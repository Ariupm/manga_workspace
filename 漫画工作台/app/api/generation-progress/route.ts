import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { cleanupGenerationJobs, getGenerationJob } from "@/lib/generation-jobs";
import { cancelGenerationJobById, cloneFailedGenerationJob, getGenerationJobById, getLatestRunningSdJob, pauseGenerationJob, resumeGenerationJob, updatePersistentGenerationJob } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request) {
  const base=(process.env.SD_WEBUI_URL||"http://127.0.0.1:7860").replace(/\/$/,"");
  const jobId=new URL(request.url).searchParams.get("jobId");
  cleanupGenerationJobs();
  const localJob=jobId?getGenerationJob(jobId):undefined;
  const persistentJob=jobId&&Number.isInteger(Number(jobId))?getGenerationJobById(Number(jobId)):undefined;
  try {
    const response=await fetch(`${base}/sdapi/v1/progress?skip_current_image=true`,{cache:"no-store",signal:AbortSignal.timeout(3000)});
    if(!response.ok) return NextResponse.json({busy:false,progress:0,error:`SD返回 ${response.status}`},{status:502});
    const payload=await response.json() as {progress?:number;eta_relative?:number;state?:{job?:string;sampling_step?:number;sampling_steps?:number}};
    const percent=Math.max(payload.state?.job?1:0,Math.round((payload.progress??0)*100));
    const stage=payload.state?.job
      ?payload.state.sampling_steps
        ?`SD WebUI 正在采样（${payload.state.sampling_step??0}/${payload.state.sampling_steps}）`
        :"SD WebUI 正在加载模型或预处理参考图"
      :"";
    if(localJob?.persistentJobId&&localJob.status==="running")updatePersistentGenerationJob(localJob.persistentJobId,"running",percent,"",stage);
    if(persistentJob&&["running","draft_running","final_running"].includes(persistentJob.status)&&payload.state?.job)updatePersistentGenerationJob(persistentJob.id,persistentJob.status,percent,"",stage);
    if(!jobId) {
      const persistent=getLatestRunningSdJob();
      if(persistent) {
        if(payload.state?.job) {
          updatePersistentGenerationJob(persistent.id,persistent.status,percent,"",stage);
        } else {
          const updated=Date.parse(`${persistent.updated_at.replace(" ","T")}Z`);
          if(Number.isFinite(updated)&&Date.now()-updated>120_000) {
            updatePersistentGenerationJob(persistent.id,"failed",0,"SD WebUI 当前没有对应的运行任务；服务可能已重启或请求已中断","任务已失联");
          }
        }
      }
    }
    return NextResponse.json({
      busy:localJob?localJob.status==="queued"||localJob.status==="running":persistentJob?["queued","running","draft_queued","draft_running","final_queued","final_running"].includes(persistentJob.status):Boolean(payload.state?.job),
      jobStatus:localJob?.status??persistentJob?.status,error:localJob?.error??persistentJob?.error,
      progress:(localJob?.status??persistentJob?.status)==="completed"?100:persistentJob?.status==="failed"?persistentJob.progress:percent,
      etaSeconds:Math.max(0,Math.round(payload.eta_relative??0)),
      step:payload.state?.sampling_step??0,steps:payload.state?.sampling_steps??0
    });
  } catch(error) {
    return NextResponse.json({busy:false,progress:0,error:error instanceof Error?error.message:"无法读取进度"},{status:502});
  }
}

export async function DELETE(request:Request) {
  const base=(process.env.SD_WEBUI_URL||"http://127.0.0.1:7860").replace(/\/$/,"");
  try {
    const body=await request.json().catch(()=>({})) as {jobId?:number};
    const jobId=Number(body.jobId);
    const job=getGenerationJobById(jobId);
    if(!job)return NextResponse.json({error:"任务不存在"},{status:404});
    if(!["queued","running","draft_queued","draft_running","final_queued","final_running","awaiting_codex","codex_queued","running_codex"].includes(job.status))return NextResponse.json({error:"该任务当前不能取消"},{status:409});
    if(job.provider==="sd-webui"&&["running","draft_running","final_running"].includes(job.status)){
      const response=await fetch(`${base}/sdapi/v1/interrupt`,{method:"POST",signal:AbortSignal.timeout(5000)});
      if(!response.ok)return NextResponse.json({error:`SD返回 ${response.status}`},{status:502});
    }
    cancelGenerationJobById(jobId);
    return NextResponse.json({ok:true});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"取消失败"},{status:502});
  }
}

function launchSdWorker(jobId:number) {
  const directory=path.join(process.cwd(),"workspace","sd-jobs");fs.mkdirSync(directory,{recursive:true});
  const log=fs.openSync(path.join(directory,`job-${jobId}.log`),"a");
  const child=spawn(process.execPath,[path.join(process.cwd(),"scripts","sd-worker.mjs"),String(jobId)],{cwd:process.cwd(),detached:true,windowsHide:true,stdio:["ignore",log,log]});
  fs.closeSync(log);child.unref();
}

export async function PATCH(request:Request) {
  const body=await request.json().catch(()=>({})) as {action?:string;jobId?:number;projectId?:number};
  const jobId=Number(body.jobId),projectId=Number(body.projectId);
  if(!Number.isInteger(jobId)||!Number.isInteger(projectId))return NextResponse.json({error:"任务参数无效"},{status:400});
  if(body.action==="pause") {
    const job=getGenerationJobById(jobId);
    if(!job||!pauseGenerationJob(projectId,jobId))return NextResponse.json({error:"该任务当前不能暂停"},{status:409});
    if(job.provider==="sd-webui"&&["running","draft_running","final_running"].includes(job.status)) {
      const base=(process.env.SD_WEBUI_URL||"http://127.0.0.1:7860").replace(/\/$/,"");
      await fetch(`${base}/sdapi/v1/interrupt`,{method:"POST",signal:AbortSignal.timeout(5000)}).catch(()=>null);
    }
    return NextResponse.json({ok:true,status:"paused"});
  }
  if(body.action==="resume") {
    const resumed=resumeGenerationJob(projectId,jobId);
    if(!resumed)return NextResponse.json({error:"该任务当前不能恢复"},{status:409});
    if(resumed.provider==="sd-webui")launchSdWorker(resumed.id);
    return NextResponse.json({ok:true,status:resumed.provider==="codex"?"awaiting_codex":"queued"});
  }
  if(body.action==="retry") {
    const cloned=cloneFailedGenerationJob(projectId,jobId);
    if(!cloned)return NextResponse.json({error:"该失败任务不能重试"},{status:409});
    if(cloned.provider==="sd-webui")launchSdWorker(cloned.id);
    return NextResponse.json({ok:true,jobId:cloned.id,status:cloned.provider==="codex"?"awaiting_codex":"queued"});
  }
  return NextResponse.json({error:"未知任务操作"},{status:400});
}

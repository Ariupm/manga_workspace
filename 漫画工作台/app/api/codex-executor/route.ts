import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { NextResponse } from "next/server";
import { getStudioData, prepareCodexJobsForExecution } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request) {
  const projectId=Number(new URL(request.url).searchParams.get("projectId"));
  const codexJs=path.join(process.env.APPDATA||"","npm","node_modules","@openai","codex","bin","codex.js");
  const installed=fs.existsSync(codexJs);
  const auth=installed?spawnSync(process.execPath,[codexJs,"login","status"],{encoding:"utf8",windowsHide:true}):null;
  return NextResponse.json({installed,authenticated:auth?.status===0,authMessage:(auth?.stdout||auth?.stderr||"").trim(),projectId});
}

export async function POST(request:Request) {
  const body=await request.json() as {projectId?:number;jobIds?:number[];confirmed?:boolean};
  if(body.confirmed!==true)return NextResponse.json({error:"必须由用户确认后才能启动Codex CLI"},{status:409});
  const projectId=Number(body.projectId);
  const jobIds=[...new Set((body.jobIds||[]).map(Number).filter(Number.isFinite))];
  if(!projectId||jobIds.length===0)return NextResponse.json({error:"没有选择待处理任务"},{status:400});
  const prepared=prepareCodexJobsForExecution(projectId,jobIds);
  if(prepared.length===0)return NextResponse.json({error:"选择的任务已不在等待状态"},{status:409});
  const logDir=path.join(process.cwd(),"workspace","codex-jobs");fs.mkdirSync(logDir,{recursive:true});
  const stdout=fs.openSync(path.join(logDir,"worker.log"),"a");
  const child=spawn(process.execPath,[path.join(process.cwd(),"scripts","codex-worker.mjs"),String(projectId),...prepared.map(String)],{
    cwd:process.cwd(),detached:true,windowsHide:true,stdio:["ignore",stdout,stdout]
  });
  fs.closeSync(stdout);
  child.unref();
  return NextResponse.json({started:true,jobIds:prepared,data:getStudioData(projectId)},{status:202});
}

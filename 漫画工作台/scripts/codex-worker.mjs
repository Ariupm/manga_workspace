import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root=process.cwd();
const projectId=Number(process.argv[2]);
const jobIds=process.argv.slice(3).map(Number).filter(Number.isFinite);
const db=new DatabaseSync(path.join(root,"data","studio.db"));
db.exec("PRAGMA busy_timeout=5000");
const codexJs=path.join(process.env.APPDATA||"","npm","node_modules","@openai","codex","bin","codex.js");
const outputDir=path.join(root,"workspace","generated");
const resultDir=path.join(root,"workspace","codex-jobs");
const codexHome=process.env.CODEX_HOME||path.join(process.env.USERPROFILE||process.env.HOME||"",".codex");
const codexGeneratedDir=path.join(codexHome,"generated_images");
fs.mkdirSync(outputDir,{recursive:true});
fs.mkdirSync(resultDir,{recursive:true});

const one=(sql,...args)=>db.prepare(sql).get(...args);
const update=(id,status,error="",progress=0,stage="")=>{
  if(["cancelled","paused"].includes(one("SELECT status FROM jobs WHERE id=?",id)?.status))return;
  db.prepare("UPDATE jobs SET status=?,error=?,progress=?,stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,error,progress,stage,id);
};

function listGeneratedPngs(directory) {
  if(!fs.existsSync(directory))return [];
  const files=[];
  const pending=[directory];
  while(pending.length) {
    const current=pending.pop();
    for(const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const file=path.join(current,entry.name);
      if(entry.isDirectory())pending.push(file);
      else if(entry.isFile()&&entry.name.toLowerCase().endsWith(".png"))files.push(file);
    }
  }
  return files;
}

function isValidPng(file) {
  try {
    const stat=fs.statSync(file);
    if(!stat.isFile()||stat.size<1024)return false;
    const header=Buffer.alloc(8);
    const descriptor=fs.openSync(file,"r");
    fs.readSync(descriptor,header,0,8,0);
    fs.closeSync(descriptor);
    return header.equals(Buffer.from([137,80,78,71,13,10,26,10]));
  } catch { return false; }
}

function runCodex(args,logPath,onEvent) {
  return new Promise((resolve,reject)=>{
    const log=fs.createWriteStream(logPath,{flags:"a"});
    const child=spawn(process.execPath,[codexJs,...args],{cwd:resultDir,windowsHide:true,env:process.env});
    let stdout="";
    let pending="";
    child.stdin.end();
    child.stdout.on("data",chunk=>{
      const text=chunk.toString();
      stdout+=text;
      log.write(chunk);
      pending+=text;
      const lines=pending.split(/\r?\n/);
      pending=lines.pop()||"";
      for(const line of lines) {
        try { onEvent?.(JSON.parse(line)); } catch {}
      }
    });
    child.stderr.on("data",chunk=>log.write(chunk));
    child.on("error",error=>{log.end();reject(error);});
    child.on("close",code=>{log.end();resolve({code,stdout});});
  });
}

for(const jobId of jobIds) {
  const row=one(`SELECT jobs.*,shots.title,shots.position,pages.number page_number
    FROM jobs JOIN shots ON shots.id=jobs.shot_id JOIN pages ON pages.id=shots.page_id
    JOIN episodes ON episodes.id=pages.episode_id
    WHERE jobs.id=? AND episodes.project_id=?`,jobId,projectId);
  if(!row||!["codex_queued","awaiting_codex"].includes(row.status))continue;
  update(jobId,"running_codex","",0,"正在启动 Codex CLI");
  try {
    const payload=JSON.parse(row.payload);
    const candidateCount=1;
    const expected=Array.from({length:candidateCount},(_,index)=>path.join(outputDir,`codex-job-${jobId}-candidate-${index+1}.png`));
    for(const file of expected)fs.rmSync(file,{force:true});
    const generatedBefore=new Set(listGeneratedPngs(codexGeneratedDir));
    const startedAt=Date.now();
    const resultPath=path.join(resultDir,`job-${jobId}-result.json`);
    const logPath=path.join(resultDir,`job-${jobId}.jsonl`);
    fs.rmSync(resultPath,{force:true});
    const references=(payload.references||[]).map(reference=>path.resolve(root,reference.path)).filter(file=>fs.existsSync(file));
    const prompt=[
      "$imagegen",
      "Create exactly one text-free anime comic panel image for the supplied visual prompt.",
      `Visual prompt: ${payload.prompt}`,
      `Negative constraints: ${payload.negativePrompt}`,
      "Use the attached images as strict identity, outfit, and footwear references. Preserve the adult character identity and selected clothing.",
      "Generate one final image with the built-in image generation tool. The worker will collect its output file.",
      "Do not edit source code or copy files. Return JSON matching the required schema; image paths may be the tool's original output paths."
    ].join("\n");
    const common=["--json","--skip-git-repo-check","--output-schema",path.join(root,"scripts","codex-result.schema.json"),"-o",resultPath];
    const imageArgs=references.flatMap(file=>["-i",file]);
    // `--image` accepts multiple values; terminate option parsing so it cannot
    // consume the prompt as another image path.
    const args=["exec",...common,"--sandbox","danger-full-access",...imageArgs,"--",prompt];
    let completedItems=0;
    const result=await runCodex(args,logPath,event=>{
      if(event.type==="thread.started"&&event.thread_id) {
        update(jobId,"running_codex","",0,"会话已建立，正在分析提示词");
      } else if(event.type==="turn.started") {
        update(jobId,"running_codex","",0,"正在调用图像生成能力");
      } else if(event.type==="item.started") {
        update(jobId,"running_codex","",0,"图像生成处理中");
      } else if(event.type==="item.completed") {
        completedItems+=1;
        update(jobId,"running_codex","",0,`已完成 ${completedItems} 个处理步骤`);
      } else if(event.type==="turn.completed") {
        update(jobId,"running_codex","",0,"正在校验并回写候选图");
      }
    });
    if(result.code!==0)throw new Error(`Codex CLI exited with code ${result.code}; see ${path.relative(root,logPath)}`);
    if(["cancelled","paused"].includes(one("SELECT status FROM jobs WHERE id=?",jobId)?.status))continue;
    const report=JSON.parse(fs.readFileSync(resultPath,"utf8"));
    const reported=(report.imagePaths||[]).map(file=>path.resolve(file)).filter(isValidPng);
    const discovered=listGeneratedPngs(codexGeneratedDir)
      .filter(file=>!generatedBefore.has(file)&&fs.statSync(file).mtimeMs>=startedAt-2000&&isValidPng(file))
      .sort((a,b)=>fs.statSync(a).mtimeMs-fs.statSync(b).mtimeMs);
    const sourceFiles=[...new Set([...reported,...discovered])].slice(-candidateCount);
    if(sourceFiles.length===0)throw new Error(`Codex completed but no new PNG was found in ${codexGeneratedDir}`);
    const files=sourceFiles.map((source,index)=>{
      const destination=expected[index];
      if(path.resolve(source)!==path.resolve(destination))fs.copyFileSync(source,destination);
      if(!isValidPng(destination))throw new Error(`Copied Codex output is not a valid PNG: ${destination}`);
      return destination;
    });
    for(const file of files) {
      const next=one("SELECT COALESCE(MAX(version),0)+1 v FROM candidates WHERE shot_id=?",row.shot_id).v;
      const existing=one("SELECT COUNT(*) c FROM candidates WHERE shot_id=?",row.shot_id).c;
      db.prepare("INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,?)")
        .run(row.shot_id,path.relative(root,file).replaceAll("\\","/"),"Codex CLI 生成",next,existing===0?1:0);
    }
    db.prepare("UPDATE shots SET status='review' WHERE id=?").run(row.shot_id);
    update(jobId,"completed","",100,"已完成");
  } catch(error) {
    update(jobId,"failed",error instanceof Error?error.message:String(error),0,"执行失败");
  }
}

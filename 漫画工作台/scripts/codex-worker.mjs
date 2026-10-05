import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

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

function renderControlBoardSvg(plan) {
  const board = plan?.controlBoard || {};
  const width = Math.max(384, Number(board.width || 512));
  const height = Math.max(384, Number(board.height || 512));
  const characters = Array.isArray(board.characters) ? board.characters : [];
  const interactions = Array.isArray(board.interactions) ? board.interactions : [];
  const characterMarkup = characters.map((item, index) => {
    const x = Math.round(Number(item.region?.xStart ?? index / Math.max(1, characters.length)) * width);
    const boxWidth = Math.max(40, Math.round((Number(item.region?.xEnd ?? (index + 1) / Math.max(1, characters.length)) - Number(item.region?.xStart ?? index / Math.max(1, characters.length))) * width));
    const centerX = x + boxWidth / 2;
    const headY = height * .27;
    const prop = interactions.find((entry) => entry.actorCharacterId === item.characterId);
    const targetX = Number(prop?.center?.x ?? centerX / width) * width;
    const targetY = Number(prop?.center?.y ?? .58) * height;
    return `<g><rect x="${x + 8}" y="${height * .12}" width="${boxWidth - 16}" height="${height * .72}" rx="18" fill="none" stroke="#3b82f6" stroke-width="4"/><circle cx="${centerX}" cy="${headY}" r="${height * .065}" fill="none" stroke="#111827" stroke-width="5"/><line x1="${centerX}" y1="${headY + height * .065}" x2="${centerX}" y2="${height * .58}" stroke="#111827" stroke-width="5"/><line x1="${centerX}" y1="${height * .39}" x2="${targetX - 18}" y2="${targetY}" stroke="#111827" stroke-width="5"/><line x1="${centerX}" y1="${height * .39}" x2="${targetX + 18}" y2="${targetY}" stroke="#111827" stroke-width="5"/><line x1="${centerX}" y1="${headY}" x2="${targetX}" y2="${targetY}" stroke="#ef4444" stroke-width="3" stroke-dasharray="8 8"/><text x="${x + 14}" y="${height * .1}" font-size="18" fill="#111827">${item.name || item.characterId}</text><text x="${x + 14}" y="${height * .89}" font-size="14" fill="#111827">${String(item.action || "").slice(0, 46)}</text></g>`;
  }).join("");
  const propMarkup = interactions.map((item) => {
    const x = Number(item.center?.x ?? .5) * width;
    const y = Number(item.center?.y ?? .58) * height;
    return `<g><rect x="${x - 24}" y="${y - 42}" width="48" height="84" rx="7" fill="#fde68a" stroke="#b45309" stroke-width="5"/><text x="${x - 42}" y="${y + 66}" font-size="16" fill="#92400e">${item.propId || "prop"}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="18" y="28" font-size="18" fill="#111827">SHOT CONTROL BOARD · framing ${plan?.camera?.shotSize || "unspecified"}</text>${characterMarkup}${propMarkup}</svg>`;
}

async function ensureControlBoard(payload, jobId) {
  if (!payload.renderPlan?.controlBoard) return null;
  const file = path.join(resultDir, `job-${jobId}-control-board.png`);
  await sharp(Buffer.from(renderControlBoardSvg(payload.renderPlan))).png().toFile(file);
  return file;
}

function validReferenceFiles(payload) {
  return (payload.references || []).map((reference) => ({ ...reference, absolutePath: path.resolve(root, reference.path) }))
    .filter((reference) => {
      try { return fs.statSync(reference.absolutePath).isFile(); } catch { return false; }
    });
}

async function collectInvocationImage({ resultPath, before, startedAt }) {
  const report = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const reported = (report.imagePaths || []).map((file) => path.resolve(file)).filter(isValidPng);
  const discovered = listGeneratedPngs(codexGeneratedDir)
    .filter((file) => !before.has(file) && fs.statSync(file).mtimeMs >= startedAt - 2000 && isValidPng(file))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  return reported.at(-1) || discovered.at(-1) || null;
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
  update(jobId,"running_codex","",0,"正在准备角色资产与镜头控制板");
  try {
    const payload=JSON.parse(row.payload);
    const candidateCount=Math.max(1,Math.min(2,Number(payload.candidateCount||payload.renderPlan?.candidateCount||2)));
    const references=validReferenceFiles(payload);
    const controlBoard=await ensureControlBoard(payload,jobId);
    const referenceManifest=references.map((reference)=>`${reference.characterName||reference.characterId||"character"} · ${reference.role||"reference"} · ${reference.description||reference.id||""}`).join("\n");
    const expected=Array.from({length:candidateCount},(_,index)=>path.join(outputDir,`codex-job-${jobId}-candidate-${index+1}.png`));
    const logPath=path.join(resultDir,`job-${jobId}.jsonl`);
    for(const file of expected)fs.rmSync(file,{force:true});
    const generatedFiles=[];
    for(let index=0;index<candidateCount;index++) {
      if(["cancelled","paused"].includes(one("SELECT status FROM jobs WHERE id=?",jobId)?.status))break;
      update(jobId,"running_codex","",Math.round(index/candidateCount*55),`正在生成候选 ${index+1}/${candidateCount}`);
      const resultPath=path.join(resultDir,`job-${jobId}-candidate-${index+1}-result.json`);
      fs.rmSync(resultPath,{force:true});
      const before=new Set(listGeneratedPngs(codexGeneratedDir));
      const startedAt=Date.now();
      const prompt=[
        "$imagegen",
        "Generate exactly one polished, text-free anime comic panel. This is a production panel, not a character sheet or reference board.",
        `Candidate variation: ${index+1}/${candidateCount}. Vary only harmless rendering details; never change story facts, identity, outfit, camera framing or interaction geometry.`,
        `HARD REQUIREMENTS:\n${(payload.renderPlan?.hardRequirements||[]).map((item)=>`- ${item}`).join("\n")}`,
        `VISUAL PROMPT:\n${payload.prompt}`,
        `NEGATIVE CONSTRAINTS:\n${payload.negativePrompt}`,
        "The attached control board is geometry guidance only. Render a natural finished scene, not lines, labels or a diagram.",
        "Every other attachment has a declared role below. Apply identity_face only to face identity, outfit only to garment appearance, turnaround only to body/hair consistency, and shoes only when visible. Do not blend reference layouts into the scene.",
        referenceManifest,
        "Generate the person, both acting hands and any held story prop as one coherent interaction unit. The prop must physically contact the declared hands and the eyes must aim at the declared gaze target.",
        "Use the built-in image generation tool. Do not edit source code or copy files. Return JSON matching the requested schema."
      ].join("\n\n");
      const imageFiles=[...references.map((reference)=>reference.absolutePath),...(controlBoard?[controlBoard]:[])];
      const args=["exec","--json","--skip-git-repo-check","--output-schema",path.join(root,"scripts","codex-result.schema.json"),"-o",resultPath,"--sandbox","danger-full-access",...imageFiles.flatMap(file=>["-i",file]),"--",prompt];
      const result=await runCodex(args,logPath);
      if(result.code!==0)throw new Error(`Codex candidate ${index+1} exited with code ${result.code}; see ${path.relative(root,logPath)}`);
      const source=await collectInvocationImage({resultPath,before,startedAt});
      if(!source)throw new Error(`Codex candidate ${index+1} completed but no new PNG was found`);
      if(path.resolve(source)!==path.resolve(expected[index]))fs.copyFileSync(source,expected[index]);
      if(!isValidPng(expected[index]))throw new Error(`Copied Codex output is not a valid PNG: ${expected[index]}`);
      generatedFiles.push(expected[index]);
    }
    if(!generatedFiles.length)continue;
    const artifacts=generatedFiles.map(file=>({path:path.relative(root,file).replaceAll("\\","/"),sha256:createHash("sha256").update(fs.readFileSync(file)).digest("hex")}));
    db.exec("BEGIN IMMEDIATE");
    try {
      for(const [index,artifact] of artifacts.entries()) {
        if(one("SELECT id FROM candidates WHERE image_path=?",artifact.path))continue;
        const next=one("SELECT COALESCE(MAX(version),0)+1 v FROM candidates WHERE shot_id=?",row.shot_id).v;
        const selected=one("SELECT COUNT(*) v FROM candidates WHERE shot_id=?",row.shot_id).v===0?1:0;
        const report={version:"user-decides-adoption-v1",sourceJobId:jobId,imageSha256:artifact.sha256,semanticReview:"not_performed"};
        db.prepare("INSERT INTO candidates(shot_id,image_path,label,version,selected,quality_status,quality_labels_json,quality_report_json,reviewed_by,source_job_id,image_sha256) VALUES(?,?,?,?,?,'unreviewed','[]',?,'',?,?)")
          .run(row.shot_id,artifact.path,"Codex 生成结果",next,selected,JSON.stringify(report),index===0?jobId:null,artifact.sha256);
      }
      payload.selectedImagePath=artifacts[0].path;payload.generatedArtifacts=artifacts.map(item=>item.path);
      delete payload.visualReview;
      db.prepare("UPDATE jobs SET status='completed',payload=?,progress=100,error='',stage='生成结果已展示，请自行选择采用',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(payload),jobId);
      db.prepare("UPDATE shots SET status='review' WHERE id=?").run(row.shot_id);
      db.exec("COMMIT");
    } catch(error){db.exec("ROLLBACK");throw error;}
  } catch(error) {
    update(jobId,"failed",error instanceof Error?error.message:String(error),0,"执行失败");
  }
}

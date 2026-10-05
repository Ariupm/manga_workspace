import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

test("SD worker completes without Codex and retains malformed image failures outside candidates", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "comic-asset-worker-test-"));
  fs.mkdirSync(path.join(temporaryRoot,"data"));
  const db = new DatabaseSync(path.join(temporaryRoot,"data","studio.db"));
  db.exec("CREATE TABLE character_asset_jobs(id INTEGER PRIMARY KEY, character_id TEXT, asset_type TEXT, provider TEXT, status TEXT, stage TEXT, error TEXT, updated_at TEXT, master_reference_id INTEGER, prompt TEXT, negative_prompt TEXT); CREATE TABLE character_asset_candidates(job_id INTEGER,character_id TEXT,asset_type TEXT,path TEXT); CREATE TABLE character_references(id INTEGER,path TEXT,confirmed INTEGER,character_id TEXT,type TEXT);");
  const image = (await sharp({create:{width:512,height:512,channels:3,background:"pink"}}).png().toBuffer()).toString("base64");
  let valid = true, requests = 0;
  const server = http.createServer((req,res)=>{
    requests++;
    req.resume();req.on("end",()=>{
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify(req.url.includes("progress")?{state:{job:""}}:req.url.includes("options")?{sd_model_checkpoint:"fixture"}:{images:valid?[image]:["broken"],info:"fixture"}));
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    for (const id of [1,2]) {
      valid = id === 1;
      db.prepare("INSERT INTO character_asset_jobs VALUES(?,'fixture','face','sd','queued','','','',NULL,'adult portrait','text')").run(id);
      const child = spawn(process.execPath,[fileURLToPath(new URL("./character-asset-worker.mjs",import.meta.url)),String(id)],{cwd:temporaryRoot,windowsHide:true,env:{...process.env,APPDATA:path.join(temporaryRoot,"no-codex"),SD_WEBUI_URL:`http://127.0.0.1:${server.address().port}`},stdio:"pipe"});
      let stderr="";child.stderr.on("data",data=>{stderr+=data;});
      await new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(stderr)));});
      assert.equal(db.prepare("SELECT status FROM character_asset_jobs WHERE id=?").get(id).status,valid?"completed":"failed");
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM character_asset_candidates WHERE job_id=?").get(id).count,valid?1:0);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM character_references").get().count,0);
      assert.equal(fs.existsSync(path.join(temporaryRoot,"workspace","character-jobs","imagegen.lock")),false);
    }
    db.exec("INSERT INTO character_references VALUES(1,'foreign.png',1,'other','face'),(2,'outfit.png',1,'fixture','outfit'),(3,'old.png',1,'fixture','face'),(4,'new.png',1,'fixture','face')");
    for(const [id,masterId] of [[4,1],[5,2],[6,3]]) {
      db.prepare("INSERT INTO character_asset_jobs VALUES(?,'fixture','outfit','sd','queued','','','',?,'outfit','text')").run(id,masterId);
      const before=requests;
      const worker=spawn(process.execPath,[fileURLToPath(new URL("./character-asset-worker.mjs",import.meta.url)),String(id)],{cwd:temporaryRoot,windowsHide:true,env:{...process.env,SD_WEBUI_URL:`http://127.0.0.1:${server.address().port}`},stdio:"pipe"});
      worker.stdout.resume();worker.stderr.resume();
      await new Promise((resolve,reject)=>{worker.on("error",reject);worker.on("close",resolve);});
      assert.equal(requests,before);
      assert.equal(db.prepare("SELECT status FROM character_asset_jobs WHERE id=?").get(id).status,"failed");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM character_asset_candidates WHERE job_id=?").get(id).n,0);
    }
    db.prepare("INSERT INTO character_asset_jobs VALUES(3,'fixture','face','sd','queued','','','',NULL,'adult portrait','text')").run();
    const lockPath=path.join(temporaryRoot,"workspace","character-jobs","imagegen.lock");
    fs.writeFileSync(lockPath,JSON.stringify({pid:process.pid}));
    const waiting=spawn(process.execPath,[fileURLToPath(new URL("./character-asset-worker.mjs",import.meta.url)),"3"],{cwd:temporaryRoot,windowsHide:true,env:{...process.env,SD_WEBUI_URL:`http://127.0.0.1:${server.address().port}`},stdio:"pipe"});
    waiting.stdout.resume();waiting.stderr.resume();
    const finished=new Promise((resolve,reject)=>{waiting.on("error",reject);waiting.on("close",resolve);});
    try {
      const deadline=Date.now()+5000;
      while(!db.prepare("SELECT stage FROM character_asset_jobs WHERE id=3").get().stage.includes("排队")) {
        assert.ok(Date.now()<deadline,"worker must reach queue");
        await new Promise(resolve=>setTimeout(resolve,30));
      }
      db.prepare("UPDATE character_asset_jobs SET status='completed',stage='completed elsewhere' WHERE id=3").run();
      const before=requests;
      fs.rmSync(lockPath);
      await finished;
      assert.equal(requests,before,"stale worker must not call SD");
      assert.equal(db.prepare("SELECT status FROM character_asset_jobs WHERE id=3").get().status,"completed");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM character_asset_candidates WHERE job_id=3").get().n,0);
      assert.equal(fs.existsSync(lockPath),false);
    } finally { if(waiting.exitCode===null) {waiting.kill();await finished;} }
  } finally {
    db.close();await new Promise(resolve=>server.close(resolve));
    const resolved = path.resolve(temporaryRoot);
    if(path.dirname(resolved)===path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("comic-asset-worker-test-")) fs.rmSync(resolved,{recursive:true,force:true});
  }
});

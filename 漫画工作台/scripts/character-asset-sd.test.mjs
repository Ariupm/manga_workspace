import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import { characterAssetSdPayload, generateCharacterAssetSd } from "./character-asset-sd.mjs";

test("local asset payload preserves each asset brief and requires identity control after face selection", () => {
  const capabilities = {masterImage:"test-reference",models:["ip-adapter-plus-face_sd15 [abc]"],modules:["ip-adapter_clip_h"]};
  for (const type of ["face","turnaround","expressions","outfit","shoes"]) {
    const job = {asset_type:type,prompt:`exact ${type} brief`,negative_prompt:"no extra person"};
    const payload = characterAssetSdPayload(job,capabilities);
    assert.equal(payload.prompt,job.prompt);
    assert.equal(payload.negative_prompt,job.negative_prompt);
    assert.equal(Boolean(payload.alwayson_scripts),type!=="face");
    if(type!=="face") {
      assert.equal(payload.alwayson_scripts.ControlNet.args[0].image,capabilities.masterImage);
      assert.throws(()=>characterAssetSdPayload(job,{...capabilities,modules:[]}));
      assert.throws(()=>characterAssetSdPayload(job,{...capabilities,masterImage:null}));
      assert.throws(()=>characterAssetSdPayload(job,{...capabilities,models:[]}));
    }
  }
});

test("SD asset response must decode to the requested dimensions, not just return HTTP 200", async () => {
  const image = (await sharp({create:{width:16,height:16,channels:3,background:"pink"}}).png().toBuffer()).toString("base64");
  let response = {images:[image],info:"fixture"};
  const server = http.createServer((req,res)=>{req.resume();req.on("end",()=>{res.setHeader("content-type","application/json");res.end(JSON.stringify(response));});});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.ok((await generateCharacterAssetSd(base,{width:16,height:16})).image.length);
    await assert.rejects(()=>generateCharacterAssetSd(base,{width:32,height:16}),/尺寸/);
    response={images:["not an image"]};
    await assert.rejects(()=>generateCharacterAssetSd(base,{width:16,height:16}));
    response={images:[]};
    await assert.rejects(()=>generateCharacterAssetSd(base,{width:16,height:16}),/未返回/);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

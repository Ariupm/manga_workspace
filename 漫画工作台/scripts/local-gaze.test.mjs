import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {runLocalGaze,selectGazeFace,localGazeGeometry} from './local-gaze.mjs';
function face(cx=.5,cy=.25){return {face_keypoints_2d:Array.from({length:68},(_,i)=>[cx+Math.cos(i/68*Math.PI*2)*.08,cy+Math.sin(i/68*Math.PI*2)*.1,1]).flat()};}
const poses=(...people)=>({poses:[{people}]});
const image=async(color,width=512,height=512)=>(await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer()).toString('base64');
test('localization respects actor region, requires eyes, and rejects ambiguous faces',()=>{
 assert.equal(selectGazeFace(poses(face()),{region:{xStart:0,xEnd:1}}).status,'localized');
 assert.equal(selectGazeFace(poses(face(.25),face(.75)),{region:{xStart:0,xEnd:.5}}).face.cx,.25);
 assert.equal(selectGazeFace(poses(face(.4),face(.6)),{}).reason,'ambiguous_face_assignment');
 assert.equal(selectGazeFace(poses({}),{}).reason,'face_not_localized');
 assert.equal(selectGazeFace(poses(face()),{nose:{x:.1,y:.9}}).status,'skipped');
});
test('distant target stays outside face crop and is not falsely reported visible',()=>{
 const f=selectGazeFace(poses(face()),{}).face;
 for(const [w,h] of [[512,512],[768,1024]]){const g=localGazeGeometry(f,w,h,{x:.5,y:.9});assert.equal(g.modelSeesTarget,false);assert.ok(g.crop.width<w);assert.ok(g.crop.top>=0);assert.ok(g.crop.left+g.crop.width<=w);}
});
test('crop transforms spatial controls, reduces only local identity, and protects pixels outside face',async()=>{
 const original=await image('#102030'),control=await image('black'),reference=await image('green');let sent;
 const request={prompt:'eyes directed downward',width:512,height:512,init_images:[original],denoising_strength:.36,alwayson_scripts:{ControlNet:{args:[{model:'ip-adapter-plus-face',module:'clip',weight:.68,image:reference,guidance_end:1},{model:'openpose',module:'none',image:control,weight:.62}]}}};
 const frozen=JSON.stringify(request);
 const result=await runLocalGaze({request,region:{xStart:0,xEnd:1},nose:{x:.5,y:.25},target:{x:.5,y:.9},detect:async()=>poses(face()),generate:async r=>{sent=r;return {status:200,body:JSON.stringify({images:[await image('red')]})};}});
 assert.equal(result.audit.status,'applied');assert.equal(result.audit.modelSeesTarget,false);assert.equal(sent.width,512);assert.equal(sent.inpaint_full_res,false);
 assert.equal(sent.alwayson_scripts.ControlNet.args[0].image,reference);assert.equal(sent.alwayson_scripts.ControlNet.args[0].weight,.35);assert.equal(sent.alwayson_scripts.ControlNet.args[1].effective_region_mask,sent.mask);
 assert.equal(JSON.stringify(request),frozen);
 const pixels=await sharp(Buffer.from(result.image,'base64')).removeAlpha().raw().toBuffer();assert.deepEqual([...pixels.subarray((450*512+256)*3,(450*512+256)*3+3)],[16,32,48]);assert.ok(pixels[(128*512+256)*3]>200);
});
test('unavailable localization or generation returns original without retry or false success',async()=>{
 const original=await image('blue'),request={init_images:[original],prompt:'looking down'};
 for(const fail of ['detect','generate','ambiguous','closed']){let calls=0;
  const result=await runLocalGaze({request:{...request,prompt:fail==='closed'?'eyes closed':request.prompt},region:{xStart:0,xEnd:1},detect:async()=>{if(fail==='detect')throw Error('unavailable');return fail==='ambiguous'?poses(face(.4),face(.6)):poses(face());},generate:async()=>{calls++;throw Error('HTTP failure');}});
  assert.equal(result.image,original);assert.equal(result.audit.status,'skipped');assert.equal(calls,fail==='generate'?1:0);
 }
});
test('disabled references stay disabled and displaced planned pose is not imposed on actual face',async()=>{
 const original=await image('blue');let sent;
 const result=await runLocalGaze({request:{init_images:[original],prompt:'looking left',alwayson_scripts:{ControlNet:{args:[{model:'openpose',image:original,weight:.6}]}}},region:{xStart:0,xEnd:1},nose:{x:.35,y:.25},target:{x:.1,y:.3},detect:async()=>poses(face()),generate:async r=>{sent=r;return {status:200,body:JSON.stringify({images:[original]})};}});
 assert.equal(result.audit.status,'applied');assert.deepEqual(sent.alwayson_scripts.ControlNet.args,[]);assert.equal(result.audit.poseAligned,false);
});

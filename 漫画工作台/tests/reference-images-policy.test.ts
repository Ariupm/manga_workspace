import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter,getStudioData,getShotGenerationInput,updateShot,createPersistentGenerationJob,updatePersistentGenerationJob,approveSdDraft,getGenerationJobRecord} from '../lib/db';
import {referenceImageUsagePlan,activeReferenceImages,usesReferenceImages,poseUsagePlan,assertControlPolicyRequest} from '../scripts/generation-control-policy.mjs';
import {buildRenderPlan} from '../lib/render-plan';
import {buildGenerationPrompt} from '../lib/prompts';

test('reference image choice persists independently of Pose; legacy defaults on',()=>{
 const shot=getStudioData().episode.pages[0].shots[0];
 assert.equal(usesReferenceImages({}),true);
 for(const referenceImagesEnabled of [false,true])for(const poseControlEnabled of [false,true]){
  updateShot(shot.id,{referenceImagesEnabled,poseControlEnabled});
  for(const actual of [getShotGenerationInput(shot.id),getStudioData().episode.pages[0].shots[0]]){
   assert.equal(actual.referenceImagesEnabled,referenceImagesEnabled);assert.equal(actual.poseControlEnabled,poseControlEnabled);
  }
 }
 for(const value of [null,'false',0]){
  assert.throws(()=>updateShot(shot.id,{referenceImagesEnabled:value}),/布尔/);
  assert.throws(()=>referenceImageUsagePlan(value as any),/boolean/);
 }
});

test('all image references filtered without mutating assets; request guard covers every stage and unlabelled adapters',()=>{
 const references=[{role:'identity',characterId:'a'},{role:'outfit',characterId:'b'}];
 for(const enabled of [false,true]){
  const recipe={referenceImageUsage:referenceImageUsagePlan(enabled),references};
  assert.deepEqual(activeReferenceImages(recipe),enabled?references:[]);
  for(const stage of ['base','identity','outfit','prop','hand','gaze','handoff']){
   for(const unit of [{role:'identity'},{role:'outfit'},{module:'ip-adapter_clip_sd15'},{model:'ip-adapter-plus-face_sd15'},{module:'reference_only'}]){
    const run=()=>assertControlPolicyRequest(recipe,{alwayson_scripts:{ControlNet:{args:[unit]}}},{stage});
    if(enabled)assert.doesNotThrow(run);else assert.throws(run,/Disabled reference images/);
   }
   assert.doesNotThrow(()=>assertControlPolicyRequest(recipe,{init_images:['approved draft'],alwayson_scripts:{ControlNet:{args:[{role:'pose',model:'control_openpose'},{role:'prop',model:'control_canny'}]}}},{stage}));
  }
 }
 assert.equal(references.length,2);
 const off={referenceImageUsage:referenceImageUsagePlan(false),poseUsage:poseUsagePlan(false)};
 assert.doesNotThrow(()=>assertControlPolicyRequest(off,{},{stage:'base'}));
 assert.throws(()=>assertControlPolicyRequest(off,{alwayson_scripts:{ControlNet:{args:[{role:'pose'}]}}},{stage:'base'}),/geometry control/);
});

test('Codex plan removes every appearance attachment for all counts/framing while text and geometry stay unchanged',()=>{
 createCharacter({name:'Reference policy second actor',descriptionCn:'第二人物',appearanceEn:'adult woman, short black hair',invariantsEn:['short black hair'],visualTraits:{hairColorEn:'black',hairStyleEn:'short hair',eyeColorEn:'brown'},profileStatus:'confirmed'});
 const data=getStudioData(),base=data.episode.pages[0].shots[0];
 for(const count of [1,2])for(const camera of ['close-up','medium shot','full body']){
  const shot={...base,visualSpec:null,visualSpecConfirmed:false,characterIds:data.characters.slice(0,count).map(c=>c.id),camera,cameraEn:camera,referenceImagesEnabled:true};
  const on=buildRenderPlan(shot,data.assets,data.characters);
  const off=buildRenderPlan({...shot,referenceImagesEnabled:false},data.assets,data.characters);
  assert.ok(on.references.length);assert.deepEqual(off.references,[]);
  assert.ok(off.characterBundles.every(b=>!b.references.length));
  assert.deepEqual(off.controlBoard,on.controlBoard);assert.deepEqual(off.hardRequirements,on.hardRequirements);
  assert.deepEqual(off.characterBundles.map(b=>b.invariants),on.characterBundles.map(b=>b.invariants));
  assert.equal(buildGenerationPrompt(shot,data.assets,data.characters).prompt,buildGenerationPrompt({...shot,referenceImagesEnabled:false},data.assets,data.characters).prompt);
 }
});

test('draft approval freezes reference choice and cannot resurrect final references after shot settings change',()=>{
 const shot=getStudioData(1).episode.pages[0].shots[0];
 for(const enabled of [false,true]){
  const reference={role:'identity',path:'old-reference.png'};
  const recipe={referenceImageUsage:referenceImageUsagePlan(enabled),poseUsage:poseUsagePlan(false),phase:'draft',endpoint:'http://localhost/sdapi/v1/txt2img',width:256,height:384,targetWidth:512,targetHeight:768,references:[reference],finalReferences:[reference]};
  const payload={phase:'draft',draftImagePath:'../角色资产/小粉/00-原始参考图.png',recipe};
  const id=createPersistentGenerationJob(shot.id,'sd-webui',payload);
  updatePersistentGenerationJob(id,'awaiting_draft_approval',100,'','等待确认');
  updateShot(shot.id,{referenceImagesEnabled:!enabled});assert.ok(approveSdDraft(1,id));
  const final=JSON.parse(getGenerationJobRecord(id).payload).recipe;
  assert.deepEqual(final.referenceImageUsage,recipe.referenceImageUsage);
  assert.deepEqual(final.references,enabled?[reference]:[]);assert.ok(final.approvedDraftPath);
 }
});

test('API off selection bypasses reference dependencies but retains independent Regional prerequisite',async()=>{
 const previousProvider=process.env.IMAGE_PROVIDER,previousDir=process.env.SD_CONTROLNET_MODEL_DIR,originalFetch=globalThis.fetch;
 process.env.IMAGE_PROVIDER='sd-webui';process.env.SD_CONTROLNET_MODEL_DIR='Z:/unavailable-test-models';
 const requests:string[]=[];
 globalThis.fetch=async(input)=>{requests.push(String(input));return Response.json({});};
 try{
  const {POST}=await import('../app/api/studio/route');
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
  updateShot(shot.id,{locked:false,characterIds:data.characters.slice(0,2).map(c=>c.id),referenceImagesEnabled:false,poseControlEnabled:false,scene:'library with tall bookshelves',sceneEn:'library with tall bookshelves',cameraEn:'medium shot',description:'two people standing beside a table',actionEn:'standing beside a table',characterLooks:{}});
  const request=(extra={})=>POST(new Request('http://localhost/api/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generateDraft',projectId:1,shotId:shot.id,force:true,width:512,height:512,...extra})}));
  const off=await request(),offBody=await off.json();
  assert.equal(offBody.code,'REGIONAL_PROMPTER_REQUIRED',JSON.stringify(offBody));
  const on=await request({referenceImagesEnabled:true});assert.equal((await on.json()).code,'CLIP_VISION_INVALID');
  const calls=requests.length;
  const invalid=await request({referenceImagesEnabled:'false'});assert.equal((await invalid.json()).code,'INVALID_REFERENCE_USAGE');assert.equal(requests.length,calls);
  assert.ok(requests.every(url=>!/txt2img|img2img/.test(url)));
 }finally{
  globalThis.fetch=originalFetch;
  if(previousProvider===undefined)delete process.env.IMAGE_PROVIDER;else process.env.IMAGE_PROVIDER=previousProvider;
  if(previousDir===undefined)delete process.env.SD_CONTROLNET_MODEL_DIR;else process.env.SD_CONTROLNET_MODEL_DIR=previousDir;
 }
});

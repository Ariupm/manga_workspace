import assert from 'node:assert/strict';
import test from 'node:test';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {LOCAL_CAMERA_CONTEXT_VERSION,createPromptPlan,compileStagePrompt,finalizePromptPlan,prepareGenerationPromptRequest,rebindPromptPlanRelations,composeGenerationPrompt} from '../scripts/prompt-compiler.mjs';

const makePlan=(camera:string,version:string|undefined=LOCAL_CAMERA_CONTEXT_VERSION)=>createPromptPlan({
 localCameraContextVersion:version,
 common:[{id:'cameraAngle',group:'cameraAngle',text:camera,source:'confirmed_camera'},
  {id:'light',group:'lighting',text:'warm side lighting',source:'scene'}],
 characters:[{characterId:'reader',region:{xStart:0,xEnd:.5},fields:[
  {id:'reader.gaze',group:'gaze',text:'eyes focused on the book',source:'manual'},
  {id:'reader.clothing',group:'clothing',text:'yellow shirt with a book print',source:'manual'},
  {id:'reader.pose',group:'pose',text:'sitting',source:'story'},
  {id:'reader.occlusion',group:'occlusion',text:'left sleeve behind the book',source:'story'},
 ]},{characterId:'worker',region:{xStart:.5,xEnd:1},fields:[
  {id:'worker.gaze',group:'gaze',text:'eyes focused on the shelf',source:'manual'},
  {id:'worker.action',group:'action',text:'reaching toward the shelf',source:'story'},
  {id:'worker.clothing',group:'clothing',text:'blue shirt',source:'manual'},
 ]}],
});

test('local camera target is not broadcast across actors or garment masks; owned facts remain',()=>{
 for(const [camera,angle] of [
  ['slightly high angle looking down at the book','slightly high angle'],
  ['low angle gazing up toward the cup','low angle'],
  ['side view, looking at the paper','side view'],
  ['eye-level view, slightly angled from the front-right looking directly at the box','eye-level view, slightly angled from the front-right'],
 ]){
  const plan=makePlan(camera);assert.deepEqual(plan.errors,[]);
  for(const stage of ['identity','gaze','outfit','prop','hand','handoff']){
   const result=compileStagePrompt(plan,{stage,characterId:'worker'});
   assert.deepEqual(result.errors,[],`${camera}/${stage}`);
   assert.ok(result.prompt.includes(angle));assert.match(result.prompt,/warm side lighting/);
   assert.doesNotMatch(result.prompt,/\b(?:book|cup|paper|box)\b/);
   if(['identity','gaze','handoff'].includes(stage))assert.match(result.prompt,/eyes focused on the shelf/);
   assert.ok(result.audit.some(a=>a.reason==='local_camera_excludes_shot_gaze_target'));
  }
  const outfit=compileStagePrompt(plan,{stage:'outfit',characterId:'reader'});
  assert.match(outfit.prompt,/yellow shirt with a book print/);
  assert.match(outfit.prompt,/left sleeve behind the book/);
  assert.doesNotMatch(outfit.prompt,/looking down at the book/);
  assert.match(compileStagePrompt(plan,{stage:'identity',characterId:'reader'}).prompt,/eyes focused on the book/);
  assert.ok(plan.commonPrompt.includes(camera),'base camera facts must remain intact');
 }
});

test('optical descriptions, ambiguous prose, legacy snapshots and negative boundaries stay intact',()=>{
 for(const camera of ['top-down view','over-the-shoulder view','camera looking down','profile view with dramatic foreshortening','woman looking at the book']){
  assert.ok(compileStagePrompt(makePlan(camera),{stage:'outfit',characterId:'worker'}).prompt.includes(camera));
 }
 const camera='slightly high angle looking down at the book';
 const legacy=makePlan(camera,'');
 assert.ok(compileStagePrompt(legacy,{stage:'outfit',characterId:'worker'}).prompt.includes(camera));
 assert.equal(legacy.facts.localCameraContextVersion,undefined);
 const newPlan=makePlan('looking at the book');
 assert.doesNotMatch(compileStagePrompt(newPlan,{stage:'outfit',characterId:'worker'}).prompt,/book/);
 assert.ok(compileStagePrompt(makePlan('not looking at the book'),{stage:'outfit',characterId:'worker'}).errors.length,'unsupported negative must not silently become a positive angle');
});

test('request adapter and relation rebind retain scope version without changing controls or source recipe',()=>{
 const plan=rebindPromptPlanRelations(makePlan('slightly high angle looking down at the book'),[]);
 assert.equal(plan.facts.localCameraContextVersion,LOCAL_CAMERA_CONTEXT_VERSION);
 const finalized=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt:composeGenerationPrompt(plan),negativePrompt:plan.negativePrompt});
 const recipe:any={prompt:finalized.appliedPrompt,negativePrompt:finalized.negativePrompt,generationSpec:{promptPlan:finalized},references:[]};
 const payload={prompt:'old worker sentence',negative_prompt:'',mask:'test-mask',seed:81,steps:12,alwayson_scripts:{ControlNet:{args:[]}}};
 const local=prepareGenerationPromptRequest(recipe,payload,{stage:'outfit',characterId:'worker',details:'(blue sleeve:1.1)'});
 assert.match(local.prompt,/blue sleeve/);assert.doesNotMatch(local.prompt,/book/);
 assert.equal(local.mask,payload.mask);assert.equal(local.seed,payload.seed);assert.deepEqual(local.alwayson_scripts,payload.alwayson_scripts);
 assert.ok(recipe.promptRequestTraces[0].audit.some((a:any)=>a.reason==='local_camera_excludes_shot_gaze_target'));
 const base=prepareGenerationPromptRequest(recipe,payload,{stage:'base'});
 assert.match(base.prompt,/looking down at the book/);
 assert.ok(finalized.facts.common[0].text.includes('looking down at the book'));
});

test('front-end planner freezes new policy across actors, framing and geometry toggles',()=>{
 const actor:any={id:'actor',name:'Actor',appearanceEn:'adult woman',visualTraits:{hairColorEn:'pink hair'},invariantsEn:[],references:[]};
 for(const size of ['close-up','medium shot','wide shot'])for(const count of [1,2]){
  const characters=Array.from({length:count},(_,i)=>({...actor,id:`actor${i}`}));
  const shot:any={id:9801,description:'standing',scene:'library',sceneEn:'library',timeOfDay:'day',actionEn:'standing',expressionEn:'neutral',camera:size,cameraEn:size,compositionEn:'',lightingEn:'daylight',characterIds:characters.map(c=>c.id),characterLooks:{},environment:{},visualSpecConfirmed:true,
   visualSpec:{camera:{shotSize:size,angle:'slightly high angle looking down at the book',composition:''},characters:characters.map((c,i)=>({characterId:c.id,action:'standing',gaze:i?'eyes focused on the shelf':'eyes focused on the book',expression:'neutral',region:{xStart:i/count,xEnd:(i+1)/count},appearanceState:{hair:'',bag:'',accessories:[],glasses:'',outerwearState:'',condition:[]}})),scene:{location:'library',timeOfDay:'day',weather:'clear',lighting:'daylight',sceneId:'library'},visibleFacts:[],interactions:[],interaction:null}};
  const regional=buildRegionalPrompt(shot,[],characters,{posePlannerVersion:'3.0'});
  for(const useGeometry of [true,false]){
   const effective=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry});
   assert.deepEqual(effective.errors,[]);
   assert.equal(effective.facts.localCameraContextVersion,LOCAL_CAMERA_CONTEXT_VERSION);
   for(const c of characters){
    const local=compileStagePrompt(effective,{stage:'outfit',characterId:c.id,details:'yellow sleeve'});
    assert.deepEqual(local.errors,[]);assert.doesNotMatch(local.prompt,/looking down at the book/);
   }
  }
 }
});

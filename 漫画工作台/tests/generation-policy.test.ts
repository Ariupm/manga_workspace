import test from 'node:test';
import assert from 'node:assert/strict';
import {getStudioData,getShotGenerationInput,updateShot,createPersistentGenerationJob,updateGenerationJobPayload,updatePersistentGenerationJob,approveSdDraft,getGenerationJobRecord} from '../lib/db';
import {poseUsagePlan,usesPoseGeometry,assertControlPolicyRequest} from '../scripts/generation-control-policy.mjs';
import {preparePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {createPromptPlan,finalizePromptPlan,compileStagePrompt,prepareGenerationPromptRequest} from '../scripts/prompt-compiler.mjs';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {applyPoseControlOverrideV3} from '../lib/pose-v3';

const person=(id='a',gaze='looking toward the window')=>({characterId:id,fields:[
  {id:id+'.identity',group:'identity',text:'adult woman, long pink hair',source:'profile'},
  {id:id+'.pose',group:'pose',text:'sitting',source:'spec'},
  {id:id+'.gaze',group:'gaze',text:gaze,source:'spec'},
  {id:id+'.outfit',group:'clothing',text:'yellow blouse',source:'asset'},
]});
const relation=(phase='anticipation'):any=>({required:true,relationId:'a:book',characterId:'a',object:'book',objectInstanceId:'book:1',expectedCount:1,handMode:'one',activeHand:'right',
 visualFacts:{actionId:'pick',phase,contact:{hand:'right',part:'cover',state:phase==='anticipation'?'approach':'contact'},support:{label:'table',state:phase==='follow_through'?'held':'on_support'},gaze:{kind:'independent',targetId:'',surface:'',description:'looking toward the window'}},gaze:'looking toward the window'});
function recipeFor(relations:any[]=[]) {
 const plan=createPromptPlan({common:[{id:'light',group:'lighting',text:'window daylight',source:'spec'}],characters:[person()],relations});
 const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
 const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
 return {prompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final,repairPasses:{propInteractions:structuredClone(relations)}}};
}

test('shot pose choice persists through both reads and rejects non-booleans',()=>{
 const shot=getStudioData().episode.pages[0].shots[0];
 for(const enabled of [false,true]){
  updateShot(shot.id,{poseControlEnabled:enabled});
  assert.equal(getShotGenerationInput(shot.id).poseControlEnabled,enabled);
  assert.equal(getStudioData().episode.pages[0].shots[0].poseControlEnabled,enabled);
 }
 assert.throws(()=>updateShot(shot.id,{poseControlEnabled:'false'}),/布尔/);
});

test('off preserves saved skeleton and regions without projection, and guards every request stage',()=>{
 const recipe:any={...recipeFor(),poseUsage:poseUsagePlan(false),poseControl:{posePlanVersion:'3.0',enabled:false,svg:'original svg',people:[[{x:.4,y:.2}]],scenePlan:{projection:{scale:2}}},references:[{role:'identity',region:{xStart:0,xEnd:1}}]};
 const before=structuredClone(recipe);preparePoseExecutionV3(recipe);assert.deepEqual(recipe,before);
 const payload={prompt:recipe.prompt,negative_prompt:recipe.negativePrompt,alwayson_scripts:{ControlNet:{args:[{role:'identity',weight:.68,effective_region_mask:'region'}]}}};
 assert.doesNotThrow(()=>prepareGenerationPromptRequest(recipe,payload,{stage:'base'}));
 for(const stage of ['identity','outfit','prop','hand','gaze','handoff'])assert.throws(()=>prepareGenerationPromptRequest(recipe,payload,{stage,characterId:'a'}),/independent image localization/);
 for(const role of ['pose','initial_prop_structure','support_surface_geometry'])assert.throws(()=>assertControlPolicyRequest(recipe,{alwayson_scripts:{ControlNet:{args:[{role}]}}},{stage:'base'}),/geometry control/);
 assert.equal(usesPoseGeometry({poseControl:{enabled:false}}),true,'legacy recipes keep existing policy');
 assert.equal(usesPoseGeometry({poseUsage:poseUsagePlan(true)}),true);
 assert.deepEqual(recipe.poseControl,before.poseControl);
});

test('new gaze stages retain canonical target and identity while historical plans keep their old behavior',()=>{
 const recipe=recipeFor(),plan=recipe.generationSpec.promptPlan;
 const result=compileStagePrompt(plan,{stage:'gaze',characterId:'a',details:'looking at camera, short black hair'});
 assert.deepEqual(result.errors,[]);assert.match(result.prompt,/window/);assert.match(result.prompt,/long pink hair/);assert.doesNotMatch(result.prompt,/camera|short black/);
 assert.ok(result.audit.some(a=>a.reason==='effective_facts_own_action_and_gaze'));
 const legacy=structuredClone(plan);delete legacy.facts.consistencyVersion;
 assert.match(compileStagePrompt(legacy,{stage:'gaze',characterId:'a',details:'looking at camera'}).prompt,/looking at camera/);
});

test('actual request rejects phase drift, posture, identity, count and negative contradictions',()=>{
 const recipe=recipeFor([relation()]),payload={prompt:recipe.prompt,negative_prompt:recipe.negativePrompt};
 assert.deepEqual(recipe.generationSpec.promptPlan.errors,[]);
 for(const extra of ['standing','short black hair','two books','right hand gripping the book']){
  const result=compileStagePrompt(recipe.generationSpec.promptPlan,{stage:'hand',characterId:'a',relationId:'a:book',details:extra});
  assert.ok(result.errors.length,extra);
 }
 assert.throws(()=>prepareGenerationPromptRequest(recipe,{...payload,negative_prompt:'pink hair'},{stage:'base'}),/conflict/);
 const changed=structuredClone(recipe);changed.generationSpec.repairPasses.propInteractions[0].visualFacts.phase='follow_through';
 assert.throws(()=>prepareGenerationPromptRequest(changed,payload,{stage:'hand',characterId:'a',relationId:'a:book'}),/semantic drift/);
 const shifted=structuredClone(recipe);shifted.generationSpec.repairPasses.propInteractions[0].objectCenter={x:.1,y:.2};
 assert.doesNotThrow(()=>prepareGenerationPromptRequest(shifted,payload,{stage:'hand',characterId:'a',relationId:'a:book'}));
});

test('different people keep independent gaze and negatives, but one person cannot have two simultaneous targets',()=>{
 const a=relation(),b={...relation(),characterId:'b',relationId:'b:book',visualFacts:{...relation().visualFacts,gaze:{kind:'independent',description:'looking at camera'}}};
 const plan=createPromptPlan({common:[],characters:[{...person(),negative:'looking at camera'},person('b','looking at camera')],relations:[a,b]});
 assert.deepEqual(plan.errors,[]);assert.doesNotMatch(plan.negativePrompt,/camera/);
 const bad=createPromptPlan({common:[],characters:[person()],relations:[a,{...b,characterId:'a'}]});assert.match(bad.errors.join(' '),/simultaneous gaze/);
});

test('off-mode prompt keeps selected action phase without reading pixel projection',()=>{
 const data=getStudioData(),original=data.episode.pages[0].shots[0];
 const shot={...original,description:'picking up a book from a table',actionEn:'picking up a book from a table',scene:'library',sceneEn:'library with a table',characterLooks:{},visualSpec:null,visualSpecConfirmed:false,characterIds:[original.characterIds[0]]};
 const regional=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:'3.0'});
 const control:any=applyPoseControlOverrideV3(regional.poseControl as any,{schemaVersion:'pose-override-v1',phase:'follow_through'});
 const before=structuredClone(control);const enabled=buildEffectivePromptPlan(regional,control);
 control.scenePlan.projection.scale=NaN;
 const off=buildEffectivePromptPlan(regional,control,{useGeometry:false});
 assert.match(off.characterPrompts[0],/holding after picking up/);assert.deepEqual(off.errors,[]);
 assert.deepEqual(off.facts.relations.map(r=>r.visualFacts?.phase||r.actionPlan?.phase),enabled.facts.relations.map(r=>r.visualFacts?.phase||r.actionPlan?.phase));
 assert.equal(control.svg,before.svg);assert.deepEqual(control.people,before.people);
});

test('draft whole approval freezes off selection despite later shot changes',()=>{
 const data=getStudioData(1),shot=data.episode.pages[0].shots[0];
 const recipe:any={...recipeFor(),poseUsage:poseUsagePlan(false),phase:'draft',endpoint:'http://localhost/sdapi/v1/txt2img',width:256,height:384,targetWidth:512,targetHeight:768,references:[],finalReferences:[]};
 const payload={phase:'draft',draftImagePath:'../角色资产/小粉/00-原始参考图.png',recipe};
 const id=createPersistentGenerationJob(shot.id,'sd-webui',payload);updateGenerationJobPayload(id,payload);updatePersistentGenerationJob(id,'awaiting_draft_approval',100,'','等待确认');
 updateShot(shot.id,{poseControlEnabled:true});assert.ok(approveSdDraft(1,id));
 const final=JSON.parse(getGenerationJobRecord(id).payload).recipe;
 assert.deepEqual(final.poseUsage,recipe.poseUsage);assert.deepEqual(final.generationSpec.promptPlan,recipe.generationSpec.promptPlan);
});

test('base and all local stages share camera and effective facts across counts and framing',()=>{
 for(const count of [1,2,3])for(const framing of ['close-up','medium shot','full shot']){
  const people=Array.from({length:count},(_,i)=>person('actor'+i));
  const plan=createPromptPlan({common:[
   {id:'camera',group:'camera',text:framing,source:'spec'},
   {id:'angle',group:'cameraAngle',text:'eye-level view',source:'spec'},
   {id:'presentation',group:'presentation',text:'the window visible behind the people',source:'spec'},
  ],characters:people});
  const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
  const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  assert.deepEqual(final.errors,[]);
  const recipe:any={prompt,negativePrompt:final.negativePrompt,poseUsage:poseUsagePlan(false),generationSpec:{promptPlan:final}};
  const request=prepareGenerationPromptRequest(recipe,{prompt:'standing, looking at camera',negative_prompt:''},{stage:'base'});
  assert.match(request.prompt,/window visible/);assert.match(request.prompt,new RegExp(framing));
  assert.equal(request.prompt.split(' BREAK ').length,count+1);assert.doesNotMatch(request.prompt,/standing|looking at camera/);
  assert.ok(recipe.promptRequestTraces[0]);
  for(const p of people)for(const stage of ['identity','outfit','prop','hand','gaze','handoff']){
   const local=compileStagePrompt(final,{stage,characterId:p.characterId});
   assert.deepEqual(local.errors,[]);assert.match(local.prompt,/eye-level view/);
   assert.doesNotMatch(local.prompt,/standing|looking at camera/);
  }
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {compileStagePrompt} from '../scripts/prompt-compiler.mjs';
import {propInteractionGeometry} from '../scripts/prop-interaction-geometry.mjs';
import {contactPassAllowed} from '../scripts/action-stage-policy.mjs';
import {normalizeInteractionFacts} from '../lib/interaction-facts';
import {inferStoryActionContract} from '../lib/story-action-contract';

test('cup mechanism excludes other drinking mechanisms and preserves manual endpoint ownership',()=>{
 const input={object:'cup',purpose:'drink',objectCenter:{x:.5,y:.4},region:{xStart:0,xEnd:1}};
 assert.equal(inferStoryActionContract(input,'sipping from a cup')?.geometry.controlShape,'cup');
 for(const object of ['bottle','glass bottle','bowl','spoon'])assert.equal(inferStoryActionContract({...input,object},`drinking from a ${object}`),null);
 assert.equal(inferStoryActionContract(input,'drinking from a cup through a straw'),null);
});

test('ordinary cup drinking constructs rim, grip and mouth without manual coordinates',()=>{
 const actor:any={id:'actor',name:'Actor',appearanceEn:'adult woman',visualTraits:{},invariantsEn:[],references:[]};
 for(const object of ['cup','mug','glass'])for(const hand of ['left','right'] as const)for(const region of [{xStart:0,xEnd:1},{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}]){
  const action=`drinking from a ${object} with the ${hand} hand`;
  const {shot}=fixture(action,hand,region,'medium shot');shot.visualSpec.visibleFacts=[action];shot.visualSpec.scene={location:'room',timeOfDay:'day',lighting:'daylight',weather:'clear'};
  const c=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
  const p=c.poseControl!;assert.ok(p.posePlanVersion==='3.0');
  const g=p.scenePlan.people[0].actionRelationAudit?.geometry;
  assert.equal(g?.mechanism,'mouth',object);assert.equal(g?.controlShape,'cup');assert.ok(g?.outline?.length);
  assert.equal(p.safety.valid,true,JSON.stringify(p.safety));
  assert.deepEqual(g.mouthContact,{x:p.fullPeople[0][0].x,y:p.fullPeople[0][0].y+.035});
  const ex=compilePoseExecutionV3(p,c.repairPasses)!;const r=ex.repairPasses.propInteractions[0];
  const geo=propInteractionGeometry(r,p.people,0,512,512,ex.scenePlan.people);
  assert.deepEqual(geo.actionGeometry.mouthContact,r.actionRelationAudit?.geometry?.mouthContact);
  const plan=buildEffectivePromptPlan(c,p);
  for(const stage of ['prop','hand']){
   const prompt=compileStagePrompt(plan,{stage,characterId:'actor',relationId:r.relationId});
   assert.deepEqual(prompt.errors,[]);assert.match(prompt.prompt,/rim touching the lips/);assert.doesNotMatch(prompt.prompt,/held upright|rim approaching/);
  }
  for(const phase of ['anticipation','follow_through'] as const){
   const changed=applyPoseControlOverrideV3(p,{schemaVersion:'pose-override-v1',phase});
   const execution=compilePoseExecutionV3(changed,c.repairPasses)!;
   const relation=execution.repairPasses.propInteractions[0],geometry=relation.actionRelationAudit!.geometry!;
   assert.equal(contactPassAllowed(relation),true,'cup remains held');
   assert.ok(geometry.mouthContact!.y>geometry.mouthTarget!.y,'rim separated from lips');
  }
  const id=p.scenePlan.relations[0].objectInstanceId;
  const moved=applyPoseControlOverrideV3(p,{schemaVersion:'pose-override-v1',propPositions:[{objectInstanceId:id,center:{x:region.xStart+.15,y:.65}}]});
  assert.equal(moved.scenePlan.relations[0].objectCenter.y,.65);
  assert.throws(()=>compilePoseExecutionV3(moved,c.repairPasses),'manual placement is preserved and cannot claim mouth contact');
 }
});

function fixture(action:string,hand:'left'|'right',region:{xStart:number;xEnd:number},camera:string){
 const x=(region.xStart+region.xEnd)/2;
 const shot:any={id:9870,pageId:1,order:1,title:'drink',dialogue:'',scene:'room',sceneEn:'room',compositionEn:'',lightingEn:'daylight',expressionEn:'neutral',description:action,actionEn:action,camera,cameraEn:camera,characterIds:['actor'],visualSpecConfirmed:true,visualSpec:{camera:{shotSize:camera},characters:[{characterId:'actor',action,region,expression:'neutral'}]}};
 const relation:any={relationId:'mouth-prop',characterId:'actor',required:true,object:action.startsWith('drinking')?'cup':'spoon',purpose:'drink',handMode:'one',activeHand:hand,objectCenter:{x,y:.23},region,contactAnchors:[{hand,x,y:.23}],positive:[]};
 return {shot,relation};
}

test('mouth actions require an explicit valid object-mouth endpoint and project it with the actor',()=>{
 for(const action of ['drinking from a cup','eating with a spoon'])for(const hand of ['left','right'] as const)for(const region of [{xStart:0,xEnd:1},{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}])for(const camera of ['medium shot','wide shot']){
  const {shot,relation}=fixture(action,hand,region,camera);
  const base=buildPoseControlV3(shot,[relation])!;
  assert.ok(base);assert.equal(base.scenePlan.people[0].actionRelationAudit?.status,'pending');
  assert.throws(()=>compilePoseExecutionV3(base,{propInteractions:[relation]}),/口部|mouth/);
  const nose=base.fullPeople[0][0];
  const mouth={x:nose.x,y:nose.y+.035};
  const valid=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',actionGeometry:{mouthContact:mouth}});
  assert.equal(valid.scenePlan.people[0].actionRelationAudit?.status,'planned',JSON.stringify(valid.safety));
  const ex=compilePoseExecutionV3(valid,{propInteractions:[relation]})!;
  const projection=valid.scenePlan.projection!;
  const expected={x:(mouth.x-.5)*projection.scale+.5+projection.translate.x,y:(mouth.y-.5)*projection.scale+.5+projection.translate.y};
  assert.deepEqual(ex.repairPasses.propInteractions[0].actionRelationAudit?.geometry?.mouthContact,expected);
  const far=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',actionGeometry:{mouthContact:{x:mouth.x,y:mouth.y+.3}}});
  assert.equal(far.scenePlan.people[0].actionRelationAudit?.status,'pending');
  assert.throws(()=>compilePoseExecutionV3(far,{propInteractions:[relation]}),/口部|mouth/);
 }
});

test('structured drink facts, framing and mirrors keep the rim attached without overriding other actors',()=>{
 const actor:any={id:'actor',name:'Actor',appearanceEn:'adult person',visualTraits:{},invariantsEn:[],references:[]};
 for(const camera of ['medium close-up','medium shot','wide shot'])for(const ids of [['actor'],['actor','other']]){
  const {shot}=fixture('drinking from a cup','left',{xStart:0,xEnd:1},camera);
  shot.characterIds=ids;shot.visualSpec.characters=ids.map((id,i)=>({characterId:id,action:'drinking from a cup',expression:'neutral',region:{xStart:i/ids.length,xEnd:(i+1)/ids.length}}));
  shot.visualSpec.visibleFacts=['drinking from cups'];shot.visualSpec.scene={location:'room',timeOfDay:'day',lighting:'daylight',weather:'clear'};
  shot.visualSpec.interactions=ids.map(id=>({type:'character-prop',actorCharacterId:id,propId:id+':cup',action:'drinking from a cup',phase:'contact',gazeTarget:'',contactPoints:['left hand gripping cup'],visualFacts:normalizeInteractionFacts({version:'interaction-facts-1',actionId:'drink',phase:'contact',object:{instanceId:id+':cup',label:'cup',count:1},contact:{hand:'left',part:'body',state:'contact'},support:{state:'held',label:''},gaze:{kind:'independent',targetId:'',surface:'',description:'looking forward'},provenance:{}})}));
  const c=buildRegionalPrompt(shot,[],ids.map(id=>({...actor,id})),{posePlannerVersion:'3.0'});const base=c.poseControl!;assert.ok(base.posePlanVersion==='3.0');
  for(const mirror of [false,true]){
   const p:import("../lib/pose-v3/schema").PoseControlV3=mirror?applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',mirror:true}):base;
   if(camera==='medium close-up'&&!p.safety.valid){
    assert.ok(p.safety.errors.every(e=>/requested chest_action crop/.test(e)),JSON.stringify(p.safety));
    assert.throws(()=>compilePoseExecutionV3(p,c.repairPasses),/framing/);
    continue;
   }
   const ex=compilePoseExecutionV3(p,c.repairPasses)!;
   for(const [i,person] of p.scenePlan.people.entries())assert.deepEqual(person.actionRelationAudit?.geometry?.mouthContact,{x:p.fullPeople[i][0].x,y:p.fullPeople[i][0].y+.035});
   assert.equal(new Set(ex.repairPasses.propInteractions.map(r=>r.objectInstanceId)).size,ids.length);
   const plan=buildEffectivePromptPlan(c,p);
   for(const r of ex.repairPasses.propInteractions){const request=compileStagePrompt(plan,{stage:'prop',characterId:r.characterId,relationId:r.relationId});assert.deepEqual(request.errors,[]);assert.match(request.prompt,/rim touching the lips/);}
  }
 }
});

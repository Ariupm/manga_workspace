import assert from 'node:assert/strict';
import test from 'node:test';
import {getStudioData} from '../lib/db';
import {normalizeShotSpec,validateVisualIds} from '../lib/visual-planning';
import {deriveInteractionContracts,buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {derivePoseScenePlanV2} from '../lib/pose-v2';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {compileStagePrompt} from '../scripts/prompt-compiler.mjs';
import {relationGazeDescription,isLastRelationGaze,propPhysicalAppearance,gazeRefinementPrompt} from '../scripts/sd-worker-logic.mjs';
import {propInteractionGeometry} from '../scripts/prop-interaction-geometry.mjs';
import {normalizeInteractionFacts,assertInteractionFactTranslation} from '../lib/interaction-facts';
const data=getStudioData(),base=data.episode.pages[0].shots[0];
const facts=(id:string,label:string,hand:string,actionId:string)=>({version:'interaction-facts-1',object:{instanceId:id,label,count:1},actionId,phase:'contact',contact:{hand,part:'body',state:'contact'},support:{label:'desk',state:'on_support'},gaze:{kind:'object',targetId:'target',surface:'',description:'looking downward at the working surface'},provenance:{}});
function fixture(tool='scissors',target='cardboard package',operation='cutting',ids=[base.characterIds[0]]){
 const shot={...base,description:'seated at the desk',actionEn:'working at the desk',characterLooks:{},characterIds:ids,camera:'中景',cameraEn:'medium shot'};
 const raw={scene:{location:'studio',anchors:['desk','chair']},characters:ids.map(characterId=>({characterId,bodyPose:'sitting',bodySupport:'chair',action:'working at the desk',hands:'hands naturally positioned for the described action and framing'})),interactions:ids.flatMap(actorCharacterId=>{
  const targetId=actorCharacterId+':target',toolId=actorCharacterId+':tool';
  const a=facts(toolId,tool,'right','tool'),b=facts(targetId,target,'left','touch');
  a.gaze.targetId=targetId;b.gaze.targetId=targetId;
  a.contact.part='handle';a.support={label:'',state:'held'};
  return [{actorCharacterId,propId:toolId,type:'character-prop',action:operation+' the '+target,phase:'contact',contactPoints:['right hand gripping handle'],gazeTarget:'work surface',visualFacts:{...a,workTarget:{instanceId:targetId,surface:target==='cardboard package'?'sealing tape':'working surface',operation,u:.5,v:.2}}},{actorCharacterId,propId:targetId,type:'character-prop',action:'stabilizing the '+target,phase:'contact',contactPoints:['left hand stabilizing object'],gazeTarget:'work surface',visualFacts:b}];})};
 return {...shot,visualSpec:normalizeShotSpec(raw,shot,{interactionSource:'model'}),visualSpecConfirmed:true};
}

test('tools bind the target surface through projection, worker geometry and each prompt stage',()=>{
 for(const [tool,target,operation] of [['scissors','cardboard package','cutting'],['knife','paper','cutting'],['brush','canvas','painting'],['screwdriver','screw','tightening']] as const){
  const shot=fixture(tool,target,operation),regional=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:'3.0'});
  const control=regional.poseControl as any,execution:any=compilePoseExecutionV3(control,regional.repairPasses,{advisory:true});
  const plan=buildEffectivePromptPlan(regional,control),relations=execution.repairPasses.propInteractions;
  const t=relations.find((r:any)=>r.object===tool),o=relations.find((r:any)=>r.object===target);
  assert.deepEqual(plan.errors,[]);assert.equal(control.scenePlan.people[0].supportRelation.supportKind,'chair');
  assert.match(plan.characterPrompts[0],/sitting/);assert.doesNotMatch(plan.characterPrompts[0],/side readable|using the scissors|thin rigid/);
  const g=t.actionPlan.geometry,tg=o.actionPlan.geometry;
  const expected={x:o.objectCenter.x,y:o.objectCenter.y-.3*tg.extent.height};
  assert.ok(Math.hypot(g.workPoint.x-expected.x,g.workPoint.y-expected.y)<1e-8);
  assert.deepEqual(g.toolEnd,g.workPoint);
  const worker=propInteractionGeometry(o,execution.people,0,512,512,execution.scenePlan.people);
  assert.equal(worker.actionGeometry.mechanism,'support');assert.ok(worker.bodySize.width>=tg.extent.width);
  const targetText=relationGazeDescription(t,relations);assert.match(targetText,new RegExp(target));
  const details=gazeRefinementPrompt({direction:'down',object:tool,targetKind:'object',targetDescription:targetText,gazeText:t.gaze});
  assert.doesNotMatch(details,new RegExp('same '+tool));
  for(const stage of ['prop','hand','gaze']){
   const compiled=compileStagePrompt(plan,{stage,characterId:t.characterId,relationId:t.relationId,details:stage==='gaze'?details:''});
   assert.deepEqual(compiled.errors,[]);assert.match(compiled.prompt,new RegExp(target));
  }
  assert.equal(relations.filter((r:any)=>isLastRelationGaze(r,relations)).length,1);
  if(tool==='scissors'){assert.equal(control.safety.valid,true,JSON.stringify(control.safety));assert.match(propPhysicalAppearance(o),/three-dimensional/);}
 }
});

test('body support rejects substrings and preserves actor-specific seat selection',()=>{
 const shot=fixture();delete shot.visualSpec.characters[0].bodySupport;shot.visualSpec.scene.anchors=[];
 for(const text of ['described action','embedded object']){shot.visualSpec.characters[0].hands=text;const p=derivePoseScenePlanV2(shot,[]);assert.notEqual(p?.people[0].supportRelation.supportKind,'bed');}
 shot.visualSpec.characters[0].bodySupport='bed';assert.equal(derivePoseScenePlanV2(shot,[])?.people[0].supportRelation.supportKind,'bed');
 shot.visualSpec.characters[0].bodySupport='chair';assert.equal(derivePoseScenePlanV2(shot,[])?.people[0].supportRelation.supportKind,'chair');
});

test('work binding validates IDs, hands and translation without borrowing gaze',()=>{
 const shot=fixture();const relation=shot.visualSpec.interactions[0],f=relation.visualFacts!;
 assert.throws(()=>normalizeInteractionFacts({...f,workTarget:{...f.workTarget,u:Infinity}}),/坐标/);
 assert.throws(()=>assertInteractionFactTranslation(shot.visualSpec,{...shot.visualSpec,interactions:shot.visualSpec.interactions.map((r,i)=>i===0?{...r,visualFacts:{...r.visualFacts,workTarget:{...f.workTarget,instanceId:'other'}}}:r)}),/改变/);
 f.workTarget!.instanceId='missing';assert.equal(validateVisualIds(shot.visualSpec,data.characters,data.assets).valid,false);
 f.workTarget!.instanceId=shot.visualSpec.interactions[1].visualFacts!.object.instanceId;shot.visualSpec.interactions[1].visualFacts!.contact.hand='right';assert.throws(()=>deriveInteractionContracts(shot,shot.characterIds[0]),/同一只手/);
});

test('two actors keep their own work objects, and independent gaze is not used as work input',()=>{
 const ids=[base.characterIds[0],'second_actor'];
 const shot=fixture('brush','canvas','painting',ids);
 for(const id of ids){const rs=deriveInteractionContracts(shot,id),t=rs.find(r=>r.object==='brush')!;assert.equal(t.visualFacts?.workTarget?.instanceId,id+':target');assert.equal(t.gazeTarget.targetId,id+':target');}
 const one=fixture();for(const r of one.visualSpec.interactions){r.visualFacts!.gaze={kind:'independent',targetId:'',surface:'',description:'looking toward the window'};}
 const tool=deriveInteractionContracts(one,one.characterIds[0]).find(r=>r.object==='scissors')!;
 assert.equal(tool.gazeTarget.kind,'independent');assert.ok(tool.actionPlan?.geometry.workTargetId);
});


test('manual gaze surface and provenance survive coupled work layout',()=>{
 const shot=fixture();
 for(const r of shot.visualSpec.interactions){r.visualFacts!.gaze.surface='label';r.visualFacts!.gaze.description='eyes focused on the package label';r.visualFacts!.provenance.gaze={source:'manual',evidence:'selected label'};}
 const rs=deriveInteractionContracts(shot,shot.characterIds[0]);
 for(const r of rs){assert.equal(r.visualFacts?.gaze.surface,'label');assert.equal(r.visualFacts?.provenance.gaze?.source,'manual');assert.match(relationGazeDescription(r,rs),/label/);}
 assert.doesNotMatch(propPhysicalAppearance({object:'metal box',visualFacts:{object:{form:'solid_box'}}}),/cardboard/);
});

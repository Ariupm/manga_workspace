import test from 'node:test';
import assert from 'node:assert/strict';
import {getStudioData} from '../lib/db';
import {normalizeShotSpec} from '../lib/visual-planning';
import {buildRegionalPrompt,buildEffectivePromptPlan,deriveInteractionContracts} from '../lib/prompts';
import {compileStagePrompt,relationVisualText} from '../scripts/prompt-compiler.mjs';
import {compilePoseExecutionV3,preparePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {propInteractionGeometry} from '../scripts/prop-interaction-geometry.mjs';
import {propBodySizePlan} from '../scripts/sd-worker-logic.mjs';

const data=getStudioData(),base=data.episode.pages[0].shots[0];
function fixture(object='open book',hand='right',camera='medium shot',ids=[base.characterIds[0]]){
  const shot={...base,characterIds:ids,characterLooks:{},camera:camera,cameraEn:camera,actionEn:'pointing',description:'pointing at a visible mark'};
  const action=`pointing at a marked section of the ${object} with ${hand} index finger`;
  const raw={scene:{location:'home',anchors:['desk']},camera:{shotSize:camera},characters:ids.map((characterId,i)=>({characterId,region:{xStart:i/ids.length,xEnd:(i+1)/ids.length},action,bodyPose:'standing',gazeTarget:'looking down at the marked section'})),interactions:ids.map(actorCharacterId=>({actorCharacterId,propId:actorCharacterId+':object',type:'character-prop',action,phase:'contact',contactPoints:[`${hand} index finger to the marked section`],gazeTarget:actorCharacterId+':object',visualFacts:{version:'interaction-facts-1',actionId:'inspect',object:{label:object,instanceId:actorCharacterId+':object',count:1,width:.32,height:.24,form:'flat'},phase:'contact',contact:{hand,part:'surface',state:'contact'},support:{label:'desk',state:'on_support'},gaze:{kind:'object',targetId:actorCharacterId+':object',surface:'marked section',description:'looking down at the marked section'},provenance:{}}}))};
  return {...shot,visualSpec:normalizeShotSpec(raw,shot,{interactionSource:'model'}),visualSpecConfirmed:true};
}

test('concrete pointing survives normal/effective compilation and prop/hand stages for objects, sides and framing',()=>{
  for(const object of ['open book','map','control panel'])for(const hand of ['left','right'])for(const camera of ['medium close-up','medium shot','full shot']){
    const shot=fixture(object,hand,camera),regional=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:'3.0'});
    for(const plan of [regional.promptPlan,buildEffectivePromptPlan(regional,regional.poseControl as any),buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry:false})]){
      assert.deepEqual(plan.errors,[]);
      assert.match(plan.characterPrompts[0],/pointing at a marked section/);
      const relation=plan.facts.relations[0];
      for(const stage of ['prop','hand']){
        const compiled=compileStagePrompt(plan,{stage,characterId:shot.characterIds[0],relationId:relation.relationId});
        assert.deepEqual(compiled.errors,[]);assert.match(compiled.prompt,new RegExp(`${hand} index finger`));assert.match(compiled.prompt,/marked section/);
      }
    }
  }
});

test('details do not cross actors, invent a finger, or survive incompatible phase/hand edits',()=>{
  const ids=[base.characterIds[0],'character_other'];const shot=fixture('map','left','medium shot',ids);
  shot.visualSpec.characters[1].action='examining a map';shot.visualSpec.interactions[1].action='examining a map';shot.visualSpec.interactions[1].contactPoints=['left hand to map'];
  const a=deriveInteractionContracts(shot,ids[0])[0],b=deriveInteractionContracts(shot,ids[1])[0];
  assert.match(relationVisualText(a,'hand'),/left index finger/);assert.doesNotMatch(relationVisualText(b,'hand'),/index finger|pointing/);
  const changed=structuredClone(a);changed.visualFacts!.contact.hand='right';changed.activeHand='right';
  assert.doesNotMatch(relationVisualText(changed,'hand'),/left index finger/);
  const legacy=structuredClone(a);delete legacy.actionDetail;
  assert.doesNotMatch(relationVisualText(legacy,'hand'),/index finger/);
  const phaseEdit=structuredClone(a);phaseEdit.visualFacts!.actionId='pick';phaseEdit.visualFacts!.phase='anticipation';phaseEdit.visualFacts!.contact.state='approach';
  assert.doesNotMatch(relationVisualText(phaseEdit,'hand'),/pointing|index finger/);
});

test('size hints reach projection and worker once for multiple actors, dimensions and shot sizes',()=>{
  for(const camera of ['medium close-up','medium shot','full shot'])for(const ids of [[base.characterIds[0]],[base.characterIds[0],'character_other']]){
    const shot=fixture('open book','right',camera,ids);
    if(ids.length>1){shot.visualSpec.interactions[1].visualFacts!.object.width=.2;shot.visualSpec.interactions[1].visualFacts!.object.height=.12;}
    const regional=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:'3.0'}),control:any=regional.poseControl;
    const execution:any=compilePoseExecutionV3(control,regional.repairPasses,{advisory:true});
    execution.repairPasses.propInteractions.forEach((relation:any,i:number)=>{
      const original=shot.visualSpec.interactions[i].visualFacts!.object;
      assert.equal(relation.propSizeHint.coordinateSpace,'projected_canvas');
      assert.ok(Math.abs(relation.propSizeHint.width-original.width!*control.scenePlan.projection.scale)<1e-10);
      const geometry=propInteractionGeometry(relation,execution.scenePlan.fullPeople,i,512,512,execution.scenePlan.people);
      assert.ok(geometry.bodySize.width>=relation.propSizeHint.width-1e-10);
      assert.ok(geometry.bodySize.height>=relation.propSizeHint.height-1e-10);
      assert.equal(geometry.bodySize.width,geometry.bodySize.envelope.width);
      const evidence=control.scenePlan.evidence.find((e:any)=>e.relationId===relation.relationId);
      assert.equal(evidence.propFootprint.propSizeHint.width,original.width);
    });
    const recipe:any={poseControl:control,posePreflightPolicy:'advisory',generationSpec:{repairPasses:regional.repairPasses}};
    preparePoseExecutionV3(recipe);const once=JSON.stringify(recipe.generationSpec.repairPasses);
    preparePoseExecutionV3(recipe);assert.equal(JSON.stringify(recipe.generationSpec.repairPasses),once);
  }
});

test('hinted geometry changes with size while old snapshots and authored outlines keep their policy',()=>{
  const r=deriveInteractionContracts(fixture())[0],small=structuredClone(r),large=structuredClone(r);
  small.propSizeHint!.width=.1;small.propSizeHint!.height=.08;large.propSizeHint!.width=.4;large.propSizeHint!.height=.3;
  const a=propInteractionGeometry(small),b=propInteractionGeometry(large);
  assert.ok(b.bodySize.width>a.bodySize.width);assert.ok(b.bodySize.height>a.bodySize.height);
  assert.deepEqual(a.center,b.center);assert.deepEqual(a.contacts,b.contacts);
  const legacy=structuredClone(r);delete legacy.propSizeHint;
  const original=propInteractionGeometry(legacy);legacy.visualFacts!.object.width=.1;
  assert.deepEqual(propInteractionGeometry(legacy),original,'old snapshots do not silently upgrade');
  const authored:any={...large,actionPlan:{geometry:{objectCenter:{x:.5,y:.5},outline:[{points:[{x:.4,y:.4},{x:.6,y:.6}]}]}}};
  assert.ok(Math.abs(propInteractionGeometry(authored).bodySize.width-.2)<1e-8,'mechanism outline wins over hint');
  const grips=propBodySizePlan({shape:'landscape_rect',contactSpan:.3,hasPoseContact:true,propSizeHint:{version:'prop-size-1',coordinateSpace:'full_pose',width:.1,height:.08}});
  assert.ok(grips.width>=.3-1e-10,'small hint does not shrink the object inside two contacts');
});

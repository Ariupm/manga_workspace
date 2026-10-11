import test from 'node:test';
import assert from 'node:assert/strict';
import {objectHandEvidence,explicitHandMode} from '../lib/pose-action-semantics';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {compileStagePrompt} from '../scripts/prompt-compiler.mjs';

test('each prop receives its own hand instead of the scene-wide both-hands visibility phrase',()=>{
 const actor:any={id:'actor',name:'Actor',appearanceEn:'adult woman',visualTraits:{},invariantsEn:[],references:[]};
 for(const [tool,operation] of [['pen','writing on paper'],['scissors','cutting paper'],['brush','painting a canvas']])for(const hand of ['right','left'])for(const visibility of ['', ', both hands visible']){
  const other=hand==='right'?'left':'right';
  const action=`${operation} with a ${tool}, her ${hand} hand holding the ${tool}, her ${other} hand holding the paper${visibility}`;
  const evidence=objectHandEvidence(action,tool)!;
  assert.equal(explicitHandMode(evidence),'one');assert.match(evidence,new RegExp(hand+' hand'));
  assert.doesNotMatch(evidence,new RegExp(other+' hand'));
  const shot:any={id:9910,pageId:1,order:1,title:'work',description:action,actionEn:action,scene:'room',sceneEn:'room',camera:'medium shot',cameraEn:'medium shot',compositionEn:'',characterIds:['actor'],characterLooks:{},visualSpecConfirmed:true,visualSpec:{camera:{shotSize:'medium shot'},characters:[{characterId:'actor',action,region:{xStart:0,xEnd:1},expression:'neutral'}],scene:{location:'room',weather:'clear',timeOfDay:'day',lighting:'daylight'},visibleFacts:[action],interactions:[],interaction:null}};
  const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
  const relation=regional.repairPasses.propInteractions[0];assert.equal(relation.object,tool);assert.equal(relation.handMode,'one');assert.equal(relation.activeHand,hand);
  for(const plan of [regional.promptPlan,buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry:false})]){
   for(const stage of ['prop','hand']){const prompt=compileStagePrompt(plan,{stage,characterId:'actor',relationId:relation.relationId});assert.deepEqual(prompt.errors,[]);assert.doesNotMatch(prompt.prompt,new RegExp(`both hands (?:contacting|physically contact) the ${tool}`));}
  }
 }
 assert.equal(explicitHandMode(objectHandEvidence('both hands holding the box','box')!),'two');
 assert.equal(explicitHandMode(objectHandEvidence('left hand gripping the box, right hand supporting the box','box')!),'two');
 assert.equal(objectHandEvidence('both hands and the box visible','box'),undefined);
});

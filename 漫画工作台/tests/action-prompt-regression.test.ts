import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveInteractionContracts,buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {storyActionPhase,inferStoryActionContract} from '../lib/story-action-contract';
import {contactPassAllowed} from '../scripts/action-stage-policy.mjs';
import {resolvePropVisualFacts,compileStagePrompt,prepareGenerationPromptRequest,finalizePromptPlan} from '../scripts/prompt-compiler.mjs';
import {poseUsagePlan,referenceRegionPlan} from '../scripts/generation-control-policy.mjs';

const actor:any={id:'actor',name:'Actor',appearanceEn:'adult woman',visualTraits:{},invariantsEn:[],references:[]};
function scene(camera='medium shot',object='package'):any {
  const action=`reaching for ${object} on the shelf`;
  return {id:9800,pageId:1,order:1,title:'action',description:action,scene:'workshop',sceneEn:'workshop with shelving',timeOfDay:'day',actionEn:action,expressionEn:'neutral',camera,cameraEn:camera,compositionEn:'',lightingEn:'daylight',characterIds:['actor'],characterLooks:{},environment:{},visualSpecConfirmed:true,
    visualSpec:{camera:{shotSize:camera},characters:[{characterId:'actor',action,expression:'neutral',gazeTarget:`the ${object} on the shelf`,position:'facing right toward the shelf, three-quarter back view',hands:`left hand holding smartphone at her side; right hand extended forward, fingers open and about to touch the ${object}`,region:{xStart:.2,xEnd:.6},appearanceState:{hair:'',bag:'',accessories:[],glasses:'',outerwearState:'',condition:[]}}],scene:{location:'workshop',timeOfDay:'day',weather:'clear',lighting:'daylight',sceneId:'workshop'},visibleFacts:[action],interaction:null,interactions:[
      {type:'character_prop_interaction',actorCharacterId:'actor',targetCharacterId:'',propId:'prop_'+object,action:'reaching for '+object,phase:'pre-contact',contactPoints:['right hand fingertips',object+' surface'],gazeTarget:'prop_'+object},
      {type:'character_prop_interaction',actorCharacterId:'actor',targetCharacterId:'',propId:'prop_smartphone',action:'holding smartphone',phase:'ongoing',contactPoints:['left hand'],gazeTarget:'prop_'+object},
    ]}};
}

test('pre-contact aliases resolve before contact and control contact-pass eligibility',()=>{
 for(const action of ['reaching for a package','picking up a book','placing a cup'])for(const phase of ['pre-contact','pre contact','pre_contact','before contact','anticipation']){
   assert.equal(storyActionPhase(phase),'anticipation');
   const plan=inferStoryActionContract({object:'book',purpose:'pick',objectCenter:{x:.4,y:.5},region:{xStart:0,xEnd:1}},action,phase,true)!;
   assert.equal(plan.phase,'anticipation');assert.equal(contactPassAllowed({actionPlan:plan}),plan.actionId==="place");
 }
 assert.equal(storyActionPhase('contact'),'contact');assert.equal(storyActionPhase('follow_through'),'follow_through');
});

test('legacy prop catalog keys become nouns while arbitrary labels and quantities survive',()=>{
 for(const [id,noun] of [['prop_smartphone','smartphone'],['prop_package','package'],['prop_book_2','book'],['prop_cup','cup']])assert.equal(resolvePropVisualFacts(id).object,noun);
 assert.deepEqual(resolvePropVisualFacts('prop_book','two paperback books'),{object:'book',expectedCount:2});
 for(const label of ['medium brown cardboard package','opaque_892','paper lantern'])assert.equal(resolvePropVisualFacts(label).object,label);
});

test('sparse relation contact inherits only the matching actor hand/object, not its other operation',()=>{
 const shot=scene();shot.visualSpec.characters[0].action='reading a book while carrying a smartphone';
 const relations=deriveInteractionContracts(shot,'actor');
 const phone=relations.find(r=>r.object==='smartphone')!,parcel=relations.find(r=>r.object==='package')!;
 assert.equal(phone.purpose,'carry');assert.equal(phone.gazeMode,'independent');assert.equal(phone.activeHand,'left');
 assert.ok(phone.objectCenter.x>.45,'side carry uses the same placement evidence for geometry');
 assert.doesNotMatch(phone.affordance,/in front of the torso|screen facing/);
 assert.equal(parcel.actionPlan?.phase,'anticipation');assert.equal(parcel.activeHand,'right');assert.equal(contactPassAllowed(parcel),false);
 assert.match(phone.objectInstanceId,/prop-smartphone/,'identity keys are unchanged');
 // The phone belongs to the other hand: an unrelated side clause cannot attach.
 shot.visualSpec.characters[0].hands='right hand holding package at her side; left hand holding smartphone in front of the torso';
 assert.notEqual(deriveInteractionContracts(shot,'actor').find(r=>r.object==='smartphone')?.purpose,'carry');
});

test('two actors keep separate carried and actively read phones through the shared prompt plan',()=>{
 const shot=scene();shot.characterIds.push('other');
 shot.visualSpec.characters.push({...structuredClone(shot.visualSpec.characters[0]),characterId:'other',region:{xStart:.65,xEnd:.95},position:'right side',action:'reading a smartphone notification',hands:'right hand holding smartphone in front of the torso',gazeTarget:'smartphone screen'});
 shot.visualSpec.interactions.push({type:'character_prop_interaction',actorCharacterId:'other',targetCharacterId:'',propId:'prop_smartphone',action:'reading a smartphone notification',phase:'contact',contactPoints:['right hand'],gazeTarget:'smartphone screen'});
 const carried=deriveInteractionContracts(shot,'actor').find(r=>r.object==='smartphone')!;
 const reading=deriveInteractionContracts(shot,'other')[0];
 assert.equal(carried.purpose,'carry');assert.equal(carried.activeHand,'left');
 assert.equal(reading.purpose,'read');assert.equal(reading.activeHand,'right');assert.notEqual(carried.objectInstanceId,reading.objectInstanceId);
 const regional=buildRegionalPrompt(shot,[],[actor,{...actor,id:'other'}],{posePlannerVersion:'3.0'});
 const plan=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry:false});
 assert.deepEqual(plan.errors,[]);assert.doesNotMatch(plan.characterPrompts[0],/in front of the torso/);
 assert.match(plan.characterPrompts[1],/in front of the torso/);assert.doesNotMatch(plan.characterPrompts[1],/left hand|package/);
});

test('reading and calls remain explicit uses even when the other object is carried at the side',()=>{
 for(const action of ['reading a smartphone notification','making a phone call']){
  const shot=scene();shot.visualSpec.interactions[1].action=action;
  shot.visualSpec.characters[0].hands='left hand holding smartphone; right hand holding package at her side';
  const phone=deriveInteractionContracts(shot,'actor').find(r=>r.object==='smartphone')!;
  assert.equal(phone.purpose,action.startsWith('reading')?'read':'call');
 }
});

test('corrected legacy relationships reach base and local payloads across framing and objects',()=>{
 for(const camera of ['close-up','medium shot','wide shot'])for(const object of ['package','book','cup']){
  const shot=scene(camera,object),regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
  for(const useGeometry of [false,true]){
   const plan=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry});
   assert.deepEqual(plan.errors,[],camera+object);
   const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
   const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
   const recipe:any={prompt,negativePrompt:final.negativePrompt,poseUsage:poseUsagePlan(useGeometry),generationSpec:{promptPlan:final,repairPasses:{propInteractions:final.facts.relations}}};
   const payload=prepareGenerationPromptRequest(recipe,{prompt,negative_prompt:final.negativePrompt},{stage:'base'});
   assert.doesNotMatch(payload.prompt,/prop_(?:smartphone|package|book|cup)|in front of the torso|right hand contacting/);
   assert.match(payload.prompt,/approaching .*visible gap/);assert.match(payload.prompt,/three-quarter back view/);
   const relation=final.facts.relations.find(r=>r.object===object)!;
   for(const stage of ['identity','outfit','prop','hand','gaze']){
    const local=compileStagePrompt(final,{stage,characterId:'actor',relationId:relation.relationId});
    assert.deepEqual(local.errors,[]);assert.doesNotMatch(local.prompt,/prop_(?:smartphone|package|book|cup)|right hand contacting/);
   }
  }
 }
});

test('reference masks use matching authored regions, never disabled skeleton or array index',()=>{
 const recipe:any={width:512,height:768,poseUsage:poseUsagePlan(false),poseControl:{people:[[{x:.99,y:.99}]]},generationSpec:{characterRegions:[{characterId:'b',region:{xStart:.65,xEnd:.95}},{characterId:'a',region:{xStart:.1,xEnd:.4}}]}};
 const region=referenceRegionPlan(recipe,{characterId:'a'});
 assert.deepEqual(region?.region,{xStart:.1,xEnd:.4});assert.equal(region?.shape,'character_region');assert.equal(region?.bounds.height,768);
 assert.equal(referenceRegionPlan(recipe,{characterId:'missing'}),null);
 assert.equal(referenceRegionPlan({...recipe,poseUsage:{version:'pose-usage-1',enabled:false}},{characterId:'a'}),null,'old snapshots do not acquire a new region policy');
 assert.equal(referenceRegionPlan(recipe,{characterId:'a',region:{xStart:.2,xEnd:.6}})?.source,'reference.region');
 assert.throws(()=>referenceRegionPlan(recipe,{characterId:'a',region:{xStart:NaN,xEnd:.6}}),/Invalid/);
});
import {gazeInstruction,viewCompatibleVisibility} from '../scripts/gaze-expression.mjs';

test('gaze target compilation is explicit and idempotent without inventing head angles',()=>{
 for(const [input,expected] of [['the package on the shelf','eyes focused on the package on the shelf'],['the other person’s eyes','eyes focused on the other person’s eyes'],['right','looking right'],['down','looking down'],['down at the book','looking down at the book'],['toward the window','looking toward the window'],['(the cup:1.3)','(eyes focused on the cup:1.3)'],['camera','eyes focused on camera']]){
  assert.equal(gazeInstruction(input),expected);assert.equal(gazeInstruction(expected),expected);
 }
 for(const text of ['', 'closed eyes', 'eyes gently closed', 'eyes closed','her eyes are closed','head turned left, eyes looking right','looking down at the book','no eye contact with camera','not looking at the package','gazing at the viewer'])assert.equal(gazeInstruction(text),text);
 assert.equal(viewCompatibleVisibility('face and upper body clearly visible','front view','package'),'face and upper body clearly visible');
 assert.equal(viewCompatibleVisibility('face clearly visible','back view','looking at camera'),'face clearly visible');
 assert.match(viewCompatibleVisibility('face and upper body clearly visible','three-quarter back view','package'),/only the portion/);
 assert.equal(viewCompatibleVisibility('face hidden behind the box','side view','package'),'face hidden behind the box');
});

test('new base and every local stage keep target gaze across framing and Pose choices',()=>{
 for(const camera of ['close-up','medium shot','full shot'])for(const useGeometry of [false,true]){
  const shot=scene(camera);shot.visualSpec.characters[0].occlusion='face and upper body clearly visible';
  const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
  const plan=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry});
  assert.deepEqual(plan.errors,[]);
  assert.match(plan.characterPrompts[0],/eyes focused on the package on the shelf/);
  assert.doesNotMatch(plan.characterPrompts[0],/face and upper body clearly visible/);
  assert.equal(shot.visualSpec.characters[0].gazeTarget,'the package on the shelf');
  for(const stage of ['identity','outfit','prop','hand','gaze','handoff']){
   const local=compileStagePrompt(plan,{stage,characterId:'actor',relationId:plan.facts.relations[0]?.relationId});
   assert.deepEqual(local.errors,[],stage);
   if(stage!=='hand')assert.match(local.prompt,/eyes focused on the package on the shelf/,stage);
   else assert.doesNotMatch(local.prompt,/looking at (?:viewer|camera)/);
  }
  const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
  const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  const recipe:any={prompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final,repairPasses:{propInteractions:final.facts.relations}}};
  const request=prepareGenerationPromptRequest(recipe,{prompt,negative_prompt:final.negativePrompt},{stage:'base'});
  assert.match(request.prompt,/eyes focused on the package on the shelf/);
 }
});
import {createPromptPlan} from '../scripts/prompt-compiler.mjs';

test('different actors keep independent gaze; old frozen field text is not migrated at execution',()=>{
 const input={common:[],characters:[{characterId:'left',fields:[{id:'left.gaze',group:'gaze',text:'the window',source:'manual'}]},{characterId:'right',fields:[{id:'right.gaze',group:'gaze',text:'looking at camera',source:'manual'}]}]};
 const plan=createPromptPlan(input);
 assert.match(plan.characterPrompts[0],/eyes focused on the window/);assert.doesNotMatch(plan.characterPrompts[0],/camera/);
 assert.match(plan.characterPrompts[1],/looking at camera/);assert.doesNotMatch(plan.characterPrompts[1],/window/);
 assert.equal(input.characters[0].fields[0].text,'the window');
 const legacy=structuredClone(plan);legacy.facts.characters[0].fields[0].text='the window';
 const before=JSON.stringify(legacy);compileStagePrompt(legacy,{stage:'gaze',characterId:'left'});assert.equal(JSON.stringify(legacy),before);
});

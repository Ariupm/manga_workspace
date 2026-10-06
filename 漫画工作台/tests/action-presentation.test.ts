import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_PRESENTATION_VERSION,composeGenerationPrompt,createPromptPlan,compileStagePrompt,finalizePromptPlan,prepareGenerationPromptRequest,rebindPromptPlanRelations,relationEventText} from '../scripts/prompt-compiler.mjs';
import {buildRegionalPrompt,buildGenerationPrompt,buildEffectivePromptPlan,buildCanonicalGenerationPrompt} from '../lib/prompts';
import {actionStageState} from '../scripts/action-stage-policy.mjs';
import {poseUsagePlan,referenceImageUsagePlan} from '../scripts/generation-control-policy.mjs';
import {getStudioData,createPersistentGenerationJob,updatePersistentGenerationJob,approveSdDraft,getGenerationJobRecord} from '../lib/db';

function relation(object='lantern',actionId='pick',phase='anticipation',hand='right',actor='a',count=1):any {
  const state=actionStageState(actionId,phase);
  return {required:true,characterId:actor,relationId:`${actor}:${object}`,object,objectInstanceId:`instance:${actor}:${object}`,expectedCount:count,handMode:hand==='both'?'two':'one',activeHand:hand,
    actionPlan:{actionId,phase},
    visualFacts:{actionId,phase,contact:{hand,part:'body',state:state.contactState},support:{label:'workbench',state:state.objectState==='action_specific'?'held':state.objectState},gaze:{kind:'independent',description:'looking toward the window'}}};
}
function person(id:string,relations:any[],position='side view'):any {
  return {characterId:id,region:{xStart:id==='a'?.1:.6,xEnd:id==='a'?.4:.95},fields:[
    {id:id+'.identity',group:'identity',text:id==='a'?'adult man, short black hair':'adult woman, silver hair',source:'profile'},
    {id:id+'.clothing',group:'clothing',text:id==='a'?'wearing a green jacket':'wearing a blue coat',source:'asset'},
    {id:id+'.position',group:'position',text:position,source:'manual'},
    {id:id+'.gaze',group:'gaze',text:'looking toward the window',source:'manual'},
    ...relations.filter(r=>r.characterId===id).map(r=>({id:`${id}.interaction.${r.relationId}`,group:'interaction',text:'old generated description',source:'interaction_contract'})),
  ]};
}
function planFor(relations:any[],count=1,version:string|undefined=ACTION_PRESENTATION_VERSION) {
  return createPromptPlan({presentationVersion:version,common:[
    {id:'camera',group:'camera',text:'medium shot, waist-up framing',source:'camera'},
    {id:'count',group:'count',text:count===1?'exactly one foreground person, solo':'exactly 2 foreground people',source:'cast'},
    {id:'scene',group:'environment',text:'a workshop with wooden shelves',source:'scene'},
    {id:'light',group:'lighting',text:'cool window light',source:'scene'},
  ],characters:['a','b'].slice(0,count).map(id=>person(id,relations)),relations});
}
function freeze(plan:ReturnType<typeof planFor>) {
  const prompt=composeGenerationPrompt(plan);
  const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  assert.deepEqual(final.errors,[]);
  return {prompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final,repairPasses:{propInteractions:structuredClone(final.facts.relations)}}};
}

test('single event stays ahead of appearance and background; other hand and explicit edits survive',()=>{
  const active=relation(),carried=relation('radio','carry','contact','left');
  const input=planFor([carried,active]),before=JSON.stringify(input.facts.relations);
  const recipe=freeze(input),prompt=recipe.prompt;
  assert.doesNotMatch(prompt,/BREAK|old generated description/);
  assert.ok(prompt.indexOf('lantern')<prompt.indexOf('radio'));
  assert.ok(prompt.indexOf('visible gap')<prompt.indexOf('short black hair'));
  assert.ok(prompt.indexOf('green jacket')<prompt.indexOf('wooden shelves'));
  assert.match(prompt,/right hand approaching the lantern with a visible gap/);
  assert.match(prompt,/one radio held in left hand/);
  assert.match(prompt,/looking toward the window/);
  const edited=composeGenerationPrompt(input,{commonPrompt:input.commonPrompt+', dramatic rim light',characterPrompts:[input.characterPrompts[0]+', (embroidered sleeve:1.4)']});
  assert.match(edited,/dramatic rim light/);assert.match(edited,/\(embroidered sleeve:1.4\)/);
  assert.equal(JSON.stringify(input.facts.relations),before);
});

test('transfer phases, arbitrary object names, hand sides and counts stay consistent in base and local requests',()=>{
  for(const object of ['lantern','copper vase','parcel'])for(const hand of ['left','right','both'])for(const phase of ['anticipation','contact','follow_through']){
    const r=relation(object,'pick',phase,hand,'a',2),recipe=freeze(planFor([r]));
    const state=phase==='follow_through'?'held in':'resting on the workbench';
    assert.match(recipe.prompt,new RegExp(`two ${object}s ${state}`));
    for(const stage of ['base','prop','hand','identity','outfit','gaze','handoff']){
      const controls={ControlNet:{args:[{model:'pose-test',weight:.41,guidance_end:.6}]}};
      const payload:any={prompt:recipe.prompt,negative_prompt:recipe.negativePrompt,mask:'same mask',alwayson_scripts:controls,seed:84,width:512,height:768};
      const request=prepareGenerationPromptRequest(recipe,payload,{stage,characterId:'a',relationId:r.relationId});
      assert.deepEqual(request.alwayson_scripts,controls);assert.equal(request.mask,'same mask');assert.equal(request.seed,84);assert.equal(request.height,768);
      if(['base','prop','hand','handoff'].includes(stage)){
        assert.match(request.prompt,new RegExp(phase==='anticipation'?'approaching.*visible gap':'touching the body'));
        if(phase==='anticipation')assert.doesNotMatch(request.prompt,/held in|holding after|touching the body/);
        if(phase==='follow_through')assert.doesNotMatch(request.prompt,/resting on|approaching/);
      }
    }
    const finalRelations=recipe.generationSpec.promptPlan.facts.relations;
    assert.equal(finalRelations[0].activeHand,hand);assert.equal(finalRelations[0].expectedCount,2);
  }
  for(const phase of ['contact','follow_through']){
    const r=relation('ceramic bowl','place',phase);
    const prompt=freeze(planFor([r])).prompt;
    assert.match(prompt,/ceramic bowl resting on the workbench/);
    if(phase==='follow_through')assert.match(prompt,/right hand separated from the ceramic bowl/);
  }
  // The pre-existing place/anticipation model reports a held object but an
  // approaching hand. Presentation cannot silently repair that geometry policy.
  const placing=relation('ceramic bowl','place','anticipation'),pending=planFor([placing]);
  assert.match(composeGenerationPrompt(pending),/approaching the ceramic bowl/);
  assert.doesNotMatch(composeGenerationPrompt(pending),/held in right hand/);
  assert.ok(pending.audit.some(a=>a.reason==='held_support_with_approach_requires_contact_model_review'));
  assert.equal(pending.facts.relations[0].visualFacts.support.state,'held');
});

test('multi-person regions keep different objects, actions, gazes and negatives; no global action broadcast',()=>{
  const a=relation('lantern'),b=relation('book','pick','follow_through','left','b');
  const plan=planFor([a,b],2);
  plan.facts.characters[0].negative='glasses';
  plan.facts.characters[1].fields.find(f=>f.group==='gaze')!.text='looking at camera';
  const rebuilt=createPromptPlan(plan.facts),prompt=composeGenerationPrompt(rebuilt),blocks=prompt.split(' BREAK ');
  assert.deepEqual(rebuilt.errors,[]);assert.equal(blocks.length,3);
  assert.doesNotMatch(blocks[0],/lantern|book|hand/);
  assert.match(blocks[1],/lantern/);assert.doesNotMatch(blocks[1],/book|left hand|camera/);
  assert.match(blocks[2],/book|looking at camera/);assert.doesNotMatch(blocks[2],/lantern|right hand|window/);
  assert.doesNotMatch(rebuilt.negativePrompt,/glasses/);assert.match(rebuilt.characterNegatives[0].prompt,/glasses/);
  assert.deepEqual(rebuilt.facts.characters.map(p=>p.region),plan.facts.characters.map(p=>p.region));
});

test('linked tool and target retain a single operation and auxiliary support in local projections',()=>{
  const tool=relation('paintbrush','tool','contact','right'),target=relation('panel','touch','contact','left');
  tool.visualFacts.workTarget={instanceId:target.objectInstanceId,surface:'front face',operation:'painting'};tool.workTargetLabel='panel';
  tool.visualFacts.contact.part='handle';target.visualFacts.support={state:'on_support',label:'easel'};
  target.actionPlan.geometry={mechanism:'support'};
  const recipe=freeze(planFor([target,tool]));
  assert.ok(recipe.prompt.indexOf('one paintbrush')<recipe.prompt.indexOf('one panel'),'operation and its support stay adjacent in primary-event order');
  for(const stage of ['prop','hand']){
    const result=compileStagePrompt(recipe.generationSpec.promptPlan,{stage,characterId:'a',relationId:tool.relationId});
    assert.deepEqual(result.errors,[]);assert.match(result.prompt,/paintbrush painting the front face on the panel/);
    assert.match(result.prompt,/right hand gripping the paintbrush handle/);assert.match(result.prompt,/left hand stabilizing the body of the panel/);
    assert.doesNotMatch(result.prompt,/package|shelf|scissors/);
  }
});

test('new effective phases recompile the event while unversioned snapshots keep legacy composition and text',()=>{
  const r=relation(),plan=planFor([r]),oldInput=JSON.stringify(plan);
  const next=relation('lantern','pick','follow_through');
  const rebound=rebindPromptPlanRelations(plan,[next]);
  assert.match(composeGenerationPrompt(rebound),/held in right hand/);assert.doesNotMatch(composeGenerationPrompt(rebound),/approaching|resting on/);
  assert.equal(JSON.stringify(plan),oldInput);
  const legacy=planFor([r],1,undefined);
  // Default arguments opt in for fresh fixtures; explicitly remove the version
  // as an actual historical snapshot would.
  delete legacy.facts.presentationVersion;
  const historical=createPromptPlan(legacy.facts);
  assert.match(composeGenerationPrompt(historical),/ BREAK /);
  const local=compileStagePrompt(historical,{stage:'prop',characterId:'a',relationId:r.relationId});
  assert.doesNotMatch(local.prompt,/one lantern resting on/);
  const frozen=freeze(historical),before=JSON.stringify(frozen.generationSpec.promptPlan);
  prepareGenerationPromptRequest(frozen,{prompt:frozen.prompt,negative_prompt:frozen.negativePrompt},{stage:'base'});
  assert.equal(JSON.stringify(frozen.generationSpec.promptPlan),before);
});

test('single merged request retains conflict guards, disabled-control guards and failure atomicity',()=>{
  const recipe:any=freeze(planFor([relation()]));
  assert.throws(()=>prepareGenerationPromptRequest(recipe,{negative_prompt:'black hair'},{stage:'base'}),/conflict/);
  recipe.poseUsage=poseUsagePlan(false);recipe.referenceImageUsage=referenceImageUsagePlan(false);
  assert.throws(()=>prepareGenerationPromptRequest(recipe,{alwayson_scripts:{ControlNet:{args:[{role:'identity'}]}}},{stage:'base'}),/Disabled reference/);
  assert.throws(()=>prepareGenerationPromptRequest(recipe,{mask:'mask'},{stage:'hand',characterId:'a'}),/independent image localization/);
  assert.equal(recipe.promptRequestTraces,undefined,'rejected requests cannot be logged as prepared');
});

test('real compiler and effective preview use the same composition across framing and independent control choices',()=>{
  const data=getStudioData(),base=data.episode.pages[0].shots[0],id=base.characterIds[0];
  for(const cameraEn of ['close-up','medium shot','wide shot'])for(const poseControlEnabled of [false,true])for(const referenceImagesEnabled of [false,true]){
    const shot={...base,camera:'',cameraEn,visualSpec:null,visualSpecConfirmed:false,poseControlEnabled,referenceImagesEnabled,
      characterLooks:{[id]:{...base.characterLooks?.[id],expressionEn:'happy',hairColorEn:'(copper hair:1.2)',gazeEn:'looking at camera'}}};
    const regional=buildRegionalPrompt(shot,data.assets,data.characters);
    assert.equal(regional.prompt,buildGenerationPrompt(shot,data.assets,data.characters).prompt);
    const effective=buildEffectivePromptPlan(regional,null,{useGeometry:poseControlEnabled});
    assert.equal(composeGenerationPrompt(effective),regional.prompt);assert.doesNotMatch(regional.prompt,/BREAK/);
    assert.match(regional.prompt,/\(copper hair:1.2\)/);assert.match(regional.prompt,/\bhappy\b/);
    assert.doesNotMatch(regional.prompt,/warm open smile|bright engaged eyes|:1\.45|:1\.5\)/);
    assert.deepEqual(buildCanonicalGenerationPrompt(shot,regional.prompt).validation.errors,[]);
  }
});

test('non-prop actions and explicitly authored display expressions are retained',()=>{
  const input=planFor([]);
  input.facts.characters[0].fields.push({id:'a.action',group:'action',text:'running through the doorway',source:'manual'},{id:'a.expression',group:'expression',text:'warm open smile, raised cheeks',source:'manual'});
  const prompt=composeGenerationPrompt(createPromptPlan(input.facts));
  assert.match(prompt,/running through the doorway/);assert.match(prompt,/warm open smile, raised cheeks/);
  assert.doesNotMatch(prompt,/holding|shelf|visible gap/);
  assert.equal(relationEventText({...relation(),required:false}),'');
});

test('draft approval freezes new presentation with the same facts and does not rewrite legacy snapshots',()=>{
  const shot=getStudioData().episode.pages[0].shots[0];
  for(const fresh of [true,false]){
    const plan=planFor([relation()]);if(!fresh)delete plan.facts.presentationVersion;
    const recipe={...freeze(createPromptPlan(plan.facts)),phase:'draft',endpoint:'http://localhost/sdapi/v1/txt2img',width:256,height:384,targetWidth:512,targetHeight:768,references:[],finalReferences:[]};
    const payload={phase:'draft',draftImagePath:'../角色资产/小粉/00-原始参考图.png',recipe};
    const id=createPersistentGenerationJob(shot.id,'sd-webui',payload);
    updatePersistentGenerationJob(id,'awaiting_draft_approval',100,'','等待整体确认');
    assert.ok(approveSdDraft(1,id));
    const final=JSON.parse(getGenerationJobRecord(id).payload).recipe;
    assert.deepEqual(final.generationSpec.promptPlan,recipe.generationSpec.promptPlan);
    assert.equal(final.prompt,recipe.prompt);
  }
});

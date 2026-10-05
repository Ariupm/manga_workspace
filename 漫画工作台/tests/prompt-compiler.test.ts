import assert from 'node:assert/strict';
import test from 'node:test';
import {getStudioData,createPersistentGenerationJob,updateGenerationJobPayload,updatePersistentGenerationJob,approveSdDraft,getGenerationJobRecord} from '../lib/db';
import {buildGenerationPrompt,buildRegionalPrompt,buildCanonicalGenerationPrompt} from '../lib/prompts';
import {applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
import {compilePromptFields,compileStagePrompt,createPromptPlan,finalizePromptPlan,prepareGenerationPromptRequest,validatePromptEditorial,assertPromptPlanRecipe} from '../scripts/prompt-compiler.mjs';

test('semantic routing preserves approach gaps and scopes exclusions; ambiguous negatives surface',()=>{
  const result=compilePromptFields([{id:'gaze',text:'eyes focused on a parcel, no eye contact with camera',source:'manual'},{id:'hand',text:'hand approaching the object without contact; preserve a visible gap',source:'phase'}]);
  assert.deepEqual(result.errors,[]);
  assert.match(result.prompt,/parcel/);assert.match(result.prompt,/visible gap/);
  assert.doesNotMatch(result.prompt,/\bno\b|without/);assert.match(result.negativePrompt,/eye contact/);
  assert.equal(compilePromptFields([{id:'custom',text:'not opening the door',source:'manual'}]).errors.length,1);
});

test('compiler retains long required facts and deduplicates without a tail cutoff',()=>{
  const fields=Array.from({length:110},(_,i)=>({id:`f.${i}`,text:`visible prop detail ${i}`,source:'manual'}));
  fields.push({id:'action',text:'eyes focused on the parcel label',source:'contract'});
  const result=compilePromptFields(fields);assert.match(result.prompt,/detail 109/);assert.match(result.prompt,/parcel label/);
  assert.equal(result.audit.length,111);
});

test('regional editorial exclusions remain scoped through finalization and local passes',()=>{
  const plan=createPromptPlan({common:[],characters:[{characterId:'a',fields:[{id:'a.eye',group:'identity',text:'brown eyes, no glasses',source:'asset'}]},{characterId:'b',fields:[{id:'b.eye',group:'identity',text:'blue eyes',source:'asset'}]}]});
  const final=finalizePromptPlan(plan,{commonPrompt:'',characterPrompts:['brown eyes, no glasses, not smiling','blue eyes'],prompt:'brown eyes BREAK blue eyes',negativePrompt:plan.negativePrompt});
  assert.doesNotMatch(final.negativePrompt,/glasses|smiling/);
  assert.match(compileStagePrompt(final,{stage:'identity',characterId:'a'}).negativePrompt,/glasses/);
  assert.match(compileStagePrompt(final,{stage:'identity',characterId:'a'}).negativePrompt,/smiling/);
  assert.doesNotMatch(compileStagePrompt(final,{stage:'identity',characterId:'b'}).negativePrompt,/glasses|smiling/);
  assertPromptPlanRecipe({prompt:final.appliedPrompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final}});
});

test('all framing and cast paths share previews, preserve ownership, and keep positive text clean',()=>{
  const data=getStudioData(1),base=data.episode.pages[0].shots[0];
  for(const cameraEn of ['close-up','medium close-up','medium shot','wide shot','full shot']) {
    const shot={...base,camera:'',cameraEn,visualSpecConfirmed:false,visualSpec:null};
    const regional=buildRegionalPrompt(shot,data.assets,data.characters);
    assert.deepEqual(regional.promptPlan.errors,[],JSON.stringify(regional.promptPlan.errors));
    assert.equal(buildGenerationPrompt(shot,data.assets,data.characters).prompt,regional.prompt);
    assert.doesNotMatch(regional.prompt,/\bno\b|\bnot\b|\bwithout\b|exclusion regions|character_xiaofen/);
    const canonical=buildCanonicalGenerationPrompt(shot,regional.prompt);
    assert.equal(canonical.validation.valid,true,canonical.validation.errors.join(';'));
    assert.equal(canonical.prompt.split('BREAK').length,regional.prompt.split('BREAK').length);
    assert.doesNotMatch(canonical.prompt,/strict crop at the waist/);
  }
});

const makePlan=()=>createPromptPlan({common:[{id:'camera',group:'camera',text:'medium shot, waist-up framing',source:'camera'},{id:'scene',group:'environment',text:'parcel station, shelves',source:'scene'},{id:'light',group:'lighting',text:'dim blue moonlight',source:'scene'}],characters:[{characterId:'a',negative:'glasses',fields:[{id:'a.identity',group:'identity',text:'adult man, short black hair',source:'profile'},{id:'a.clothing',group:'clothing',text:'navy coat',source:'asset'},{id:'a.action',group:'action',text:'carrying a parcel',source:'story'},{id:'a.gaze',group:'gaze',text:'looking at viewer',source:'manual'}]},{characterId:'b',negative:'looking at viewer, eye contact with camera',fields:[{id:'b.identity',group:'identity',text:'adult woman, brown hair',source:'profile'},{id:'b.gaze',group:'gaze',text:'eyes focused on a book',source:'manual'}]}]});

test('editorial cannot silently change cast, traits, garments or another actor gaze',()=>{
  const plan=makePlan();
  assert.ok(validatePromptEditorial(plan,{common:'exactly three foreground people'}).some(e=>e.startsWith('count')));
  assert.ok(validatePromptEditorial(plan,{characters:['long red hair']}).some(e=>e.includes('hair')));
  assert.ok(validatePromptEditorial(plan,{characters:['wearing a white dress']}).some(e=>e.includes('clothing')));
  assert.ok(validatePromptEditorial(plan,{characters:['','looking at viewer']}).some(e=>e.startsWith('b.gaze')));
  assert.deepEqual(validatePromptEditorial(plan,{characters:['','no eye contact with camera'],global:'soft rim lighting'}),[]);
});

test('mixed gaze and garment negatives never broadcast to another actor; stages keep identity and light',()=>{
  const plan=makePlan();assert.doesNotMatch(plan.negativePrompt,/viewer|glasses/);
  const identity=compileStagePrompt(plan,{stage:'identity',characterId:'a'});
  assert.match(identity.prompt,/adult man|short black hair/);assert.match(identity.prompt,/dim blue moonlight/);
  assert.doesNotMatch(identity.prompt,/navy coat|parcel station|brown hair/);
  assert.doesNotMatch(identity.negativePrompt,/eye contact/);
  const gaze=compileStagePrompt(plan,{stage:'gaze',characterId:'b'});
  assert.match(gaze.negativePrompt,/looking at viewer/);
  const clothing=compileStagePrompt(plan,{stage:'outfit',characterId:'a',details:'white sleeve'});
  assert.match(clothing.prompt,/white sleeve/);assert.doesNotMatch(clothing.prompt,/navy coat/);
});

test('request adapter preserves masks/control settings, rejects tampering and supports immutable legacy',()=>{
  const plan=makePlan();const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
  const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  const recipe:any={prompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final},requestTrace:{}};
  const payload={prompt,negative_prompt:recipe.negativePrompt,mask:'mask',alwayson_scripts:{ControlNet:{args:[{weight:.37,guidance_end:.51}]}}};
  const result=prepareGenerationPromptRequest(recipe,payload,{stage:'base'});
  assert.equal(result.mask,'mask');assert.deepEqual(result.alwayson_scripts,payload.alwayson_scripts);
  assert.equal(recipe.requestTrace.prompt,result.prompt);assert.equal(recipe.promptRequestTraces[0].requestStatus,'prepared');
  const local=prepareGenerationPromptRequest(recipe,payload,{stage:'identity',characterId:'a'});
  assert.doesNotMatch(local.prompt,/brown hair/);assert.deepEqual(local.alwayson_scripts,payload.alwayson_scripts);
  assert.equal(prepareGenerationPromptRequest({generationSpec:{}},payload,{stage:'base'}),payload);
  for(const compilerVersion of ['sd15-visual-spec-v1','sd15-staged-identity-v2'])assert.equal(prepareGenerationPromptRequest({generationSpec:{compilerVersion}},payload,{stage:'base'}),payload);
  assert.throws(()=>assertPromptPlanRecipe({generationSpec:{compilerVersion:'comic-facts-1'}}),/Missing/);
  assert.throws(()=>assertPromptPlanRecipe({generationSpec:{compilerVersion:'unknown'}}),/unsupported/);
  assert.throws(()=>prepareGenerationPromptRequest({...recipe,prompt:'changed'},payload,{stage:'base'}),/differs/);
  assert.throws(()=>compileStagePrompt(final,{stage:'hand',characterId:'a',relationId:'missing'}),/belong/);
  final.facts.characters[0].fields[0].text='tampered';
  assert.throws(()=>prepareGenerationPromptRequest(recipe,payload,{stage:'identity',characterId:'a'}),/fingerprint/);
});

test('whole draft approval preserves the compiler snapshot and text while upgrading final dimensions',()=>{
  const data=getStudioData(1),shot=data.episode.pages[0].shots[0],plan=makePlan();
  const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
  const finalized=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  const recipe:any={phase:'draft',endpoint:'http://localhost/sdapi/v1/txt2img',width:256,height:384,targetWidth:512,targetHeight:768,steps:12,cfgScale:5.5,batchSize:1,references:[],finalReferences:[],prompt,negativePrompt:finalized.negativePrompt,generationSpec:{compilerVersion:finalized.version,promptPlan:finalized}};
  const payload={phase:'draft',draftImagePath:'../角色资产/小粉/00-原始参考图.png',recipe};
  const id=createPersistentGenerationJob(shot.id,'sd-webui',payload);updateGenerationJobPayload(id,payload);updatePersistentGenerationJob(id,'awaiting_draft_approval',100,'','等待确认');
  assert.ok(approveSdDraft(1,id));const result=JSON.parse(getGenerationJobRecord(id).payload).recipe;
  assert.deepEqual(result.generationSpec.promptPlan,finalized);assert.equal(result.width,512);assert.equal(result.height,768);assertPromptPlanRecipe(result);
});

test('generic objects and mechanism stages retain the same relation through every scoped pass',()=>{
  const actor:any={id:'actor',name:'Actor',appearanceEn:'adult man',visualTraits:{hairStyleEn:'short hair',eyeColorEn:'brown eyes'},invariantsEn:[],references:[]};
  for (const action of ['opening a door','turning a knob','writing with a pen','picking up a package','placing a book on a table']) {
    const shot:any={id:91,description:action,scene:'workshop',sceneEn:'workshop with a table',timeOfDay:'day',actionEn:action,expressionEn:'neutral',camera:'wide shot',cameraEn:'wide shot',compositionEn:'',lightingEn:'daylight',characterIds:['actor'],characterLooks:{},environment:{},visualSpecConfirmed:false};
    const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
    assert.deepEqual(regional.promptPlan.errors,[],action);
    for(const phase of ['anticipation','contact','follow_through']) {
      const control:any=applyPoseControlOverrideV3(regional.poseControl as any,{schemaVersion:'pose-override-v1',phase});
      const execution=compilePoseExecutionV3(control,regional.repairPasses);
      const fields=regional.promptPlan.facts.characters[0].fields.map(f=>f.group==='action'?{...f,text:synchronizeBasicPosePromptV3(f.text,control.scenePlan.people[0])}:f);
      const plan=createPromptPlan({...regional.promptPlan.facts,characters:[{...regional.promptPlan.facts.characters[0],fields}],relations:execution.repairPasses.propInteractions});
      const relation=plan.facts.relations[0];assert.ok(relation,action);
      for(const stage of ['prop','hand','gaze','identity']) {
        const result=compileStagePrompt(plan,{stage,characterId:'actor',relationId:stage==='identity'?undefined:relation.relationId});
        assert.deepEqual(result.errors,[],`${action}/${phase}/${stage}: ${result.errors}`);
        assert.doesNotMatch(result.prompt,/\bno\b|\bnot\b|\bwithout\b|story instance|exclusion regions|\{/);
        if(phase==='anticipation' && ['prop','hand'].includes(stage))assert.match(result.prompt,/gap|separation/);
      }
    }
  }
});

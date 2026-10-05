import assert from 'node:assert/strict';
import test from 'node:test';
import {getStudioData,createPersistentGenerationJob,updateGenerationJobPayload,updatePersistentGenerationJob,approveSdDraft,getGenerationJobRecord} from '../lib/db';
import {buildGenerationPrompt,buildRegionalPrompt,buildCanonicalGenerationPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
import {compilePromptFields,compileStagePrompt,createPromptPlan,finalizePromptPlan,prepareGenerationPromptRequest,validatePromptEditorial,assertPromptPlanRecipe,resolvePropVisualFacts,visibleClothingText,rebindPromptPlanRelations} from '../scripts/prompt-compiler.mjs';
import {propGroupOutline,actionOutlineMarkup} from '../scripts/action-mechanism.mjs';
import {deferRequiredPropsFromBasePrompt,upperBodyVisiblePrompt} from '../scripts/sd-worker-logic.mjs';

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

const booksFixture=()=>{
 const actor:any={id:'reader',name:'Reader',appearanceEn:'adult woman, gentle oval face',visualTraits:{hairStyleEn:'waist-length layered hair with airy side-swept bangs',hairColorEn:'soft pink hair',eyeColorEn:'warm pink-brown eyes'},profile:{baseOutfitEn:'cream-yellow top with a soft pink midi skirt'},references:[],invariantsEn:[]};
 const action='Taking out two books and touching the covers';
 const shot:any={id:84,scene:'小粉的家',sceneEn:'coherent everyday environment',description:'从包裹里拿出两本书，抚摸封面',timeOfDay:'白天',camera:'近景',cameraEn:'medium close-up',characterIds:['reader'],actionEn:action,expressionEn:'satisfied',compositionEn:'at the books, holding books',environment:{keyLight:'motivated directional key light',ambientLight:'soft environment bounce light'},characterLooks:{reader:{actionEn:action,gazeEn:'eyes focused on the book or document, pupils directed toward the page, no eye contact with camera',handsEn:'hands naturally positioned for the described action and framing'}},visualSpecConfirmed:false};
 return {shot,actor};
};

test('reported two-book cover scene compiles concrete count, one phase, visible wardrobe and cover gaze',()=>{
 const {shot,actor}=booksFixture();const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
 const plan=regional.promptPlan,relation=plan.facts.relations[0];assert.deepEqual(plan.errors,[]);
 assert.equal(relation.object,'book');assert.equal(relation.expectedCount,2);assert.equal(relation.actionPlan.phase,'follow_through');
 assert.equal(relation.actionPlan.geometry.outline.filter((p:any)=>p.role==='body').length,2);
 assert.match(regional.prompt,/home interior/);assert.match(regional.prompt,/two books/);assert.match(regional.prompt,/book covers/);
 assert.match(regional.prompt,/held above/);assert.match(regional.prompt,/cream-yellow top/);assert.match(regional.prompt,/relaxed brows/);
 assert.doesNotMatch(regional.prompt,/one book|book or document|toward the page|approach|resting on|naturally positioned|contextual orientation|visible surface follows|object position consistent|action in progress|midi skirt|motivated directional|environment bounce/);
 assert.doesNotMatch(regional.negativePrompt,/duplicate book|duplicated prop/);
 const projected=compilePoseExecutionV3(regional.poseControl as any,regional.repairPasses,{advisory:true});
 assert.equal(projected.repairPasses.propInteractions[0].expectedCount,2);
 assert.equal(projected.repairPasses.propInteractions?.[0]?.actionRelationAudit?.geometry?.outline?.filter((p:any)=>p.role==='body').length,2);
 for(const stage of ['prop','hand','gaze']) {
  const local=compileStagePrompt(plan,{stage,characterId:'reader',relationId:relation.relationId});assert.deepEqual(local.errors,[]);
  assert.doesNotMatch(local.prompt,/one book|document|approach|resting on|page:|action in progress|contextual orientation/);
  assert.doesNotMatch(local.negativePrompt,/duplicated prop/);
 }
});

test('concrete nouns/counts and garment visibility generalize beyond one book scene',()=>{
 for(const [action,object,count] of [['carrying three documents','document',3],['holding two bottles','bottle',2],['holding one notebook','notebook',1],['reading a letter','letter',1]] as const){
  const family=object==='bottle'?'drink container':'book or document';assert.deepEqual(resolvePropVisualFacts(family,action),{object,expectedCount:count});
 }
 assert.equal(visibleClothingText('navy coat and white trousers','medium close-up'),'navy coat');
 assert.equal(visibleClothingText('cream-yellow top with a soft pink midi skirt','full shot'),'cream-yellow top with a soft pink midi skirt');
 assert.match(visibleClothingText('green maxi dress','close-up'),/upper portion of green dress/);
 const {shot,actor}=booksFixture();shot.characterLooks.reader.gazeEn='eyes focused on the doorway';
 assert.match(buildRegionalPrompt(shot,[],[actor]).prompt,/eyes focused on the doorway/);
});

test('manual phases recompile both base blocks and local requests from one effective relation',()=>{
 const {shot,actor}=booksFixture();const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
 for(const phase of ['anticipation','contact','follow_through'] as const){
  const control:any=applyPoseControlOverrideV3(regional.poseControl as any,{schemaVersion:'pose-override-v1',templateId:'pick',phase});
  const execution=compilePoseExecutionV3(control,regional.repairPasses,{advisory:true});
  const plan=buildEffectivePromptPlan(regional,control);
  const relation=plan.facts.relations[0];assert.equal(relation.expectedCount,2);assert.equal(relation.actionPlan.geometry.objectCount,2);
  assert.ok(validatePromptEditorial(plan,{characters:['one book']}).some(e=>e.includes('prop_count')));
  if(phase==='anticipation')assert.ok(validatePromptEditorial(plan,{characters:['right hand contacting the books']}).some(e=>e.includes('contact')));
  const prompt=[plan.commonPrompt,...plan.characterPrompts].join(' BREAK ');
  const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt,negativePrompt:plan.negativePrompt});
  const recipe:any={prompt,negativePrompt:final.negativePrompt,generationSpec:{promptPlan:final,repairPasses:execution.repairPasses}};
  for(const stage of ['base','prop','hand'] as const){
   const deferred=deferRequiredPropsFromBasePrompt(prompt,execution.repairPasses.propInteractions || [],{structuredVisual:true});
   const basePrompt=upperBodyVisiblePrompt(deferred.prompt,{structuredVisual:true,raisedHandContact:true});
   const actual=prepareGenerationPromptRequest(recipe,{prompt:stage==='base'?basePrompt:prompt,negative_prompt:final.negativePrompt,mask:'owned-mask',alwayson_scripts:{ControlNet:{args:[{weight:.41,guidance_end:.53}]}}},{stage,characterId:'reader',relationId:relation.relationId});
   assert.doesNotMatch(actual.prompt,/one book|book or document|action in progress|visible surface follows/);
   if(phase==='anticipation'){assert.match(actual.prompt,/visible gap/);assert.doesNotMatch(actual.prompt,/contacting|fingertips touching|held above|touching the covers/);}
   if(phase==='contact'){assert.match(actual.prompt,/contacting/);assert.doesNotMatch(actual.prompt,/approaching|held above/);}
   if(phase==='follow_through'){assert.match(actual.prompt,/contacting|touching/);assert.doesNotMatch(actual.prompt,/approaching|resting on/);}
   assert.equal(actual.mask,'owned-mask');assert.equal(actual.alwayson_scripts.ControlNet.args[0].weight,.41);
  }
 }
});

test('portable prop groups produce the authored number of control silhouettes within one footprint',()=>{
 for(const shape of ['landscape_rect','portrait_rect','cylinder','dish'])for(const expectedCount of [2,3,5]){
  const geometry=propGroupOutline({shape,expectedCount},{x:.5,y:.5},.2,.1)!;
  assert.equal(geometry.outline?.length,expectedCount);
  assert.equal((actionOutlineMarkup(geometry,512,512).match(/<path/g)||[]).length,expectedCount);
  for(const point of geometry.outline!.flatMap(p=>p.points)){assert.ok(point.x>=.4 && point.x<=.6 && point.y>=.45 && point.y<=.55);}
 }
 assert.throws(()=>propGroupOutline({expectedCount:17},{x:.5,y:.5},.2,.1),/Unsupported/);
});

test('multi-actor base deferral preserves each region count and local exclusion ownership',()=>{
 const {shot,actor}=booksFixture();const other={...actor,id:'other',name:'Other'};
 shot.characterIds=['reader','other'];shot.characterLooks.other={actionEn:'reading one book',gazeEn:'eyes focused on the book pages'};
 const regional=buildRegionalPrompt(shot,[],[actor,other]);
 const [first,second]=regional.promptPlan.facts.relations;
 assert.equal(first.expectedCount,2);assert.equal(second.expectedCount,1);
 const deferred=deferRequiredPropsFromBasePrompt(regional.prompt,[first,second],{structuredVisual:true});
 const blocks=deferred.prompt.split(' BREAK ');
 assert.equal(blocks.length,3);assert.match(blocks[1],/two books/);assert.doesNotMatch(blocks[1],/one book/);
 assert.match(blocks[2],/one book/);assert.doesNotMatch(blocks[2],/two books/);
 assert.doesNotMatch(regional.negativePrompt,/duplicate book/);
 assert.doesNotMatch(compileStagePrompt(regional.promptPlan,{stage:'prop',characterId:'reader',relationId:first.relationId}).negativePrompt,/duplicated prop|duplicate book/);
});

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

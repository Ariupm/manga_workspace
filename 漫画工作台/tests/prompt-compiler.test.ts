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
import {normalizeShotSpec,validateVisualIds} from '../lib/visual-planning';
import {normalizeInteractionFacts,reconcileInteractionAction,markManualInteractionFactEdits,assertInteractionFactTranslation} from '../lib/interaction-facts';
import {deriveInteractionContracts} from '../lib/prompts';
import type {InteractionVisualFacts} from '../lib/types';

const structuredFacts=(label='book',count=2):InteractionVisualFacts=>({version:'interaction-facts-1',object:{label,instanceId:`group:${label}`,count},actionId:'pick',phase:'follow_through',contact:{hand:'left',part:label==='book'?'covers':'body',state:'contact'},support:{label:'package',state:'held'},gaze:{kind:'object',targetId:`group:${label}`,surface:label==='book'?'covers':'body',description:`eyes focused on the ${label}`},provenance:{object:{source:'narrative',evidence:`${count} ${label}`}}});

test('structured upstream facts own quantity, hands, stage and gaze through base and local payloads',()=>{
  const data=getStudioData(),base=data.episode.pages[0].shots[0],id=base.characterIds[0];
  for(const [label,count] of [['book',2],['bottle',3],['lantern',4]] as const){
    const raw={characters:[{characterId:id,action:'taking out one book',actionTarget:label,hands:'right hand holding a book',gazeTarget:'eyes focused on book pages'}],interactions:[{type:'prop_operation',actorCharacterId:id,propId:'opaque-story-id',action:'taking out the object',phase:'in progress',contactPoints:['right hand'],gazeTarget:'eyes focused on book pages',visualFacts:structuredFacts(label,count)}]};
    const spec=normalizeShotSpec(raw,base,{interactionSource:'model',requireInteractionFacts:true});
    const shot={...base,characterIds:[id],cameraEn:'medium shot',characterLooks:{},visualSpec:spec,visualSpecConfirmed:true};
    const relation=deriveInteractionContracts(shot,id)[0];
    assert.equal(relation.object,label);assert.equal(relation.expectedCount,count);assert.equal(relation.objectInstanceId,`group:${label}`);assert.equal(relation.activeHand,'left');assert.equal(relation.contactAnchors.length,1);assert.equal(relation.contactAnchors[0].hand,'left');assert.equal(relation.actionPlan?.phase,'follow_through');assert.equal(relation.actionPlan?.geometry.objectCount,count);assert.equal(relation.gazeTarget.targetId,`group:${label}`);
    const regional=buildRegionalPrompt(shot,data.assets,data.characters,{posePlannerVersion:'3.0'}),plan=buildEffectivePromptPlan(regional,regional.poseControl as import('../lib/pose-v3/schema').PoseControlV3);
    assert.deepEqual(plan.errors,[]);assert.match(plan.characterPrompts[0],new RegExp(label));assert.doesNotMatch(plan.characterPrompts[0],/one book|right hand|book pages|opaque-story-id/);
    const freeHand=buildRegionalPrompt({...shot,characterLooks:{[id]:{handsEn:'right hand waving'}} as typeof base.characterLooks},data.assets,data.characters);
    assert.match(freeHand.characterRegions[0].prompt,/right hand waving/);
    const final=finalizePromptPlan(plan,{commonPrompt:plan.commonPrompt,characterPrompts:plan.characterPrompts,prompt:[plan.commonPrompt,...plan.characterPrompts].join(' BREAK '),negativePrompt:plan.negativePrompt});
    const recipe={promptPlan:final,prompt:final.appliedPrompt,negativePrompt:final.negativePrompt,repairPasses:{propInteractions:[relation]}};
    for(const stage of ['base','prop','hand','gaze']){
      const controls={ControlNet:{args:[{weight:.61,guidance_end:.72,model:'retained-control'}]}};
      const payload=prepareGenerationPromptRequest(recipe,{prompt:recipe.prompt,negative_prompt:recipe.negativePrompt,mask:'keep-mask',alwayson_scripts:controls},{stage,characterId:id,relationId:relation.relationId});
      assert.equal(payload.mask,'keep-mask');assert.doesNotMatch(payload.prompt,/one book|right hand|book pages|opaque-story-id/);
      assert.deepEqual(payload.alwayson_scripts,controls);
      if(stage!=='gaze')assert.match(payload.prompt,new RegExp(label));
    }
  }
});

test('structured facts fail explicitly, retain provenance, and preserve legacy compatibility',()=>{
  const data=getStudioData(),shot=data.episode.pages[0].shots[0],id=shot.characterIds[0];
  assert.equal(normalizeInteractionFacts(undefined),undefined);
  for(const count of [0,1.5,17,'2'])assert.throws(()=>normalizeInteractionFacts({...structuredFacts(),object:{...structuredFacts().object,count}}),/数量/);
  assert.throws(()=>normalizeInteractionFacts({...structuredFacts('door',2),actionId:'open'}),/执行几何/);
  assert.throws(()=>normalizeInteractionFacts({...structuredFacts(),phase:'anticipation'}),/阶段/);
  assert.throws(()=>normalizeInteractionFacts({...structuredFacts(),gaze:{...structuredFacts().gaze,targetId:''}}),/目标/);
  const manual=normalizeInteractionFacts(structuredFacts(),'manual')!;
  assert.equal(manual.provenance.phase?.source,'manual');assert.deepEqual(normalizeInteractionFacts(manual),manual);
  const original=normalizeInteractionFacts(structuredFacts(),'model')!;
  const edited=markManualInteractionFactEdits({...original,object:{...original.object,count:3}},original)!;
  assert.equal(edited.provenance.object?.source,'manual');assert.equal(edited.provenance.phase?.source,'model');assert.equal(edited.provenance.gaze?.source,'model');
  const translationInput={interactions:[{actorCharacterId:id,visualFacts:original}]};
  assert.doesNotThrow(()=>assertInteractionFactTranslation(translationInput,translationInput));
  assert.throws(()=>assertInteractionFactTranslation(translationInput,{interactions:[]}),/翻译/);
  assert.throws(()=>assertInteractionFactTranslation(translationInput,{interactions:[{actorCharacterId:id,visualFacts:edited}]}),/翻译/);
  const raw={characters:[{characterId:id,action:'holding two books',actionTarget:'books',hands:'both hands holding books',gazeTarget:'eyes focused on books'}],interactions:[{type:'prop_operation',actorCharacterId:id,propId:'book',action:'holding two books',phase:'contact',contactPoints:['both hands'],gazeTarget:'eyes focused on books'}]};
  assert.throws(()=>normalizeShotSpec(raw,shot,{requireInteractionFacts:true}),/visualFacts/);
  const legacy=normalizeShotSpec(raw,shot);assert.equal(legacy.interactions[0].visualFacts,undefined);assert.match(validateVisualIds(legacy,data.characters,data.assets).warnings.join(' '),/旧文本/);
  const conflict=normalizeShotSpec({...raw,interactions:[{...raw.interactions[0],visualFacts:{...structuredFacts(),actionId:'place',support:{label:'table',state:'held'}}}]},shot);
  assert.equal(validateVisualIds(conflict,data.characters,data.assets).blocked,true);
  assert.throws(()=>deriveInteractionContracts({...shot,visualSpec:conflict,visualSpecConfirmed:true},id),/冲突/);
});

test('authored noun modifiers preserve prop counts without borrowing across action clauses',()=>{
  for(const [family,action,noun,count] of [
    ['book or document','taking out two paperback books','book',2],
    ['book or document','carrying three red hardcover books','book',3],
    ['drink container','holding three transparent bottles','bottle',3],
    ['food container','holding two hand-painted bowls','bowl',2],
    ['book or document','two bottles beside a book','book',1],
    ['book or document','two bottles and a book','book',1],
    ['book or document','two bottles while touching a book','book',1],
  ] as const) assert.deepEqual(resolvePropVisualFacts(family,action),{object:noun,expectedCount:count});
});

test('structured instances separate same-type groups, resolve external gaze, and follow effective Pose phases',()=>{
  const data=getStudioData(),base=data.episode.pages[0].shots[0],id=base.characterIds[0];
  const relation=(facts:InteractionVisualFacts,actor=id)=>({type:'prop_operation',actorCharacterId:actor,targetCharacterId:'',propId:'book',action:'holding the object',phase:'contact',contactPoints:['left hand'],gazeTarget:'eyes focused on the object',ownershipBefore:actor,ownershipAfter:actor,visualFacts:facts});
  const otherFacts=structuredFacts('book',3);otherFacts.object.instanceId='other-books';otherFacts.gaze.targetId='other-books';
  const twoShot={...base,characterIds:[id,'other'],characterLooks:{}};
  const separate=normalizeShotSpec({characters:[{characterId:id},{characterId:'other'}],interactions:[relation(structuredFacts()),relation(otherFacts,'other')]},twoShot);
  assert.equal(deriveInteractionContracts({...twoShot,visualSpec:separate,visualSpecConfirmed:true},id)[0].expectedCount,2);
  assert.equal(deriveInteractionContracts({...twoShot,visualSpec:separate,visualSpecConfirmed:true},'other')[0].expectedCount,3);
  const collision=normalizeShotSpec({...separate,interactions:[separate.interactions[0],{...separate.interactions[1],visualFacts:{...otherFacts,object:{...otherFacts.object,instanceId:'group:book'},gaze:{...otherFacts.gaze,targetId:'group:book'}}}]},twoShot);
  assert.match(validateVisualIds(collision,data.characters,data.assets).failures!.map(f=>f.message).join(' '),/共享实例/);
  const bottle=structuredFacts('bottle',1);bottle.actionId='hold';bottle.phase='contact';bottle.contact.hand='right';bottle.gaze.targetId='group:book';bottle.gaze.surface='covers';
  const spec=normalizeShotSpec({characters:[{characterId:id}],interactions:[relation(structuredFacts()),relation(bottle)]},{...base,characterLooks:{}});
  const contracts=deriveInteractionContracts({...base,characterLooks:{},visualSpec:spec,visualSpecConfirmed:true},id);
  assert.equal(contracts[1].gazeTarget.targetId,'group:book');assert.deepEqual(contracts[1].gazeTarget.point,contracts[0].objectCenter);assert.match(contracts[1].gaze,/book covers/);
  const multiRegional=buildRegionalPrompt({...base,characterLooks:{},visualSpec:spec,visualSpecConfirmed:true},data.assets,data.characters,{posePlannerVersion:'3.0'});
  const multiEffective=buildEffectivePromptPlan(multiRegional,multiRegional.poseControl as import('../lib/pose-v3/schema').PoseControlV3);
  assert.equal(multiEffective.facts.relations[1].gazeTarget.targetId,'group:book');assert.deepEqual(multiEffective.facts.relations[1].gazeTarget.point,multiEffective.facts.relations[0].objectCenter);
  const single={...base,characterLooks:{},visualSpec:{...spec,interactions:[spec.interactions[0]]},visualSpecConfirmed:true};
  const regional=buildRegionalPrompt(single,data.assets,data.characters,{posePlannerVersion:'3.0'});
  for(const phase of ['anticipation','contact','follow_through'] as const){
    const control=applyPoseControlOverrideV3(regional.poseControl as import('../lib/pose-v3/schema').PoseControlV3,{schemaVersion:'pose-override-v1',templateId:'pick',phase});
    const plan=buildEffectivePromptPlan(regional,control),r=plan.facts.relations[0];
    assert.equal(r.expectedCount,2);assert.equal(r.visualFacts.phase,phase);assert.equal(r.visualFacts.contact.state,phase==='anticipation'?'approach':'contact');assert.equal(r.visualFacts.support.state,phase==='follow_through'?'held':'on_support');
  }
  const placed=buildEffectivePromptPlan(regional,applyPoseControlOverrideV3(regional.poseControl as import('../lib/pose-v3/schema').PoseControlV3,{schemaVersion:'pose-override-v1',templateId:'place',phase:'follow_through'}));
  assert.equal(placed.facts.relations[0].visualFacts.actionId,'place');assert.equal(placed.facts.relations[0].purpose,'place');assert.equal(placed.facts.relations[0].visualFacts.contact.state,'released');assert.equal(placed.facts.relations[0].expectedCount,2);
});

test('semantic routing preserves approach gaps and scopes exclusions; ambiguous negatives surface',()=>{
  const result=compilePromptFields([{id:'gaze',text:'eyes focused on a parcel, no eye contact with camera',source:'manual'},{id:'hand',text:'hand approaching the object without contact; preserve a visible gap',source:'phase'}]);
  assert.deepEqual(result.errors,[]);
  assert.match(result.prompt,/parcel/);assert.match(result.prompt,/visible gap/);
  assert.doesNotMatch(result.prompt,/\bno\b|without/);assert.match(result.negativePrompt,/eye contact/);
  assert.equal(compilePromptFields([{id:'custom',text:'not opening the door',source:'manual'}]).errors.length,1);
  const indoor=compilePromptFields([{id:'weather',text:'not visible indoors',source:'spec'},{id:'clothes',text:'no outerwear',source:'spec'}]);
  assert.deepEqual(indoor.errors,[]);assert.equal(indoor.prompt,'');assert.match(indoor.negativePrompt,/outerwear/);
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


test('portable tool category, specific operation and supported work object survive compilation',()=>{
 const data=getStudioData(),base=data.episode.pages[0].shots[0],id=base.characterIds[0];
 for(const [tool,action] of [['scissors','cutting open the cardboard delivery package'],['hammer','hammering the board']] as const){
  const toolFacts={...structuredFacts(tool,1),actionId:'operate_environment',phase:'contact',contact:{hand:'right',part:'handle',state:'contact'},support:{label:'',state:'held'},gaze:{kind:'object',targetId:'package_01',surface:'',description:'looking at the working point'}};
  const packageFacts={...structuredFacts('cardboard delivery package',1),object:{label:'cardboard delivery package',count:1,instanceId:'package_01'},actionId:'open',phase:'contact',contact:{hand:'left',part:'flap',state:'contact'},support:{label:'desk',state:'on_support'},gaze:{kind:'object',targetId:'package_01',surface:'opening',description:'looking at the opening'}};
  const spec=normalizeShotSpec({interactions:[{actorCharacterId:id,propId:'tool',action,visualFacts:toolFacts},{actorCharacterId:id,propId:'package',action:'opening the package',visualFacts:packageFacts}]},base,{interactionSource:'model'});
  assert.equal(spec.interactions[0].visualFacts?.actionId,'tool');
  const shot={...base,characterIds:[id],characterLooks:{},visualSpec:spec,visualSpecConfirmed:true};
  const relations=deriveInteractionContracts(shot,id);
  assert.equal(relations[0].actionPlan?.geometry.mechanism,'work');
  const regional=buildRegionalPrompt(shot,data.assets,data.characters);
  assert.match(regional.characterRegions[0].prompt,new RegExp(action));
  assert.match(regional.characterRegions[0].prompt,/cardboard delivery package resting on the desk/);
  assert.match(regional.characterRegions[0].prompt,/left hand touching the flap/);
  assert.doesNotMatch(regional.characterRegions[0].prompt,/operating/);
  const effective=buildEffectivePromptPlan(regional,regional.poseControl as import('../lib/pose-v3/schema').PoseControlV3);
  assert.deepEqual(effective.errors,[]);
  assert.match(effective.characterPrompts[0],new RegExp(action));
  assert.doesNotMatch(effective.characterPrompts[0],/using cardboard|operating/);
  assert.equal(effective.facts.relations.find(r=>r.object==='cardboard delivery package')?.actionPlan?.actionId,'open');
  assert.equal(effective.facts.relations.find(r=>r.object===tool)?.actionPlan?.actionId,'tool');
  assert.match(effective.characterPrompts[0],/cardboard delivery package resting on the desk/);
  assert.throws(()=>reconcileInteractionAction(toolFacts,action,'manual'),/tool/);
  assert.equal(reconcileInteractionAction({...toolFacts,object:{...toolFacts.object,label:'door control'}},'pressing the control').actionId,'operate_environment');
 }
});

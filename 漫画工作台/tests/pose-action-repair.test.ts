import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
import {actionIntent,explicitHandMode} from '../lib/pose-action-semantics';
import {poseConditioningPolicy,poseUnitParameters} from '../scripts/pose-conditioning-policy.mjs';
import {contactPassAllowed,phaseInteractionTerms} from '../scripts/action-stage-policy.mjs';
import {compilePoseExecutionV3,preparePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
const shot=(action:string):any=>({id:9300,pageId:1,order:1,description:action,actionEn:action,camera:'wide shot',cameraEn:'wide shot',characterIds:['actor'],visualSpecConfirmed:true,visualSpec:{camera:{shotSize:'wide shot'},characters:[{characterId:'actor',action,expression:'neutral'}]}});
const relation=(purpose='place',object='package'):any=>({relationId:'r',characterId:'actor',required:true,object,purpose,handMode:'one',activeHand:'right',objectCenter:{x:.5,y:.6},region:{xStart:0,xEnd:1},contactAnchors:[{hand:'right',x:.5,y:.6}],positive:['holding object with hand','one package']});
test('action verbs distinguish putting from taking, knobs from standing, and explicit single hand',()=>{
 for(const s of ['placing a book on a table','putting a phone down','放下手机'])assert.equal(actionIntent(s),'place');
 for(const s of ['picking up a book','taking a phone','拿起书'])assert.equal(actionIntent(s),'pick');
 assert.equal(actionIntent('turning a knob'),'operate_environment');assert.equal(actionIntent('holding an open book'),null);
 assert.equal(explicitHandMode('holding a phone with one hand'),'one');assert.equal(explicitHandMode('右手拿手机'),'one');assert.equal(explicitHandMode('with both hands'),'two');
});
test('conditioning follows common bounds and the actual unit preserves weight and end',()=>{
 for(const strength of ['auto','flexible','strict'] as const)for(const people of [[],[{relationTargets:[{}]}],[{},{}]]){
 const p=poseConditioningPolicy({},people,{strength});const u=poseUnitParameters(p);assert.equal(u.weight,p.weight);assert.equal(u.guidance_end,p.guidanceEnd);assert.equal(u.control_mode,p.controlMode);
 assert.ok(p.weight>0&&p.guidanceEnd<=1);
 }
 const flexible=poseConditioningPolicy({},[],{strength:'flexible'});assert.equal(flexible.weight,.5);assert.equal(flexible.controlMode,'My prompt is more important');
 for(const actors of [[{relationTargets:[{}]}],[{},{}],[{}]])for(const weight of [0,.01,.3,1.5,2]) {
 const manual=poseConditioningPolicy({},actors,{weight,guidanceEnd:.1});assert.equal(manual.weight,weight);assert.equal(manual.guidanceEnd,.1);assert.equal(poseUnitParameters(manual).weight,weight);
 }
 assert.equal(poseConditioningPolicy({},[],{weight:Infinity}).weight,.7);assert.equal(poseConditioningPolicy({},[],{weight:null} as any).weight,.7);
 assert.deepEqual(poseUnitParameters({weight:.42,guidanceStart:.1,guidanceEnd:.66,controlMode:'Balanced'}),{weight:.42,guidance_start:.1,guidance_end:.66,control_mode:'Balanced'});
 assert.equal(poseUnitParameters({guidanceStart:.9,guidanceEnd:.4}).guidance_start,.4);
});
test('conditioning-only edit preserves authored joints, framing and contacts',()=>{
 const base=buildPoseControlV3(shot('standing holding a package'),[relation('inspect')])!;
 const edited=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',conditioning:{strength:'flexible',weight:.64,guidanceEnd:.6}});
 assert.deepEqual(edited.fullPeople,base.fullPeople);assert.deepEqual(edited.scenePlan.relations,base.scenePlan.relations);assert.deepEqual(edited.scenePlan.projection,base.scenePlan.projection);
 assert.equal(edited.controlProfile.weight,.64);assert.equal(edited.controlProfile.guidanceEnd,.6);
});
test('place stages separate hand and object; execution and replay preserve the object instead of snapping it to wrists',()=>{
 const base=buildPoseControlV3(shot('placing a package on a table'),[relation()])!;
 for(const phase of ['anticipation','contact','follow_through'] as const){
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'place',phase,actionGeometry:{supportY:.6}});
 assert.equal(p.safety.valid,true,p.safety.errors.join(';'));
 const audit=p.scenePlan.people[0].actionRelationAudit!;assert.equal(audit.stateBefore,'held');assert.equal(audit.stateAfter,'on_support');assert.equal(contactPassAllowed({actionRelationAudit:audit}),phase!=='follow_through');
 const recipe:any={poseControl:p,generationSpec:{repairPasses:{propInteractions:[relation()]}}};preparePoseExecutionV3(recipe);const pass=recipe.poseExecution.repairPasses.propInteractions[0];
 const wrist=recipe.poseControl.people[0][4];const anchor=pass.contactAnchors[0];const distance=Math.hypot(wrist.x-anchor.x,wrist.y-anchor.y);
 assert.ok(phase!=='follow_through'?distance<1e-8:distance>.01);assert.equal(pass.actionRelationAudit.contactState,audit.contactState);
 if(phase==='follow_through')assert.ok(!phaseInteractionTerms(pass).some((s:string)=>/^holding/.test(s)));
 const first=JSON.stringify(recipe.poseExecution);preparePoseExecutionV3(recipe);assert.equal(JSON.stringify(recipe.poseExecution),first);
 }
});
test('missing and inconsistent object mechanisms, working tips and mouth targets stay pending and block replay',()=>{
 for(const [id,purpose,object] of [['open','operate','unknown container'],['write','operate','unknown tool'],['drink','drink','cup']] as const){
 const r=relation(purpose,object);const base=buildPoseControlV3(shot('standing'),[r])!;const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:id});
 assert.equal(p.scenePlan.people[0].actionRelationAudit?.status,'pending');assert.equal(p.safety.valid,false);assert.throws(()=>compilePoseExecutionV3(p,{propInteractions:[r]}),/overlay conflict/);
 }
 const r=relation('operate','pen');const p=applyPoseControlOverrideV3(buildPoseControlV3(shot('writing with a pen'),[r])!,{schemaVersion:'pose-override-v1',templateId:'write',actionGeometry:{workPoint:{x:.5,y:.6},toolEnd:{x:.7,y:.6}}});assert.match(p.safety.errors.join(' '),/工具/);
});
test('body views use opposite forward axes and face gestures change relative landmark geometry',()=>{
 const base=buildPoseControlV3(shot('standing'))!;
 const values=['front','left_profile','right_profile'].map(bodyView=>{const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'bend',bodyView:bodyView as any});const q=p.fullPeople[0];return q[1].x-(q[8].x+q[11].x)/2;});
 assert.ok(Math.abs(values[0])<1e-8);assert.ok(values[1]<0&&values[2]>0);
 const nod=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'nod'}),up=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'look_up'});
 assert.notEqual(nod.fullPeople[0][14].y-nod.fullPeople[0][0].y,up.fullPeople[0][14].y-up.fullPeople[0][0].y);
});
import {buildRegionalPrompt} from '../lib/prompts';
test('automatic story compilation binds environmental actions and preserves explicit phone hand and transfer intent',()=>{
 for(const action of ['opening a door','closing a door','pressing a button','turning a knob','typing on a keyboard','pushing a box','pulling a box']){
 const s={...shot(action),visualSpecConfirmed:false,scene:'room',sceneEn:'room',expressionEn:'neutral',compositionEn:'',lightingEn:'daylight',characterLooks:{}};
 const r=buildRegionalPrompt(s,[],[],{posePlannerVersion:'3.0'});const p:any=r.poseControl;
 assert.ok(p?.scenePlan.relations.some((r:any)=>r.purpose==='operate'),action);assert.equal(p.scenePlan.people[0].layers.armTemplateId,null,action);
 }
 for(const [action,id] of [['placing a smartphone on a table','place'],['picking up a smartphone from a table','pick'],['turning a knob','operate_environment']]){
 const r=buildRegionalPrompt({...shot(action),visualSpecConfirmed:false},[],[],{posePlannerVersion:'3.0'});const p:any=r.poseControl;assert.equal(p.scenePlan.people[0].templateId,id,action);
 }
 const one:any=buildRegionalPrompt({...shot('holding a smartphone with one hand'),visualSpecConfirmed:false},[],[],{posePlannerVersion:'3.0'}).poseControl;
 assert.equal(one.scenePlan.people[0].handMode,'one');assert.equal(one.scenePlan.relations[0].handMode,'one');
});
test('walking and running retain lean after basic rebuilding, and pair roles swap independently of screen position',()=>{
 for(const action of ['walking toward the exit','running toward the exit']){
 const p=buildPoseControlV3(shot(action))!;const q=p.fullPeople[0];const hip=(q[8].x+q[11].x)/2;
 assert.ok(Math.abs(q[1].x-hip)>.001,action);assert.ok(p.scenePlan.people[0].locomotion!.torsoLean!==0);
 }
 const s:any=shot('standing');s.characterIds=['a','b'];s.visualSpec.characters=['a','b'].map(characterId=>({characterId,action:'standing',expression:'neutral'}));const base=buildPoseControlV3(s)!;
 const guide=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'guide_pull',spacing:'close'});
 assert.deepEqual(guide.scenePlan.people.map(p=>p.pairRole),['active','supported']);
 const swapped=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'guide_pull',spacing:'close',swapRoles:true});assert.deepEqual(swapped.scenePlan.people.map(p=>p.pairRole),['supported','active']);
 const handshake=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'handshake',spacing:'close'});assert.notDeepEqual(guide.fullPeople,handshake.fullPeople);
});
test('face-bound free actions mirror their wrist targets in the same body frame',()=>{
 for(const templateId of ['self_touch','drink','eat']){
 const base=buildPoseControlV3(shot('standing'))!;const a=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId}),b=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId,mirror:true});
 for(const w of [4,7]){assert.ok(Math.abs(a.fullPeople[0][w].x+b.fullPeople[0][w].x-1)<1e-8,templateId);assert.ok(Math.abs(a.fullPeople[0][w].y-b.fullPeople[0][w].y)<1e-8);}
 }
});
test('locked joint editing sends the same conditioning profile as the scene plan',()=>{
 const base=buildPoseControlV3(shot('standing'))!;
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',people:structuredClone(base.fullPeople),editMode:'joint_edit',coordinateSpace:'full_pose',conditioning:{strength:'flexible',weight:.45,guidanceEnd:.6}});
 assert.equal(p.controlProfile.weight,.45);assert.deepEqual(p.controlProfile,p.scenePlan.controlProfile);assert.deepEqual(p.fullPeople,base.fullPeople);
});

test('reach never inherits an automatic holding overlay and incompatible held targets are explicit',()=>{
 const r=relation('read','smartphone');r.handMode='two';r.activeHand='both';r.contactAnchors=[{hand:'left',x:.525,y:.6},{hand:'right',x:.475,y:.6}];
 const automatic=buildPoseControlV3(shot('reaching while reading a smartphone with both hands'),[r])!;
 assert.equal(automatic.scenePlan.people[0].layers?.armTemplateId,null);
 assert.equal(automatic.safety.valid,false);assert.match(automatic.safety.errors.join(' '),/伸手/);
 const free=buildPoseControlV3(shot('reaching toward the right'))!;
 assert.equal(free.scenePlan.people[0].layers?.armTemplateId,null);assert.equal(free.safety.valid,true,JSON.stringify(free.safety));
 const p=free.fullPeople[0];assert.ok(Math.abs(p[4].x-p[2].x)>.18);assert.ok(Math.abs(p[4].y-p[2].y)<.15);
 const base=buildPoseControlV3(shot('holding a smartphone with both hands'),[r])!;
 const selected=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'reach',armTemplateId:'hold_two'});
 assert.equal(selected.safety.valid,false);assert.match(selected.safety.errors.join(' '),/伸手/);
 assert.throws(()=>compilePoseExecutionV3(selected),/伸手/);
});

test('known operation outlines fit once without a second portable envelope',()=>{
 const input=shot('sitting and cutting a package with scissors');
 const p=buildPoseControlV3(input,[relation('operate','scissors')])!;
 for(const e of p.scenePlan.evidence.filter(e=>e.points&&e.points.length>1)) assert.equal(e.propFootprint,undefined);
 for(const e of p.scenePlan.evidence.filter(e=>e.required&&e.points?.length)) assert.equal(p.scenePlan.projection?.evidenceVisible[e.id],true);
});
import {deriveInteractionContract} from '../lib/prompts';
import {inferStoryActionContract} from '../lib/story-action-contract';

test('reaching uses one canonical approach contract through prompt pose and worker preparation',()=>{
 for(const action of ['Reaching for a package on the shelf','伸手去拿货架上的包裹','Reaching for a book on the shelf with the left hand','Reaching for a phone on the shelf with both hands']){
 const s=shot(action);s.visualSpecConfirmed=false;s.visualSpec=null;
 const c=deriveInteractionContract(s,'actor');assert.equal(c.purpose,'pick',action);assert.equal(c.actionPlan?.phase,'anticipation');assert.doesNotMatch(c.positive.join(' '),/physically contact|interaction purpose inspect/);assert.doesNotMatch(c.negative.join(' '),/empty hands/);
 if(/both hands/.test(action))assert.equal(c.handMode,'two');else assert.equal(c.handMode,'one');
 if(/left hand/.test(action))assert.equal(c.activeHand,'left');
 const p=buildPoseControlV3(s,[c])!;assert.equal(p.scenePlan.people[0].templateId,'pick');assert.equal(p.scenePlan.people[0].phase,'anticipation');assert.equal(p.safety.valid,true,p.safety.errors.join(';'));
 const recipe:any={poseControl:p,generationSpec:{repairPasses:{propInteractions:[c]}}};preparePoseExecutionV3(recipe);const pass=recipe.poseExecution.repairPasses.propInteractions[0];
 assert.equal(pass.actionRelationAudit.contactState,'approach');assert.equal(contactPassAllowed(pass),false);assert.doesNotMatch(pass.positive.join(' '),/physically contact|picking up the/);
 for(const t of pass.actionRelationAudit.handTargets){const wrist=p.people[0][t.hand==='left'?7:4];assert.ok(Math.hypot(wrist.x-pass.objectCenter.x,wrist.y-pass.objectCenter.y)>.01);
 const joints=p.fullPeople[0],s=joints[t.hand==='left'?5:2],e=joints[t.hand==='left'?6:3],w=joints[t.hand==='left'?7:4];
 const dx=w.x-s.x,dy=w.y-s.y,d2=dx*dx+dy*dy,along=((e.x-s.x)*dx+(e.y-s.y)*dy)/d2;
 assert.ok(along>0&&along<1,`${action}: elbow must stay between shoulder and wrist along reaching direction`);
 const arm=p.scenePlan.people[0].overlayAudit!.arms.find(a=>a.hand===t.hand)!;
 assert.equal(arm.depthAssumption,'front_of_body');assert.ok(arm.depthOffsets!.wrist>0);
 }
 }
});
test('phase facts override generic defaults and negated reaching does not reappear through template fallback',()=>{
 const input={object:'book',purpose:'inspect',objectCenter:{x:.5,y:.5},region:{xStart:0,xEnd:1}};
 assert.equal(inferStoryActionContract(input,'reaching for a book','in progress',true)?.phase,'anticipation');
 assert.equal(inferStoryActionContract(input,'reaching for a book','contact',true)?.phase,'contact');
 assert.equal(inferStoryActionContract(input,'picked up a book')?.phase,'follow_through');
 assert.equal(inferStoryActionContract(input,'not reaching for a book'),null);
});

test('unknown props and separate actor regions share canonical stage semantics',()=>{
 const s=shot('standing');s.characterIds=['actor','other'];
 s.visualSpec.characters=[{characterId:'actor',region:{xStart:0,xEnd:.5},action:'reaching for ceramic_token with left hand'},{characterId:'other',region:{xStart:.5,xEnd:1},action:'placing a book on the table'}];
 s.visualSpec.interactions=[{type:'person_prop',actorCharacterId:'actor',propId:'ceramic_token',action:'reaching for ceramic_token with left hand',phase:'in progress',contactPoints:['left hand approaches ceramic_token']},{type:'person_prop',actorCharacterId:'other',propId:'book',action:'placing a book on the table',phase:'follow_through',contactPoints:['right hand has released book']}];
 const first=deriveInteractionContract(s,'actor'),second=deriveInteractionContract(s,'other');
 assert.equal(first.actionPlan?.phase,'anticipation');assert.equal(first.activeHand,'left');assert.equal(first.handMode,'one');assert.equal(first.purpose,'pick');assert.equal(contactPassAllowed(first),false);
 assert.equal(second.actionPlan?.actionId,'place');assert.equal(second.actionPlan?.phase,'follow_through');assert.equal(contactPassAllowed(second),false);
 assert.ok(first.objectCenter.x<.5);assert.ok(second.objectCenter.x>.5);
 assert.doesNotMatch(first.positive.join(' '),/physically contact/);assert.doesNotMatch(second.positive.join(' '),/both hands physically contact/);
});

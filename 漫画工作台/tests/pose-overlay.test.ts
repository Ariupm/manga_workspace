import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3,preparePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
const bodies=[['stand','standing on the floor'],['sit','sitting on a chair'],['crouch','crouching on the floor'],['kneel_single','kneeling on one knee'],['kneel_double','kneeling on both knees'],['recline','reclining on a sofa'],['lie_supine','lying supine on a bed'],['lie_side','lying on one side on a bed']];
const shot=(action:string,region?:any,camera='wide shot'):any=>({id:7201,pageId:1,order:1,description:action,actionEn:action,camera,cameraEn:camera,characterIds:['actor'],visualSpecConfirmed:true,visualSpec:{camera:{shotSize:camera},characters:[{characterId:'actor',action,expression:'neutral',...(region?{region}:{})}]}});
const d=(a:any,b:any)=>Math.hypot(a.x-b.x,a.y-b.y);
const rel=(handMode:'one'|'two',y=.62,x=.5):any=>({relationId:'held',characterId:'actor',required:true,object:'package',purpose:'inspect',handMode,activeHand:handMode==='two'?'both':'right',objectCenter:{x,y},region:{xStart:0,xEnd:1},contactAnchors:handMode==='two'?[{hand:'right',x:x-.045,y},{hand:'left',x:x+.045,y}]:[{hand:'right',x,y}]});
test('all basic postures retain their lower body and support under single/two-hand overlays in regions and mirrors',()=>{
 for(const [id,action] of bodies)for(const region of [undefined,{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}])for(const mirror of [false,true])for(const armTemplateId of ['hold_one','hold_two','phone_one','phone_two'] as const){
 const base=buildPoseControlV3(shot(action,region))!;const mirrored=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',mirror});
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',bodyTemplateId:id as any,armTemplateId,mirror});
 assert.equal(p.scenePlan.people[0].layers!.bodyTemplateId,id);assert.equal(p.scenePlan.people[0].layers!.armTemplateId,armTemplateId);
 assert.equal(p.safety.valid,true,JSON.stringify({id,armTemplateId,errors:p.safety.errors}));
 assert.deepEqual(p.fullPeople[0].slice(8,14),mirrored.fullPeople[0].slice(8,14));assert.deepEqual(p.scenePlan.supportRelations,mirrored.scenePlan.supportRelations);
 for(const a of p.scenePlan.people[0].overlayAudit!.arms){const [s,e,w]=a.hand==='left'?[5,6,7]:[2,3,4];assert.ok(Math.abs(d(p.fullPeople[0][s],p.fullPeople[0][e])-a.upperLength)<1e-9);assert.ok(Math.abs(d(p.fullPeople[0][e],p.fullPeople[0][w])-a.foreLength)<1e-9);}
 assert.equal(p.scenePlan.people[0].handMode,armTemplateId.endsWith('two')?'two':'one');
 }
});
test('low/high contacts remain exact and impossible contacts fail before execution instead of stretching',()=>{
 for(const y of [.28,.45,.62])for(const handMode of ['one','two'] as const){const relation=rel(handMode,y);const p=buildPoseControlV3(shot('standing holding a package'),[relation])!;assert.equal(p.safety.valid,true,JSON.stringify(p.safety));for(const a of relation.contactAnchors)assert.deepEqual(p.fullPeople[0][a.hand==='left'?7:4],{x:a.x,y:a.y});}
 const impossible=buildPoseControlV3(shot('standing holding a package'),[rel('two',.95,.85)])!;assert.equal(impossible.safety.valid,false);assert.match(impossible.safety.errors.join(' '),/beyond arm reach/);assert.throws(()=>compilePoseExecutionV3(impossible),/overlay conflict/);
});
test('body and arm selections persist together; walking remains walking and phone gaze has a coherent pitched face',()=>{
 const base=buildPoseControlV3(shot('standing on the floor'))!;const raw:any={schemaVersion:'pose-override-v1',bodyTemplateId:'sit',armTemplateId:'phone_two',confirmPoseContract:true};const p=applyPoseControlOverrideV3(base,raw);
 assert.equal(p.scenePlan.people[0].layers!.bodyTemplateId,'sit');assert.equal(p.scenePlan.people[0].handMode,'two');assert.equal(p.scenePlan.people[0].activeHand,'both');
 const walk=buildPoseControlV3(shot('walking toward the exit'))!;const phone=applyPoseControlOverrideV3(walk,{schemaVersion:'pose-override-v1',armTemplateId:'phone_two'});assert.equal(phone.scenePlan.people[0].locomotion!.mode,'walk');assert.deepEqual(phone.fullPeople[0].slice(8,14),walk.fullPeople[0].slice(8,14));
 const hold=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',armTemplateId:'hold_two'});const look=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',armTemplateId:'phone_two'});
 assert.ok(look.fullPeople[0][0].y>hold.fullPeople[0][0].y);
 assert.notDeepEqual(look.fullPeople[0].slice(14,18).map(q=>({x:q.x-look.fullPeople[0][0].x,y:q.y-look.fullPeople[0][0].y})),hold.fullPeople[0].slice(14,18).map(q=>({x:q.x-hold.fullPeople[0][0].x,y:q.y-hold.fullPeople[0][0].y})));
 for(const j of [14,15])assert.ok(Math.hypot(look.fullPeople[0][j].x-look.fullPeople[0][0].x,look.fullPeople[0][j].y-look.fullPeople[0][0].y)<.06);
 const a=look.fullPeople[0];assert.ok(a[4].x<a[7].x);assert.ok(a[3].x<a[6].x);
});
test('conflicting hand allocation and manual interaction changes are visible failures',()=>{
 const base=buildPoseControlV3(shot('standing holding a package'),[rel('one')])!;
 const two=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',armTemplateId:'hold_two'});assert.equal(two.safety.valid,false);assert.match(two.safety.errors.join(' '),/hand mode/);
 const duplicate={...rel('one'),relationId:'another'};const occupied=buildPoseControlV3(shot('standing holding a package'),[rel('two'),duplicate])!;assert.equal(occupied.safety.valid,false);assert.match(occupied.safety.errors.join(' '),/assigned to both/);
});
test('execution and replay share contact geometry; editing explicit wrists invalidates stale audit',()=>{
 const p=buildPoseControlV3(shot('standing holding a package'),[rel('two')])!;const before=JSON.stringify(p);const recipe:any={poseControl:p,generationSpec:{repairPasses:{propInteractions:[rel('two')]}}};preparePoseExecutionV3(recipe);const first=JSON.stringify(recipe.poseExecution);preparePoseExecutionV3(recipe);assert.equal(JSON.stringify(recipe.poseExecution),first);assert.equal(JSON.stringify(p),before);
 for(const contact of recipe.poseExecution.repairPasses.propInteractions[0].contactAnchors)assert.deepEqual({x:contact.x,y:contact.y},p.people[0][contact.hand==='left'?7:4]);
 const points=structuredClone(p.people);points[0][4].x+=.1;const edited=applyPoseControlOverrideV3(p,{schemaVersion:'pose-override-v1',people:points,editMode:'joint_edit'});assert.equal(edited.safety.valid,false);assert.match(edited.safety.errors.join(' '),/declared contact|bone lengths/);
});
import {poseOverlayBindingFailuresV3} from '../lib/pose-v3/overlays';
test('preview-only manual arm selections cannot pretend that a prop interaction was bound',()=>{
 const base=buildPoseControlV3(shot('standing on the floor'))!;const manual=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',armTemplateId:'phone_two'});assert.deepEqual(poseOverlayBindingFailuresV3(manual.scenePlan.people),['actor']);
 const bound=buildPoseControlV3(shot('standing holding a package'),[rel('two')])!;assert.deepEqual(poseOverlayBindingFailuresV3(bound.scenePlan.people),[]);
 const cleared=applyPoseControlOverrideV3(manual,{schemaVersion:'pose-override-v1',armTemplateId:'none'});assert.equal(cleared.scenePlan.people[0].layers!.armTemplateId,null);assert.deepEqual(poseOverlayBindingFailuresV3(cleared.scenePlan.people),[]);
});
test('independent gaze and manual hand facts stay consistent in prompt and geometry',()=>{
 const base=buildPoseControlV3(shot('standing looking at the camera'))!;base.scenePlan.people[0].gazeTarget={kind:'independent',point:null,targetId:null,source:'explicit_story_gaze'};
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',armTemplateId:'phone_two'});assert.equal(p.scenePlan.people[0].gazeTarget.kind,'independent');
 const text=synchronizeBasicPosePromptV3('standing, holding a smartphone with the right hand, looking at camera',p.scenePlan.people[0]);assert.match(text,/with both hands/);assert.ok(!/with the right hand|viewing a smartphone/.test(text));assert.match(text,/looking at camera/);
});
test('authored contacts near source boundary are not clamped before scene projection',()=>{
 const relation:any={...rel('one',.42,.965),activeHand:'left',contactAnchors:[{hand:'left',x:.965,y:.42}]};const p=buildPoseControlV3(shot('standing holding a package',{xStart:.7,xEnd:1}),[relation])!;
 assert.equal(p.safety.valid,true,JSON.stringify(p.safety));assert.deepEqual(p.fullPeople[0][7],{x:.965,y:.42});assert.equal(p.scenePlan.people[0].target!.x,.965);
});
test('phone foreshortening has an explicit depth model and preserves physical bone lengths',()=>{
 const p=applyPoseControlOverrideV3(buildPoseControlV3(shot('standing on the floor'))!,{schemaVersion:'pose-override-v1',armTemplateId:'phone_two'});
 for(const a of p.scenePlan.people[0].overlayAudit!.arms){const [s,e,w]=a.hand==='left'?[5,6,7]:[2,3,4];assert.equal(a.depthAssumption,'front_of_body');assert.ok(Math.abs(Math.hypot(d(p.fullPeople[0][s],p.fullPeople[0][e]),a.depthOffsets!.elbow)-a.upperBoneLength!)<1e-9);assert.ok(Math.abs(Math.hypot(d(p.fullPeople[0][e],p.fullPeople[0][w]),a.depthOffsets!.wrist-a.depthOffsets!.elbow)-a.foreBoneLength!)<1e-9);}
});
test('phone overlays consume body views, hand choice and mirror consistently',()=>{
 for(const action of ['standing on the floor','sitting on a chair'])for(const bodyView of ['front','three_quarter','left_profile','right_profile'] as const)for(const mirror of [false,true])for(const handedness of ['left','right'] as const){
 const p=applyPoseControlOverrideV3(buildPoseControlV3(shot(action))!,{schemaVersion:'pose-override-v1',armTemplateId:'phone_one',bodyView,mirror,handedness});assert.equal(p.safety.valid,true,JSON.stringify(p.safety));assert.equal(p.scenePlan.people[0].activeHand,handedness);assert.equal(p.scenePlan.people[0].basicGeometry!.parameters.view,bodyView);
 }
});

test('cradled object wrists remain fixed while projected forearms have auditable depth',()=>{
 for(const x of [.3,.5,.7])for(const y of [.43,.47,.52]){
  const region={xStart:x-.2,xEnd:x+.2};const p=buildPoseControlV3(shot('standing holding a package',region),[rel('two',y,x)])!;
  const points=p.fullPeople[0];for(const a of p.scenePlan.people[0].overlayAudit!.arms){const [shoulder,elbow,wrist]=a.hand==='left'?[5,6,7]:[2,3,4];assert.ok(Math.abs(points[elbow].x-points[shoulder].x)<.025);assert.ok(d(points[wrist],a.target)<1e-9);assert.equal(a.depthAssumption,'front_of_body');assert.ok(Math.abs(Math.hypot(a.upperLength,a.depthOffsets!.elbow)-a.upperBoneLength!)<1e-9);assert.ok(Math.abs(Math.hypot(a.foreLength,a.depthOffsets!.wrist-a.depthOffsets!.elbow)-a.foreBoneLength!)<1e-9);}
 }
});
test('head-shoulder framing rejects a low prop even with hidden knees; medium remains usable',()=>{
 const close=buildPoseControlV3(shot('standing holding a package',undefined,'close-up'),[rel('two',.47)])!;
 assert.equal(close.safety.valid,false);assert.match(close.safety.errors.join(' '),/crop includes torso/);close.safety.valid=true;assert.throws(()=>compilePoseExecutionV3(close),/framing conflict/);
 const medium=buildPoseControlV3(shot('standing holding a package',undefined,'medium shot'),[rel('two',.47)])!;assert.equal(medium.safety.valid,true);assert.ok(compilePoseExecutionV3(medium));
});
test('bound object gaze changes nose relative to eyes instead of translating a frontal face',()=>{
 const relation={...rel('two',.47),gazeTarget:{kind:'object',point:{x:.5,y:.47},targetId:'held',source:'interaction.object_center'}};const p=buildPoseControlV3(shot('standing holding a package'),[relation])!;const q=p.fullPeople[0];assert.ok(q[0].y-(q[14].y+q[15].y)/2>.02);assert.equal(p.scenePlan.people[0].headDirection.mode,'down');
});

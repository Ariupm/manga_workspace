import assert from 'node:assert/strict';import test from 'node:test';
import {buildPoseControlV3,applyPoseControlOverrideV3,poseTemplateRegistryV3} from '../lib/pose-v3';
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
import {poseOverlayBindingFailuresV3} from '../lib/pose-v3/overlays';
import {overlayGeometryFailures} from '../scripts/pose-overlay-guard.mjs';
import {ARM_RIG_V3} from '../lib/pose-v3/rig';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
const shot=(action:string,n=1):any=>({id:9012,pageId:1,order:1,actionEn:action,description:action,camera:'wide shot',cameraEn:'wide shot',characterIds:n===1?['a']:['a','b'],visualSpecConfirmed:true,visualSpec:{camera:{shotSize:'wide shot'},characters:(n===1?['a']:['a','b']).map(characterId=>({characterId,action,expression:'neutral'}))}});
const d=(a:any,b:any)=>Math.hypot(a.x-b.x,a.y-b.y);
const examples:Record<string,string>={turn:'turning around',bend:'bending forward',point:'pointing at a sign',reach:'reaching for a shelf',self_touch:'touching her face',nod:'nodding',look_up:'looking up',head_turn:'turning her head',head_tilt:'tilting her head',open:'opening a box',close:'closing a door',operate_environment:'pressing a button',write:'writing a letter',tool:'cutting paper',drink:'drinking water',eat:'eating food',lie_prone:'lying face down on a bed'};
test('missing templates are selectable and automatically recognized with actual action geometry',()=>{
 const base=buildPoseControlV3(shot('standing'))!;
 for(const [id,text] of Object.entries(examples)){
  assert.ok(poseTemplateRegistryV3.some(t=>t.id===id));
  const auto=buildPoseControlV3(shot(text))!;assert.ok(auto,id);assert.equal(auto.scenePlan.people[0].templateId,id,text);
  const manual=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:id,confirmPoseContract:true});assert.equal(manual.scenePlan.people[0].templateId,id);assert.notDeepEqual(manual.fullPeople,base.fullPeople,id);assert.equal(manual.fullPeople[0].length,18);
 }
});
test('rest and overlay use the same physical arm rig for all basic types, views, hands and mirrors',()=>{
 for(const templateId of ['stand','sit','crouch','kneel_single','kneel_double','recline','lie_supine','lie_side','lie_prone'])for(const mirror of [false,true]){
 const base=buildPoseControlV3(shot('standing'))!;const rest=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId,mirror,confirmPoseContract:true});
 for(const armTemplateId of ['hold_one','hold_two','phone_one','phone_two'] as const){const action=applyPoseControlOverrideV3(rest,{schemaVersion:'pose-override-v1',armTemplateId});
  for(const p of [rest,action])for(const a of p.scenePlan.people[0].overlayAudit!.arms){assert.equal(a.upperBoneLength,ARM_RIG_V3.upper);assert.equal(a.foreBoneLength,ARM_RIG_V3.fore);const [s,e,w]=a.hand==='left'?[5,6,7]:[2,3,4];assert.ok(Math.abs(d(p.fullPeople[0][s],p.fullPeople[0][e])-a.upperLength)<1e-8);assert.ok(Math.abs(d(p.fullPeople[0][e],p.fullPeople[0][w])-a.foreLength)<1e-8);}
 }
 }
});
test('pick/place, push/pull and head gestures differ and preserve body layering',()=>{
 const base=buildPoseControlV3(shot('sitting on a chair'))!;
 for(const [a,b] of [['pick','place'],['push','pull'],['nod','look_up'],['open','close'],['drink','eat']]){
 const first=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:a});const second=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:b});assert.notDeepEqual(first.fullPeople,second.fullPeople,`${a}/${b}`);assert.equal(first.scenePlan.people[0].layers!.bodyTemplateId,'sit');
 }
});
test('paired contact uses anatomically inner hands and blocks unreachable spacing without stretching',()=>{
 const base=buildPoseControlV3(shot('two people standing',2))!;
 for(const templateId of ['handshake','highfive','handover','support_walk','embrace'])for(const mirror of [false,true]){
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId,spacing:'close',mirror});assert.equal(p.safety.valid,true,templateId+JSON.stringify(p.safety));assert.ok(p.scenePlan.people.every(q=>q.actionContacts!.length>0));
 for(const [i,person] of p.scenePlan.people.entries())for(const c of person.actionContacts!){const w=c.hand==='left'?7:4;assert.ok(d(p.fullPeople[i][w],c.target)<1e-9);}
 assert.ok(compilePoseExecutionV3(p));
 }
 const far=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'embrace',spacing:'wide'});assert.equal(far.safety.valid,false);assert.match(far.safety.errors.join(' '),/beyond arm reach/);
});
test('walk and run retain constant leg bones and differentiated geometry in all phases',()=>{
 const base=buildPoseControlV3(shot('standing'))!;
 for(const phase of ['anticipation','contact','follow_through'] as const)for(const mirror of [false,true]){
 const poses=['walk','run'].map(templateId=>applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId,phase,mirror}));assert.notDeepEqual(poses[0].fullPeople,poses[1].fullPeople);
 for(const p of poses)for(const [h,k,a] of [[8,9,10],[11,12,13]]){assert.ok(Math.abs(d(p.fullPeople[0][h],p.fullPeople[0][k])-.20)<1e-8);assert.ok(Math.abs(d(p.fullPeople[0][k],p.fullPeople[0][a])-.205)<1e-8);}
 }
});

test('all paired catalog entries preserve both actor IDs and geometry through execution',()=>{
 const base=buildPoseControlV3(shot('two people standing',2))!;
 for(const templateId of ['conversation','reaction','shared_prop','guide_pull','walk_together','confrontation']){
  const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId,spacing:'close'});
  assert.deepEqual(p.scenePlan.people.map(q=>q.templateId),[templateId,templateId]);assert.equal(p.safety.valid,true,templateId+JSON.stringify(p.safety));
  assert.notDeepEqual(p.fullPeople,base.fullPeople);assert.ok(compilePoseExecutionV3(p));
 }
});
test('new rig guards reject shortened arms and direction controls change the requested reach',()=>{
 const base=buildPoseControlV3(shot('standing'))!;
 const right=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'reach',targetDirection:'right'});
 const up=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'reach',targetDirection:'up'});
 assert.notDeepEqual(right.fullPeople[0][4],up.fullPeople[0][4]);assert.equal(right.scenePlan.people[0].overlayAudit!.version,'pose-overlay-2');
 const bad=structuredClone(base);bad.fullPeople[0][3]={...bad.fullPeople[0][2]};assert.throws(()=>compilePoseExecutionV3(bad),/bone lengths/);
});

test('manual action text and object purpose cannot silently contradict the selected template',()=>{
 const p=applyPoseControlOverrideV3(buildPoseControlV3(shot('pointing at a sign'))!,{schemaVersion:'pose-override-v1',templateId:'drink'});
 const person=p.scenePlan.people[0];const prompt=synchronizeBasicPosePromptV3('adult woman, pointing at a sign, pink shirt',person);
 assert.doesNotMatch(prompt,/pointing|at a sign/);assert.match(prompt,/drink to the mouth/);assert.match(prompt,/pink shirt/);
 person.relationTargets=[{object:'package',purpose:'inspect'} as any];assert.match(overlayGeometryFailures(p.fullPeople,p.scenePlan.people).join(' '),/interaction purpose/);
});

test('shared object previews require real bindings and head gestures respect explicit gaze',()=>{
 const pair=applyPoseControlOverrideV3(buildPoseControlV3(shot('standing',2))!,{schemaVersion:'pose-override-v1',templateId:'shared_prop',spacing:'close'});
 assert.equal(poseOverlayBindingFailuresV3(pair.scenePlan.people).length,2);
 const head=applyPoseControlOverrideV3(buildPoseControlV3(shot('standing'))!,{schemaVersion:'pose-override-v1',templateId:'look_up'});const person=head.scenePlan.people[0];
 person.relationTargets=[{object:'book',purpose:'read'} as any];person.gazeTarget={kind:'object',point:{x:.5,y:.7},targetId:null,source:'explicit'};
 assert.match(overlayGeometryFailures(head.fullPeople,head.scenePlan.people).join(' '),/gaze target/);
});

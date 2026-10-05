import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {basicTemplateFromText} from '../lib/pose-basic-semantics';
const cases=[['stand','standing on the floor'],['sit','sitting on a chair'],['crouch','crouching on the floor'],['kneel_single','kneeling on one knee'],['kneel_double','kneeling on both knees'],['recline','reclining on a sofa'],['lie_supine','lying supine on a bed'],['lie_side','lying on one side on a bed']];
function shot(action:string,region?:any):any{return {id:7001,pageId:1,order:1,title:'pose',description:action,actionEn:action,camera:'wide shot',cameraEn:'wide shot',compositionEn:'',characterIds:['actor'],characterLooks:{},visualSpecConfirmed:true,visualSpec:{camera:{shotSize:'wide shot'},characters:[{characterId:'actor',action,expression:'neutral',...(region?{region}:{})}]}}}
test('basic auto/manual geometry agrees in center and both actor regions; mirrors preserve bone lengths',()=>{
 for(const [id,action] of cases)for(const region of [undefined,{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}]){
 const a=buildPoseControlV3(shot(action,region))!;const b=applyPoseControlOverrideV3(a,{schemaVersion:'pose-override-v1',templateId:id,editMode:'parameter_edit'});
 assert.deepEqual(a.fullPeople,b.fullPeople,id);assert.equal(a.safety.valid,true,`${id}: ${a.safety.errors}`);
 const m=applyPoseControlOverrideV3(a,{schemaVersion:'pose-override-v1',templateId:id,editMode:'parameter_edit',mirror:true});
 const cx=a.scenePlan.people[0].anchor.x; a.fullPeople[0].forEach((p,i)=>{assert.ok(Math.abs(m.fullPeople[0][i].x-(2*cx-p.x))<1e-9,JSON.stringify({id,region,i,cx,a:p,m:m.fullPeople[0][i],actions:a.scenePlan.people[0].actions}));assert.ok(Math.abs(m.fullPeople[0][i].y-p.y)<1e-9)});
 const e=compilePoseExecutionV3(a);const hips={x:(a.fullPeople[0][8].x+a.fullPeople[0][11].x)/2,y:(a.fullPeople[0][8].y+a.fullPeople[0][11].y)/2};
 assert.deepEqual(a.scenePlan.supportRelations[0].pelvisAnchor,hips); assert.equal(e.scenePlan.supportRelations[0].pelvisAnchor.x,(hips.x-.5)*a.scenePlan.projection!.scale+.5+a.scenePlan.projection!.translate.x);
 }
});
test('default sit is moderate; explicit together/apart and profile change geometry',()=>{
 const p=(s:string)=>buildPoseControlV3(shot(s))!.fullPeople[0];const natural=p('sitting on a chair in front view'),together=p('sitting on a chair knees together in front view'),apart=p('sitting on a chair knees apart in front view');
 const gap=(j:any[])=>Math.abs(j[9].x-j[12].x);assert.ok(gap(together)<gap(natural));assert.ok(gap(natural)<gap(apart));assert.ok(gap(natural)<Math.abs(natural[2].x-natural[5].x));assert.notDeepEqual(p('sitting on a chair in profile'),natural);
});
test('lying subtypes, kneeling and crouching are distinct; furniture/negation never imply seated',()=>{
 const p=(s:string)=>buildPoseControlV3(shot(s))!;
 assert.equal(basicTemplateFromText('lying supine beside a bed'),'lie_supine');assert.equal(p('standing beside a sofa, not sitting').scenePlan.people[0].templateId,'stand');
 assert.notDeepEqual(p(cases[2][1]).fullPeople,p(cases[3][1]).fullPeople);assert.notDeepEqual(p(cases[3][1]).fullPeople,p(cases[4][1]).fullPeople);assert.notDeepEqual(p(cases[6][1]).fullPeople,p(cases[7][1]).fullPeople);
 for(const s of ['sitting on the floor','lying supine on the floor'])assert.equal(p(s).scenePlan.supportRelations[0].supportKind,'floor');
 const recline=p(cases[5][1]);const e=compilePoseExecutionV3(recline);const back=recline.scenePlan.supportRelations[0].backEdge!;assert.ok(back);assert.equal(e.scenePlan.supportRelations[0].backEdge!.x,(back.x-.5)*recline.scenePlan.projection!.scale+.5+recline.scenePlan.projection!.translate.x);
});

test('manual body view and knee spacing override story defaults and are retained in recipe audit',()=>{
 const base=buildPoseControlV3(shot('sitting on a chair knees apart in front view'))!;
 const manual=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',bodyView:'left_profile',kneeSpacing:'together',editMode:'parameter_edit'});
 assert.equal(manual.scenePlan.people[0].basicGeometry!.parameters.view,'left_profile');assert.equal(manual.scenePlan.people[0].basicGeometry!.parameters.kneeSpacing,'together');assert.equal(manual.override!.kneeSpacing,'together');assert.notDeepEqual(manual.fullPeople,base.fullPeople);
 const prone=buildPoseControlV3(shot('lying face down on a bed'))!;assert.equal(prone.safety.valid,true);assert.equal(prone.scenePlan.people[0].templateId,'lie_prone');assert.notDeepEqual(prone.fullPeople,buildPoseControlV3(shot('lying supine on a bed'))!.fullPeople);
 assert.equal(basicTemplateFromText('仰卧在床上'),'lie_supine');assert.equal(basicTemplateFromText('侧卧在床上'),'lie_side');
});
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
test('manual basic qualifiers replace conflicting story prompt qualifiers',()=>{
 const base=buildPoseControlV3(shot('sitting on a chair knees apart in front view'))!;
 const manual=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',bodyView:'left_profile',kneeSpacing:'together'});
 const text=synchronizeBasicPosePromptV3('blue coat, sitting, knees apart, front view, holding a book',manual.scenePlan.people[0]);
 assert.ok(!/knees apart|front view/.test(text));assert.match(text,/knees together/);assert.match(text,/left profile/);assert.match(text,/holding a book/);assert.match(text,/blue coat/);
});
test('confirmed manual posture change removes the old basic posture from execution text',()=>{
 const base=buildPoseControlV3(shot('standing on the floor'))!;const m=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'sit',confirmPoseContract:true});
 const text=synchronizeBasicPosePromptV3('standing on the floor, holding a book',m.scenePlan.people[0]);assert.ok(!/standing/.test(text));assert.match(text,/sitting/);assert.match(text,/holding a book/);
});

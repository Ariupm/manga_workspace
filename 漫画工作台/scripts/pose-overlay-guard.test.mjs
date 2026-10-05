import assert from 'node:assert/strict';
import test from 'node:test';
import {overlayGeometryFailures,forearmsIntersect} from './pose-overlay-guard.mjs';
import {compilePoseExecutionV3} from './pose-execution-v3.mjs';
function fixture(){
 const p=Array.from({length:18},()=>({x:.5,y:.5}));p[2]={x:.41,y:.295};p[3]={x:.4,y:.475};p[4]={x:.45,y:.62};
 const person={characterId:'actor',anchor:{x:.5,y:.5},scale:1,relationTargets:[],overlayAudit:{version:'pose-overlay-1',errors:[],arms:[{hand:'right',source:'explicit_contact',target:{...p[4]},upperLength:.18,foreLength:.171,reachable:true}]}};
 return {posePlanVersion:'3.0',fullPeople:[p],scenePlan:{people:[person],fullPeople:[p],projection:{scale:1,translate:{x:0,y:0}},relations:[],supportRelations:[]}};
}
test('worker rejects stale success when an edited contact or bone length no longer matches',()=>{
 const c=fixture();c.fullPeople[0][4]={x:.8,y:.9};c.safety={valid:true,errors:[]};assert.throws(()=>compilePoseExecutionV3(c),/bone lengths|declared contact/);
});
test('unreachable explicit contact is recomputed from current geometry, not an old success flag',()=>{
 const c=fixture();c.scenePlan.people[0].overlayAudit.arms[0].target={x:.95,y:.95};assert.match(overlayGeometryFailures(c.fullPeople,c.scenePlan.people).join(' '),/beyond arm reach/);
});
test('ordinary phone crossing is blocked, while explicitly requested crossed forearms remain allowed',()=>{
 const c=fixture(),p=c.fullPeople[0];p[3]={x:.4,y:.4};p[4]={x:.6,y:.6};p[6]={x:.6,y:.4};p[7]={x:.4,y:.6};assert.equal(forearmsIntersect(p),true);c.scenePlan.people[0].overlayAudit.arms=[];c.scenePlan.people[0].layers={armTemplateId:'phone_two'};
 assert.match(overlayGeometryFailures(c.fullPeople,c.scenePlan.people).join(' '),/crossed forearms/);c.scenePlan.people[0].sourceText='crossed forearms';assert.deepEqual(overlayGeometryFailures(c.fullPeople,c.scenePlan.people),[]);
});

test('historical contact recipes preserve coordinates but cannot replay stretched arms',()=>{
 const c=fixture(),person=c.scenePlan.people[0];delete person.overlayAudit;
 person.relationTargets=[{handMode:'one',activeHand:'right'}];
 c.fullPeople[0][1]={x:.5,y:.295};c.fullPeople[0][8]={x:.45,y:.545};c.fullPeople[0][11]={x:.55,y:.545};
 assert.deepEqual(overlayGeometryFailures(c.fullPeople,c.scenePlan.people),[]);
 c.fullPeople[0][3]={x:.45,y:.675};
 assert.throws(()=>compilePoseExecutionV3(c),/legacy contact arm length invalid/);
});

test('two low hand contacts report one conflict per actor and retain different actors',()=>{
 const joints=Array.from({length:18},()=>({x:.5,y:.3}));joints[4].y=.6;joints[7].y=.6;
 const person={characterId:'actor',templateId:'reach',activeHand:'both',relationTargets:[{handMode:'two',purpose:'read'}]};
 const errors=overlayGeometryFailures([joints,joints],[person,{...person,characterId:'other'}]);
 assert.equal(errors.filter(e=>e.startsWith('actor: 伸手目标与既有低位持物接触冲突')).length,1);
 assert.equal(errors.filter(e=>e.startsWith('other: 伸手目标与既有低位持物接触冲突')).length,1);
});

test('downward reaching to inspect a prop is not a static holding conflict',()=>{
 const joints=Array.from({length:18},()=>({x:.5,y:.3}));joints[4].y=.6;joints[7].y=.6;
 const errors=overlayGeometryFailures([joints],[{characterId:'actor',templateId:'reach',activeHand:'both',relationTargets:[{handMode:'two',purpose:'inspect'}]}]);
 assert.ok(!errors.some(e=>e.includes('伸手目标与既有低位持物')));
});

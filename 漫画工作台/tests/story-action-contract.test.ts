import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveInteractionContract,buildRegionalPrompt,buildGenerationPrompt} from '../lib/prompts';
import {applyPoseControlOverrideV3,buildPoseControlV3} from '../lib/pose-v3';
import {compilePoseExecutionV3,preparePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';
import {actionOutlineMarkup,mechanismGeometryFailures} from '../scripts/action-mechanism.mjs';
import {synchronizeBasicPosePromptV3} from '../lib/pose-v3/prompt-consistency';
const actor:any={id:'actor',name:'Actor',appearanceEn:'adult person',visualTraits:{},invariantsEn:[],references:[]};
const shot=(action:string,region={xStart:0,xEnd:1},camera='wide shot'):any=>({id:9401,pageId:1,order:1,title:'action',description:action,scene:'workshop',sceneEn:'workshop with a table',timeOfDay:'day',actionEn:action,expressionEn:'neutral',camera,cameraEn:camera,compositionEn:'',lightingEn:'daylight',characterIds:['actor'],characterLooks:{},environment:{},visualSpecConfirmed:true,visualSpec:{camera:{shotSize:camera},characters:[{characterId:'actor',action,expression:'neutral',region,appearanceState:{hair:'',bag:'',accessories:[],glasses:'',outerwearState:'',condition:[]}}],scene:{location:'workshop',timeOfDay:'day',weather:'clear',lighting:'daylight',sceneId:'workshop'},visibleFacts:[action],interactions:[],interaction:null}});
const examples=[['opening a door','open','hinge'],['closing a door','close','hinge'],['opening a drawer','open','slide'],['pressing a button','operate_environment','press'],['turning a knob','operate_environment','rotate'],['writing with a pen on paper','write','work'],['cutting paper with scissors','tool','work'],['typing on a keyboard','tool','work'],['pushing a box','push','force'],['pulling a box','pull','force']] as const;
test('story contracts drive prompt, source pose and repair relation without asking for coordinates',()=>{
 for(const [action,id,mechanism] of examples){
 const s=shot(action),contract=deriveInteractionContract(s,'actor');assert.equal(contract.actionPlan?.actionId,id,action);assert.equal(contract.actionPlan?.geometry.mechanism,mechanism,action);
 const compiled=buildRegionalPrompt(s,[],[actor],{posePlannerVersion:'3.0'}),p:any=compiled.poseControl;assert.equal(p?.posePlanVersion,'3.0',action);assert.equal(p.scenePlan.people[0].templateId,id);assert.equal(p.safety.valid,true,action+JSON.stringify(p.safety));
 const r=p.scenePlan.relations[0],audit=r.actionRelationAudit;assert.equal(audit.status,'planned');assert.equal(audit.mechanism,mechanism);assert.deepEqual(mechanismGeometryFailures(audit.geometry),[]);
 assert.match(buildGenerationPrompt(s,[],[actor]).prompt,/door|drawer|button|knob|pen|scissors|keyboard|package/);
 assert.ok(compiled.repairPasses.propInteractions[0].actionPlan);const executed=compilePoseExecutionV3(p,compiled.repairPasses)!;
 const pass:any=executed.repairPasses.propInteractions[0];assert.equal(pass.actionRelationAudit.mechanism,mechanism);assert.ok(actionOutlineMarkup(pass.actionRelationAudit.geometry,512,512).includes('<path'));
 if(mechanism==='force')assert.equal(p.scenePlan.people[0].forceSupport.footContacts.length,2);
 }
});
test('phase changes preserve hinge pivot and update slide/button/knob geometry, contacts and saved state',()=>{
 for(const [action] of examples.slice(0,5)){
 const compiled=buildRegionalPrompt(shot(action),[],[actor],{posePlannerVersion:'3.0'}),base:any=compiled.poseControl;
 const stages=['anticipation','contact','follow_through'].map(phase=>applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',phase:phase as any}));
 for(const p of stages)assert.equal(p.safety.valid,true,action+JSON.stringify(p.safety));
 const geometries=stages.map(p=>p.scenePlan.people[0].actionRelationAudit!.geometry!);
 assert.notDeepEqual(geometries[0].outline,geometries[2].outline,action);
 if(geometries[0].mechanism==='hinge')assert.deepEqual(geometries[0].pivot,geometries[2].pivot);
 for(const p of stages){const a=p.scenePlan.people[0].actionRelationAudit!;const r=p.scenePlan.relations[0];assert.equal(r.actionPlan!.phase,a.phase);assert.equal(r.stateAfter,a.stateAfter);const ex=compilePoseExecutionV3(p,compiled.repairPasses)!;assert.equal(ex.repairPasses.propInteractions[0].actionPlan!.phase,a.phase);}
 }
});
test('manual action, tip and object edits update the shared contract or fail explicitly rather than keeping stale controls',()=>{
 const compiled=buildRegionalPrompt(shot('opening a door'),[],[actor],{posePlannerVersion:'3.0'}),base:any=compiled.poseControl;
 const close=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'close',phase:'follow_through'});assert.equal(close.safety.valid,true,JSON.stringify(close.safety));assert.equal(close.scenePlan.relations[0].stateAfter,'closed');
 const recipe:any={poseControl:close,generationSpec:{repairPasses:compiled.repairPasses},automaticVisualGate:{requiredPropInteractions:compiled.repairPasses.propInteractions}};preparePoseExecutionV3(recipe);const terms=recipe.generationSpec.repairPasses.propInteractions[0].positive;assert.ok(terms.some((s:string)=>/^closing/.test(s)));assert.ok(!terms.includes('opening'));
 assert.deepEqual(recipe.automaticVisualGate.requiredPropInteractions[0],recipe.generationSpec.repairPasses.propInteractions[0]);const first=JSON.stringify(recipe.poseExecution);preparePoseExecutionV3(recipe);assert.equal(JSON.stringify(recipe.poseExecution),first);
 const old=base.scenePlan.people[0].actionRelationAudit.geometry.objectCenter;const target={x:old.x+.015,y:old.y+.015};const moved=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',actionGeometry:{objectCenter:target}});assert.ok(Math.hypot(moved.scenePlan.relations[0].objectCenter.x-target.x,moved.scenePlan.relations[0].objectCenter.y-target.y)<1e-8);assert.equal(moved.safety.valid,true,JSON.stringify(moved.safety));
 const pen:any=buildRegionalPrompt(shot('writing with a pen'),[],[actor],{posePlannerVersion:'3.0'}).poseControl;const bad=applyPoseControlOverrideV3(pen,{schemaVersion:'pose-override-v1',actionGeometry:{toolEnd:{x:.7,y:.7}}});assert.equal(bad.safety.valid,false);assert.match(bad.safety.errors.join(' '),/工具/);
});
test('tool tips, work surfaces and object outlines project once across regions and framing',()=>{
 for(const region of [{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}])for(const camera of ['wide shot','medium shot']){
 const compiled=buildRegionalPrompt(shot('cutting paper with scissors',region,camera),[],[actor],{posePlannerVersion:'3.0'}),p:any=compiled.poseControl;assert.ok(p,'missing pose');assert.equal(p.safety.valid,true,JSON.stringify(p.safety));
 const projection=p.scenePlan.projection,source=p.scenePlan.people[0].actionRelationAudit.geometry;const ex=compilePoseExecutionV3(p,compiled.repairPasses)!;const g=ex.repairPasses.propInteractions[0].actionRelationAudit!.geometry!;
 const point=(q:any)=>({x:(q.x-.5)*projection.scale+.5+projection.translate.x,y:(q.y-.5)*projection.scale+.5+projection.translate.y});
 assert.deepEqual(g.toolEnd,point(source.toolEnd));assert.deepEqual(g.workPoint,point(source.workPoint));assert.deepEqual(g.outline![0].points,source.outline[0].points.map(point));
 }
});
test('support roles come from each actor and support chains stay aligned under role swaps and mirrors',()=>{
 const s:any=shot('supporting the other person');s.characterIds=['a','b'];s.visualSpec.characters=[{characterId:'a',action:'supporting the other person',expression:'neutral'},{characterId:'b',action:'being supported by the other person',expression:'neutral'}];
 const base=buildPoseControlV3(s)!;assert.equal(base.scenePlan.people[0].templateId,'support_walk');assert.equal(base.safety.valid,true,JSON.stringify(base.safety));
 for(const mirror of [false,true])for(const swapRoles of [false,true]){
 const p=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',mirror,swapRoles});assert.equal(p.safety.valid,true,JSON.stringify(p.safety));const people=p.scenePlan.people;
 assert.deepEqual(people.map(q=>q.pairRole),swapRoles?['supported','active']:['active','supported']);
 for(const [i,q] of people.entries()){assert.equal(q.loadSupport?.partnerId,people[1-i].characterId);for(const foot of q.loadSupport!.footContacts)assert.deepEqual(p.fullPeople[i][foot.joint],foot.point);assert.ok(synchronizeBasicPosePromptV3(q.sourceText,q).includes(q.pairRole==='active'?'supporting':'supported'));}
 const ex=compilePoseExecutionV3(p)!;assert.ok(ex.scenePlan.people.every((q:any)=>q.loadSupport));
 }
});
test('ambiguous mechanisms and tampered execution snapshots remain hard failures',()=>{
 const unknown:any=buildRegionalPrompt(shot('opening a package'),[],[actor],{posePlannerVersion:'3.0'}).poseControl;assert.equal(unknown.safety.valid,false);assert.match(unknown.safety.errors.join(' '),/待定/);
 const c=buildRegionalPrompt(shot('opening a door'),[],[actor],{posePlannerVersion:'3.0'}),bad:any=structuredClone(c.poseControl);bad.scenePlan.people[0].actionRelationAudit.geometry.outline[0].points[0].x+=.1;assert.throws(()=>compilePoseExecutionV3(bad,c.repairPasses),/快照/);
 const simple=deriveInteractionContract(shot('holding a smartphone with one hand'),'actor');assert.equal(simple.actionPlan,undefined);assert.equal(simple.handMode,'one');
});

test('support anticipation does not claim transferred load, and local contact prompts preserve control mechanics',async()=>{
 const s:any=shot('supporting the other person');s.characterIds=['a','b'];s.visualSpec.characters=[{characterId:'a',action:'supporting the other person',expression:'neutral'},{characterId:'b',action:'being supported by the other person',expression:'neutral'}];
 const p=applyPoseControlOverrideV3(buildPoseControlV3(s)!,{schemaVersion:'pose-override-v1',phase:'anticipation'});assert.equal(p.safety.valid,true,JSON.stringify(p.safety));
 for(const q of p.scenePlan.people){assert.equal(q.loadSupport!.loadShare,1);assert.equal(q.loadSupport!.contactState,'approach');assert.equal(q.loadSupport!.footContacts.length,2);assert.match(synchronizeBasicPosePromptV3(q.sourceText,q),/each person still bears their own weight/);}
 const {actionContactTerms}=await import('../scripts/action-stage-policy.mjs');
 for(const [action,word] of [['pressing a button','fingertip'],['turning a knob','pivot'],['writing with a pen','working end']]){const c:any=buildRegionalPrompt(shot(action),[],[actor],{posePlannerVersion:'3.0'});const terms=actionContactTerms(c.repairPasses.propInteractions[0]).join(' ');assert.ok(terms.includes(word),terms);assert.ok(!terms.includes('wraps around'));}
});

test('common tools and floor force use the same reachable contract across mirrors',()=>{
 for(const tool of ['pen','pencil','brush','knife','scissors','keyboard','hammer','wrench','screwdriver','pliers']){
 const c:any=buildRegionalPrompt(shot('using a '+tool+' on the work surface'),[],[actor]);const p=c.poseControl;assert.equal(p?.posePlanVersion,'3.0',tool);assert.equal(p.safety.valid,true,tool+JSON.stringify(p.safety));const ex=compilePoseExecutionV3(p,c.repairPasses);const g=ex.repairPasses.propInteractions[0].actionRelationAudit!.geometry!;assert.equal(g.controlShape,tool);assert.ok(g.outline!.length);assert.deepEqual(g.workPoint,g.toolEnd);
 }
 for(const action of ['pushing a box across the floor','pulling a box along the ground'])for(const mirror of [false,true]){
 const c:any=buildRegionalPrompt(shot(action),[],[actor]);const p=applyPoseControlOverrideV3(c.poseControl,{schemaVersion:'pose-override-v1',mirror});assert.equal(p.safety.valid,true,action+JSON.stringify({safety:p.safety,mirror,shoulder:p.fullPeople[0][2],geometry:p.scenePlan.people[0].actionGeometryInput}));assert.equal(p.scenePlan.people[0].forceSupport!.footContacts.length,2);assert.equal(p.scenePlan.people[0].actionRelationAudit!.geometry!.supportY,.9);
 }
});

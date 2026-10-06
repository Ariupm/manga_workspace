import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPoseControlV3, applyPoseControlOverrideV3 } from '../lib/pose-v3';
import { parsePoseControlOverride } from '../lib/pose-v2';
import { movePoseProps } from '../lib/pose-v3/prop-edit';
import { fullPoseLayout, undoFullPoseLayout, relationPreviewPoints } from '../lib/pose-v3/preview-layout';
import { compilePoseExecutionV3, preparePoseExecutionV3 } from '../scripts/pose-execution-v3.mjs';
import { propInteractionGeometry } from '../scripts/prop-interaction-geometry.mjs';

const shot=(ids=['actor'],camera='wide shot'):any=>({id:9904,pageId:1,order:1,description:'standing holding an object',actionEn:'standing holding an object',camera,cameraEn:camera,characterIds:ids});
const relation=(characterId='actor',instance='parcel',hand='right'):any=>({relationId:`${characterId}:${instance}`,objectInstanceId:instance,characterId,required:true,object:'parcel',purpose:'hold',handMode:'one',activeHand:hand,objectCenter:{x:.5,y:.55},region:{xStart:0,xEnd:1},contactAnchors:[{hand,x:.5,y:.55}],gazeTarget:{kind:'object',targetId:instance,point:{x:.5,y:.55},source:'test'},shape:'landscape_rect'});
const near=(a:any,b:any)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-9,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);

test('manual prop position survives projection, worker geometry and repeat replay without moving bones',()=>{
 for(const camera of ['close-up','medium shot','wide shot'])for(const hand of ['left','right']){
  const r=relation('actor','arbitrary-container',hand),base=buildPoseControlV3(shot(['actor'],camera),[r])!;
  const before=JSON.stringify(base),center={x:.46,y:.49};
  const moved=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',propPositions:[{objectInstanceId:r.objectInstanceId,center}]});
  near(moved.scenePlan.relations[0].objectCenter,center);
  assert.deepEqual(moved.fullPeople,base.fullPeople);
  assert.equal(moved.scenePlan.projection!.scale,base.scenePlan.projection!.scale);
  assert.deepEqual(moved.scenePlan.projection!.translate,base.scenePlan.projection!.translate);
  assert.equal(JSON.stringify(base),before);
  const replay=applyPoseControlOverrideV3(base,JSON.parse(JSON.stringify(moved.override)));
  assert.deepEqual(replay.scenePlan.relations,moved.scenePlan.relations);
  assert.equal(replay.audit.templateHash,moved.audit.templateHash);
  const execution=compilePoseExecutionV3(moved,{propInteractions:[r]},{advisory:true})!;
  const p=moved.scenePlan.projection!,project=(q:any)=>({x:(q.x-.5)*p.scale+.5+p.translate.x,y:(q.y-.5)*p.scale+.5+p.translate.y});
  const contract=execution.repairPasses.propInteractions[0];
  near(contract.objectCenter,project(center));near(contract.contactAnchors[0],project(center));
  const geometry=propInteractionGeometry(contract,moved.people,0,512,512,execution.scenePlan.people);
  near(geometry.center,contract.objectCenter);near(geometry.contacts[0],contract.contactAnchors[0]);
  assert.equal(geometry.contacts[0].source,'authored_action_contact');
  const recipe:any={poseControl:moved,posePreflightPolicy:'advisory',generationSpec:{repairPasses:{propInteractions:[r]}}};
  preparePoseExecutionV3(recipe);const once=JSON.stringify(recipe.poseExecution);preparePoseExecutionV3(recipe);assert.equal(JSON.stringify(recipe.poseExecution),once);
 }
});

test('shared physical instance moves all owners but another same-named prop stays independent',()=>{
 const relations=[relation('a','shared'),relation('b','shared','left'),relation('b','other')];
 const base=buildPoseControlV3(shot(['a','b']),relations)!;
 const before=structuredClone(base.scenePlan);
 const moved=movePoseProps(base.scenePlan,[{objectInstanceId:'shared',center:{x:.57,y:.48}}]);
 for(const r of moved.relations){
  if(r.objectInstanceId==='shared'){near(r.objectCenter,{x:.57,y:.48});near(r.contactAnchors![0],{x:.57,y:.48});}
  else assert.deepEqual(r,before.relations.find(p=>p.relationId===r.relationId));
 }
 for(const person of moved.people){const r=person.relationTargets.find(r=>r.objectInstanceId==='shared')!;near(r.target,{x:.57,y:.48});}
 assert.deepEqual(base.scenePlan,before);
});

test('tool movement preserves external work surface; surface movement updates the bound work point and gaze',()=>{
 const base=buildPoseControlV3(shot(),[relation('actor','tool'),relation('actor','panel','left')])!;
 const tool=base.scenePlan.relations[0],panel=base.scenePlan.relations[1];
 const g:any={modelVersion:'action-mechanism-1',objectCenter:{...tool.objectCenter},baseCenter:{...tool.objectCenter},toolEnd:{x:.55,y:.6},workPoint:{x:.55,y:.6},workTargetId:'panel',supportY:.7,mouthContact:{x:.5,y:.2},axis:{x:1,y:0},outline:[{role:'tool',closed:false,points:[{...tool.objectCenter},{x:.55,y:.6}]}]};
 tool.actionPlan={actionId:'tool',geometry:g} as any;
 tool.actionRelationAudit={version:'action-relations-1',phase:'contact',status:'planned',contactState:'contact',mechanism:'work',errors:[],stateBefore:null,stateAfter:null,handTargets:[{hand:'right',...tool.objectCenter}],geometry:g};
 // Intentionally retain shared references as real planners do.
 const target=base.scenePlan.people[0].relationTargets[0];target.actionPlan=tool.actionPlan;target.actionRelationAudit=tool.actionRelationAudit;
 base.scenePlan.people[0].actionRelationAudit=tool.actionRelationAudit;base.scenePlan.people[0].actionGeometryInput=g;
 tool.gazeTarget={kind:'object',targetId:'panel',source:'structured.external_object',point:{...panel.objectCenter}};
 const toolOnly=movePoseProps(base.scenePlan,[{objectInstanceId:'tool',center:{x:.6,y:.55}}]);
 near(toolOnly.relations[0].actionPlan!.geometry.toolEnd!,{x:.65,y:.6});
 near(toolOnly.people[0].actionRelationAudit!.geometry!.toolEnd!,{x:.65,y:.6});
 near(toolOnly.relations[0].actionPlan!.geometry.workPoint!,g.workPoint);
 assert.equal(toolOnly.relations[0].actionPlan!.geometry.supportY,g.supportY);
 assert.deepEqual(toolOnly.relations[0].actionPlan!.geometry.axis,g.axis);
 const surfaceOnly=movePoseProps(base.scenePlan,[{objectInstanceId:'panel',center:{x:.5,y:.65}}]);
 near(surfaceOnly.relations[0].actionPlan!.geometry.workPoint!,{x:.55,y:.7});
 near(surfaceOnly.relations[0].actionPlan!.geometry.toolEnd!,g.toolEnd);
 near(surfaceOnly.relations[0].gazeTarget!.point!,{x:.5,y:.65});
 near(g.toolEnd,{x:.55,y:.6});
});

test('preview inverse mapping, joint edits and selected-template overrides preserve absolute prop coordinates',()=>{
 const r=relation(),base=buildPoseControlV3(shot(),[r])!;
 const selected=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'sit'});
 const layout=fullPoseLayout(selected.fullPeople,selected.scenePlan.projection,relationPreviewPoints(selected.scenePlan.relations));
 const p=layout.people.map(person=>person.map(q=>({...q})));p[0][3].x+=.015;
 const people=undoFullPoseLayout(p,layout),center={x:.43,y:.56};
 const raw:any={schemaVersion:'pose-override-v1',templateId:'sit',people,editMode:'joint_edit',coordinateSpace:'full_pose',propPositions:[{objectInstanceId:'parcel',center}]};
 const edited=applyPoseControlOverrideV3(base,raw);
 assert.deepEqual(edited.fullPeople,people);near(edited.scenePlan.relations[0].objectCenter,center);
 assert.deepEqual(edited.scenePlan.projection!.translate,selected.scenePlan.projection!.translate);
 const reopened=applyPoseControlOverrideV3(base,edited.override);assert.deepEqual(reopened.scenePlan.relations,edited.scenePlan.relations);
 assert.deepEqual(applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',templateId:'sit'}).scenePlan.relations,selected.scenePlan.relations);
});

test('invalid/stale instance edits fail explicitly, and historical controls retain the old behavior',()=>{
 const base=buildPoseControlV3(shot(),[relation()])!;
 for(const propPositions of [null,{},[{objectInstanceId:'parcel',center:{x:NaN,y:.5}}],[{objectInstanceId:'',center:{x:.5,y:.5}}],[{objectInstanceId:'parcel',center:{x:.5,y:.5}},{objectInstanceId:'parcel',center:{x:.6,y:.6}}]]){
  assert.throws(()=>parsePoseControlOverride({schemaVersion:'pose-override-v1',propPositions}),/道具位置/);
 }
 assert.throws(()=>applyPoseControlOverrideV3(base,{propPositions:[{objectInstanceId:'missing',center:{x:.5,y:.5}}]}),/重新打开/);
 const legacy=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',conditioning:{weight:.3}});
 assert.deepEqual(legacy.scenePlan.relations,base.scenePlan.relations);assert.deepEqual(legacy.fullPeople,base.fullPeople);
 const outside=applyPoseControlOverrideV3(base,{propPositions:[{objectInstanceId:'parcel',center:{x:2,y:2}}]});
 const execution=compilePoseExecutionV3(outside,{propInteractions:[relation()]},{advisory:true})!;
 assert.ok(execution.warnings.some((w:string)=>/outside canvas|out of frame|beyond arm reach/.test(w)));
 near(outside.scenePlan.relations[0].objectCenter,{x:2,y:2});
});

test('pick/place stage geometry, quantity and controlled request remain consistent after an object edit',()=>{
 for(const actionId of ['pick','place'])for(const phase of ['anticipation','contact','follow_through']){
  const r={...relation(),purpose:actionId,expectedCount:2};
  const base=buildPoseControlV3({...shot(),actionEn:`${actionId==='pick'?'picking up':'placing'} a package on a table`},[r])!;
  const params:any={schemaVersion:'pose-override-v1',templateId:actionId,phase,actionGeometry:{supportY:.65}};
  const selected=applyPoseControlOverrideV3(base,params);
  const old=selected.scenePlan.relations[0],center={x:old.objectCenter.x-.03,y:old.objectCenter.y-.02};
  const moved=applyPoseControlOverrideV3(base,{...params,propPositions:[{objectInstanceId:old.objectInstanceId,center}]});
  const next=moved.scenePlan.relations[0];
  near(next.objectCenter,center);near(next.actionRelationAudit!.geometry!.objectCenter!,center);
  assert.equal(next.expectedCount,2);assert.equal(next.actionRelationAudit!.phase,phase);
  assert.equal(next.actionRelationAudit!.contactState,old.actionRelationAudit!.contactState);
  assert.equal(next.actionRelationAudit!.geometry!.supportY,old.actionRelationAudit!.geometry!.supportY);
  assert.deepEqual(moved.controlProfile,selected.controlProfile);
  const replay=applyPoseControlOverrideV3(base,moved.override);assert.deepEqual(replay.scenePlan.relations,moved.scenePlan.relations);
  const execution=compilePoseExecutionV3(moved,{propInteractions:[r]},{advisory:true})!;
  near(execution.repairPasses.propInteractions[0].objectCenter,execution.repairPasses.propInteractions[0].actionRelationAudit!.geometry!.objectCenter!);
 }
});

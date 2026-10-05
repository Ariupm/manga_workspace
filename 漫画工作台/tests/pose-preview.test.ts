import assert from 'node:assert/strict';
import test from 'node:test';
import {fullPoseLayout,undoFullPoseLayout,fullPosePreviewSvg} from '../lib/pose-v3/preview-layout';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
const shot:any={id:9991,pageId:1,order:1,description:'standing holding an object',actionEn:'standing holding an object',camera:'medium shot',cameraEn:'medium shot',characterIds:['actor']};
test('full preview fits all source joints and inverse-projected viewport without altering control',()=>{
 const pose=buildPoseControlV3(shot)!;const before=JSON.stringify(pose),full=structuredClone(pose.fullPeople);full[0][10]={x:-.3,y:1.4};
 const layout=fullPoseLayout(full,pose.scenePlan.projection);assert.ok(layout.people.flat().every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1));
 const restored=undoFullPoseLayout(layout.people,layout);restored.flat().forEach((p,i)=>{assert.ok(Math.abs(p.x-full.flat()[i].x)<1e-10);assert.ok(Math.abs(p.y-full.flat()[i].y)<1e-10);});
 assert.match(fullPosePreviewSvg(full,pose.scenePlan.projection,512,512),/stroke-dasharray/);assert.equal(JSON.stringify(pose),before);
});
test('editing an out-of-frame ankle in full space preserves the shot projection and round trips',()=>{
 const base=buildPoseControlV3(shot)!;const raw:any={schemaVersion:'pose-override-v1',templateId:'sit',confirmPoseContract:true};const chosen=applyPoseControlOverrideV3(base,raw);
 const full=structuredClone(chosen.fullPeople);full[0][10].x=-.05;
 const edited=applyPoseControlOverrideV3(base,{...raw,people:full,editMode:'joint_edit',coordinateSpace:'full_pose',projectionIntent:'lock_current'});
 assert.deepEqual(edited.fullPeople,full);assert.equal(edited.scenePlan.projection!.scale,chosen.scenePlan.projection!.scale);assert.deepEqual(edited.scenePlan.projection!.translate,chosen.scenePlan.projection!.translate);
 assert.equal(edited.override!.coordinateSpace,'full_pose');const replay=applyPoseControlOverrideV3(base,edited.override);assert.deepEqual(replay.fullPeople,full);assert.equal(replay.svg,edited.svg);
});

import sharp from 'sharp';
import {renderControlOpenPoseV3} from '../lib/pose-v3/render';
test('control raster retains in-frame shin and clips at viewport when ankle is outside',async()=>{
 const p=Array.from({length:18},()=>({x:.5,y:.2}));p[9]={x:.4,y:.7};p[10]={x:.4,y:1.3};
 const v=p.map(()=> 'visible' as const) as Array<'visible'|'out_of_frame'|'occluded'>;v[10]='out_of_frame';
 const svg=renderControlOpenPoseV3([p],[v],200,200);
 const {data,info}=await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const pixel=(x:number,y:number)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 assert.notDeepEqual(pixel(80,195),[0,0,0]);assert.deepEqual(pixel(90,195),[0,0,0]);
 // An occluded endpoint remains a semantic suppression, unlike a geometric crop.
 v[10]='occluded';const suppressed=renderControlOpenPoseV3([p],[v],200,200);assert.ok(!suppressed.includes('y2="260"'));
});
test('a segment crossing the viewport remains drawn even with both endpoints outside',()=>{
 const p=Array.from({length:18},()=>({x:.5,y:.2}));p[3]={x:-.2,y:.6};p[4]={x:1.2,y:.6};
 const v=p.map(()=> 'visible' as const) as Array<'visible'|'out_of_frame'>;v[3]=v[4]='out_of_frame';
 assert.match(renderControlOpenPoseV3([p],[v],200,200),/x1="-40" y1="120" x2="240" y2="120"/);
});

test('relation preview shows target and outline without changing control or inverse editing',()=>{
 const pose=buildPoseControlV3(shot)!;
 const r:any={objectCenter:{x:1.1,y:.4},contactAnchors:[{hand:'right',x:1,y:.4}],actionRelationAudit:{handTargets:[{hand:'right',x:.96,y:.4}],geometry:{outline:[{points:[{x:.95,y:.35},{x:1.15,y:.35},{x:1.15,y:.45},{x:.95,y:.45},{x:.95,y:.35}]}]}}};
 const before=pose.svg;
 const svg=fullPosePreviewSvg(pose.fullPeople,pose.scenePlan.projection,512,512,[r]);
 assert.match(svg,/data-preview-relation/);assert.match(svg,/<polyline/);assert.match(svg,/stroke-dasharray="3 3"/);
 assert.equal(pose.svg,before);assert.doesNotMatch(pose.svg,/data-preview-relation/);
 const extras=[r.objectCenter,...r.contactAnchors,...r.actionRelationAudit.geometry.outline.flatMap((o:any)=>o.points)];
 const layout=fullPoseLayout(pose.fullPeople,pose.scenePlan.projection,extras);
 undoFullPoseLayout(layout.people,layout).flat().forEach((p,i)=>assert.ok(Math.hypot(p.x-pose.fullPeople.flat()[i].x,p.y-pose.fullPeople.flat()[i].y)<1e-10));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPoseControlV3,applyPoseControlOverrideV3} from '../lib/pose-v3';
import {compilePoseExecutionV3} from '../scripts/pose-execution-v3.mjs';

function fixture(action:string,hand:'left'|'right',region:{xStart:number;xEnd:number},camera:string){
 const x=(region.xStart+region.xEnd)/2;
 const shot:any={id:9870,pageId:1,order:1,description:action,actionEn:action,camera,cameraEn:camera,characterIds:['actor'],visualSpecConfirmed:true,visualSpec:{camera:{shotSize:camera},characters:[{characterId:'actor',action,region,expression:'neutral'}]}};
 const relation:any={relationId:'mouth-prop',characterId:'actor',required:true,object:action.startsWith('drinking')?'cup':'spoon',purpose:'drink',handMode:'one',activeHand:hand,objectCenter:{x,y:.23},region,contactAnchors:[{hand,x,y:.23}],positive:[]};
 return {shot,relation};
}

test('mouth actions require an explicit valid object-mouth endpoint and project it with the actor',()=>{
 for(const action of ['drinking from a cup','eating with a spoon'])for(const hand of ['left','right'] as const)for(const region of [{xStart:0,xEnd:1},{xStart:.05,xEnd:.45},{xStart:.55,xEnd:.95}])for(const camera of ['medium shot','wide shot']){
  const {shot,relation}=fixture(action,hand,region,camera);
  const base=buildPoseControlV3(shot,[relation])!;
  assert.ok(base);assert.equal(base.scenePlan.people[0].actionRelationAudit?.status,'pending');
  assert.throws(()=>compilePoseExecutionV3(base,{propInteractions:[relation]}),/口部|mouth/);
  const nose=base.fullPeople[0][0];
  const mouth={x:nose.x,y:nose.y+.035};
  const valid=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',actionGeometry:{mouthContact:mouth}});
  assert.equal(valid.scenePlan.people[0].actionRelationAudit?.status,'planned',JSON.stringify(valid.safety));
  const ex=compilePoseExecutionV3(valid,{propInteractions:[relation]})!;
  const projection=valid.scenePlan.projection!;
  const expected={x:(mouth.x-.5)*projection.scale+.5+projection.translate.x,y:(mouth.y-.5)*projection.scale+.5+projection.translate.y};
  assert.deepEqual(ex.repairPasses.propInteractions[0].actionRelationAudit?.geometry?.mouthContact,expected);
  const far=applyPoseControlOverrideV3(base,{schemaVersion:'pose-override-v1',actionGeometry:{mouthContact:{x:mouth.x,y:mouth.y+.3}}});
  assert.equal(far.scenePlan.people[0].actionRelationAudit?.status,'pending');
  assert.throws(()=>compilePoseExecutionV3(far,{propInteractions:[relation]}),/口部|mouth/);
 }
});

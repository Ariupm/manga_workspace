import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {supportControlPlan} from './support-control.mjs';
import {selectControlUnitsForProfile} from './sd-worker-logic.mjs';
const surface=(kind,y)=>({supportKind:kind,supportSurfaceId:kind,visibleEdge:{xStart:.1,xEnd:.9,y},pelvisAnchor:{x:.5,y}});
test('画外地面没有黑图控制，也不会挤掉身份；画内支持面仍有有效像素',async()=>{
  for(const kind of ['floor','sofa','chair','bed'])for(const [width,height] of [[384,512],[512,512],[640,384]]){
    const outside=supportControlPlan([surface(kind,1.5)],width,height);
    assert.equal(outside.svg,null);assert.equal(outside.skipped[0].reason,'outside_projected_viewport');
    const plan=supportControlPlan([surface(kind,.6)],width,height);
    assert.equal(plan.visible.length,1);
    assert.equal((await sharp(Buffer.from(plan.svg)).stats()).channels[0].max,255);
  }
  const plan=supportControlPlan([surface('floor',1.4)]);
  const units=[{stage:'identity_reference'},{stage:'pose'},{stage:'initial_prop_structure'},...(plan.svg?[{stage:'support_surface_geometry'}]:[])];
  assert.equal(selectControlUnitsForProfile(units,'cpu_local_complex').some(u=>u.stage==='identity_reference'),true);
});
test('双人支持面按各自实际可见几何选择，边缘仍可见时不遗漏',()=>{
  const off=surface('floor',1.5),on=surface('chair',.6);
  for(const supports of [[off,on],[on,off]])assert.deepEqual(supportControlPlan(supports).visible,[on]);
  assert.equal(supportControlPlan([surface('bed',1.02)]).visible.length,1);
  assert.equal(supportControlPlan([surface('unknown',.5)]).svg,null);
});
test('靠背在上身裁切中可见时保留支持控制，不复制人物骨链',()=>{
 const s={...surface('chair',1.2),backEdge:{x:.2,yStart:.3,yEnd:1.2}};
 const p=supportControlPlan([s]);assert.equal(p.visible.length,1);assert.match(p.svg,/M 102.4 153.6 L 102.4 614.4/);assert.ok(!p.svg.includes('circle'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {contactMask,assertContactMasks} from './contact-mask.mjs';
const anchor={hand:'right',x:.4551877724,y:.7600127009};
test('surface/edge contacts survive large and small prop cores in both hand stages',async()=>{
 for(const radius of [16.56,30])for(const hand of ['left','right'])for(const width of [40,267]){
  const a={...anchor,hand};const result=await contactMask({width:512,height:512,anchor:a,elbow:{x:.3,y:.5},contacts:[a],objectBounds:{x:120,y:289,width,height:200},radius,stroke:23});
  assertContactMasks([result]);assert.equal(result.contactPixel,255);assert.ok(result.activePixels>0);
  const pixels=await sharp(Buffer.from(result.mask,'base64')).removeAlpha().greyscale().raw().toBuffer();
  assert.equal(pixels[320*512+140],0,'unrelated core protected');
 }
});
test('peer object and opposite hand win; empty/out-of-frame masks cannot count as success',async()=>{
 const input={width:512,height:512,anchor,elbow:anchor,contacts:[anchor,{hand:'left',x:.6,y:.76}],objectBounds:{x:120,y:289,width:267,height:200},radius:30,stroke:23};
 const result=await contactMask(input);assertContactMasks([result]);
 const pixels=await sharp(Buffer.from(result.mask,'base64')).removeAlpha().greyscale().raw().toBuffer();assert.equal(pixels[Math.round(.76*512)*512+Math.round(.6*512)],0);
 const blocked=await contactMask({...input,peerMarkup:'<rect width="512" height="512" fill="black"/>'});assert.equal(blocked.activePixels,0);assert.throws(()=>assertContactMasks([blocked]));
 const outside=await contactMask({...input,anchor:{...anchor,x:2,y:2},elbow:{x:2,y:2}});assert.throws(()=>assertContactMasks([outside]));assert.throws(()=>assertContactMasks([]));
});

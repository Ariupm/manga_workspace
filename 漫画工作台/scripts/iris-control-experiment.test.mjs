import test from 'node:test';
import assert from 'node:assert/strict';
import {planIrisControl,irisMaskSvg} from './iris-control-experiment.mjs';
function face(cx=.5,cy=.25){
 const f=Array.from({length:478},(_,i)=>[cx+Math.cos(i)*.1,cy+Math.sin(i)*.12,0]);
 for(const [a,b,upper1,upper2,lower1,lower2,iris,ex] of [[33,133,160,158,144,153,468,cx-.045],[362,263,385,387,380,373,473,cx+.045]]){
  f[a]=[ex-.025,cy,0];f[b]=[ex+.025,cy,0];f[upper1]=[ex-.01,cy-.012,0];f[upper2]=[ex+.01,cy-.012,0];f[lower1]=[ex-.01,cy+.012,0];f[lower2]=[ex+.01,cy+.012,0];f[iris]=[ex,cy,0];
 }
 return f;
}
const args={region:{xStart:0,xEnd:1},width:512,height:512};
test('eight gaze directions use eye geometry for arbitrary faces and rectangular images',()=>{
 for(const [width,height] of [[512,512],[768,1024],[1024,768]])for(const [cx,cy] of [[.25,.25],[.7,.6]]){
  const neutral=planIrisControl({...args,width,height,faces:[face(cx,cy)],direction:'neutral'});
  for(const direction of ['up','down','left','right','up-left','up-right','down-left','down-right']){
   const p=planIrisControl({...args,width,height,faces:[face(cx,cy)],direction});assert.equal(p.status,'prepared');
   p.eyes.forEach((e,i)=>{const n=neutral.eyes[i].target;assert.equal(Math.sign(e.target.x-n.x),direction.includes('left')?-1:direction.includes('right')?1:0);assert.equal(Math.sign(e.target.y-n.y),direction.includes('up')?-1:direction.includes('down')?1:0);});
  }
 }
});
test('actor regions isolate two faces; ambiguous, crossing, missing, tiny and invalid faces skip',()=>{
 const faces=[face(.25),face(.75)],copy=JSON.stringify(faces);
 for(const region of [{xStart:0,xEnd:.5},{xStart:.5,xEnd:1}]){const p=planIrisControl({...args,faces,region,direction:'right'});assert.equal(p.status,'prepared');assert.ok(p.eyes.every(e=>e.normalizedTarget.x>region.xStart&&e.normalizedTarget.x<region.xEnd));assert.match(irisMaskSvg(p,512,512),/clip-path/);}
 assert.equal(JSON.stringify(faces),copy);
 assert.equal(planIrisControl({...args,faces,direction:'down'}).reason,'ambiguous_actor');
 assert.equal(planIrisControl({...args,faces:[face(.48)],region:{xStart:0,xEnd:.5},direction:'down'}).status,'skipped');
 assert.equal(planIrisControl({...args,faces:[],direction:'down'}).reason,'face_not_localized');
 assert.equal(planIrisControl({...args,width:64,height:64,faces:[face()],direction:'down'}).reason,'eyes_too_small');
 const bad=face();bad[468]=[NaN,.2,0];assert.equal(planIrisControl({...args,faces:[bad],direction:'down'}).status,'skipped');
});
test('closed eyes, camera gaze and unknown targets do not get a universal downward rule',()=>{
 for(const patch of [{eyes:'closed'},{eyes:'occluded'},{gazeKind:'camera'},{gazeKind:'unknown'},{direction:'invalid'}])assert.equal(planIrisControl({...args,faces:[face()],direction:'down',...patch}).status,'skipped');
 const f=face();for(const i of [160,158,144,153])f[i][1]=.25;assert.equal(planIrisControl({...args,faces:[f],direction:'down'}).reason,'eye_occluded_or_unreliable');
});
test('tilted faces use their own eye axes',()=>{
 const angle=Math.PI/7,c=Math.cos(angle),s=Math.sin(angle);
 const tilted=face(.5,.5).map(([x,y,z])=>[.5+(x-.5)*c-(y-.5)*s,.5+(x-.5)*s+(y-.5)*c,z]);
 const neutral=planIrisControl({...args,faces:[tilted],direction:'neutral'});
 const down=planIrisControl({...args,faces:[tilted],direction:'down'});
 assert.equal(down.status,'prepared');
 for(let i=0;i<2;i++){
  const delta={x:down.eyes[i].target.x-neutral.eyes[i].target.x,y:down.eyes[i].target.y-neutral.eyes[i].target.y};
  assert.ok(delta.x<0&&delta.y>0);assert.ok(Math.abs(delta.x*c+delta.y*s)<1e-8);
 }
});

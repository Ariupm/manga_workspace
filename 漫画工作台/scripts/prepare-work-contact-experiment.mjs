// Explicit diagnostic fixture builder; never imported by the production planner.
// Keep wrists/props/head fixed and test projected arm lengths for bound tool work.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const [requestFile, payloadFile, out] = process.argv.slice(2);
if (!requestFile || !payloadFile || !out) throw Error('Usage: request.json saved-payload.json new-output-directory');
const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
const recipe = JSON.parse(fs.readFileSync(payloadFile, 'utf8')).recipe;
const pose = recipe.poseControl;
assert.equal(pose.override, null, 'This experiment does not replace manual pose edits');
const units = request.alwayson_scripts.ControlNet.args.filter(unit => /openpose/i.test(unit.model));
assert.equal(units.length, 1);
const original = await sharp(Buffer.from(pose.svg)).ensureAlpha().raw().toBuffer();
const saved = await sharp(Buffer.from(units[0].image, 'base64')).ensureAlpha().raw().toBuffer();
assert.ok(original.equals(saved), 'Frozen SVG must match the baseline request');
const projection = pose.scenePlan.projection;
assert.ok(projection && pose.fullPeople);
const project = point => ({x:((point.x-.5)*projection.scale+.5+projection.translate.x)*pose.width,y:((point.y-.5)*projection.scale+.5+projection.translate.y)*pose.height});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const changes = [], audit = [];
for (const [personIndex, person] of pose.scenePlan.people.entries()) {
  const points = pose.fullPeople[personIndex];
  const relations = person.relationTargets || [];
  const tools = relations.filter(r => r.actionPlan?.geometry?.mechanism === 'work' && r.actionPlan?.phase === 'contact' && r.actionPlan.geometry.workTargetId);
  const bound = new Set(tools.flatMap(r => [r.relationId,...relations.filter(other => other.objectInstanceId === r.actionPlan.geometry.workTargetId).map(other=>other.relationId)]));
  const pelvis = {x:(points[8].x+points[11].x)/2,y:(points[8].y+points[11].y)/2};
  const length = distance(points[1],pelvis);
  if (length < .01) continue;
  const axis = {x:(pelvis.x-points[1].x)/length,y:(pelvis.y-points[1].y)/length};
  for (const arm of person.overlayAudit?.arms || []) {
    if (!bound.has(arm.relationId) || !arm.reachable || arm.depthAssumption !== 'planar') continue;
    const [s,e,w] = arm.hand === 'left' ? [5,6,7] : [2,3,4];
    const shoulder=points[s], wrist=points[w];
    assert.ok(distance(wrist,arm.target)<1e-6, 'A later edit changed the explicit wrist target');
    const upper=arm.upperBoneLength, fore=arm.foreBoneLength;
    if (!(upper>0 && fore>0)) continue;
    const along=(wrist.x-shoulder.x)*axis.x+(wrist.y-shoulder.y)*axis.y;
    if (along<=0 || distance(shoulder,wrist)>upper+fore) continue;
    const side=Math.sign((shoulder.x-points[1].x)*axis.y-(shoulder.y-points[1].y)*axis.x) || (arm.hand==='left'?1:-1);
    // Hypothesis, not measured depth: prefer a low-abduction elbow and let the
    // remaining physical bone length project into depth. Test before adoption.
    const options=[.82,.72,.92].map(ratio=>({x:shoulder.x+axis.x*upper*ratio+axis.y*side*upper*.06,y:shoulder.y+axis.y*upper*ratio-axis.x*side*upper*.06}));
    const elbow=options.find(p=>distance(shoulder,p)<=upper && distance(p,wrist)>=.025 && distance(p,wrist)<=fore);
    if (!elbow) continue;
    const upperProjected=distance(shoulder,elbow),foreProjected=distance(elbow,wrist);
    changes.push({from:project(points[e]),to:project(elbow),personIndex,joint:e});
    audit.push({personIndex,hand:arm.hand,relationId:arm.relationId,wristUnchanged:wrist,oldElbow:points[e],newElbow:elbow,upperProjected,foreProjected,upperBone:upper,foreBone:fore,upperDepth:Math.sqrt(upper**2-upperProjected**2),foreDepth:Math.sqrt(fore**2-foreProjected**2)});
  }
}
assert.ok(changes.length, 'No eligible automatic tool/support arms');
let changedPrimitives=0;
const svg=pose.svg.replace(/<(circle|line)\b[^>]*\/>/g,(element,kind)=>{
  const attrs=Object.fromEntries([...element.matchAll(/([a-z][a-z0-9_-]*)="([^"]*)"/gi)].map(m=>[m[1],m[2]]));
  let result=element;
  for(const [xKey,yKey] of kind==='circle'?[['cx','cy']]:[['x1','y1'],['x2','y2']]){
    const change=changes.find(c=>Math.abs(c.from.x-Number(attrs[xKey]))<1e-6&&Math.abs(c.from.y-Number(attrs[yKey]))<1e-6);
    if(change)result=result.replace(`${xKey}="${attrs[xKey]}"`,`${xKey}="${change.to.x}"`).replace(`${yKey}="${attrs[yKey]}"`,`${yKey}="${change.to.y}"`);
  }
  if(result!==element)changedPrimitives++;
  return result;
});
assert.equal(changedPrimitives,changes.length*3,'Each elbow must match exactly two edges and one point');
const image=await sharp(Buffer.from(svg)).png().toBuffer();
units[0].image=image.toString('base64');
fs.mkdirSync(out,{recursive:true});
for(const [name,contents] of [['projected-arms-control.png',image],['projected-arms-audit.json',JSON.stringify({audit,changedPrimitives},null,2)],['projected-arms-cases.json',JSON.stringify([{name:'scissors-projected-arms',description:'Only automatic bound tool/support elbows change; fixed wrists, shoulder/head/body/identity/props and scalar settings. Projected-depth hypothesis, not production fix.',request}])]])fs.writeFileSync(path.join(out,name),contents,{flag:'wx'});
console.log(JSON.stringify({out,arms:audit.length,changedPrimitives,audit}));

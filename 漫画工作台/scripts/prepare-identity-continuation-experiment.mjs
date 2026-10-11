// Prepare two explicit img2img experiments from an improved base image.
// Same production prompt/compiler/refinement settings; only mask center differs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {characterIdentityGazePolicy,faceRefinementPassPlan,identityRefinementPrompts} from './sd-worker-logic.mjs';
import {prepareGenerationPromptRequest} from './prompt-compiler.mjs';
const [payloadFile,sourceFile,landmarkFile,out]=process.argv.slice(2);
if(!out)throw Error('Usage: saved-payload.json source.png detected-landmarks.json new-output-directory');
const recipe=JSON.parse(fs.readFileSync(payloadFile,'utf8')).recipe;
const landmarks=JSON.parse(fs.readFileSync(landmarkFile,'utf8'));
assert.equal(landmarks.faces.length,1,'This diagnostic supports one unambiguous face');
const reference=recipe.references.find(r=>r.role==='identity');
const characterIndex=recipe.generationSpec.characterRegions.findIndex(r=>r.characterId===reference.characterId);
const policy=characterIdentityGazePolicy(recipe,reference.characterId);
const plan=faceRefinementPassPlan({phase:'draft',pass:'identity',shotSize:`${recipe.generationSpec.visualSpec?.camera?.shotSize||''} ${recipe.prompt}`,poseNose:recipe.poseControl.people[characterIndex][0],region:reference.region||{xStart:0,xEnd:1},identityReference:reference,gazeText:policy.text});
const width=recipe.width,height=recipe.height;
const source=fs.readFileSync(sourceFile).toString('base64');
const meta=await sharp(Buffer.from(source,'base64')).metadata();
assert.equal(meta.width,width);assert.equal(meta.height,height);
const face=landmarks.faces[0];
const detectedCenter={x:(Math.min(...face.map(p=>p[0]))+Math.max(...face.map(p=>p[0])))/2,y:(Math.min(...face.map(p=>p[1]))+Math.max(...face.map(p=>p[1])))/2};
const rx=Math.max(64,Math.round(width*plan.radiusXRatio*2))/2,ry=Math.max(82,Math.round(height*plan.radiusYRatio*2))/2;
fs.mkdirSync(out,{recursive:true});
const cases=[],audit=[];
for(const [name,center] of [['identity-planned-mask',plan.center],['identity-detected-mask',detectedCenter]]){
 const mask=(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${width*center.x}" cy="${height*center.y}" rx="${rx}" ry="${ry}" fill="white"/></svg>`)).png().toBuffer()).toString('base64');
 const request=prepareGenerationPromptRequest(structuredClone(recipe),{
  ...identityRefinementPrompts(recipe,reference,plan.gazePlan),init_images:[source],mask,width,height,steps:12,cfg_scale:6,seed:610031,
  denoising_strength:plan.denoisingStrength,sampler_name:recipe.sampler,scheduler:recipe.scheduler,batch_size:1,n_iter:1,mask_blur:10,inpainting_fill:1,inpaint_full_res:true,inpaint_full_res_padding:recipe.identityRefinement?.inpaintPadding??48,send_images:true,
  alwayson_scripts:{ControlNet:{args:[{enabled:true,module:reference.module,model:reference.model,weight:policy.offCamera?Math.min(plan.identityControl.weight,.68):plan.identityControl.weight,image:fs.readFileSync(reference.path).toString('base64'),effective_region_mask:mask,resize_mode:'Crop and Resize',low_vram:true,processor_res:512,guidance_start:0,guidance_end:1,control_mode:policy.offCamera?'Balanced':'ControlNet is more important',pixel_perfect:true}]}}
 },{stage:'identity',characterId:reference.characterId});
 const prior=recipe.promptRequestTraces.find(t=>t.stage==='identity'&&t.characterId===reference.characterId);
 assert.equal(request.prompt,prior.prompt,'Compiled identity prompt changed since saved job');
 assert.equal(request.negative_prompt,prior.negativePrompt,'Compiled identity negative changed since saved job');
 const contains=([x,y])=>((x-center.x)*width/rx)**2+((y-center.y)*height/ry)**2<=1;
 audit.push({name,center,radiusPixels:{x:rx,y:ry},landmarksInsideMask:{nose:contains(face[1]),eye33:contains(face[33]),eye263:contains(face[263]),iris468:contains(face[468]),iris473:contains(face[473])},denoise:plan.denoisingStrength});
 fs.writeFileSync(path.join(out,name+'-mask.png'),Buffer.from(mask,'base64'),{flag:'wx'});
 cases.push({name,description:'Production identity continuation on improved reading image; fixed seed and same mask size. Only mask center differs. Results composited using production mask protection.',request});
}
fs.writeFileSync(path.join(out,'identity-cases.json'),JSON.stringify(cases),{flag:'wx'});
fs.writeFileSync(path.join(out,'identity-mask-audit.json'),JSON.stringify(audit,null,2),{flag:'wx'});
console.log(JSON.stringify(audit));

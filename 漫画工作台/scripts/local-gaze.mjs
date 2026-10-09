import sharp from 'sharp';
import {compositeMaskedOutput} from './masked-composite.mjs';

export function selectGazeFace(detection, {region={xStart:0,xEnd:1},nose}={}) {
 const faces=[];
 for(const pose of detection?.poses||[])for(const person of pose.people||[]){
  const raw=person.face_keypoints_2d;
  if(!Array.isArray(raw)||raw.length<68*3)continue;
  const points=Array.from({length:Math.floor(raw.length/3)},(_,i)=>({x:raw[i*3],y:raw[i*3+1],c:raw[i*3+2]}));
  const valid=p=>p&&[p.x,p.y,p.c].every(Number.isFinite)&&p.c>.2&&p.x>0&&p.x<1&&p.y>0&&p.y<1;
  if(points.slice(36,42).filter(valid).length<4||points.slice(42,48).filter(valid).length<4)continue;
  const usable=points.slice(0,68).filter(valid);if(usable.length<40)continue;
  const xs=usable.map(p=>p.x),ys=usable.map(p=>p.y);
  const b={x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
  const cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
  if(b.right-b.x<.025||b.bottom-b.y<.035)continue;
  faces.push({...b,cx,cy});
 }
 const candidates=faces.filter(f=>f.x>=region.xStart&&f.right<=region.xEnd&&(!nose||Math.hypot(f.cx-nose.x,f.cy-nose.y)<.25));
 if(candidates.length!==1)return {status:'skipped',reason:candidates.length?'ambiguous_face_assignment':'face_not_localized'};
 const face=candidates[0];
 if(faces.some(f=>f!==face&&f.x<face.right&&f.right>face.x&&f.y<face.bottom&&f.bottom>face.y))return {status:'skipped',reason:'overlapping_faces'};
 return {status:'localized',face,otherFaces:faces.filter(f=>f!==face)};
}

export function localGazeGeometry(face,width,height,target){
 const cx=face.cx*width,cy=face.cy*height,rx=(face.right-face.x)*width*.55,ry=(face.bottom-face.y)*height*.58;
 const size=Math.min(width,height,Math.max(64,Math.ceil(Math.max(rx,ry)*2.8)));
 const left=Math.max(0,Math.min(width-size,Math.floor(cx-size/2))),top=Math.max(0,Math.min(height-size,Math.floor(cy-size/2)));
 return {crop:{left,top,width:size,height:size},mask:{cx,cy,rx,ry},modelSeesTarget:Boolean(target&&target.x*width>=left&&target.x*width<left+size&&target.y*height>=top&&target.y*height<top+size)};
}

// No generation retries or quality gate. Detection and this optional repair may
// fail without discarding the already generated image.
export async function runLocalGaze({request,region,nose,target,detect,generate}){
 const original=request.init_images[0];
 let audit={version:'local-gaze-1',status:'skipped',reason:'unavailable',modelSeesTarget:false};
 try{
  if(/\b(?:eyes? closed|closed eyes|eyes? shut)\b/i.test(request.prompt||''))return {image:original,audit:{...audit,reason:'closed_eyes_preserved'}};
  if(!region||![region.xStart,region.xEnd].every(Number.isFinite)||region.xStart>=region.xEnd)return {image:original,audit:{...audit,reason:'invalid_character_region'}};
  const selection=selectGazeFace(await detect(original),{region,nose});
  if(selection.status!=='localized')return {image:original,audit:{...audit,...selection}};
  const {width,height}=await sharp(Buffer.from(original,'base64')).metadata();
  const geometry=localGazeGeometry(selection.face,width,height,target),crop=geometry.crop,m=geometry.mask;
  const peers=selection.otherFaces.map(f=>`<rect x="${(f.cx-(f.right-f.x)*.65)*width}" y="${(f.cy-(f.bottom-f.y)*.65)*height}" width="${(f.right-f.x)*width*1.3}" height="${(f.bottom-f.y)*height*1.3}" fill="black"/>`).join('');
  const mask=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><clipPath id="actor"><rect x="${region.xStart*width}" y="0" width="${(region.xEnd-region.xStart)*width}" height="${height}"/></clipPath></defs><rect width="100%" height="100%" fill="black"/><ellipse clip-path="url(#actor)" cx="${m.cx}" cy="${m.cy}" rx="${m.rx}" ry="${m.ry}" fill="white"/>${peers}</svg>`)).png().toBuffer();
  const localize=async(base64)=>sharp(Buffer.from(base64,'base64')).extract(crop).resize(512,512).png().toBuffer();
  const localMask=(await localize(mask.toString('base64'))).toString('base64');
  const localImage=(await localize(original)).toString('base64');
  const controls=[];
  const aligned=nose&&Math.hypot(nose.x-selection.face.cx,nose.y-selection.face.cy)<.06;
  for(const unit of request.alwayson_scripts?.ControlNet?.args||[]){
   const identity=/ip[-_ ]?adapter|reference|faceid/i.test(`${unit.module} ${unit.model}`);
   if(!identity&&!aligned)continue;
   controls.push({...unit,image:identity?unit.image:(await localize(unit.image)).toString('base64'),effective_region_mask:localMask,resize_mode:'Just Resize',pixel_perfect:false,...(identity?{weight:Math.min(Number(unit.weight)||0,.35),guidance_end:Math.min(unit.guidance_end??1,.6),control_mode:'Balanced'}:{})});
  }
  audit={...audit,face:selection.face,...geometry,faceMaskBounds:{x:Math.max(0,m.cx-m.rx),y:Math.max(0,m.cy-m.ry),width:Math.min(width,m.cx+m.rx)-Math.max(0,m.cx-m.rx),height:Math.min(height,m.cy+m.ry)-Math.max(0,m.cy-m.ry)},modelResolution:{width:512,height:512},denoisingStrength:Math.max(request.denoising_strength||0,.4),identityWeightCap:.35,poseAligned:Boolean(aligned),controls:controls.map(u=>({role:/ip[-_ ]?adapter|reference|faceid/i.test(`${u.module} ${u.model}`)?'identity':'head_direction_pose',model:u.model,weight:u.weight,guidanceEnd:u.guidance_end})),status:'prepared',reason:null};
  const localRequest={...request,init_images:[localImage],mask:localMask,width:512,height:512,inpaint_full_res:false,inpaint_full_res_padding:0,mask_blur:4,denoising_strength:Math.max(request.denoising_strength||0,.4),alwayson_scripts:{...request.alwayson_scripts,ControlNet:{args:controls}}};
  const result=await generate(localRequest);
  if(result.status<200||result.status>=300)throw new Error(`gaze request HTTP ${result.status}`);
  const output=JSON.parse(result.body).images?.[0];if(!output)throw new Error('gaze request returned no image');
  const local=await compositeMaskedOutput(localImage,output,localMask);
  const patch=await sharp(Buffer.from(local,'base64')).resize(crop.width,crop.height).png().toBuffer();
  const canvas=await sharp(Buffer.from(original,'base64')).composite([{input:patch,left:crop.left,top:crop.top}]).png().toBuffer();
  const image=await compositeMaskedOutput(original,canvas.toString('base64'),mask.toString('base64'));
  return {image,audit:{...audit,status:'applied',semanticStatus:'unverified'}};
 }catch(error){return {image:original,audit:{...audit,status:'skipped',reason:'local_gaze_unavailable',error:String(error.message||error),semanticStatus:'not_applied'}};}
}

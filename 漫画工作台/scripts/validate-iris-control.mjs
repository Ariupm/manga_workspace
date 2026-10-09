// Explicitly invoked SD experiment; never called by production or test suites.
// node scripts/validate-iris-control.mjs landmarks.json output-dir direction [pair|control]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {planIrisControl,irisMaskSvg} from './iris-control-experiment.mjs';
import {compositeMaskedOutput} from './masked-composite.mjs';

const [input,out,direction,mode='pair']=process.argv.slice(2);
if(!input||!out||!direction)throw Error('landmarks input, output directory and direction required');
const d=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const plan=planIrisControl({...d,region:d.region||{xStart:0,xEnd:1},direction});
if(plan.status!=='prepared')throw Error(`Optional experiment skipped: ${plan.reason}`);
fs.mkdirSync(out,{recursive:true});
const {width,height}=d,b=plan.faceBounds;
const size=Math.min(width,height,Math.max(64,Math.ceil(Math.max((b.right-b.left)*width,(b.bottom-b.top)*height)*1.5)));
const crop={left:Math.max(0,Math.min(width-size,Math.round((b.left+b.right)*width/2-size/2))),top:Math.max(0,Math.min(height-size,Math.round((b.top+b.bottom)*height/2-size/2))),width:size,height:size};
fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify({...d,plan,crop},null,2));
const python=process.env.SD_PYTHON||'E:/Anaconda3/envs/sd-webui/python.exe';
const root=process.env.SD_WEBUI_ROOT||'D:/stable-diffusion-webui-master';
execFileSync(python,['scripts/render-iris-control-experiment.py','--annotator',path.join(root,'extensions/sd-webui-controlnet/annotator/mediapipe_face/mediapipe_face_common.py'),'--input',path.join(out,'geometry.json'),'--output',path.join(out,'control-map.png')]);
const original=fs.readFileSync(d.source),mask=await sharp(Buffer.from(irisMaskSvg(plan,width,height))).png().toBuffer();
const local=await sharp(original).extract(crop).resize(512,512).png().toBuffer();
const localMask=await sharp(mask).extract(crop).resize(512,512).png().toBuffer();
fs.writeFileSync(path.join(out,'init.png'),local);fs.writeFileSync(path.join(out,'mask.png'),localMask);fs.writeFileSync(path.join(out,'full-mask.png'),mask);
const base=process.env.SD_WEBUI_URL||'http://127.0.0.1:7860';
const models=await (await fetch(`${base}/controlnet/model_list?update=true`)).json();
const model=models.model_list.find(m=>m.startsWith('control_v2p_sd15_mediapipe_face '));if(!model)throw Error('SD1.5 MediaPipe control model unavailable');
const prompt=`${d.stylePrompt||'anime illustration'}, ${d.subjectPrompt||'one person'}, established facial identity, eyes looking ${direction.replace('-', ' and ')}, pupils directed ${direction.replace('-', ' and ')}, natural open eyes`;
const common={init_images:[local.toString('base64')],mask:localMask.toString('base64'),width:512,height:512,prompt,negative_prompt:'looking at viewer, eye contact with camera, crossed eyes, mismatched pupils, malformed eyes, closed eyes',seed:610011,steps:16,cfg_scale:6.4,denoising_strength:.55,sampler_name:'DPM++ 2M',scheduler:'Karras',batch_size:1,n_iter:1,inpainting_fill:1,inpaint_full_res:false,mask_blur:4,inpaint_full_res_padding:0,send_images:true};
for(const variant of mode==='control'?['control']:['baseline','control']){
 const args=variant==='control'?[{enabled:true,module:'none',model,image:fs.readFileSync(path.join(out,'control-map.png')).toString('base64'),weight:1,resize_mode:'Just Resize',processor_res:512,pixel_perfect:false,guidance_start:0,guidance_end:1,control_mode:'Balanced',low_vram:true}]:[];
 const request={...common,alwayson_scripts:{ControlNet:{args}}};
 fs.writeFileSync(path.join(out,variant+'-request.json'),JSON.stringify(request));
 console.log(JSON.stringify({variant,direction,seed:request.seed,model:variant==='control'?model:null,startedAt:new Date().toISOString()}));
 const start=performance.now(),res=await fetch(`${base}/sdapi/v1/img2img`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
 const body=await res.text();if(!res.ok)throw Error(`${res.status} ${body.slice(0,600)}`);
 const data=JSON.parse(body);if(!data.images?.[0])throw Error('No actual output');
 const clipped=await compositeMaskedOutput(local.toString('base64'),data.images[0],localMask.toString('base64'));
 const patch=await sharp(Buffer.from(clipped,'base64')).resize(size,size).png().toBuffer();
 const canvas=await sharp(original).composite([{input:patch,left:crop.left,top:crop.top}]).png().toBuffer();
 const output=Buffer.from(await compositeMaskedOutput(original.toString('base64'),canvas.toString('base64'),mask.toString('base64')),'base64');
 fs.writeFileSync(path.join(out,variant+'.png'),output);fs.writeFileSync(path.join(out,variant+'-local.png'),Buffer.from(data.images[0],'base64'));
 const audit={variant,direction,durationMs:Math.round(performance.now()-start),status:'applied',semanticStatus:'unverified',info:JSON.parse(data.info)};
 fs.writeFileSync(path.join(out,variant+'-audit.json'),JSON.stringify(audit,null,2));console.log(JSON.stringify({variant,status:'applied',durationMs:audit.durationMs}));
}

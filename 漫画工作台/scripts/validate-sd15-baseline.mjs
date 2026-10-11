// Explicit SD capability/ablation experiment. Never imported by production.
// node scripts/validate-sd15-baseline.mjs cases.json new-output-directory [txt2img|img2img]
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {compositeMaskedOutput} from './masked-composite.mjs';
const [input,out,mode='txt2img']=process.argv.slice(2);
if(!input||!out)throw Error('Case file and output directory required');
if(!['txt2img','img2img'].includes(mode))throw Error('Unknown generation mode');
const cases=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const base=process.env.SD_WEBUI_URL||'http://127.0.0.1:7860';
fs.mkdirSync(out,{recursive:true});
for(const item of cases){
 if(!/^[a-z0-9_-]+$/i.test(item.name))throw Error('Unsafe case name');
 if(fs.existsSync(path.join(out,item.name+'.png')))throw Error('Preserve prior result; use a new case name or directory');
 if(fs.existsSync('data/studio.db')){
  const db=new DatabaseSync('data/studio.db',{readOnly:true});
  // Old unclaimed queued records do not own the backend; running jobs do,
  // including the quiet intervals between their image requests.
  let active;try{active=db.prepare("SELECT id,status FROM jobs WHERE provider='sd-webui' AND status LIKE '%running' LIMIT 1").get();}finally{db.close();}
  if(active)throw Error(`Production job ${active.id} is ${active.status}; do not insert an experiment between its stages`);
 }
 const progress=await (await fetch(base+'/sdapi/v1/progress?skip_current_image=true')).json();
 if(progress.state.job)throw Error('SD is busy; do not compete with an existing generation');
 const request={width:512,height:512,steps:20,cfg_scale:6.5,sampler_name:'DPM++ 2M',scheduler:'Karras',batch_size:1,n_iter:1,send_images:true,do_not_save_grid:true,alwayson_scripts:{ControlNet:{args:[]}},...item.request};
 if(!Number.isInteger(request.seed)||request.seed<0)throw Error('A fixed seed is required');
 if(mode==='img2img'&&(!request.init_images?.[0]||!request.mask))throw Error('Masked img2img experiment requires source image and mask');
 fs.writeFileSync(path.join(out,item.name+'-request.json'),JSON.stringify(request));
 const started=performance.now();console.log(JSON.stringify({name:item.name,seed:request.seed,steps:request.steps,startedAt:new Date().toISOString()}));
 const res=await fetch(base+'/sdapi/v1/'+mode,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
 const body=await res.text();if(!res.ok)throw Error(`${res.status}: ${body.slice(0,500)}`);
 const result=JSON.parse(body);if(!result.images?.length)throw Error('No generated image');
 let output=result.images[0];
 if(mode==='img2img'){
  fs.writeFileSync(path.join(out,item.name+'-raw.png'),Buffer.from(output,'base64'));
  output=await compositeMaskedOutput(request.init_images[0],output,request.mask);
 }
 fs.writeFileSync(path.join(out,item.name+'.png'),Buffer.from(output,'base64'));
 const info=JSON.parse(result.info),audit={name:item.name,mode,maskedComposite:mode==='img2img',durationMs:Math.round(performance.now()-started),description:item.description,info};
 fs.writeFileSync(path.join(out,item.name+'-audit.json'),JSON.stringify(audit,null,2));
 console.log(JSON.stringify({name:item.name,status:'generated',durationMs:audit.durationMs,seed:info.seed,model:info.sd_model_name}));
}

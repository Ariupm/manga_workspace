// Offline fixture compiler for paired SD experiments. No database or SD writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {composeGenerationPrompt} from '../scripts/prompt-compiler.mjs';

const [fixturePath,out]=process.argv.slice(2);
assert.ok(fixturePath&&out);assert.ok(!fs.existsSync(out),'Preserve existing experiment');
const suite=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const actor:any={id:'actor',name:'Actor',appearanceEn:'adult woman with pink hair',visualTraits:{hairColorEn:"pink hair"},invariantsEn:[],references:[]};
const requests:any[]=[],audit:any[]=[];
for(const item of suite.cases){
 const action=item.prompt.replace(/^anime illustration, side view of an adult woman with pink hair /,'');
 const shot:any={id:9900,pageId:1,order:1,title:item.id,description:action,scene:'room',sceneEn:'room',timeOfDay:'day',actionEn:action,expressionEn:'neutral',camera:'medium shot',cameraEn:'medium shot, side view',compositionEn:'hands and action target visible',lightingEn:'daylight',characterIds:['actor'],characterLooks:{},environment:{},visualSpecConfirmed:true,
  visualSpec:{camera:{shotSize:'medium shot',angle:'side view',composition:'hands and action target visible'},characters:[{characterId:'actor',action,expression:'neutral',region:{xStart:0,xEnd:1},appearanceState:{hair:'',bag:'',accessories:[],glasses:'',outerwearState:'',condition:[]}}],scene:{location:'room',timeOfDay:'day',weather:'clear',lighting:'daylight',sceneId:'room'},visibleFacts:[action],interactions:[],interaction:null}};
 const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
 const plan=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry:false});
 if(plan.errors.length){audit.push({id:item.id,baseline:item.prompt,input:shot,errors:plan.errors,status:'compile_rejected'});continue;}
 const prompt=composeGenerationPrompt(plan);
 for(const seed of suite.seeds)requests.push({name:`${item.id}-compiled-${seed}`,description:'Same source action, current text compiler, no image controls; fixed baseline negative. Framing/default additions are part of compiler output.',request:{...suite.settings,prompt,negative_prompt:suite.negative,seed,batch_size:1,n_iter:1,send_images:true,do_not_save_grid:true,alwayson_scripts:{ControlNet:{args:[]}}}});
 audit.push({id:item.id,baseline:item.prompt,input:shot,compiled:prompt,plan});
}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(requests,null,2));
fs.writeFileSync(path.join(out,'compiler-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify({cases:requests.length,out}));

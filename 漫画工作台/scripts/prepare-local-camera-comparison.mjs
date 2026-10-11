// Explicit offline experiment only; never edits a stored job or calls SD.
// node scripts/prepare-local-camera-comparison.mjs config.json new-output-dir
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LOCAL_CAMERA_CONTEXT_VERSION,createPromptPlan,finalizePromptPlan,prepareGenerationPromptRequest} from './prompt-compiler.mjs';

const [configFile,out]=process.argv.slice(2);
assert.ok(configFile&&out,'Config and new output directory required');
assert.ok(!fs.existsSync(out),'Preserve prior experiment outputs');
const config=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));
assert.ok(config.seeds.length>=2&&config.seeds.every(s=>Number.isInteger(s)&&s>=0),'Predeclare at least two seeds');
const payload=JSON.parse(fs.readFileSync(config.recipeFile,'utf8'));
const sourceRecipe=payload.recipe||payload;
const sourcePlan=sourceRecipe.generationSpec.promptPlan;
const oldRequest=JSON.parse(fs.readFileSync(config.requestFile,'utf8'));
assert.ok(oldRequest.init_images?.[0]&&oldRequest.mask,'Use an existing reviewed local image and mask');
const pairs=[],audits=[];
for(const version of ['before','after']){
 const recipe=structuredClone(sourceRecipe);
 const compiled=createPromptPlan({...sourcePlan.facts,localCameraContextVersion:version==='after'?LOCAL_CAMERA_CONTEXT_VERSION:undefined});
 // Only opt this private experiment clone into the new local policy. The
 // base text, references, dimensions, frozen relations and control units stay.
 const plan=finalizePromptPlan(compiled,{commonPrompt:sourcePlan.commonPrompt,characterPrompts:sourcePlan.characterPrompts,prompt:sourcePlan.appliedPrompt,negativePrompt:sourcePlan.negativePrompt});
 assert.deepEqual(plan.errors,[]);
 recipe.generationSpec.promptPlan=plan;
 const request=prepareGenerationPromptRequest(recipe,structuredClone(oldRequest),config.context);
 if(version==='before')assert.equal(request.prompt,oldRequest.prompt,'Must reproduce historical request through production compiler');
 assert.equal(request.negative_prompt,oldRequest.negative_prompt);
 for(const [key,value] of Object.entries(oldRequest))if(!['prompt','negative_prompt'].includes(key))assert.deepEqual(request[key],value,key);
 audits.push({version,prompt:request.prompt,negative:request.negative_prompt,trace:recipe.promptRequestTraces.at(-1)});
 for(const seed of config.seeds)pairs.push({name:`${config.name}-${version}-${seed}`,description:'Production stage compiler; paired local camera policy only. Historical reviewed mask, fixed source, no database changes.',request:{...request,seed}});
}
const hash=x=>createHash('sha256').update(Buffer.from(x,'base64')).digest('hex');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(pairs));
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({config,sourceImageSha256:hash(oldRequest.init_images[0]),maskSha256:hash(oldRequest.mask),audits},null,2));
console.log(JSON.stringify({out,cases:pairs.length,audits:audits.map(({version,prompt})=>({version,prompt}))}));

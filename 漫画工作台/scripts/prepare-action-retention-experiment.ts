// Offline staged comparison from an observed source request. No DB/SD writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildRegionalPrompt,buildEffectivePromptPlan} from '../lib/prompts';
import {createPromptPlan,composeGenerationPrompt,compilePromptFields,promptTerms} from './prompt-compiler.mjs';

const [configFile,out]=process.argv.slice(2);
assert.ok(configFile&&out&&!fs.existsSync(out),'Use a config and a new output directory');
const config=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));
assert.ok(config.seeds.length>=2&&config.seeds.every((s:number)=>Number.isInteger(s)&&s>=0));
const baseline=JSON.parse(fs.readFileSync(config.requestFile,'utf8'));
assert.equal(baseline.alwayson_scripts?.ControlNet?.args?.length,0,'Begin with a text-only success');
const sourcePayload=JSON.parse(fs.readFileSync(config.appearanceRecipeFile,'utf8'));
const sourceRecipe=sourcePayload.recipe||sourcePayload;
const appearance=sourceRecipe.generationSpec.promptPlan.facts.characters.find((p:any)=>p.characterId===config.characterId);
assert.ok(appearance,'Appearance must belong to the requested actor');
const actor:any={id:config.characterId,name:'Actor',appearanceEn:config.identity,visualTraits:{hairColorEn:config.hairColor},invariantsEn:[],references:[]};
const shot:any={id:9802,pageId:1,order:1,title:'Action retention diagnostic',description:config.action,scene:config.location,sceneEn:config.location,timeOfDay:'day',actionEn:config.action,expressionEn:'neutral',camera:config.shotSize,cameraEn:config.shotSize,compositionEn:config.composition,lightingEn:config.lighting,characterIds:[actor.id],characterLooks:{},environment:{},visualSpecConfirmed:true,
 visualSpec:{camera:{shotSize:config.shotSize,angle:config.angle,composition:config.composition},characters:[{characterId:actor.id,action:config.action,gazeTarget:config.gaze,expression:'neutral',region:{xStart:0,xEnd:1},appearanceState:{hair:'',bag:'',accessories:[],glasses:'',outerwearState:'',condition:[]}}],scene:{location:config.location,timeOfDay:'day',weather:'clear',lighting:config.lighting,sceneId:'diagnostic'},visibleFacts:[config.action],interactions:[],interaction:null}};
const regional=buildRegionalPrompt(shot,[],[actor],{posePlannerVersion:'3.0'});
const compiled=buildEffectivePromptPlan(regional,regional.poseControl as any,{useGeometry:false});
assert.deepEqual(compiled.errors,[]);
const groups=['identity','clothing','body','condition'];
const full=createPromptPlan({...compiled.facts,characters:compiled.facts.characters.map(p=>({...p,fields:[...p.fields.filter(f=>!groups.includes(f.group||'')),...appearance.fields.filter((f:any)=>groups.includes(f.group)).map((f:any)=>({...f}))]}))});
assert.deepEqual(full.errors,[]);
const stages=[{name:'baseline',prompt:baseline.prompt,description:'Exact historical short request; observed gaze/posture success, tool contact not accepted.'},{name:'compiled',prompt:composeGenerationPrompt(compiled),description:'Same authored action/gaze in front-end buildRegionalPrompt -> buildEffectivePromptPlan; minimal appearance. Framing/default contract text additions are part of this stage.'},{name:'appearance',prompt:composeGenerationPrompt(full),description:'Compiled stage plus the same actor frozen production identity/clothing/body/condition fields only.'}];
const cases=config.seeds.flatMap((seed:number)=>stages.map(stage=>({name:`${stage.name}-${seed}`,description:stage.description,request:{...baseline,prompt:stage.prompt,seed}})));
// A separately declared ablation, not a production rule: the authored action
// remains complete, and relation facts remain available for downstream control.
const ablations:any[]=[],ablationAudit:any[]=[];
for(const [name,plan] of [['compiled',compiled],['appearance',full]] as const){
 const reduced=createPromptPlan({...plan.facts,characters:plan.facts.characters.map(p=>({...p,fields:p.fields.filter(f=>f.group!=='interaction')}))});
 assert.deepEqual(reduced.errors,[]);
 assert.deepEqual(reduced.facts.relations,plan.facts.relations);
 const prompt=composeGenerationPrompt(reduced);
 ablationAudit.push({name,removedFields:plan.facts.characters.flatMap(p=>p.fields.filter(f=>f.group==='interaction')),prompt});
 for(const seed of config.seeds)ablations.push({name:`${name}-without-generic-${seed}`,description:'Experimental compiler projection: omit only auto relation text, retain source action and frozen relation data. Not a production policy.',request:{...baseline,prompt,seed}});
}
const fullPrompt=composeGenerationPrompt(full),allTerms=promptTerms(fullPrompt);
const eventTerms=promptTerms(compilePromptFields(full.facts.characters[0].fields.filter(f=>['action','gaze'].includes(f.group||''))).prompt);
const movedTerms=allTerms.filter(t=>eventTerms.includes(t));
assert.ok(movedTerms.length);
const eventFirst=[...movedTerms,...allTerms.filter(t=>!eventTerms.includes(t))].join(', ');
assert.deepEqual([...promptTerms(eventFirst)].sort(),[...allTerms].sort(),'Ordering trial must preserve the complete term multiset');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'cases.json'),JSON.stringify(cases));
fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify({config,shot,stages,compiled,full,controlsApplied:false,scope:'Text compilation and appearance additions only; not a full production replay.'},null,2));
fs.writeFileSync(path.join(out,'without-generic-cases.json'),JSON.stringify(ablations));
fs.writeFileSync(path.join(out,'without-generic-preparation.json'),JSON.stringify(ablationAudit,null,2));
fs.writeFileSync(path.join(out,'event-first-cases.json'),JSON.stringify(config.seeds.map((seed:number)=>({name:`appearance-event-first-${seed}`,description:'Same complete compiled appearance terms/counts; only move existing action/gaze terms to the front.',request:{...baseline,prompt:eventFirst,seed}}))));
fs.writeFileSync(path.join(out,'event-first-preparation.json'),JSON.stringify({old:fullPrompt,reordered:eventFirst,movedTerms,termMultisetIdentical:true},null,2));
console.log(JSON.stringify({out,cases:cases.length,stages}));

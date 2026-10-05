import { NextResponse } from "next/server";
import { callDeepSeekJson, getDeepSeekConfig } from "@/lib/deepseek";
import { confirmAllShotVisualSpecs, confirmChapterVisualPlan, confirmShotVisualSpec, getStudioData, recordVisualPlanningFailure, saveChapterVisualPlan, saveShotVisualSpec, updateShotVisualSpec } from "@/lib/db";
import { assertVisualShape, characterContinuityMemory, dependencyHash, inheritShotContinuity, normalizeShotSpec, shotSystemPrompt, validateVisualIds, VISUAL_SCHEMA_VERSION } from "@/lib/visual-planning";
import { planChapterInBatches } from "@/lib/chapter-planning";
import {interactionFactsShape,interactionFactsInstruction,markManualInteractionFactEdits,assertInteractionFactTranslation} from '@/lib/interaction-facts';

export const runtime="nodejs";
export const dynamic="force-dynamic";

async function invoke(system:string,user:string) {
  let last: unknown;
  for(let attempt=0;attempt<2;attempt++)try{const result=await callDeepSeekJson(system,user);const serialized=JSON.stringify(result.data);if(/[\u3400-\u9fff]/.test(serialized))throw new Error("视觉规划包含中文，正在要求模型重新输出英文");return result;}catch(error){last=error;}
  throw last;
}

const shotSummary=(shot:any,includeConfirmed=true)=>shot?({id:shot.id,title:shot.title,description:shot.description,scene:shot.scene,timeOfDay:shot.timeOfDay,
  camera:shot.camera,cameraEn:shot.cameraEn,characterIds:shot.characterIds,outfitId:shot.outfitId,shoeId:shot.shoeId,
  characterLooks:shot.characterLooks,confirmedVisualSpec:includeConfirmed&&shot.visualSpecConfirmed?shot.visualSpec:null}):null;

async function refineOne(data:ReturnType<typeof getStudioData>,shotId:number,force=false,allowPendingPrevious=false) {
  const all=data.episode.pages.flatMap((x)=>x.shots),shot=all.find((x)=>x.id===shotId);
  if(!shot)throw new Error("分格不存在");
  const index=all.findIndex((x)=>x.id===shot.id);
  const continuityMemory=characterContinuityMemory(all,index,allowPendingPrevious);
  const input={schemaVersion:VISUAL_SCHEMA_VERSION,chapterPlan:data.episode.visualPlanConfirmed?data.episode.visualPlan:null,
    continuityMemory:{characters:continuityMemory.map(({shotId,confirmed,character})=>({shotId,confirmed,characterId:character.characterId,outfitId:character.outfitId,shoeId:character.shoeId,appearanceState:character.appearanceState})),instruction:"These are the last known states of returning characters, with source shot IDs and confirmation status. Absence from an intervening panel is not removal. Preserve these states unless the current story or manual choice changes them. Do not copy old actions, gaze or environments into the current panel."},
    previousShot:allowPendingPrevious&&all[index-1]?{...shotSummary(all[index-1],false),confirmedVisualSpec:all[index-1].visualSpec}:shotSummary(all[index-1]),currentShot:shotSummary(shot,false),nextShot:shotSummary(all[index+1],false),
    characters:data.characters.filter((x)=>shot.characterIds.includes(x.id)).map((x)=>({id:x.id,name:x.name,appearance:x.appearanceEn,invariants:x.invariantsEn,visualTraits:x.visualTraits,profile:x.profile})),
    allowedAssets:data.assets.filter((x)=>shot.characterIds.includes(x.characterId)).map((x)=>({id:x.id,type:x.type,characterId:x.characterId,description:x.visualDescriptionEn})),
    requiredShape:{schemaVersion:"1.0",visibleFacts:[],scene:{},characters:[],interactions:[{type:"",actorCharacterId:"",targetCharacterId:"",propId:"",action:"",phase:"",contactPoints:[],gazeTarget:"",ownershipBefore:null,ownershipAfter:null}],camera:{},stateChanges:[],warnings:[]}};
  input.requiredShape.interactions[0]=Object.assign(input.requiredShape.interactions[0],{visualFacts:interactionFactsShape});
  const hash=dependencyHash(input);
  if(shot.visualSpec&&shot.visualSpecDependencyHash===hash&&!force)return {cached:true,spec:shot.visualSpec,shotId};
  const result=await invoke(`${shotSystemPrompt} ${interactionFactsInstruction}`,`Create the shot visual specification from this JSON input:\n${JSON.stringify(input)}`);
  assertVisualShape("shot",result.data);
  const previous=all[index-1]&&(all[index-1].visualSpecConfirmed||allowPendingPrevious)?all[index-1].visualSpec:null;
  const spec=inheritShotContinuity(normalizeShotSpec(result.data,shot,{interactionSource:'model',requireInteractionFacts:true}),previous,data.episode.visualPlanConfirmed?data.episode.visualPlan:null,continuityMemory.map(item=>item.character)),validation=validateVisualIds(spec,data.characters,data.assets);
  if(!validation.valid)throw new Error(`镜头规格校验失败：${[...validation.errors,...(validation.failures||[]).map(f=>f.message)].join("；")}`);
  const meta={schemaVersion:VISUAL_SCHEMA_VERSION,model:result.model,generatedAt:new Date().toISOString(),inputHash:hash,usage:result.usage,validation};
  saveShotVisualSpec(shot.id,spec,"deepseek",hash,meta);
  return {cached:false,spec,shotId,meta,validation};
}

export async function POST(request:Request) {
  const body=await request.json().catch(()=>({}));
  const projectId=Number(body.projectId),episodeId=Number(body.episodeId);
  if(!Number.isInteger(projectId)||!Number.isInteger(episodeId))return NextResponse.json({error:"项目或章节参数无效"},{status:400});
  const data=getStudioData(projectId,episodeId);
  if(data.episode.id!==episodeId)return NextResponse.json({error:"章节不存在"},{status:404});
  try {
    if(body.action==="plan-chapter") {
      const input={schemaVersion:VISUAL_SCHEMA_VERSION,story:data.episode.rawMaterial||data.episode.synopsis,script:data.episode.script,
        shots:data.episode.pages.flatMap((page)=>page.shots.map((shot)=>({id:shot.id,title:shot.title,description:shot.description,scene:shot.scene,timeOfDay:shot.timeOfDay,characterIds:shot.characterIds,characterLooks:shot.characterLooks,outfitId:shot.outfitId,shoeId:shot.shoeId,confirmedVisualSpec:shot.visualSpecConfirmed?shot.visualSpec:null}))),
        characters:data.characters.map((x)=>({id:x.id,name:x.name,invariants:x.invariantsEn})),
        assets:data.assets.map((x)=>({id:x.id,type:x.type,characterId:x.characterId,description:x.visualDescriptionEn})),seriesMemory:data.seriesMemory,
        requiredShape:{schemaVersion:"1.0",scenes:[],timeline:[],warnings:[]}};
      const result=await planChapterInBatches(input,callDeepSeekJson);
      const plan=result.plan,validation=validateVisualIds(plan,data.characters,data.assets);
      if(!validation.valid)return NextResponse.json({error:"视觉规划引用了无效资产",validation},{status:422});
      const meta={schemaVersion:VISUAL_SCHEMA_VERSION,model:result.calls.at(-1)?.model,generatedAt:new Date().toISOString(),inputHash:dependencyHash(input),calls:result.calls,planningMode:"bounded_batches",validation};
      saveChapterVisualPlan(episodeId,plan,meta);
      return NextResponse.json({ok:true,plan,meta,validation});
    }
    if(body.action==="refine-shot")return NextResponse.json({ok:true,...await refineOne(data,Number(body.shotId),Boolean(body.force))});
    if(body.action==="refine-all") {
      if(!data.episode.visualPlanConfirmed)return NextResponse.json({error:"请先确认全章视觉规划"},{status:409});
      const results=[];let working=data;
      for(const shot of data.episode.pages.flatMap((x)=>x.shots)) {
        try { const result=await refineOne(working,shot.id,Boolean(body.force),true);results.push({shotId:shot.id,ok:true,cached:result.cached});working=getStudioData(projectId,episodeId); }
        catch(error){recordVisualPlanningFailure(episodeId,shot.id,"refine-shot",error);results.push({shotId:shot.id,ok:false,error:error instanceof Error?error.message:"细化失败"});}
      }
      return NextResponse.json({ok:results.every((x)=>x.ok),results,completed:results.filter((x)=>x.ok).length,failed:results.filter((x)=>!x.ok).length});
    }
    if(body.action==="update-shot-spec") {
      const shot=data.episode.pages.flatMap((x)=>x.shots).find((x)=>x.id===Number(body.shotId));
      if(!shot)return NextResponse.json({error:"分格不存在"},{status:404});
      assertVisualShape("shot",body.spec);
      let submitted=body.spec,translationMeta:Record<string,unknown>|null=null;
      const serialized=JSON.stringify(submitted);
      if(/[\u3400-\u9fff]/.test(serialized)||/\bunknown\b/i.test(serialized)) {
        const converted=await invoke(
          `${shotSystemPrompt} Translate and repair the supplied existing specification. Preserve its exact story meaning, character IDs, asset IDs, manual camera choice and explicit visual decisions. Replace every Chinese descriptive value and every "unknown" placeholder with concise production-ready English. Return the complete shot specification JSON shape, not a patch.`,
          `Existing specification:\n${serialized}\nAllowed character IDs: ${JSON.stringify(shot.characterIds)}\nAllowed assets: ${JSON.stringify(data.assets.filter((asset)=>shot.characterIds.includes(asset.characterId)).map((asset)=>({id:asset.id,type:asset.type,characterId:asset.characterId})))}`,
        );
        assertVisualShape("shot",converted.data);assertInteractionFactTranslation(submitted,converted.data);submitted=converted.data;translationMeta={model:converted.model,usage:converted.usage,translatedAt:new Date().toISOString()};
      }
      if(Array.isArray(submitted.interactions))submitted={...submitted,interactions:submitted.interactions.map((relation:any)=>({...relation,visualFacts:markManualInteractionFactEdits(relation.visualFacts,shot.visualSpec?.interactions.find(old=>old.actorCharacterId===relation.actorCharacterId&&old.visualFacts?.object.instanceId===relation.visualFacts?.object.instanceId)?.visualFacts)}))};
      const spec=normalizeShotSpec(submitted,{...shot,characterLooks:{}},{manualEnvironment:true,manualAppearance:true,interactionSource:'preserve'});
      const validation=validateVisualIds(spec,data.characters,data.assets);if(!validation.valid)return NextResponse.json({error:"规格引用无效资产",validation},{status:422});
      return NextResponse.json({ok:updateShotVisualSpec(shot.id,spec,dependencyHash({manual:spec})),spec,validation,translationMeta});
    }
    if(body.action==="confirm-chapter")return NextResponse.json({ok:confirmChapterVisualPlan(episodeId)});
    if(body.action==="confirm-shot"||body.action==="confirm-all-shots"){
      const shots=data.episode.pages.flatMap(p=>p.shots).filter(s=>body.action==='confirm-all-shots'||s.id===Number(body.shotId));
      if(!shots.length)return NextResponse.json({error:'分格不存在'},{status:404});
      for(const shot of shots)if(shot.visualSpec){const validation=validateVisualIds(shot.visualSpec,data.characters,data.assets);if(!validation.valid)return NextResponse.json({error:`第${shot.position}格规格校验失败`,validation},{status:422});}
      return body.action==='confirm-shot'?NextResponse.json({ok:confirmShotVisualSpec(Number(body.shotId))}):NextResponse.json({ok:true,confirmed:confirmAllShotVisualSpecs(episodeId)});
    }
    return NextResponse.json({error:"未知操作"},{status:400});
  } catch(error) {
    recordVisualPlanningFailure(episodeId,Number.isInteger(Number(body.shotId))?Number(body.shotId):null,String(body.action||"unknown"),error);
    return NextResponse.json({error:error instanceof Error?error.message:"视觉规划失败",mode:getDeepSeekConfig().enabled?"deepseek_failed":"rules"},{status:502});
  }
}

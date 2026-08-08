import { NextResponse } from "next/server";
import { analyzeStory } from "@/lib/analysis";
import { createEpisodeFromStory, createStoryMaterial, getStudioData, refreshLatestEpisodeAnalysis } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request:Request) {
  const body=await request.json();
  const text=String(body.text??"").trim();
  if(text.length<8) return NextResponse.json({error:"剧情至少需要 8 个字"},{status:400});
  const automatic=analyzeStory(text);
  const supplied=body.analysis??{};
  const validKinds=["日常短篇","长篇章节","长篇素材"];
  const analysis={...automatic,...supplied,kind:validKinds.includes(supplied.kind)?supplied.kind:automatic.kind};
  const target=body.target==="current_series"?"current_series":"new_project";
  const projectId=Number(body.projectId);
  if(analysis.kind==="长篇素材") {
    if(!Number.isInteger(projectId)||projectId<=0)return NextResponse.json({error:"保存长篇素材需要有效作品"},{status:400});
    createStoryMaterial(projectId,text,analysis);
    return NextResponse.json({...getStudioData(projectId),savedAsMaterial:true});
  }
  createEpisodeFromStory(text,analysis,target,Number.isFinite(projectId)?projectId:undefined);
  return NextResponse.json(getStudioData(target==="current_series"?projectId:undefined));
}

export async function PATCH(request:Request) {
  const {text=""}=await request.json();
  const analysis=analyzeStory(String(text));
  refreshLatestEpisodeAnalysis(String(text),analysis);
  return NextResponse.json(getStudioData());
}

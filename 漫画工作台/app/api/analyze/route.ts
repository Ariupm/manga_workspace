import { NextResponse } from "next/server";
import { analyzeStory } from "@/lib/analysis";
import { callDeepSeekJson } from "@/lib/deepseek";

export async function POST(request: Request) {
  const {text = ""} = await request.json();
  if (String(text).trim().length < 8) return NextResponse.json({error:"请至少输入 8 个字的剧情素材"},{status:400});
  const source=String(text).trim(),fallback=analyzeStory(source);
  try {
    const result=await callDeepSeekJson(
      "You are a serialized manga story editor and storyboard director. Return JSON only. Preserve the supplied story facts; do not add unrelated plot. Every panel must describe one unique visible state change, not a generic pose. English visual fields must contain English only.",
      `Analyze this Chinese story and return a complete production plan. Required JSON shape: {kind:"日常短篇|长篇章节|长篇素材",theme:string,emotion:string[],characters:string[],scenes:string[],recommendedPages:number,outfitId:string,shoeId:string,affectsMainline:boolean,outline:[{title,description,emotion}],script:[{scene,timeOfDay,summary,dialogue}],panels:[{pageNumber,title,description,actionEn,expressionEn,gazeEn,handsEn,dialogue,camera:"远景|全景|中景|近景|特写",scene,timeOfDay,characterNames:string[]}]}. For a chapter create 5-7 pages and 6-8 panels per page. Panel descriptions must form a continuous sequence of start state, action, reaction, prop/environment information, and result. Specify actor-action-target, gaze, visible hands, prop ownership, and what changed from the previous panel. Use existing asset defaults ${fallback.outfitId} and ${fallback.shoeId} unless the story clearly requires another known asset ID. Story:\n${source}`,
      {timeoutMs:120_000,maxTokens:12_000},
    );
    const value=result.data as any;
    const panels=Array.isArray(value?.panels)?value.panels:[];
    const outline=Array.isArray(value?.outline)?value.outline:[];
    const script=Array.isArray(value?.script)?value.script:[];
    if(!panels.length||!outline.length||!script.length)throw new Error("大模型未返回完整分镜结构");
    return NextResponse.json({...fallback,...value,recommendedPages:Math.max(5,Math.min(7,Number(value.recommendedPages)||fallback.recommendedPages)),outfitId:String(value.outfitId||fallback.outfitId),shoeId:String(value.shoeId||fallback.shoeId),analysisSource:"deepseek"});
  } catch(error) {
    return NextResponse.json({...fallback,analysisWarning:error instanceof Error?`DeepSeek 分析失败，已使用本地规则：${error.message}`:"DeepSeek 分析失败，已使用本地规则"});
  }
}

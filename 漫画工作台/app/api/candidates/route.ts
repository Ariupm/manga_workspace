import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addCandidate, getAssets, getCharacters, getShotGenerationInput, getStudioData } from "@/lib/db";
import { evaluateCandidateGate } from "@/lib/quality-gate";
import { validateVisualIds } from "@/lib/visual-planning";
import sharp from "sharp";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request) {
  const form=await request.formData();
  const file=form.get("file");
  const shotId=Number(form.get("shotId"));
  if(!(file instanceof File)||!shotId) return NextResponse.json({error:"缺少图片或分镜编号"},{status:400});
  const shot = getShotGenerationInput(shotId);
  if (!shot) return NextResponse.json({ error: "分镜不存在" }, { status: 404 });
  const validation = shot.visualSpec
    ? validateVisualIds(shot.visualSpec, getCharacters(), getAssets())
    : undefined;
  const gate = evaluateCandidateGate(shot, validation);
  if (gate.status === "blocked") return NextResponse.json({ error: "该分镜存在 P0 结构问题，候选图已阻断", code: "QUALITY_GATE_BLOCKED", qualityGate: gate }, { status: 422 });
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)) return NextResponse.json({error:"仅支持 PNG、JPG 和 WebP"},{status:415});
  if(file.size>20*1024*1024) return NextResponse.json({error:"图片不能超过 20MB"},{status:413});
  let pixelQa:{status:"passed"|"blocked";blockers:string[];warnings:string[];width?:number;height?:number};
  const fileBuffer=Buffer.from(await file.arrayBuffer());
  try {
    const meta=await sharp(fileBuffer).metadata();
    const blockers:string[]=[];
    if(!meta.width||!meta.height||meta.width<256||meta.height<256) blockers.push("image_dimensions_below_256px");
    if(fileBuffer.length<20_000) blockers.push("image_payload_suspiciously_small");
    pixelQa={status:blockers.length?"blocked":"passed",blockers,warnings:[],width:meta.width,height:meta.height};
    if(pixelQa.status==="blocked") return NextResponse.json({error:"图片像素质检未通过",code:"PIXEL_QA_BLOCKED",pixelQa},{status:422});
  } catch(error) { return NextResponse.json({error:"图片无法解码，未进入候选",code:"PIXEL_QA_BLOCKED"},{status:422}); }
  const extension=file.type==="image/png"?".png":file.type==="image/webp"?".webp":".jpg";
  const directory=path.join(process.cwd(),"workspace","generated");
  fs.mkdirSync(directory,{recursive:true});
  const filename=`shot-${shotId}-${randomUUID()}${extension}`;
  fs.writeFileSync(path.join(directory,filename),fileBuffer);
  addCandidate(shotId,`workspace/generated/${filename}`,`${gate.status === "needs_review" ? "待复核 · " : ""}${String(form.get("label")||file.name)}`);
  return NextResponse.json({ ...getStudioData(Number(form.get("projectId"))||undefined), qualityGate: gate, pixelQa });
}

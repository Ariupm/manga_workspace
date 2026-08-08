import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addCandidate, getAssets, getCharacters, getShotGenerationInput, getStudioData } from "@/lib/db";
import { evaluateCandidateGate } from "@/lib/quality-gate";
import { validateVisualIds } from "@/lib/visual-planning";

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
  const extension=file.type==="image/png"?".png":file.type==="image/webp"?".webp":".jpg";
  const directory=path.join(process.cwd(),"workspace","generated");
  fs.mkdirSync(directory,{recursive:true});
  const filename=`shot-${shotId}-${randomUUID()}${extension}`;
  fs.writeFileSync(path.join(directory,filename),Buffer.from(await file.arrayBuffer()));
  addCandidate(shotId,`workspace/generated/${filename}`,`${gate.status === "needs_review" ? "待复核 · " : ""}${String(form.get("label")||file.name)}`);
  return NextResponse.json({ ...getStudioData(Number(form.get("projectId"))||undefined), qualityGate: gate });
}

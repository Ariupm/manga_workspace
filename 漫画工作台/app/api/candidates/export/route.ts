import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCandidateExport } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const safe = (value: string) =>
  value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 80);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = Number(params.get("projectId"));
  const candidateId = Number(params.get("candidateId"));
  if (!Number.isInteger(projectId) || !Number.isInteger(candidateId))
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  const candidate = getCandidateExport(candidateId, projectId);
  if (!candidate)
    return NextResponse.json(
      { error: "候选不存在或不属于当前作品" },
      { status: 404 },
    );
  const root = process.cwd();
  const file = path.resolve(root, candidate.image_path);
  const generated = path.resolve(root, "workspace", "generated");
  if (!file.startsWith(generated + path.sep) || !fs.existsSync(file))
    return NextResponse.json(
      { error: "候选文件不存在或路径不安全" },
      { status: 404 },
    );
  const extension = path.extname(file) || ".png";
  const filename =
    safe(
      `${candidate.project_title}-${candidate.episode_title}-第${candidate.page_number}页-第${candidate.shot_position}格-V${candidate.version}`,
    ) + extension;
  return new NextResponse(fs.readFileSync(file), {
    headers: {
      "content-type":
        extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : extension === ".webp"
            ? "image/webp"
            : "image/png",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

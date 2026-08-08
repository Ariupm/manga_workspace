import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceRoot = path.resolve(process.cwd(), "..");
const contentTypes: Record<string,string> = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp"};

export async function GET(request: NextRequest) {
  const relative = request.nextUrl.searchParams.get("path") ?? "";
  const target = path.resolve(process.cwd(), relative);
  if (!target.startsWith(workspaceRoot + path.sep) || !fs.existsSync(target)) {
    return NextResponse.json({error:"文件不存在"},{status:404});
  }
  const type = contentTypes[path.extname(target).toLowerCase()];
  if (!type) return NextResponse.json({error:"不支持的文件类型"},{status:415});
  return new NextResponse(fs.readFileSync(target), {headers:{"content-type":type,"cache-control":"private, max-age=60"}});
}

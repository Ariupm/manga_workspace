import { NextResponse } from "next/server";
import { getPaginatedJobs } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = Number(params.get("projectId"));
  if (!Number.isInteger(projectId) || projectId <= 0)
    return NextResponse.json({ error: "无效作品 ID" }, { status: 400 });
  return NextResponse.json(
    getPaginatedJobs(
      projectId,
      Number(params.get("page") || 1),
      Number(params.get("pageSize") || 20),
    ),
  );
}

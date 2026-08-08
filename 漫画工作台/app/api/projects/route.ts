import { NextResponse } from "next/server";
import { createProject, deleteProject, duplicateProject, getProjectManagementData, updateProject } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getProjectManagementData());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "duplicate") {
      const id = duplicateProject(Number(body.projectId));
      return NextResponse.json({ id, ...getProjectManagementData() }, { status: 201 });
    }
    const id = createProject({ title: String(body.title || ""), description: String(body.description || ""), status: body.status });
    return NextResponse.json({ id, ...getProjectManagementData() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建作品失败" }, { status: 422 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    updateProject(Number(body.projectId), body.patch || {});
    return NextResponse.json(getProjectManagementData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新作品失败" }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    if (!body.confirm) return NextResponse.json({ error: "删除作品需要确认" }, { status: 400 });
    deleteProject(Number(body.projectId));
    return NextResponse.json(getProjectManagementData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除作品失败" }, { status: 422 });
  }
}

import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeFilePath = (value: string) => value.replaceAll("\\", "/");

const findEditorRoot = () => {
  const configured = process.env.SD_OPENPOSE_EDITOR_DIR?.trim();
  if (configured) return configured;

  const controlNetModelDir = process.env.SD_CONTROLNET_MODEL_DIR?.trim();
  if (controlNetModelDir) {
    const webuiRoot = path.resolve(controlNetModelDir, "..", "..", "..");
    return path.join(
      webuiRoot,
      "extensions",
      "sd-webui-3d-open-pose-editor",
    );
  }

  return "D:\\stable-diffusion-webui-master\\extensions\\sd-webui-3d-open-pose-editor";
};

export async function GET() {
  const webuiUrl = (process.env.SD_WEBUI_URL || "http://127.0.0.1:7860").replace(
    /\/$/,
    "",
  );

  try {
    const response = await fetch(`${webuiUrl}/sdapi/v1/options`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Stable Diffusion WebUI 返回 ${response.status}，请确认它已使用 --api 启动。`,
        },
        { status: 503 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "无法连接 Stable Diffusion WebUI，请先启动 127.0.0.1:7860。" },
      { status: 503 },
    );
  }

  const editorRoot = findEditorRoot();
  const indexPath = path.join(editorRoot, "pages", "index.html");
  const configPath = path.join(editorRoot, "downloads", "config.json");

  if (existsSync(indexPath) && existsSync(configPath)) {
    const editorAsset = normalizeFilePath(indexPath);
    const configAsset = `/file=${normalizeFilePath(configPath)}`;
    const url = `${webuiUrl}/file=${editorAsset}?config=${encodeURIComponent(configAsset)}`;
    return NextResponse.json({
      available: true,
      url,
      source: "standalone-3d-openpose-editor",
      message: "已打开独立 3D OpenPose Editor。",
    });
  }

  return NextResponse.json({
    available: true,
    url: `${webuiUrl}/?__theme=dark#tab_threedopenpose`,
    source: "webui-tab-fallback",
    message: "未找到独立编辑器文件，已打开 WebUI；请点击“3D Openpose”标签。",
  });
}

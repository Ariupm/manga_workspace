import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  addCharacterReference,
  confirmCharacterAssetCandidate,
  createCharacterAssetJob,
  createCharacter,
  getStudioData,
  updateCharacterOutfitPrompt,
  updateCharacterProfile,
} from "@/lib/db";
import { containsCjk } from "@/lib/prompts";
import { draftCharacterProfile, validateCharacterProfileDraft } from "@/lib/character-profile-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = path.join(process.cwd(), "scripts", "character-profile.schema.json");

function launchAssetWorker(jobId: number) {
  const directory = path.join(process.cwd(), "workspace", "character-jobs");
  fs.mkdirSync(directory, { recursive: true });
  const log = fs.openSync(path.join(directory, `job-${jobId}.log`), "a");
  const worker = spawn(process.execPath, [path.join(process.cwd(), "scripts", "character-asset-worker.mjs"), String(jobId)], {
    cwd: process.cwd(), detached: true, windowsHide: true, stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  worker.unref();
}

function runCodexProfileDraft(name: string, conceptCn: string, notes: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const codexJs = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
    if (!fs.existsSync(codexJs)) return reject(new Error("未找到 Codex CLI，无法草拟人物档案"));
    const directory = path.join(process.cwd(), "workspace", "character-jobs");
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, `profile-${randomUUID()}.json`);
    const prompt = `You are a character design editor. Draft one reusable adult anime comic character profile from the Chinese concept below. Keep the identity visually distinctive and internally consistent. All fields except descriptionCn must be concise English generation-ready phrases. Never make the character a child. Name: ${name}\nChinese concept: ${conceptCn}\nOptional notes: ${notes || "none"}`;
    const child = spawn(process.execPath, [codexJs, "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-schema", profileSchema, "-o", output, "--", prompt], { cwd: directory, windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 180000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(`Codex 人物草拟失败（退出码 ${code}）`);
        const value = JSON.parse(fs.readFileSync(output, "utf8"));
        fs.rmSync(output, { force: true });
        resolve(value);
      } catch (error) { reject(error); }
    });
  });
}

function runCodexOutfitDraft(imagePath: string) {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const codexJs = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
    if (!fs.existsSync(codexJs)) return reject(new Error("未找到 Codex CLI，无法识别服装参考图"));
    const directory = path.join(process.cwd(), "workspace", "character-jobs");
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, `outfit-prompt-${randomUUID()}.json`);
    const prompt = [
      "Analyze only the clothing and visible footwear in the attached reference image for reuse in anime image generation.",
      "Return a concise Chinese summary, a precise English outfit prompt, an English footwear prompt, and English negative constraints.",
      "Describe garment category, color, fabric, neckline, sleeves, waist, silhouette, hem length and styling. Do not describe or copy the photographed person's face, hair, body identity, pose or background.",
      "If footwear is not clearly visible, set baseShoesEn to an empty string. Keep the styling adult and generation-ready."
    ].join("\n");
    const child = spawn(process.execPath, [codexJs, "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-schema", path.join(process.cwd(), "scripts", "outfit-prompt.schema.json"), "-o", output, "-i", imagePath, "--", prompt], { cwd: directory, windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), 180000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(`服装参考图识别失败（退出码 ${code}）`);
        const value = JSON.parse(fs.readFileSync(output, "utf8"));
        fs.rmSync(output, { force: true });
        resolve(value);
      } catch (error) { reject(error); }
    });
  });
}

function validateConfirmedProfile(body: any) {
  const english = [body.appearanceEn, ...(Array.isArray(body.invariantsEn) ? body.invariantsEn : String(body.invariantsEn || "").split(/[,;\n]/)), body.visualTraits?.hairColorEn ?? body.hairColorEn, body.visualTraits?.hairStyleEn ?? body.hairStyleEn, body.visualTraits?.eyeColorEn ?? body.eyeColorEn, ...Object.values(body.profile || {})].map((value) => String(value || "").trim());
  return english.length >= 8 && english.every((value) => value && !containsCjk(value));
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const characterId = String(form.get("characterId") ?? ""),
      type = String(form.get("type") ?? "");
    const projectId = Number(form.get("projectId"));
    if (
      !(file instanceof File) ||
      file.size < 1024 ||
      file.size > 15 * 1024 * 1024
    )
      return NextResponse.json(
        { error: "参考图必须为 1KB–15MB 图片" },
        { status: 422 },
      );
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return NextResponse.json(
        { error: "仅支持 PNG、JPEG 或 WebP" },
        { status: 422 },
      );
    if (String(form.get("action") || "") === "draftOutfitPrompt") {
      if (form.get("provider") !== "codex") return NextResponse.json({ error: "图片服装识别当前为 Codex 备选能力；可直接编辑人物档案中的服装描述。" }, { status: 422 });
      const directory = path.join(process.cwd(), "workspace", "character-jobs", "uploads");
      fs.mkdirSync(directory, { recursive: true });
      const extension = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
      const temporary = path.join(directory, `outfit-reference-${randomUUID()}${extension}`);
      fs.writeFileSync(temporary, Buffer.from(await file.arrayBuffer()));
      try { return NextResponse.json({ draft: await runCodexOutfitDraft(temporary) }); }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 }); }
      finally { fs.rmSync(temporary, { force: true }); }
    }
    const directory = path.join(
      process.cwd(),
      "workspace",
      "assets",
      "characters",
      characterId,
    );
    fs.mkdirSync(directory, { recursive: true });
    const extension =
      file.type === "image/png"
        ? ".png"
        : file.type === "image/webp"
          ? ".webp"
          : ".jpg";
    const relative = `workspace/assets/characters/${characterId}/${type}-${randomUUID()}${extension}`;
    fs.writeFileSync(
      path.join(process.cwd(), relative),
      Buffer.from(await file.arrayBuffer()),
    );
    if (!addCharacterReference(characterId, type, relative)) {
      fs.rmSync(path.join(process.cwd(), relative), { force: true });
      return NextResponse.json(
        { error: "人物或参考类型无效" },
        { status: 404 },
      );
    }
    return NextResponse.json(getStudioData(projectId || undefined));
  }
  const body = await request.json();
  const action = String(body.action || "create");
  if (action === "draftProfile") {
    const name = String(body.name || "").trim(), conceptCn = String(body.conceptCn || "").trim();
    if (!name || !conceptCn) return NextResponse.json({ error: "请输入人物名称和中文概念" }, { status: 400 });
    try {
      if (body.provider === "codex") return NextResponse.json({ draft: validateCharacterProfileDraft(await runCodexProfileDraft(name, conceptCn, String(body.notes || ""))), provider: "codex" });
      return NextResponse.json(await draftCharacterProfile(name, conceptCn, String(body.notes || "")));
    }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 }); }
  }
  if (action === "updateProfile") {
    if (body.confirm && !validateConfirmedProfile(body)) return NextResponse.json({ error: "确认人物档案前，请补齐所有英文视觉字段且不要包含中文" }, { status: 422 });
    if (!updateCharacterProfile(String(body.characterId), { name: String(body.name || "").trim(), descriptionCn: String(body.descriptionCn || ""), conceptCn: String(body.conceptCn || ""), notes: String(body.notes || ""), appearanceEn: String(body.appearanceEn || ""), invariantsEn: body.invariantsEn || [], visualTraits: body.visualTraits || {}, profile: body.profile || {}, confirm: Boolean(body.confirm) }))
      return NextResponse.json({ error: "人物不存在" }, { status: 404 });
    return NextResponse.json(getStudioData(Number(body.projectId) || undefined));
  }
  if (action === "updateOutfitPrompt") {
    const fields = [body.baseOutfitEn, body.baseShoesEn, body.outfitNegativeEn].map((value) => String(value || "").trim());
    if (!fields[0] || fields.some((value) => value && containsCjk(value))) return NextResponse.json({ error: "服装提示词必须使用英文，基础服装不能为空" }, { status: 422 });
    const characterId = String(body.characterId);
    if (!updateCharacterOutfitPrompt(characterId, { baseOutfitEn: fields[0], baseShoesEn: fields[1], outfitNegativeEn: fields[2] })) return NextResponse.json({ error: "人物不存在" }, { status: 404 });
    let jobId: number | null = null, generationError = "";
    if (body.generate) {
      const queued = createCharacterAssetJob(characterId, "outfit");
      if ("error" in queued) generationError = queued.error || "基础服装任务未能加入队列";
      else { jobId = queued.id; launchAssetWorker(queued.id); }
    }
    return NextResponse.json({ data: getStudioData(Number(body.projectId) || undefined), jobId, generationError });
  }
  if (action === "generateAsset") {
    if (body.provider && !["sd", "codex-imagegen"].includes(body.provider)) return NextResponse.json({error:"不支持的人物资产提供方"},{status:422});
    const result = createCharacterAssetJob(String(body.characterId), String(body.type) as any, body.provider || "sd");
    if ("error" in result) return NextResponse.json(result, { status: 422 });
    launchAssetWorker(result.id);
    return NextResponse.json({ jobId: result.id });
  }
  if (action === "confirmCandidate") {
    const result = confirmCharacterAssetCandidate(String(body.characterId), Number(body.candidateId));
    if ("error" in result) return NextResponse.json(result, { status: 422 });
    return NextResponse.json(getStudioData(Number(body.projectId) || undefined));
  }
  if (action === "refresh") return NextResponse.json(getStudioData(Number(body.projectId) || undefined));
  const name = String(body.name ?? "").trim();
  const appearanceEn = String(body.appearanceEn ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "请输入人物名称" }, { status: 400 });
  if (!appearanceEn || containsCjk(appearanceEn))
    return NextResponse.json(
      { error: "英文视觉设定不能为空且不能包含中文" },
      { status: 422 },
    );
  if (body.confirm && !validateConfirmedProfile(body)) return NextResponse.json({ error: "确认人物档案前，请补齐所有英文视觉字段且不要包含中文" }, { status: 422 });
  const visualTraits = {
    hairColorEn: String(body.hairColorEn ?? "").trim(),
    hairStyleEn: String(body.hairStyleEn ?? "").trim(),
    eyeColorEn: String(body.eyeColorEn ?? "").trim(),
  };
  if (Object.values(visualTraits).some((value) => !value || containsCjk(value)))
    return NextResponse.json(
      { error: "发色、发型和瞳色必须填写英文描述" },
      { status: 422 },
    );
  createCharacter({
    name,
    descriptionCn: String(body.descriptionCn ?? ""),
    appearanceEn,
    invariantsEn: String(body.invariantsEn ?? "")
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean),
    visualTraits,
    conceptCn: String(body.conceptCn || body.descriptionCn || ""),
    notes: String(body.notes || ""),
    profile: body.profile || {},
    profileStatus: body.confirm ? "confirmed" : "draft",
  });
  return NextResponse.json(getStudioData(Number(body.projectId) || undefined));
}

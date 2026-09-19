import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import {
  addCandidate,
  addPageToEpisode,
  addShotToPage,
  addTextLayer,
  approveSdDraft,
  approveSdFinal,
  clearGeneratedReferenceCandidates,
  createPersistentGenerationJob,
  deletePage,
  deleteShot,
  deleteTextLayer,
  duplicateTextLayer,
  getAssets,
  getCharacters,
  getGenerationJobRecord,
  getShotGenerationInput,
  getStudioData,
  moveShot,
  queueCodexPage,
  recordBelongsToProject,
  rejectSdDraft,
  rejectSdFinal,
  retryFailedCodexJob,
  selectCandidate,
  separateRecentStoriesIntoProjects,
  updateEpisodeContent,
  updatePageLayout,
  updateSeriesMemory,
  updateShot,
  updateTextLayer,
  upgradeLatestStoryStructure,
} from "@/lib/db";
import { normalizeSemanticReviewItems, validateSemanticReviewSubmission, type SemanticReviewItem, type SemanticReviewSubmission } from "@/lib/semantic-review";
import {
  buildGenerationPrompt,
  buildRegionalPrompt,
  buildCanonicalGenerationPrompt,
  buildCanonicalNegativePrompt,
  buildCanonicalNegativePromptTrace,
  extractPromptEditorialDiff,
  containsCjk,
  classifyOutfitConditioning,
  deriveInteractionContract,
  expressionPrompt,
  reconcileFinalPrompt,
  validateFinalPrompt,
  resolveCharacterAssetDescription,
  sanitizeEnglishPrompt,
} from "@/lib/prompts";
import { applyPoseControlOverride, type PoseControlV2 } from "@/lib/pose-v2";
import { applyPoseControlOverrideV3 } from "@/lib/pose-v3";
import { normalizeShotSpec, validateVisualIds } from "@/lib/visual-planning";
import {
  createGenerationJob,
  updateGenerationJob,
} from "@/lib/generation-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerationProfile = "cpu_local_fast" | "cpu_local_complex" | "gpu_full";
const generationProfilePlan = (profile: GenerationProfile, characterCount: number) =>
  profile === "gpu_full"
    ? { draftLongEdge: 512, maxTargetEdge: 1024, draftSteps: characterCount > 1 ? 16 : 12, finalSteps: 18 }
    : profile === "cpu_local_complex"
      ? { draftLongEdge: 512, maxTargetEdge: 640, draftSteps: 12, finalSteps: 16 }
      : { draftLongEdge: 448, maxTargetEdge: 640, draftSteps: 10, finalSteps: 14 };

function launchSdWorker(jobId: number) {
  const logDir = path.join(process.cwd(), "workspace", "sd-jobs");
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, `job-${jobId}.log`), "a");
  const worker = spawn(
    process.execPath,
    [path.join(process.cwd(), "scripts", "sd-worker.mjs"), String(jobId)],
    {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
    },
  );
  fs.closeSync(log);
  worker.unref();
}

function postJsonLong(url: string, payload: unknown) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 500,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.setTimeout(4 * 60 * 60 * 1000, () =>
      request.destroy(new Error("SD生成超过4小时，连接已终止")),
    );
    request.on("error", reject);
    request.end(body);
  });
}

export async function GET(request: NextRequest) {
  const projectId = Number(request.nextUrl.searchParams.get("projectId"));
  const episodeId = Number(request.nextUrl.searchParams.get("episodeId"));
  return NextResponse.json(
    getStudioData(
      Number.isFinite(projectId) && projectId > 0 ? projectId : undefined,
      Number.isFinite(episodeId) && episodeId > 0 ? episodeId : undefined,
    ),
  );
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const actions = new Set([
    "updateShot",
    "updateEpisode",
    "addShot",
    "deleteShot",
    "moveShot",
    "addPage",
    "deletePage",
    "selectCandidate",
    "clearEpisodeCandidates",
    "separateRecentStories",
    "upgradeLatestStory",
    "updatePageLayout",
    "addTextLayer",
    "updateTextLayer",
    "deleteTextLayer",
    "duplicateTextLayer",
    "queueCodexPage",
    "retryCodexJob",
    "updateSeriesMemory",
  ]);
  if (!actions.has(body.action))
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0)
    return NextResponse.json({ error: "无效作品 ID" }, { status: 400 });
  const ownership: Array<
    [string, "shot" | "page" | "episode" | "layer" | "candidate" | "job"]
  > = [
    ["shotId", "shot"],
    ["pageId", "page"],
    ["episodeId", "episode"],
    ["layerId", "layer"],
    ["candidateId", "candidate"],
    ["jobId", "job"],
  ];
  for (const [field, kind] of ownership)
    if (
      body[field] !== undefined &&
      (!Number.isInteger(Number(body[field])) ||
        !recordBelongsToProject(kind, Number(body[field]), projectId))
    )
      return NextResponse.json(
        { error: `目标 ${field} 不存在或不属于当前作品` },
        { status: 404 },
      );
  if (
    body.action === "updateShot" &&
    body.patch?.characterIds &&
    (!Array.isArray(body.patch.characterIds) ||
      body.patch.characterIds.length < 1 ||
      body.patch.characterIds.some((id: unknown) => typeof id !== "string"))
  )
    return NextResponse.json({ error: "人物绑定结构无效" }, { status: 422 });
  if (body.action === "updateShot")
    updateShot(Number(body.shotId), body.patch ?? {});
  if (body.action === "updateEpisode")
    updateEpisodeContent(Number(body.episodeId), body.patch ?? {});
  if (body.action === "addShot") addShotToPage(Number(body.pageId));
  if (body.action === "deleteShot") deleteShot(Number(body.shotId));
  if (body.action === "moveShot")
    moveShot(Number(body.shotId), body.direction === -1 ? -1 : 1);
  if (body.action === "addPage") addPageToEpisode(Number(body.episodeId));
  if (body.action === "deletePage") deletePage(Number(body.pageId));
  if (body.action === "selectCandidate")
    selectCandidate(Number(body.shotId), Number(body.candidateId));
  if (body.action === "clearEpisodeCandidates")
    clearGeneratedReferenceCandidates(Number(body.episodeId));
  if (body.action === "separateRecentStories")
    separateRecentStoriesIntoProjects();
  if (body.action === "upgradeLatestStory") upgradeLatestStoryStructure();
  if (body.action === "updatePageLayout")
    updatePageLayout(Number(body.pageId), body.patch ?? {});
  if (body.action === "addTextLayer")
    addTextLayer(
      Number(body.pageId),
      body.type,
      Number(body.shotId) || undefined,
    );
  if (body.action === "updateTextLayer")
    updateTextLayer(Number(body.layerId), body.patch ?? {});
  if (body.action === "deleteTextLayer") deleteTextLayer(Number(body.layerId));
  if (body.action === "duplicateTextLayer")
    duplicateTextLayer(Number(body.layerId));
  if (body.action === "queueCodexPage") queueCodexPage(Number(body.pageId));
  if (
    body.action === "retryCodexJob" &&
    !retryFailedCodexJob(Number(body.projectId), Number(body.jobId))
  )
    return NextResponse.json({ error: "该失败任务不能重试" }, { status: 409 });
  if (
    body.action === "updateSeriesMemory" &&
    !updateSeriesMemory(Number(body.projectId), Number(body.episodeId))
  )
    return NextResponse.json({ error: "章节不属于当前作品" }, { status: 404 });
  return NextResponse.json(
    getStudioData(
      Number(body.projectId) || undefined,
      Number(body.episodeId) || undefined,
    ),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  if (
    !["generate", "generateDraft", "approveDraft", "rejectDraft", "approveFinal", "rejectFinal"].includes(
      body.action,
    )
  )
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0)
    return NextResponse.json({ error: "无效作品 ID" }, { status: 400 });
  if (["approveDraft", "rejectDraft", "approveFinal", "rejectFinal"].includes(body.action)) {
    const jobId = Number(body.jobId);
    if (
      !Number.isInteger(jobId) ||
      !recordBelongsToProject("job", jobId, projectId)
    )
      return NextResponse.json(
        { error: "图片审核任务不存在或不属于当前作品" },
        { status: 404 },
      );
    if (body.action === "rejectDraft") {
      if (!rejectSdDraft(projectId, jobId))
        return NextResponse.json(
          { error: "该任务不在等待草稿确认状态" },
          { status: 409 },
        );
      return NextResponse.json({ ok: true, data: getStudioData(projectId) });
    }
    if (body.action === "rejectFinal") {
      if (!rejectSdFinal(projectId, jobId))
        return NextResponse.json({ error: "该任务不在等待最终图片复核状态" }, { status: 409 });
      return NextResponse.json({ ok: true, data: getStudioData(projectId) });
    }
    const approvalJob = getGenerationJobRecord(jobId);
    let semanticItems: SemanticReviewItem[] = [];
    try {
      semanticItems = normalizeSemanticReviewItems(JSON.parse(approvalJob?.payload || "{}").recipe?.semanticQa);
    } catch {}
    const semanticValidation = validateSemanticReviewSubmission(semanticItems, body.semanticReview);
    if (!semanticValidation.valid)
      return NextResponse.json(
        { error: semanticValidation.errors.join("；"), code: "SEMANTIC_REVIEW_INCOMPLETE", reviewItems: semanticItems },
        { status: 422 },
      );
    if (body.action === "approveFinal") {
      const approvedFinal = approveSdFinal(projectId, jobId, body.semanticReview as SemanticReviewSubmission | undefined);
      if (!approvedFinal)
        return NextResponse.json({ error: "最终图片、图片哈希或逐项复核结果无效" }, { status: 409 });
      return NextResponse.json({ ok: true, candidateId: approvedFinal.id, data: getStudioData(projectId) });
    }
    const approved = approveSdDraft(projectId, jobId, body.semanticReview as SemanticReviewSubmission | undefined);
    if (!approved)
      return NextResponse.json(
        { error: "草稿尚未完成或缺少草稿图片" },
        { status: 409 },
      );
    launchSdWorker(jobId);
    return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
  }
  const provider = process.env.IMAGE_PROVIDER;
  if (provider !== "sd-webui")
    return NextResponse.json(
      {
        error:
          "尚未配置图片生成服务。请在 .env.local 设置 IMAGE_PROVIDER=sd-webui 和 SD_WEBUI_URL；也可以先复制提示词到其他生成工具。",
        code: "IMAGE_PROVIDER_REQUIRED",
      },
      { status: 409 },
    );
  const requestedShotId = Number(body.shotId);
  if (!Number.isInteger(requestedShotId) || !recordBelongsToProject("shot", requestedShotId, projectId))
    return NextResponse.json(
      { error: "生成分格不存在或不属于当前作品", code: "SHOT_PROJECT_MISMATCH" },
      { status: 404 },
    );
  let shot = getShotGenerationInput(requestedShotId);
  if (shot.locked)
    return NextResponse.json(
      { error: "该分格已锁定，请先解锁后再生成。", code: "SHOT_LOCKED" },
      { status: 409 },
    );
  const assets = getAssets();
  const characters = getCharacters();
  let visualMigrationTrace: { applied: boolean; fromVersion: number; toVersion: string; warnings: string[] } | null = null;
  if (shot.visualSpecConfirmed) {
    const before = shot.visualSpec;
    const fromVersion = shot.visualSpecVersion || 0;
    const normalized = normalizeShotSpec(before || {}, shot);
    const validation = validateVisualIds(normalized, characters, assets);
    if (validation.errors.length)
      return NextResponse.json({ error: `已确认视觉规格无法通过当前契约校验：${validation.errors.join("；")}`, code: "VISUAL_SPEC_REQUIRES_RECONFIRMATION", validation }, { status: 422 });
    shot = { ...shot, visualSpec: normalized, visualSpecVersion: 1 };
    visualMigrationTrace = { applied: JSON.stringify(before) !== JSON.stringify(normalized), fromVersion, toVersion: normalized.schemaVersion, warnings: validation.warnings };
  }
  const compiled = buildGenerationPrompt(shot, assets, characters);
  const configuredProfile = String(body.generationProfile || process.env.SD_GENERATION_PROFILE || "cpu_local_fast");
  const requestedProfile: GenerationProfile = ["cpu_local_fast", "cpu_local_complex", "gpu_full"].includes(configuredProfile)
    ? configuredProfile as GenerationProfile
    : "cpu_local_fast";
  let generationProfile: GenerationProfile = requestedProfile === "cpu_local_fast" && shot.characterIds.length > 1
    ? "cpu_local_complex"
    : requestedProfile;
  let profilePlan = generationProfilePlan(generationProfile, shot.characterIds.length);
  let targetWidth = Number(body.width || shot.generationWidth || 512);
  let targetHeight = Number(body.height || shot.generationHeight || 512);
  if (shot.characterIds.length === 1 && targetWidth === 512 && targetHeight === 512 && /远景|全景/.test(shot.camera)) targetHeight = 768;
  const ratio = targetWidth / targetHeight;
  if (
    !Number.isInteger(targetWidth) ||
    !Number.isInteger(targetHeight) ||
    targetWidth < 384 ||
    targetWidth > 1024 ||
    targetHeight < 384 ||
    targetHeight > 1024 ||
    targetWidth % 64 !== 0 ||
    targetHeight % 64 !== 0 ||
    ratio < 2 / 3 ||
    ratio > 3 / 2
  )
    return NextResponse.json(
      {
        error: "生成尺寸必须为 384–1024 之间的 64 倍数，宽高比限于 2:3–3:2",
        code: "INVALID_IMAGE_SIZE",
      },
      { status: 422 },
    );
  if (Math.max(targetWidth, targetHeight) > profilePlan.maxTargetEdge)
    return NextResponse.json(
      {
        error: `${generationProfile} 档位的最长边上限为 ${profilePlan.maxTargetEdge}px；纯 CPU 模式请降低尺寸，或显式切换 gpu_full。`,
        code: "GENERATION_PROFILE_SIZE_LIMIT",
        generationProfile,
        maxTargetEdge: profilePlan.maxTargetEdge,
      },
      { status: 422 },
    );
  // 384px drafts leave only ~35-50px for a face in full-body shots. Keep all
  // character drafts at 512 so the approval image is useful for identity QA.
  let draftLongEdge = profilePlan.draftLongEdge;
  let draftScale = draftLongEdge / Math.max(targetWidth, targetHeight);
  let draftWidth = Math.max(
    256,
    Math.round((targetWidth * draftScale) / 64) * 64,
  );
  let draftHeight = Math.max(
    256,
    Math.round((targetHeight * draftScale) / 64) * 64,
  );
  const expectedFaceWidth = Math.round(
    Math.min(targetWidth, targetHeight) *
      (shot.characterIds.length > 1 ? 0.13 : /特写|近景/.test(shot.camera) ? 0.24 : /中景/.test(shot.camera) ? 0.18 : 0.11),
  );
  if (expectedFaceWidth < 48 && body.force !== true)
    return NextResponse.json(
      {
        error: `当前尺寸和景别预计人脸宽度仅约 ${expectedFaceWidth}px，低于可用下限 48px。请提高输出尺寸或拉近景别；纯环境镜头可选择忽略风险继续。`,
        code: "FACE_RESOLUTION_TOO_LOW",
        quality: { expectedFaceWidthPx: expectedFaceWidth, minimumFaceWidthPx: 48 },
      },
      { status: 422 },
    );
  let prompt =
    typeof body.promptOverride === "string" && body.promptOverride.trim()
      ? body.promptOverride.trim()
      : compiled.prompt;
  const negative =
    typeof body.negativePromptOverride === "string" &&
    body.negativePromptOverride.trim()
      ? body.negativePromptOverride.trim()
      : compiled.negativePrompt;
  const quality = compiled.quality;
  const readContracts = shot.characterIds
    .map((id) => deriveInteractionContract(shot, id))
    .filter((contract) => contract.object === "smartphone" && contract.purpose === "read");
  const promptRepairs: string[] = [];
  for (const contract of readContracts) {
    const reconciled = reconcileFinalPrompt(prompt, contract);
    prompt = reconciled.prompt;
    promptRepairs.push(...reconciled.repairs);
  }
  const promptContractErrors = readContracts.flatMap((contract) =>
    validateFinalPrompt(prompt, contract).errors,
  );
  if (promptContractErrors.length)
    return NextResponse.json(
      {
        error: `最终提示词与结构化动作契约冲突：${[...new Set(promptContractErrors)].join("；")}`,
        code: "PROMPT_ACTION_CONTRACT_CONFLICT",
        validation: { valid: false, errors: [...new Set(promptContractErrors)] },
      },
      { status: 422 },
    );
  if (quality.blockingErrors.length)
    return NextResponse.json(
      {
        error: `人物绑定检查失败：${quality.blockingErrors.join("；")}。请先在“人物造型”中补齐出场人物。`,
        code: "CHARACTER_BINDING_REQUIRED",
        quality,
      },
      { status: 422 },
    );
  if (!quality.valid && body.force !== true)
    return NextResponse.json(
      {
        error: `提示词质量检查发现风险：${quality.errors.join("；")}。可自动修正、编辑后生成，或明确忽略建议。`,
        code: "PROMPT_QUALITY_FAILED",
        quality,
      },
      { status: 422 },
    );
  if (containsCjk(prompt) || containsCjk(negative))
    return NextResponse.json(
      {
        error:
          "英文提示词校验失败：生成字段中仍包含中文，请先完成英文视觉描述。",
        code: "PROMPT_NOT_ENGLISH",
      },
      { status: 422 },
    );
  try {
    const base = (process.env.SD_WEBUI_URL || "http://127.0.0.1:7860").replace(
      /\/$/,
      "",
    );
    const progress = (await fetch(
      `${base}/sdapi/v1/progress?skip_current_image=true`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    ).then((r) => (r.ok ? r.json() : null))) as {
      state?: { job?: string };
    } | null;
    if (progress?.state?.job)
      return NextResponse.json(
        {
          error: "SD WebUI 正在处理其他任务，请等待当前任务完成后再生成。",
          code: "SD_BUSY",
        },
        { status: 409 },
      );
    const options = (await fetch(`${base}/sdapi/v1/options`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    }).then((r) => (r.ok ? r.json() : {}))) as Record<string, unknown>;
    const sdScripts = (await fetch(`${base}/sdapi/v1/scripts`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))) as { txt2img?: string[]; img2img?: string[] };
    const regionalPrompterAvailable = [
      ...(sdScripts.txt2img || []),
      ...(sdScripts.img2img || []),
    ].some((name) => name.toLowerCase() === "regional prompter");
    const controlModels = (await fetch(`${base}/controlnet/model_list`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { model_list?: string[] } | null;
    const modelDirectory =
      process.env.SD_CONTROLNET_MODEL_DIR ||
      "D:\\stable-diffusion-webui-master\\extensions\\sd-webui-controlnet\\models";
    const clipVisionPath = path.resolve(
      modelDirectory,
      "..",
      "annotator",
      "downloads",
      "clip_vision",
      "clip_h.pth",
    );
    const clipVisionHealthy =
      fs.existsSync(clipVisionPath) && fs.statSync(clipVisionPath).size > 2_000_000_000;
    if (!clipVisionHealthy)
      return NextResponse.json(
        {
          error: "IP-Adapter 的 CLIP-H 视觉编码器缺失或下载不完整。请完成 clip_h.pth 下载并重启 SD WebUI 后再生成，避免角色资产控制被静默跳过。",
          code: "CLIP_VISION_INVALID",
        },
        { status: 503 },
      );
    const resolveAdapter = (filename: string, modelPrefix: string) => {
      const localPath = path.join(modelDirectory, filename);
      const validFile =
        fs.existsSync(localPath) && fs.statSync(localPath).size > 1024 * 1024;
      const model = controlModels?.model_list?.find((name) =>
        name.startsWith(modelPrefix),
      );
      return validFile && model
        ? { module: "ip-adapter_clip_h", model, validFile: true }
        : { module: "reference_only", model: "None", validFile: false };
    };
    const faceAdapter = resolveAdapter(
      "ip-adapter-plus-face_sd15.safetensors",
      "ip-adapter-plus-face_sd15",
    );
    const outfitAdapter = resolveAdapter(
      "ip-adapter-plus_sd15.safetensors",
      "ip-adapter-plus_sd15",
    );
    const openPoseCandidates = [
      {
        filename: "control_v11p_sd15_openpose.pth",
        prefix: "control_v11p_sd15_openpose",
      },
      {
        filename: "control_sd15_openpose.pth",
        prefix: "control_sd15_openpose",
      },
    ];
    const resolvedOpenPose = openPoseCandidates.find(({ filename, prefix }) => {
      const localPath = path.join(modelDirectory, filename);
      const validFile =
        fs.existsSync(localPath) && fs.statSync(localPath).size > 1024 * 1024;
      return (
        validFile &&
        controlModels?.model_list?.some((name) => name.startsWith(prefix))
      );
    });
    const openPoseModel = resolvedOpenPose
      ? controlModels?.model_list?.find((name) =>
          name.startsWith(resolvedOpenPose.prefix),
        )
      : undefined;
    const cannyModel = controlModels?.model_list?.find((name) =>
      name.startsWith("control_sd15_canny"),
    );
    const handRefinerModel = controlModels?.model_list?.find((name) =>
      name.startsWith("control_sd15_inpaint_depth_hand_fp16"),
    );
    const handRefinerDependencyDirectory = path.resolve(modelDirectory, "..", "annotator", "downloads", "hand_refiner", "hr16", "ControlNet-HandRefiner-pruned");
    const handRefinerRequiredFiles = [
      [path.join(modelDirectory, "control_sd15_inpaint_depth_hand_fp16.safetensors"), 722601104],
      [path.join(handRefinerDependencyDirectory, "graphormer_hand_state_dict.bin"), 855658184],
      [path.join(handRefinerDependencyDirectory, "hrnetv2_w64_imagenet_pretrained.pth"), 513111608],
    ] as const;
    const handRefinerAvailable = Boolean(handRefinerModel) && handRefinerRequiredFiles.every(
      ([filePath, expectedBytes]) => fs.existsSync(filePath) && fs.statSync(filePath).size === expectedBytes,
    );
    const openPoseAvailable = Boolean(openPoseModel);
    const regionalSpec = buildRegionalPrompt(shot, assets, characters, { posePlannerVersion: "3.0" });
    const requiredPropInteractions = regionalSpec.repairPasses?.propInteractions || (regionalSpec.repairPasses?.propInteraction ? [regionalSpec.repairPasses.propInteraction] : []);
    if (generationProfile === "cpu_local_fast" && requiredPropInteractions.some((item) => item?.required !== false)) {
      generationProfile = "cpu_local_complex";
      profilePlan = generationProfilePlan(generationProfile, shot.characterIds.length);
      draftLongEdge = profilePlan.draftLongEdge;
      draftScale = draftLongEdge / Math.max(targetWidth, targetHeight);
      draftWidth = Math.max(256, Math.round((targetWidth * draftScale) / 64) * 64);
      draftHeight = Math.max(256, Math.round((targetHeight * draftScale) / 64) * 64);
    }
    if (shot.characterIds.length > 1 && !regionalPrompterAvailable)
      return NextResponse.json(
        {
          error: "多人镜头需要 Regional Prompter 提供真实分区控制；CPU 模式不会把 BREAK 文本伪装成区域控制。请安装并启用插件，或改为逐人物局部生成。",
          code: "REGIONAL_PROMPTER_REQUIRED",
        },
        { status: 503 },
      );
    const cfgScale = Number(process.env.SD_CFG_SCALE || 6.5);
    const seed = Number(body.seed ?? process.env.SD_SEED ?? -1);
    const identities = shot.characterIds.map((characterId, index) => {
      const character = characters.find((item) => item.id === characterId);
      const face = character?.references.find(
        (reference) => reference.type === "face" && reference.confirmed,
      );
      return face && character
        ? {
            role: "identity",
            characterId: character.id,
            assetId: character.id,
            name: `${character.name} SD正脸`,
            path: face.path,
            module: faceAdapter.module,
            model: faceAdapter.model,
            weight: shot.characterIds.length > 1 ? 0.9 : 0.8,
            region:
              shot.characterIds.length > 1
                ? regionalSpec.characterRegions[index]?.region || {
                    xStart: index / shot.characterIds.length,
                    xEnd: (index + 1) / shot.characterIds.length,
                  }
                : null,
            characterPrompt: [
              "masterpiece, best quality, anime illustration",
              "1girl, solo, one adult woman",
              character.appearanceEn,
              ...(character.invariantsEn || []),
              character.profile?.faceShapeEn,
              character.profile?.skinToneEn,
              character.profile?.bodyTypeEn,
              character.profile?.distinguishingFeaturesEn,
              compiled.characterLooks[character.id]?.hairStyleEn,
              compiled.characterLooks[character.id]?.hairColorEn,
              compiled.characterLooks[character.id]?.eyeColorEn,
              resolveCharacterAssetDescription(assets.find(
                (asset) =>
                  asset.id === compiled.characterLooks[character.id]?.outfitId &&
                  asset.characterId === character.id,
              ), character.profile?.baseOutfitEn),
              resolveCharacterAssetDescription(assets.find(
                (asset) =>
                  asset.id === compiled.characterLooks[character.id]?.shoeId &&
                  asset.characterId === character.id,
              ), character.profile?.baseShoesEn),
              compiled.characterLooks[character.id]?.actionEn,
              expressionPrompt(compiled.characterLooks[character.id]?.expressionEn || ""),
              compiled.characterLooks[character.id]?.gazeEn,
              "same established facial identity, symmetrical readable eyes, defined nose and lips",
              "soft frontal fill light on the face, both eyes fully visible, face unobstructed by hair or props",
            ]
              .filter(Boolean)
              .join(", "),
          }
        : null;
    });
    if (identities.some((identity) => !identity))
      return NextResponse.json(
        {
          error:
            "出场人物缺少已确认的 SD 正脸身份参考，请先在角色资产中上传标准正脸。",
          code: "FACE_REFERENCE_REQUIRED",
        },
        { status: 422 },
      );
    const outfits = Object.entries(compiled.characterLooks)
      .map(([characterId, look], index) => {
        const asset = assets.find(
          (asset) =>
            asset.id === look.outfitId &&
            asset.characterId === characterId &&
            asset.confirmed,
        );
        return asset
          ? {
              asset,
              characterId,
              region:
                shot.characterIds.length > 1
                  ? regionalSpec.characterRegions[shot.characterIds.indexOf(characterId)]?.region || {
                      xStart: index / shot.characterIds.length,
                      xEnd: (index + 1) / shot.characterIds.length,
                    }
                  : null,
            }
          : null;
      })
      .filter(Boolean);
    const outfitPlans = outfits.map((entry) => {
      const isolated = entry!.asset.tags.some((tag) => /isolated[-_ ]garment|去人脸服装参考|纯服装参考/i.test(tag));
      const baseDecision = classifyOutfitConditioning(shot.cameraEn || shot.camera, isolated, outfitAdapter.validFile);
      return {
        entry: entry!,
        isolated,
        decision: generationProfile === "gpu_full"
          ? baseDecision
          : { status: "text_only" as const, safety: "cpu_profile_text_only" as const, controlApplied: false },
      };
    });
    const outfitReferences = outfitPlans
      .filter(({ entry, decision }) => outfitAdapter.validFile && fs.existsSync(path.resolve(process.cwd(), entry.asset.path)) && (decision.controlApplied || generationProfile !== "gpu_full"))
      .map(({ entry, isolated, decision }) => ({
      role: "outfit",
      characterId: entry.characterId,
      assetId: entry.asset.id,
      name: entry.asset.name,
      path: entry.asset.path,
      module: outfitAdapter.module,
      model: outfitAdapter.model,
      weight: shot.characterIds.length > 1 ? 0.48 : 0.42,
      region: entry!.region,
      stagedOnly: generationProfile !== "gpu_full" || !decision.controlApplied,
      isolatedGarmentReference: isolated,
      outfitPrompt: resolveCharacterAssetDescription(entry.asset, characters.find((character) => character.id === entry.characterId)?.profile?.baseOutfitEn) || entry.asset.name,
    }));
    const identityReferences = identities.filter(Boolean);
    const references = [...identityReferences, ...outfitReferences];
    const finalReferences = [
      ...identityReferences.map((reference) => ({
        ...reference,
        weight: shot.characterIds.length > 1 ? 0.92 : 0.85,
      })),
      ...outfitReferences.map((reference) => ({
        ...reference,
        weight: shot.characterIds.length > 1 ? 0.52 : 0.46,
      })),
    ].filter(Boolean);
    const regionalOverride = body.regionalPromptOverride as
      | { commonPrompt?: string; characterPrompts?: string[] }
      | undefined;
    let regionalCommonPrompt = sanitizeEnglishPrompt(regionalOverride?.commonPrompt?.trim() || regionalSpec.commonPrompt);
    let regionalCharacterPrompts =
      Array.isArray(regionalOverride?.characterPrompts) &&
      regionalOverride!.characterPrompts!.length === regionalSpec.regionPrompts.length
        ? regionalOverride!.characterPrompts!.map((value) => sanitizeEnglishPrompt(String(value).trim()))
        : regionalSpec.regionPrompts;
    for (const contract of readContracts) {
      if (shot.characterIds.length > 1) {
        const commonReconciled = reconcileFinalPrompt(regionalCommonPrompt, contract);
        regionalCommonPrompt = commonReconciled.prompt;
        promptRepairs.push(...commonReconciled.repairs.map((item) => `regional common: ${item}`));
      }
      const regionIndex = shot.characterIds.indexOf(contract.characterId);
      if (regionIndex >= 0 && regionalCharacterPrompts[regionIndex]) {
        const characterReconciled = reconcileFinalPrompt(regionalCharacterPrompts[regionIndex], contract);
        regionalCharacterPrompts[regionIndex] = characterReconciled.prompt;
        promptRepairs.push(...characterReconciled.repairs.map((item) => `regional character ${contract.characterId}: ${item}`));
      }
    }
    const regionalCombinedPrompt = [regionalCommonPrompt, ...regionalCharacterPrompts].join(" BREAK ");
    const regionalContractErrors = readContracts.flatMap((contract) =>
      validateFinalPrompt(regionalCombinedPrompt, contract).errors,
    );
    if (regionalContractErrors.length)
      return NextResponse.json(
        {
          error: `Regional 最终提示词与结构化动作契约冲突：${[...new Set(regionalContractErrors)].join("；")}`,
          code: "REGIONAL_PROMPT_ACTION_CONTRACT_CONFLICT",
          validation: { valid: false, errors: [...new Set(regionalContractErrors)] },
        },
        { status: 422 },
      );
    if (containsCjk(regionalCombinedPrompt))
      return NextResponse.json(
        { error: "Regional 分区提示词必须全部为英文。", code: "REGIONAL_PROMPT_NOT_ENGLISH" },
        { status: 422 },
      );
    const rawPromptOverride = typeof body.promptOverride === "string" && body.promptOverride.trim()
      ? body.promptOverride.trim()
      : "";
    const requestedPromptOverride = rawPromptOverride && rawPromptOverride.trim() !== compiled.prompt.trim()
      ? extractPromptEditorialDiff(compiled.prompt, rawPromptOverride)
      : "";
    const canonicalPrompt = buildCanonicalGenerationPrompt(
      shot,
      regionalCombinedPrompt,
      requestedPromptOverride,
      quality.characterCount,
    );
    promptRepairs.push(...canonicalPrompt.repairs);
    if (!canonicalPrompt.validation.valid)
      return NextResponse.json(
        {
          error: `最终提示词缺少结构化生成契约：${canonicalPrompt.validation.errors.join("；")}`,
          code: "PROMPT_INVARIANT_CONFLICT",
          validation: canonicalPrompt.validation,
        },
        { status: 422 },
      );
    const appliedPrompt = canonicalPrompt.prompt;
    const regionalPrompter =
      shot.characterIds.length > 1 && regionalPrompterAvailable
        ? {
            enabled: true,
            mode: "Matrix",
            orientation: "Horizontal",
            ratios: regionalSpec.characterRegions.map((region) => Math.max(0.05, region.region.xEnd-region.region.xStart).toFixed(2)).join(","),
            baseRatio: "0.35",
            useCommon: true,
            commonPrompt: regionalCommonPrompt,
            characterPrompts: regionalCharacterPrompts,
            prompt: appliedPrompt,
          }
        : null;
    const rawNegativeOverride = typeof body.negativePromptOverride === "string" && body.negativePromptOverride.trim()
      ? body.negativePromptOverride.trim()
      : "";
    const requestedNegativeOverride = rawNegativeOverride
      ? extractPromptEditorialDiff(compiled.negativePrompt, rawNegativeOverride)
      : "";
    const negativePromptTrace = buildCanonicalNegativePromptTrace(
      shot,
      regionalSpec.negativePrompt || negative,
      requestedNegativeOverride,
    );
    if (negativePromptTrace.droppedTerms.length) {
      return NextResponse.json(
        { error: "负向编辑超过安全词项上限，未静默丢弃尾部内容。请减少负向编辑后重试。", code: "NEGATIVE_PROMPT_OVERRIDE_TOO_LONG", droppedTerms: negativePromptTrace.droppedTerms },
        { status: 422 },
      );
    }
    const effectiveNegativePrompt = negativePromptTrace.prompt;
    const negativeOverrideAccepted = Boolean(requestedNegativeOverride);
    const poseOverride =
      typeof body.poseImageOverride === "string" && body.poseImageOverride.trim()
        ? body.poseImageOverride.trim().replace(/^data:image\/[^;]+;base64,/, "")
        : "";
    const automaticPoseControl = regionalSpec.poseControl;
    const resolvedPoseControl = automaticPoseControl && "posePlanVersion" in automaticPoseControl
      ? automaticPoseControl.posePlanVersion === "3.0"
        ? applyPoseControlOverrideV3(automaticPoseControl, body.poseControlOverride)
        : applyPoseControlOverride(automaticPoseControl as PoseControlV2, body.poseControlOverride)
      : automaticPoseControl;
    if (resolvedPoseControl && "posePlanVersion" in resolvedPoseControl && resolvedPoseControl.posePlanVersion === "3.0" && !resolvedPoseControl.safety.valid) {
      return NextResponse.json(
        { error: "V3 动作证据、接触或投影校验失败，已阻止生成。", code: "POSE_V3_CONTROL_CONFLICT", status: resolvedPoseControl.scenePlan.status, errors: resolvedPoseControl.safety.errors, warnings: resolvedPoseControl.safety.warnings },
        { status: 422 },
      );
    }
    if (body.poseControlOverride && resolvedPoseControl && "safety" in resolvedPoseControl && !resolvedPoseControl.safety.valid) {
      return NextResponse.json(
        { error: "人工姿态覆盖与剧情支持面冲突，已阻止生成。", code: "POSE_OVERRIDE_SUPPORT_CONFLICT", errors: resolvedPoseControl.safety.errors, warnings: resolvedPoseControl.scenePlan?.warnings || [] },
        { status: 422 },
      );
    }
    const hasStructuredPoseOverride = Boolean(
      resolvedPoseControl && "override" in resolvedPoseControl && resolvedPoseControl.override,
    );
    const poseControl =
      resolvedPoseControl && openPoseAvailable
        ? {
            ...resolvedPoseControl,
            enabled: true,
            model: openPoseModel,
            module: "none",
            weight: "controlProfile" in resolvedPoseControl ? resolvedPoseControl.controlProfile.weight : 0.9,
            guidanceStart: "controlProfile" in resolvedPoseControl ? resolvedPoseControl.controlProfile.guidanceStart : 0,
            guidanceEnd: "controlProfile" in resolvedPoseControl ? resolvedPoseControl.controlProfile.guidanceEnd : 0.82,
            source: poseOverride || hasStructuredPoseOverride ? "user_override" : resolvedPoseControl.source || "automatic_template",
            image: poseOverride || null,
            cannyModel: cannyModel || null,
          }
        : null;
    const recipe = {
      provider: "sd-webui",
      phase: "draft",
      generationProfile,
      profilePlan,
      endpoint: `${base}/sdapi/v1/txt2img`,
      model: String(options.sd_model_checkpoint || "未知"),
      vae: String(options.sd_vae || "Automatic"),
      clipSkip: Number(options.CLIP_stop_at_last_layers || 1),
      sampler: "DPM++ 2M",
      scheduler: "Karras",
      steps: profilePlan.draftSteps,
      cfgScale: 5.5,
      width: draftWidth,
      height: draftHeight,
      targetWidth,
      targetHeight,
      seed,
      batchSize: 1,
      prompt: appliedPrompt,
      negativePrompt: effectiveNegativePrompt,
      references,
      regionalPrompter,
      generationSpec: {
      compilerVersion: "sd15-staged-identity-v2",
        visualSpec: shot.visualSpecConfirmed ? shot.visualSpec : null,
        reviewInputs: {
          source: shot.visualSpecConfirmed ? "confirmed_visual_spec" : "compiled_execution_contract",
          characterCount: quality.characterCount,
          shotSize: shot.visualSpecConfirmed ? shot.visualSpec?.camera?.shotSize : (shot.cameraEn || shot.camera || "medium shot"),
          characters: shot.characterIds.map((characterId) => ({
            characterId,
            expression: compiled.characterLooks[characterId]?.expressionEn || "",
            gazeTarget: compiled.characterLooks[characterId]?.gazeEn || "",
            hands: compiled.characterLooks[characterId]?.handsEn || "",
          })),
        },
        visualSpecMigration: visualMigrationTrace,
        visualSpecVersion: shot.visualSpecVersion,
        commonPrompt: regionalCommonPrompt,
        appliedPrompt,
        promptOverride: requestedPromptOverride
          ? {
              requested: requestedPromptOverride,
              appliedAsEditorialLayer: canonicalPrompt.overrideApplied,
              repairs: canonicalPrompt.repairs,
            }
          : null,
        negativePromptOverride: negativeOverrideAccepted
          ? { requested: negativePromptTrace.requested, applied: negativePromptTrace.applied, accepted: negativePromptTrace.accepted, droppedTerms: negativePromptTrace.droppedTerms, baseline: compiled.negativePrompt }
          : null,
        characterRegions: regionalSpec.characterRegions.map((region, index) => ({
          ...region,
          prompt: regionalCharacterPrompts[index],
        })),
        negativeBlocks: regionalSpec.negativeBlocks,
        assetBindings: regionalSpec.assetBindings,
        assetWarnings: regionalSpec.assetWarnings,
        poseControl,
        structureControl: { cannyModel: cannyModel || null, depth: { enabled: false, status: "unavailable_manual_required" } },
        repairPasses: regionalSpec.repairPasses,
        riskProfile: regionalSpec.repairPasses?.risk || null,
        qualityGate: {
          expectedFaceWidthPx: expectedFaceWidth,
          minimumReadableFaceWidthPx: 64,
          preferredExpressionFaceWidthPx: 96,
          requiresFaceRefinement: true,
          warnings: [
            ...([...new Set(promptRepairs)].length ? [`服务端已按动作契约自动修复最终提示词：${[...new Set(promptRepairs)].join("；")}`] : []),
            ...regionalSpec.assetWarnings,
            ...(shot.characterIds.length > 2 && regionalSpec.repairPasses?.risk?.poseRequired
              ? ["三人以上镜头不自动套用双人骨架，必须使用人工 OpenPose 编辑或上传姿势图"]
              : []),
            ...((resolvedPoseControl && "scenePlan" in resolvedPoseControl)
              ? resolvedPoseControl.scenePlan.warnings
              : []),
            ...outfitPlans
              .filter((plan) => !plan.isolated)
              .map((plan) => `${plan.entry.asset.name} 不是去人脸纯服装参考，本次仅使用其结构化文字，避免身份和构图污染`),
            ...(outfits.length && !outfitReferences.length ? ["服装参考未进入 ControlNet：当前镜头仅使用服装文字，必须人工复核服装一致性"] : []),
            ...(/雨|rain|umbrella|伞/i.test(`${shot.scene} ${shot.description}`)
              ? ["雨伞、刘海和逆光可能遮挡面部；已启用面部补光与局部身份精修"]
              : []),
          ],
          outfitConditioning: outfitPlans.map((plan) => ({
            characterId: plan.entry.characterId,
            assetId: plan.entry.asset.id,
            selected: true,
            ...plan.decision,
          })),
        },
      },
      poseControl,
      identityRefinement: {
        enabled: true,
        scope: "face_only_high_resolution",
        draftDenoisingStrength: 0.38,
        finalDenoisingStrength: 0.32,
        maskExpansion: 0.3,
        inpaintPadding: 48,
        processWidth: 512,
        processHeight: 512,
      },
      handRefinement: {
        enabled: handRefinerAvailable && requiredPropInteractions.some((item) => item?.required !== false && item?.handMode),
        module: "depth_hand_refiner",
        model: handRefinerAvailable ? handRefinerModel : null,
        weight: 0.58,
        dependencyStatus: handRefinerAvailable ? "ready" : "unavailable",
      },
      promptSource:
        (requestedPromptOverride || negativeOverrideAccepted)
          ? (typeof body.promptMode === "string" ? body.promptMode : "manual_override")
          : "structured",
      finalReferences,
      characterCount: quality.characterCount,
      promptQuality: quality,
      environment: compiled.environment,
      characterLooks: compiled.characterLooks,
      adapterStatus: {
        identity: faceAdapter.validFile
          ? "ip-adapter-plus-face_sd15"
          : "reference_only",
        outfit: outfitReferences.length && outfitAdapter.validFile
          ? "ip-adapter-plus_sd15"
          : outfits.length
            ? "text_only_manual_review"
            : "not_selected",
        pose: openPoseModel || "unavailable",
        depth: "unavailable_manual_required",
        hands: handRefinerAvailable ? "depth_hand_refiner" : "manual_review_required",
        fallbackReason:
          faceAdapter.validFile && outfitAdapter.validFile && (!regionalSpec.poseControl || openPoseAvailable)
            ? null
            : "IP-Adapter 或 OpenPose ControlNet 模型不可用",
      },
      automaticVisualGate: {
        enabled: requiredPropInteractions.length > 0,
        method: "sd_webui_clip_interrogate",
        maxAttempts: 2,
        requiredPropInteractions,
      },
    };
    const persistentJobId = createPersistentGenerationJob(
      shot.id,
      "sd-webui",
      {
        phase: "draft",
        prompt: appliedPrompt,
        negativePrompt: effectiveNegativePrompt,
        outputDirectory: "workspace/generated",
        recipe,
      },
      "draft_queued",
    );
    launchSdWorker(persistentJobId);
    return NextResponse.json(
      { jobId: persistentJobId, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: `图片生成失败：${error instanceof Error ? error.message : "无法连接生成服务"}`,
        code: "GENERATION_FAILED",
      },
      { status: 502 },
    );
  }
}

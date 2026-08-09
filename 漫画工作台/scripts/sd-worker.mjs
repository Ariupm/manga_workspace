import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { faceRefinementPassPlan, gazeMaskGeometry, identityReferenceForCharacter, semanticApprovalCoversItems, semanticReviewContract, umbrellaGeometry } from "./sd-worker-logic.mjs";

const root = process.cwd();
const jobId = Number(process.argv[2]);
const db = new DatabaseSync(path.join(root, "data", "studio.db"));
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
const one = (sql, ...args) => db.prepare(sql).get(...args);
const status = () => one("SELECT status FROM jobs WHERE id=?", jobId)?.status;
const update = (next, progress = 0, error = "", stage = "") => {
  if (["cancelled", "paused"].includes(status())) return;
  db.prepare(
    "UPDATE jobs SET status=?,progress=?,error=?,stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(next, progress, error, stage, jobId);
};

function expressionCue(value = "") {
  const source = String(value || "").trim();
  if (/happy|joy|excited|delighted|期待|开心|高兴|惊喜/i.test(source))
    return "genuine happy anticipation, warm open smile, raised cheeks, bright engaged eyes, clearly readable joyful expression";
  if (/surpris|惊讶|震惊/i.test(source))
    return "clearly readable surprised expression, raised brows, widened eyes, slightly parted lips";
  if (/worried|concern|anxious|担心|焦虑/i.test(source))
    return "clearly readable worried expression, gently knitted brows, tense attentive eyes";
  if (/sad|悲伤|难过/i.test(source))
    return "clearly readable sad expression, softened eyes, downturned mouth, restrained emotion";
  return source ? `${source}, clearly readable facial expression` : "readable story-appropriate expression";
}

function expressionNegativeCue(value = "") {
  const source = String(value || "");
  if (/happy|joy|excited|delighted|期待|开心|高兴|惊喜/i.test(source))
    return "blank expression, sad expression, worried expression, downturned mouth, dead eyes";
  if (/surpris|惊讶|震惊/i.test(source)) return "flat neutral expression, sleepy eyes";
  return "";
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
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
        const chunks = [];
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
      request.destroy(new Error("SD生成超过4小时")),
    );
    request.on("error", reject);
    request.end(body);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(5000, () =>
      request.destroy(new Error("读取 SD 进度超时")),
    );
    request.on("error", reject);
  });
}

try {
  const row = one(
    "SELECT * FROM jobs WHERE id=? AND provider='sd-webui'",
    jobId,
  );
  if (!row || !["queued", "draft_queued", "final_queued"].includes(row.status))
    process.exit(0);
  const payload = JSON.parse(row.payload);
  const recipe = payload.recipe;
  const phase = recipe.phase || payload.phase || "final";
  const poseControl = recipe.poseControl;
  const poseImageBase64 = poseControl?.enabled
    ? poseControl.image ||
      (poseControl.svg
        ? (await sharp(Buffer.from(poseControl.svg)).png().toBuffer()).toString("base64")
        : "")
    : "";
  update(
    phase === "draft" ? "draft_running" : "final_running",
    0,
    "",
    phase === "draft" ? "构图草稿 worker 已启动" : "正式成品 worker 已启动",
  );
  const controlUnits = [];
  const allReferences = recipe.references || [];
  const initialReferences =
    recipe.characterCount > 1 && recipe.identityRefinement?.enabled
      ? allReferences.filter((reference) => reference.role === "identity")
      : allReferences;
  for (const reference of initialReferences) {
    const referencePath = path.resolve(root, reference.path);
    if (!fs.existsSync(referencePath)) continue;
    let effectiveRegionMask;
    if (reference.region) {
      const width = recipe.width;
      const height = recipe.height;
      const x = Math.round(reference.region.xStart * width);
      const regionWidth = Math.max(
        1,
        Math.round((reference.region.xEnd - reference.region.xStart) * width),
      );
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${x}" y="0" width="${regionWidth}" height="${height}" fill="white"/></svg>`,
      );
      effectiveRegionMask = (await sharp(svg).png().toBuffer()).toString(
        "base64",
      );
    }
    controlUnits.push({
        enabled: true,
        module: reference.module,
        model: reference.model,
        weight: reference.weight,
        image: fs.readFileSync(referencePath).toString("base64"),
        ...(effectiveRegionMask
          ? { effective_region_mask: effectiveRegionMask }
          : {}),
        resize_mode: "Crop and Resize",
        low_vram: true,
        processor_res: 512,
        threshold_a: 0.5,
        threshold_b: 0.5,
        guidance_start: 0,
        guidance_end: reference.role === "outfit" ? 0.8 : 1,
        control_mode:
          reference.role === "identity"
            ? "ControlNet is more important"
            : "Balanced",
        pixel_perfect: true,
      });
  }
  if (poseImageBase64 && poseControl?.model) {
    controlUnits.push({
      enabled: true,
      module: poseControl.module || "none",
      model: poseControl.model,
      weight: poseControl.weight ?? 0.9,
      image: poseImageBase64,
      resize_mode: "Just Resize",
      low_vram: true,
      processor_res: 512,
      guidance_start: poseControl.guidanceStart ?? 0,
      guidance_end: poseControl.guidanceEnd ?? 0.82,
      control_mode: "ControlNet is more important",
      pixel_perfect: false,
    });
  }
  let polling = false;
  const progressUrl = new URL(
    "/sdapi/v1/progress?skip_current_image=true",
    recipe.endpoint,
  ).toString();
  const progressTimer = setInterval(async () => {
    if (
      polling ||
      !["running", "draft_running", "final_running"].includes(status())
    )
      return;
    polling = true;
    try {
      const current = await getJson(progressUrl);
      const percent = Math.max(
        current.state?.job ? 1 : 0,
        Math.round((current.progress || 0) * 100),
      );
      const prefix = phase === "draft" ? "构图草稿" : "正式成品";
      const stage = current.state?.sampling_steps
        ? `${prefix}正在采样（${current.state.sampling_step || 0}/${current.state.sampling_steps}）`
        : `${prefix}正在加载模型或预处理参考图`;
      update(
        phase === "draft" ? "draft_running" : "final_running",
        percent,
        "",
        stage,
      );
    } catch {
    } finally {
      polling = false;
    }
  }, 2500);
  let generated;
  try {
    const alwaysonScripts = {};
    if (controlUnits.length)
      alwaysonScripts.ControlNet = { args: controlUnits };
    if (recipe.regionalPrompter?.enabled)
      alwaysonScripts["Regional Prompter"] = {
        args: [
          true,
          false,
          "Matrix",
          recipe.regionalPrompter.orientation === "Vertical" ? "Rows" : "Columns",
          "Mask",
          "Prompt",
          recipe.regionalPrompter.ratios || "1,1",
          recipe.regionalPrompter.baseRatio || "0.2",
          false,
          recipe.regionalPrompter.useCommon === true,
          false,
          "Attention",
          [],
          "0",
          "0",
          "0.4",
          null,
          "0",
          "0",
          false,
        ],
      };
    const requestPayload = {
      prompt: recipe.regionalPrompter?.enabled
        ? recipe.regionalPrompter.prompt
        : recipe.prompt,
      negative_prompt: recipe.negativePrompt,
      steps: recipe.steps,
      cfg_scale: recipe.cfgScale,
      width: recipe.width,
      height: recipe.height,
      seed: recipe.seed,
      sampler_name: recipe.sampler,
      scheduler: recipe.scheduler,
      batch_size: 1,
      n_iter: 1,
      do_not_save_samples: false,
      do_not_save_grid: true,
      send_images: true,
      ...(Object.keys(alwaysonScripts).length
        ? { alwayson_scripts: alwaysonScripts }
        : {}),
      override_settings_restore_afterwards: true,
    };
    recipe.requestTrace = {
      prompt: requestPayload.prompt,
      negativePrompt: requestPayload.negative_prompt,
      regionalPrompterEnabled: Boolean(recipe.regionalPrompter?.enabled),
      recordedAt: new Date().toISOString(),
    };
    if (phase === "final") {
      const draftPath = path.resolve(
        root,
        recipe.approvedDraftPath || payload.draftImagePath || "",
      );
      if (!fs.existsSync(draftPath)) throw new Error("已批准的构图草稿不存在");
      requestPayload.init_images = [
        fs.readFileSync(draftPath).toString("base64"),
      ];
      requestPayload.denoising_strength = recipe.denoisingStrength ?? 0.35;
      requestPayload.resize_mode = 0;
    }
    generated = await postJson(recipe.endpoint, requestPayload);
  } finally {
    clearInterval(progressTimer);
  }
  if (generated.status < 200 || generated.status >= 300)
    throw new Error(
      `生成服务返回 ${generated.status}：${generated.body.slice(0, 240)}`,
    );
  if (status() === "cancelled") process.exit(0);
  let response = JSON.parse(generated.body);
  if (!response.images?.length) throw new Error("生成服务没有返回图片");
  const postprocessWarnings = [];
  const identityReferences = (recipe.references || []).filter(
    (reference) => reference.role === "identity",
  );
  if (
    identityReferences.length > 0 && recipe.identityRefinement?.enabled
  ) {
    let currentImage = response.images[0];
    for (const [identityIndex, reference] of identityReferences.entries()) {
      if (status() === "cancelled") process.exit(0);
      const width = recipe.width;
      const height = recipe.height;
      const region = reference.region || { xStart: 0, xEnd: 1 };
      const characterRegions = recipe.generationSpec?.characterRegions || [];
      const characterIndex = characterRegions.findIndex((item) => item.characterId === reference.characterId);
      const poseIndex = characterIndex >= 0 ? characterIndex : identityIndex;
      const poseNose = recipe.poseControl?.people?.[poseIndex]?.[0];
      const cameraText = `${recipe.generationSpec?.visualSpec?.camera?.shotSize || ""} ${recipe.prompt || ""}`;
      const gazeText=reference.characterPrompt||"";
      const refinementPlan=faceRefinementPassPlan({phase,pass:"identity",shotSize:cameraText,poseNose,region,identityReference:reference,gazeText});
      const maskWidth = Math.max(64, Math.round(width * refinementPlan.radiusXRatio * 2));
      const maskHeight = Math.max(82, Math.round(height * refinementPlan.radiusYRatio * 2));
      const x = Math.max(0, Math.round(width * refinementPlan.center.x - maskWidth / 2));
      const y = Math.max(0, Math.round(height * refinementPlan.center.y - maskHeight / 2));
      const maskSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${x + maskWidth / 2}" cy="${y + maskHeight / 2}" rx="${maskWidth / 2}" ry="${maskHeight / 2}" fill="white"/></svg>`,
      );
      const mask = (await sharp(maskSvg).png().toBuffer()).toString("base64");
      recipe.debugMasks = recipe.debugMasks || [];
      recipe.faceRefinementPasses = recipe.faceRefinementPasses || [];
      const identityTrace={type:"identity",order:recipe.faceRefinementPasses.length+1,characterId:reference.characterId,centerX:refinementPlan.center.x,centerY:refinementPlan.center.y,sourceX:refinementPlan.center.sourceX,sourceY:refinementPlan.center.sourceY,denoisingStrength:refinementPlan.denoisingStrength,identityControl:refinementPlan.identityControl};
      recipe.debugMasks.push(identityTrace);
      recipe.faceRefinementPasses.push(identityTrace);
      const referencePath = path.resolve(root, reference.path);
      update(
        phase === "draft" ? "draft_running" : "final_running",
        70 + Math.round(((identityIndex + 1) / identityReferences.length) * 25),
        "",
        `正在精修第 ${identityIndex + 1}/${identityReferences.length} 个人物脸部与身份`,
      );
      const {allowsCameraGaze,preservesOffCameraGaze}=refinementPlan.gazePlan;
      const refinePayload = {
        prompt: `${reference.characterPrompt || recipe.prompt}, detailed facial features, symmetrical readable eyes, defined pupils, defined nose and lips, clean facial contour, preserve the specified head direction and eye target, ${preservesOffCameraGaze ? "natural directional lighting, preserve the off-camera gaze and head angle, do not rotate the face toward the viewer" : "soft frontal fill light, both eyes fully visible"}, unobstructed face`,
        negative_prompt: `blurry face, featureless face, melted facial features, asymmetrical eyes, mismatched eyes, crossed eyes, malformed pupils, pointed ears, elf ears, animal ears, face hidden by hair, face covered by prop, deep shadow across eyes, wrong identity, wrong hair color, wrong eye color, duplicate face${allowsCameraGaze?"":", looking at viewer, eye contact with camera, front-facing portrait gaze"}`,
        init_images: [currentImage],
        mask,
        width,
        height,
        steps: phase === "draft" ? 12 : 16,
        cfg_scale: 6,
        denoising_strength: refinementPlan.denoisingStrength,
        sampler_name: recipe.sampler,
        scheduler: recipe.scheduler,
        batch_size: 1,
        n_iter: 1,
        mask_blur: 10,
        inpainting_fill: 1,
        inpaint_full_res: true,
        inpaint_full_res_padding: recipe.identityRefinement?.inpaintPadding ?? 48,
        send_images: true,
        alwayson_scripts: {
          ControlNet: {
            args: [
              {
                enabled: true,
                module: reference.module,
                model: reference.model,
                weight: refinementPlan.identityControl.weight,
                image: fs.readFileSync(referencePath).toString("base64"),
                effective_region_mask: mask,
                resize_mode: "Crop and Resize",
                low_vram: true,
                processor_res: 512,
                guidance_start: 0,
                guidance_end: 1,
                control_mode: "ControlNet is more important",
                pixel_perfect: true,
              },
            ],
          },
        },
      };
      try {
        const refined = await postJson(
          recipe.endpoint.replace(/\/txt2img$/, "/img2img"),
          refinePayload,
        );
        if (refined.status < 200 || refined.status >= 300)
          throw new Error(`服务返回 ${refined.status}：${refined.body.slice(0, 180)}`);
        const refinedResponse = JSON.parse(refined.body);
        if (!refinedResponse.images?.[0]) throw new Error("没有返回图片");
        currentImage = refinedResponse.images[0];
      } catch (error) {
        const warning = `第 ${identityIndex + 1} 个人物脸部精修失败，已保留基础生成图：${error instanceof Error ? error.message : String(error)}`;
        postprocessWarnings.push(warning);
        update(
          phase === "draft" ? "draft_running" : "final_running",
          92,
          "",
          warning,
        );
      }
    }
    response = { ...response, images: [currentImage] };
  }
  const propInteraction=recipe.generationSpec?.repairPasses?.propInteraction;
  const propInteractions=recipe.generationSpec?.repairPasses?.propInteractions || (propInteraction ? [propInteraction] : []);
  recipe.relationTraces = propInteractions.map((item, index) => ({ relationId: item.relationId || `legacy:${index + 1}`, characterId: item.characterId || "", object: item.object || "", status: item?.required ? "queued" : "not_required" }));
  const updateRelationTrace = (relationId, status, error = "") => {
    const trace = recipe.relationTraces.find((item) => item.relationId === relationId);
    if (trace) Object.assign(trace, { status, ...(error ? { error } : {}) });
  };
  for (const propInteraction of propInteractions.filter((item) => item?.required)) {
  const relationId = propInteraction.relationId || `legacy:${propInteractions.indexOf(propInteraction) + 1}`;
  updateRelationTrace(relationId, "executing");
  let relationFailed = false;
  if(propInteraction.required && response.images?.[0]) {
    if(status()==="cancelled")process.exit(0);
    const width=recipe.width,height=recipe.height;
    const centerX=width*Math.max(.12,Math.min(.88,propInteraction.objectCenter?.x??.5));
    const centerY=height*Math.max(.38,Math.min(.76,propInteraction.objectCenter?.y??.58));
    const regionWidth=Math.max(.25,(propInteraction.region?.xEnd??1)-(propInteraction.region?.xStart??0));
    const radiusX=width*Math.min(.22,Math.max(.15,regionWidth*.28));
    const radiusY=height*(propInteraction.handMode==="two"?.18:.16);
    const portrait=propInteraction.orientation==="portrait";
    const landscape=propInteraction.orientation==="landscape";
    const objectHalfWidth=portrait?radiusX*.28:landscape?radiusX*.62:radiusX*.46;
    const objectHalfHeight=portrait?radiusY*.68:landscape?radiusY*.42:radiusY*.52;
    const handOffset=propInteraction.handMode==="two"?objectHalfWidth*1.15:objectHalfWidth*.85;
    const handRadius=Math.max(18,Math.min(width,height)*.055);
    const maskSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${centerX-objectHalfWidth}" y="${centerY-objectHalfHeight}" width="${objectHalfWidth*2}" height="${objectHalfHeight*2}" rx="${Math.max(10,objectHalfWidth*.2)}" fill="white"/><circle cx="${centerX-handOffset}" cy="${centerY}" r="${handRadius}" fill="white"/>${propInteraction.handMode==="two"?`<circle cx="${centerX+handOffset}" cy="${centerY}" r="${handRadius}" fill="white"/>`:""}</svg>`);
    const mask=(await sharp(maskSvg).png().toBuffer()).toString("base64");
    const shape=propInteraction.shape||"landscape_rect",stroke=Math.max(5,Math.round(Math.min(width,height)*.012));
    const sx=centerX-radiusX*.46,sy=centerY-radiusY*.5,sw=radiusX*.92,sh=radiusY;
    const shapeMarkup=(shape==="portrait_rect"||shape==="landscape_rect")
      ? portrait
        ? `<rect x="${centerX-sw*.22}" y="${centerY-sh*.48}" width="${sw*.44}" height="${sh*.96}" rx="${stroke*1.6}"/>`
        : landscape
          ? `<rect x="${centerX-sw*.48}" y="${centerY-sh*.22}" width="${sw*.96}" height="${sh*.44}" rx="${stroke*1.6}"/>`
          : `<rect x="${centerX-sw*.4}" y="${centerY-sh*.32}" width="${sw*.8}" height="${sh*.64}" rx="${stroke*1.4}"/>`
      : shape==="cylinder"?`<path d="M ${centerX-sw*.2} ${centerY-sh*.38} L ${centerX-sw*.17} ${centerY+sh*.38} Q ${centerX} ${centerY+sh*.48} ${centerX+sw*.17} ${centerY+sh*.38} L ${centerX+sw*.2} ${centerY-sh*.38} Z"/><ellipse cx="${centerX}" cy="${centerY-sh*.38}" rx="${sw*.2}" ry="${sh*.08}"/>`
      : shape==="umbrella"?`<path d="M ${centerX-sw*.48} ${centerY-sh*.12} Q ${centerX} ${centerY-sh*.75} ${centerX+sw*.48} ${centerY-sh*.12}"/><path d="M ${centerX} ${centerY-sh*.5} L ${centerX} ${centerY+sh*.45} q 0 ${sh*.16} ${-sw*.12} ${sh*.16}"/>`
      : shape==="bag"?`<rect x="${sx}" y="${centerY-sh*.18}" width="${sw}" height="${sh*.62}" rx="${stroke*2}"/><path d="M ${centerX-sw*.28} ${centerY-sh*.18} Q ${centerX} ${centerY-sh*.7} ${centerX+sw*.28} ${centerY-sh*.18}"/>`
      : shape==="dish"?`<ellipse cx="${centerX}" cy="${centerY}" rx="${sw*.48}" ry="${sh*.22}"/>`
      : shape==="elongated"?`<path d="M ${centerX-sw*.38} ${centerY+sh*.22} L ${centerX+sw*.34} ${centerY-sh*.28}"/><rect x="${centerX-sw*.46}" y="${centerY+sh*.16}" width="${sw*.22}" height="${sh*.16}" rx="${stroke}" transform="rotate(-35 ${centerX-sw*.35} ${centerY+sh*.24})"/>`
      : `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${stroke}"/><path d="M ${centerX} ${sy} L ${centerX} ${sy+sh}"/>`;
    const guideSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${shapeMarkup}</g></svg>`);
    const guide=(await sharp(guideSvg).png().toBuffer()).toString("base64");
    const cannyModel=recipe.generationSpec?.structureControl?.cannyModel;
    update(phase==="draft"?"draft_running":"final_running",95,"",`正在校正手部与剧情道具：${propInteraction.object}`);
    const payload={
      prompt:["masterpiece, best quality, anime illustration",...(propInteraction.positive||[]),`one coherent ${propInteraction.object}, ${propInteraction.orientation} orientation, ${propInteraction.viewerSurface} surface readable to viewer, ${propInteraction.handMode}-hand interaction`,"anatomically credible hands, only fingers required by the grip remain visible, physically credible object contact"].join(", "),
      negative_prompt:[recipe.negativePrompt,...(propInteraction.negative||[]),"malformed hands, extra fingers, missing fingers, fused fingers, detached object, duplicated prop, oversized prop, prop transformed into an unrelated object"].join(", "),
      init_images:[response.images[0]],mask,width,height,
      steps:phase==="draft"?10:12,cfg_scale:6.5,
      denoising_strength:phase==="draft"?0.54:0.42,
      sampler_name:recipe.sampler,scheduler:recipe.scheduler,batch_size:1,n_iter:1,
      mask_blur:10,inpainting_fill:1,inpaint_full_res:true,inpaint_full_res_padding:64,send_images:true,
      ...(cannyModel?{alwayson_scripts:{ControlNet:{args:[{enabled:true,module:"canny",model:cannyModel,weight:.82,image:guide,effective_region_mask:mask,resize_mode:"Just Resize",low_vram:true,processor_res:512,threshold_a:64,threshold_b:128,guidance_start:0,guidance_end:.8,control_mode:"ControlNet is more important",pixel_perfect:false}]}}}:{}),
    };
    try {
      const result=await postJson(recipe.endpoint.replace(/\/txt2img$/,"/img2img"),payload);
      if(result.status<200||result.status>=300)throw new Error(`服务返回 ${result.status}：${result.body.slice(0,180)}`);
      const repaired=JSON.parse(result.body);
      if(!repaired.images?.[0])throw new Error("没有返回图片");
      response={...response,images:[repaired.images[0]]};
    } catch(error) {
      relationFailed = true;
      const warning=`剧情道具与手部校正失败，已保留上一阶段图片：${error instanceof Error?error.message:String(error)}`;
      postprocessWarnings.push(warning);
      update(phase==="draft"?"draft_running":"final_running",96,"",warning);
    }
    if(response.images?.[0]&&propInteraction.gaze&&propInteraction.gazeMode!=="independent") {
      const cameraText=`${recipe.generationSpec?.visualSpec?.camera?.shotSize||""} ${recipe.prompt||""}`;
      const close=/close-up|extreme close|特写|近景/i.test(cameraText),medium=/medium shot|waist-up|中景/i.test(cameraText);
      const regions=recipe.generationSpec?.characterRegions||[];
      const characterIndex=regions.findIndex((item)=>item.characterId===propInteraction.characterId);
      const characterRegion=characterIndex>=0?regions[characterIndex]:regions[0];
      const poseNose=recipe.poseControl?.people?.[characterIndex>=0?characterIndex:0]?.[0];
      const identityReference=identityReferenceForCharacter(identityReferences,propInteraction.characterId,characterIndex>=0?characterIndex:0);
      const gazePlan=faceRefinementPassPlan({phase,pass:"gaze",shotSize:cameraText,poseNose,region:characterRegion?.region,identityReference,gazeText:propInteraction.gaze});
      const gazeDistance=Math.hypot((propInteraction.objectCenter?.x ?? .5) - gazePlan.center.x, (propInteraction.objectCenter?.y ?? .58) - gazePlan.center.y);
      const gazePadding=Math.max(48,Math.round(gazeDistance * Math.max(width,height) + Math.max(width,height) * .12));
      const gazeGeometry=gazeMaskGeometry({width,height,face:{x:gazePlan.center.x,y:gazePlan.center.y,radiusXRatio:gazePlan.radiusXRatio,radiusYRatio:gazePlan.radiusYRatio},target:propInteraction.objectCenter,inpaintPadding:gazePadding});
      const faceCenterX=gazeGeometry.face.cx;
      const faceCenterY=gazeGeometry.face.cy;
      const faceRadiusX=gazeGeometry.face.rx,faceRadiusY=gazeGeometry.face.ry;
      const gazeMaskSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${faceCenterX}" cy="${faceCenterY}" rx="${Math.max(36,faceRadiusX)}" ry="${Math.max(46,faceRadiusY)}" fill="white"/></svg>`);
      const gazeMask=(await sharp(gazeMaskSvg).png().toBuffer()).toString("base64");
      recipe.debugMasks = recipe.debugMasks || [];
      recipe.faceRefinementPasses = recipe.faceRefinementPasses || [];
      const gazeTrace={type:"gaze",order:recipe.faceRefinementPasses.length+1,characterId:propInteraction.characterId,centerX:gazePlan.center.x,centerY:gazePlan.center.y,targetCenter:propInteraction.objectCenter||null,vector:gazeGeometry.vector,direction:gazeGeometry.direction,maskBounds:gazeGeometry.bounds,containsTarget:gazeGeometry.containsTarget,sourceX:gazePlan.center.sourceX,sourceY:gazePlan.center.sourceY,denoisingStrength:gazePlan.denoisingStrength,identityControl:gazePlan.identityControl};
      recipe.debugMasks.push(gazeTrace);
      recipe.faceRefinementPasses.push(gazeTrace);
      update(phase==="draft"?"draft_running":"final_running",97,"",`正在校正人物视线与剧情道具：${propInteraction.object}`);
      const expression = recipe.characterLooks?.[propInteraction.characterId]?.expressionEn || recipe.generationSpec?.visualSpec?.characters?.find((item) => item.characterId === propInteraction.characterId)?.expression || "";
      const gazeIdentityPath=identityReference?.path?path.resolve(root,identityReference.path):"";
      const gazeIdentityUnit=gazePlan.identityControl&&gazeIdentityPath&&fs.existsSync(gazeIdentityPath)?{
        enabled:true,
        module:gazePlan.identityControl.module,
        model:gazePlan.identityControl.model,
        weight:gazePlan.identityControl.weight,
        image:fs.readFileSync(gazeIdentityPath).toString("base64"),
        effective_region_mask:gazeMask,
        resize_mode:"Crop and Resize",low_vram:true,processor_res:512,guidance_start:0,guidance_end:1,control_mode:"ControlNet is more important",pixel_perfect:true,
      }:null;
      const gazePayload={
        prompt:["masterpiece, best quality, anime illustration, consistent established face",expressionCue(expression),propInteraction.gaze,`head, irises, and pupils visibly converge ${gazeGeometry.direction === "independent" ? "with the surrounding action" : `toward the ${gazeGeometry.direction} target at normalized coordinates ${propInteraction.objectCenter?.x?.toFixed(2) ?? "0.50"},${propInteraction.objectCenter?.y?.toFixed(2) ?? "0.58"} (${gazeGeometry.vector.distance.toFixed(2)} distance)`}`,propInteraction.gazeMode==="object"?`the ${propInteraction.object} is the gaze target`:propInteraction.gazeMode==="work_point"?"the tool contact point is the gaze target":"the interaction target is the gaze target","natural eyelids, symmetrical detailed eyes, no eye contact with viewer"].join(", "),
        negative_prompt:[recipe.negativePrompt,expressionNegativeCue(expression),"looking at viewer, eye contact with camera, front-facing portrait gaze, pupils aimed at camera, crossed eyes, mismatched pupils, malformed eyes"].filter(Boolean).join(", "),
        init_images:[response.images[0]],mask:gazeMask,width,height,
        steps:phase==="draft"?12:14,cfg_scale:6.4,denoising_strength:gazePlan.denoisingStrength,
        sampler_name:recipe.sampler,scheduler:recipe.scheduler,batch_size:1,n_iter:1,
        mask_blur:8,inpainting_fill:1,inpaint_full_res:true,inpaint_full_res_padding:gazePadding,send_images:true,
        ...(gazeIdentityUnit?{alwayson_scripts:{ControlNet:{args:[gazeIdentityUnit]}}}:{}),
      };
      try {
        const gazeResult=await postJson(recipe.endpoint.replace(/\/txt2img$/,"/img2img"),gazePayload);
        if(gazeResult.status<200||gazeResult.status>=300)throw new Error(`服务返回 ${gazeResult.status}：${gazeResult.body.slice(0,180)}`);
        const gazeResponse=JSON.parse(gazeResult.body);if(!gazeResponse.images?.[0])throw new Error("没有返回图片");
        response={...response,images:[gazeResponse.images[0]]};
      }catch(error){relationFailed = true; const warning=`视线校正失败，已保留手部与道具校正结果：${error instanceof Error?error.message:String(error)}`;postprocessWarnings.push(warning);update(phase==="draft"?"draft_running":"final_running",97,"",warning);}
    }
  }
  updateRelationTrace(relationId, relationFailed ? "failed" : "completed");
  }
  if (recipe.generationSpec?.repairPasses?.handoff && response.images?.[0]) {
    if (status() === "cancelled") process.exit(0);
    const width = recipe.width;
    const height = recipe.height;
    const scenePlan = recipe.poseControl?.scenePlan;
    const swapped = Boolean(recipe.poseControl?.override?.swapRoles);
    const giverSide = swapped ? "left-side giver" : "right-side giver";
    const receiverSide = swapped ? "right-side receiver" : "left-side receiver";
    const umbrella = umbrellaGeometry({ width, height, target: scenePlan?.interactionTarget || { x: .5, y: .48 }, anchors: scenePlan?.people?.map((person) => person.anchor) || [] });
    const maskX = Math.round(umbrella.bounds.x);
    const maskY = Math.round(umbrella.bounds.y);
    const maskWidth = Math.round(umbrella.bounds.width);
    const maskHeight = Math.round(umbrella.bounds.height);
    const handoffMaskSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><rect x="${maskX}" y="${maskY}" width="${maskWidth}" height="${maskHeight}" rx="${Math.min(maskWidth, maskHeight) * .12}" fill="white"/></svg>`,
    );
    const handoffMask = (await sharp(handoffMaskSvg).png().toBuffer()).toString("base64");
    update(
      phase === "draft" ? "draft_running" : "final_running",
      97,
      "",
      "正在校正双方手部、伞柄和递伞关系",
    );
    const handoffControlUnits = poseImageBase64 && poseControl?.model
      ? [{
          enabled: true,
          module: poseControl.module || "none",
          model: poseControl.model,
          weight: 0.72,
          image: poseImageBase64,
          effective_region_mask: handoffMask,
          resize_mode: "Just Resize",
          low_vram: true,
          processor_res: 512,
          guidance_start: 0,
          guidance_end: 0.7,
          control_mode: "Balanced",
          pixel_perfect: false,
        }]
      : [];
    if (poseControl?.cannyModel) {
      const guideSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="black"/><path d="M ${umbrella.canopy.x1} ${umbrella.canopy.y} Q ${umbrella.center.x} ${umbrella.canopy.y-height*.13} ${umbrella.canopy.x2} ${umbrella.canopy.y}" fill="none" stroke="white" stroke-width="${Math.max(6,width*.012)}"/><path d="M ${umbrella.shaft.x1} ${umbrella.shaft.y1} L ${umbrella.shaft.x2} ${umbrella.shaft.y2}" fill="none" stroke="white" stroke-width="${Math.max(6,width*.011)}" stroke-linecap="round"/></svg>`,
      );
      const guideImage = (await sharp(guideSvg).png().toBuffer()).toString("base64");
      handoffControlUnits.push({
        enabled: true,
        module: "canny",
        model: poseControl.cannyModel,
        weight: 0.82,
        image: guideImage,
        effective_region_mask: handoffMask,
        resize_mode: "Just Resize",
        low_vram: true,
        processor_res: 512,
        threshold_a: 80,
        threshold_b: 160,
        guidance_start: 0,
        guidance_end: 0.78,
        control_mode: "ControlNet is more important",
        pixel_perfect: false,
      });
    }
    recipe.debugMasks = recipe.debugMasks || [];
    recipe.debugMasks.push({ type: "umbrella_handoff", bounds: umbrella.bounds, canopy: umbrella.canopy, shaft: umbrella.shaft, maskGuideIntersection: umbrella.maskGuideIntersection });
    if (!umbrella.maskGuideIntersection) {
      const warning = "雨伞结构引导未被有效遮罩完整覆盖，已拒绝交接局部修复";
      postprocessWarnings.push(warning);
      update(phase === "draft" ? "draft_running" : "final_running", 97, "", warning);
    } else {
    const handoffPayload = {
      prompt: [
        "masterpiece, best quality, anime illustration",
        recipe.generationSpec.repairPasses.handoffPrompt,
        "two anatomically correct adult female hands approaching the same umbrella handle",
        `the ${giverSide} firmly holds the umbrella shaft while extending the handle`,
        `the ${receiverSide} reaches with an open hand before grasping`,
        "clearly separated wrists, natural elbows, five distinct fingers on each visible hand",
        "continuous umbrella shaft connected to the canopy",
      ].join(", "),
      negative_prompt: `${recipe.negativePrompt}, holding hands, fused hands, merged fingers, extra fingers, missing fingers, broken wrist, detached hand, both women gripping the shaft, disconnected umbrella handle`,
      init_images: [response.images[0]],
      mask: handoffMask,
      width,
      height,
      steps: phase === "draft" ? 10 : 12,
      cfg_scale: 6,
      denoising_strength: phase === "draft" ? 0.34 : 0.26,
      sampler_name: recipe.sampler,
      scheduler: recipe.scheduler,
      batch_size: 1,
      n_iter: 1,
      mask_blur: 10,
      inpainting_fill: 1,
      inpaint_full_res: false,
      send_images: true,
      ...(handoffControlUnits.length
        ? { alwayson_scripts: { ControlNet: { args: handoffControlUnits } } }
        : {}),
    };
    const handoffResult = await postJson(
      recipe.endpoint.replace(/\/txt2img$/, "/img2img"),
      handoffPayload,
    );
    if (handoffResult.status < 200 || handoffResult.status >= 300)
      throw new Error(`手部与伞柄校正失败 ${handoffResult.status}：${handoffResult.body.slice(0, 180)}`);
    const handoffResponse = JSON.parse(handoffResult.body);
    if (!handoffResponse.images?.[0]) throw new Error("手部与伞柄校正没有返回图片");
    response = { ...response, images: [handoffResponse.images[0]] };
    }
  }
  let info = {};
  try {
    info = JSON.parse(response.info || "{}");
  } catch {}
  const directory = path.join(root, "workspace", "generated");
  fs.mkdirSync(directory, { recursive: true });
  const actualSeed = Number.isFinite(Number(info.seed))
    ? Number(info.seed)
    : undefined;
  let pixelQa={status:"blocked",blockers:["pixel_decode_failed"],warnings:[],checkedAt:new Date().toISOString()};
  let semanticQa={status:"blocked",blockers:["semantic_decode_failed"],labels:[],warnings:[],checkedAt:new Date().toISOString()};
  try {
    const imageBuffer=Buffer.from(response.images?.[0]||"","base64");
    const meta=await sharp(imageBuffer).metadata();
    const blockers=[];
    if(!meta.width||!meta.height||meta.width<256||meta.height<256) blockers.push("image_dimensions_below_256px");
    if(imageBuffer.length<20_000) blockers.push("image_payload_suspiciously_small");
    pixelQa={status:blockers.length?"blocked":"passed",blockers,warnings:[],width:meta.width,height:meta.height,checkedAt:new Date().toISOString()};
    const reviewContract=semanticReviewContract({generationSpec:recipe.generationSpec,references:recipe.references||[],adapterStatus:recipe.adapterStatus||{},characterLooks:recipe.characterLooks||{},environment:recipe.environment||{}});
    semanticQa={status:reviewContract.items.length?"manual_required":"passed",blockers:[],labels:reviewContract.labels,items:reviewContract.items,version:reviewContract.version,warnings:reviewContract.items.length?["No pixel-level semantic detector is configured; these are review requirements, not detected failures"]:[],checkedAt:new Date().toISOString()};
  } catch(error) { pixelQa={status:"blocked",blockers:[`pixel_decode_failed:${error instanceof Error?error.message:String(error)}`],warnings:[],checkedAt:new Date().toISOString()}; semanticQa={status:"blocked",blockers:["semantic_decode_failed"],labels:[],warnings:[],checkedAt:new Date().toISOString()}; }
  payload.recipe = {
    ...recipe,
    actualSeed,
    actualSeeds: Array.isArray(info.all_seeds) ? info.all_seeds : undefined,
    postprocessWarnings,
    pixelQa,
    semanticQa,
  };
  if (phase === "draft") {
    const filename = `sd-draft-job-${jobId}-${randomUUID()}.png`;
    fs.writeFileSync(
      path.join(directory, filename),
      Buffer.from(response.images[0], "base64"),
    );
    payload.draftImagePath = `workspace/generated/${filename}`;
    payload.phase = "draft";
    db.prepare(
      "UPDATE jobs SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(JSON.stringify(payload), jobId);
    const draftStatus = postprocessWarnings.length || pixelQa.status === "blocked" || semanticQa.status === "blocked" ? "draft_blocked" : "awaiting_draft_approval";
    db.prepare("UPDATE shots SET status=? WHERE id=?").run(draftStatus === "draft_blocked" ? "draft" : "awaiting_draft_approval", row.shot_id);
    update(draftStatus, 100, [...postprocessWarnings,...pixelQa.blockers].join("；"), draftStatus === "draft_blocked" ? "视觉质检阻断" : "图片已生成，等待人工视觉质检");
    process.exit(0);
  }
  db.prepare(
    "UPDATE jobs SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(JSON.stringify(payload), jobId);
  if (postprocessWarnings.length || pixelQa.status === "blocked" || !semanticApprovalCoversItems(semanticQa.items || [], recipe.semanticApproval)) {
    db.prepare("UPDATE shots SET status=? WHERE id=?").run("draft", row.shot_id);
    update("failed", 100, [...postprocessWarnings,...pixelQa.blockers].join("；"), "正式成品质检失败，未写入候选");
    process.exit(0);
  }
  for (const [index, image] of response.images.slice(0, 1).entries()) {
    if (status() === "cancelled") break;
    const filename = `shot-${row.shot_id}-${randomUUID()}.png`;
    fs.writeFileSync(
      path.join(directory, filename),
      Buffer.from(image, "base64"),
    );
    const version = one(
      "SELECT COALESCE(MAX(version),0)+1 value FROM candidates WHERE shot_id=?",
      row.shot_id,
    ).value;
    const selected =
      one("SELECT COUNT(*) count FROM candidates WHERE shot_id=?", row.shot_id)
        .count === 0
        ? 1
        : 0;
    db.prepare(
      "INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,?)",
    ).run(
      row.shot_id,
      `workspace/generated/${filename}`,
      `SD WebUI 成品`,
      version,
      selected,
    );
  }
  if (status() !== "cancelled") {
    db.prepare("UPDATE shots SET status='review' WHERE id=?").run(row.shot_id);
    update("completed", 100, "", "已生成并回写候选");
  }
} catch (error) {
  update(
    "failed",
    0,
    error instanceof Error ? error.message : String(error),
    "独立 worker 执行失败",
  );
}

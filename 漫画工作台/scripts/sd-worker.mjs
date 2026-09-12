import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { controlExecutionCoverage, deferRequiredPropsFromBasePrompt, evaluateCaptionForRequiredProps, faceRefinementPassPlan, gazeMaskGeometry, generationProfilePlan, handDepthDetectionUsable, handPoseDetectionUsable, identityReferenceForCharacter, identityReferenceMaskPlan, outfitGarmentZones, propBodySizePlan, selectControlUnitsForProfile, semanticReviewContractForStage, shouldUseOutfitVisualReference, structuredGazeExecutionPlan, umbrellaGeometry, upperBodyVisiblePrompt } from "./sd-worker-logic.mjs";

const root = process.cwd();
const jobId = Number(process.argv[2]);
const workerId = `sd-worker-${process.pid}-${randomUUID()}`;
const db = new DatabaseSync(path.join(root, "data", "studio.db"));
db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
const one = (sql, ...args) => db.prepare(sql).get(...args);
const status = () => one("SELECT status FROM jobs WHERE id=?", jobId)?.status;
const update = (next, progress = 0, error = "", stage = "") => {
  if (["cancelled", "paused"].includes(status())) return;
  db.prepare(
    "UPDATE jobs SET status=?,progress=?,error=?,stage=?,worker_id=?,heartbeat_at=CURRENT_TIMESTAMP,lease_until=datetime('now','+10 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(next, progress, error, stage, workerId, jobId);
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

async function compositeMaskedOutput(base64, generatedBase64, maskBase64) {
  const alpha = await sharp(Buffer.from(maskBase64, "base64")).greyscale().toBuffer();
  const overlay = await sharp(Buffer.from(generatedBase64, "base64"))
    .removeAlpha()
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return (await sharp(Buffer.from(base64, "base64"))
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer()).toString("base64");
}

function propAppearanceContract(interaction = {}) {
  const object = String(interaction.object || "story object").toLowerCase();
  const shape = String(interaction.shape || "");
  const plane = String(interaction.surfacePlan?.plane || "contextual");
  const positive = [
    shape === "portrait_rect" ? "one thin rigid portrait rectangle with a continuous outer silhouette" : "",
    shape === "landscape_rect" ? "one thin rigid landscape rectangle with a continuous outer silhouette" : "",
    plane === "screen" ? "one uninterrupted glass display surface contained inside the object frame" : "",
  ];
  const negative = [];
  if (/smartphone|cell phone|mobile phone/.test(object)) {
    positive.push("modern slab smartphone, thin black glass touchscreen, single-piece phone body, visible screen bezel");
    negative.push("wallet, purse, book, notebook, folding case, hinged cover, pages, two-panel object, clamshell device");
  } else if (/tablet|ipad/.test(object)) {
    positive.push("single-piece tablet computer, thin glass touchscreen, continuous rigid bezel");
    negative.push("book, notebook, hinged cover, pages, folding device");
  } else if (/book|novel/.test(object)) {
    positive.push("bound paper book with a spine and visible page block");
    negative.push("glass touchscreen, smartphone, tablet computer");
  }
  return { positive: positive.filter(Boolean), negative };
}

function propInteractionGeometry(interaction, posePeople = [], characterIndex = 0, width = 512, height = 512, posePlans = []) {
  const center = interaction.objectCenter || { x: .5, y: .58 };
  const pose = posePeople[characterIndex] || [];
  const plannedRelation = posePlans[characterIndex]?.relationTargets?.find((relation) => relation.relationId === interaction.relationId) || null;
  const anchors = Array.isArray(interaction.contactAnchors) && interaction.contactAnchors.length
    ? interaction.contactAnchors
    : interaction.handMode === "two"
      ? [{ hand: "left", x: center.x + .055, y: center.y, role: "support" }, { hand: "right", x: center.x - .055, y: center.y, role: "active" }]
      : [{ hand: "right", x: center.x, y: center.y, role: "active" }];
  const poseContacts = anchors.map((anchor) => {
    if (plannedRelation) {
      const assignment = plannedRelation.wristAssignments?.find((item) => item.hand === anchor.hand)
        || plannedRelation.contactAnchors?.find((item) => item.hand === anchor.hand);
      if (assignment && Number.isFinite(assignment.x) && Number.isFinite(assignment.y))
        return { ...anchor, x: assignment.x, y: assignment.y, source: "relation_wrist_assignment" };
    }
    const index = anchor.hand === "left" ? 7 : 4;
    return pose[index] && Number.isFinite(pose[index].x) ? { ...anchor, x: pose[index].x, y: pose[index].y, source: "pose_wrist" } : { ...anchor, source: "contract_anchor" };
  });
  const minX = Math.min(center.x, ...poseContacts.map((point) => point.x));
  const maxX = Math.max(center.x, ...poseContacts.map((point) => point.x));
  const minY = Math.min(center.y, ...poseContacts.map((point) => point.y));
  const maxY = Math.max(center.y, ...poseContacts.map((point) => point.y));
  const regionWidth = Math.max(.12, (interaction.region?.xEnd ?? 1) - (interaction.region?.xStart ?? 0));
  const hasPoseContact = poseContacts.some((point) => point.source === "pose_wrist" || point.source === "relation_wrist_assignment");
  const wristSpan = Math.max(0, maxX - minX);
  const bodySize = propBodySizePlan({ shape: interaction.shape, orientation: interaction.orientation, contactSpan: wristSpan, hasPoseContact, regionWidth });
  const widthRatio = bodySize.envelope.width;
  const heightRatio = bodySize.envelope.height;
  return {
    center,
    contacts: poseContacts,
    bounds: { x: Math.max(.03, minX - widthRatio * .5), y: Math.max(.2, minY - heightRatio * .5), width: widthRatio, height: heightRatio },
    bodySize: { width: bodySize.width, height: bodySize.height },
    depthPlane: interaction.surfacePlan?.plane === "screen" ? "character_facing_surface" : "action_plane",
    occlusionOrder: "hands_in_front_at_declared_contact_anchors_object_continuous_behind_contacts",
    source: hasPoseContact ? "pose_wrist_or_relation_target_plan_plus_contract_surface" : "contract_anchors_plus_region_fallback",
  };
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
  recipe.stageOutputs = Array.isArray(recipe.stageOutputs) ? recipe.stageOutputs : [];
  const stageDirectory = path.join(root, "workspace", "generated", "stages");
  const persistStageOutput = (stage, relationId, imageBase64) => {
    if (!imageBase64) return null;
    const imageBuffer = Buffer.from(imageBase64, "base64");
    fs.mkdirSync(stageDirectory, { recursive: true });
    const safeStage = String(stage || "stage").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 48) || "stage";
    const safeRelation = String(relationId || "base").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 64) || "base";
    const filename = `sd-stage-job-${jobId}-${safeStage}-${safeRelation}-${randomUUID()}.png`;
    const absolutePath = path.join(stageDirectory, filename);
    fs.writeFileSync(absolutePath, imageBuffer);
    return {
      path: path.relative(root, absolutePath).replace(/\\/g, "/"),
      bytes: imageBuffer.length,
      sha256: createHash("sha256").update(imageBuffer).digest("hex"),
    };
  };
  const phase = recipe.phase || payload.phase || "final";
  const claimedStatus = phase === "draft" ? "draft_running" : "final_running";
  const claim = db.prepare(
    "UPDATE jobs SET status=?,worker_id=?,attempt=attempt+1,heartbeat_at=CURRENT_TIMESTAMP,lease_until=datetime('now','+10 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','draft_queued','final_queued')",
  ).run(claimedStatus, workerId, jobId);
  if (claim.changes !== 1) process.exit(0);
  const profilePlan = generationProfilePlan(recipe.generationProfile || "cpu_local_fast", recipe.characterCount || 1);
  recipe.generationProfile = profilePlan.id;
  recipe.profilePlan = { ...(recipe.profilePlan || {}), ...profilePlan };
  const poseControl = recipe.poseControl;
  const poseImageBase64 = poseControl?.enabled
    ? poseControl.image ||
      (poseControl.svg
        ? (await sharp(Buffer.from(poseControl.svg)).png().toBuffer()).toString("base64")
        : "")
    : "";
  if (poseImageBase64) {
    const poseGuideOutput = persistStageOutput("control_pose", "scene", poseImageBase64);
    recipe.stageOutputs.push({ stage: "control_pose", relationId: null, output: poseGuideOutput });
  }
  update(
    phase === "draft" ? "draft_running" : "final_running",
    0,
    "",
    phase === "draft" ? "构图草稿 worker 已启动" : "正式成品 worker 已启动",
  );
  let controlUnits = [];
  const requiredBaseInteractions = (recipe.generationSpec?.repairPasses?.propInteractions || []).filter((item) => item?.required !== false);
  const deferredBase = deferRequiredPropsFromBasePrompt(recipe.prompt, requiredBaseInteractions);
  recipe.generationSpec.deferRequiredProps = requiredBaseInteractions.length > 0;
  recipe.generationSpec.deferredBasePrompt = requiredBaseInteractions.length ? { objects: deferredBase.objects, removedClauseCount: deferredBase.removed.length } : null;
  const allReferences = recipe.references || [];
  const initialStructuredGazePlan = structuredGazeExecutionPlan({ people: recipe.poseControl?.scenePlan?.people || [] });
  const offCameraGaze = (recipe.generationSpec?.repairPasses?.propInteractions || (recipe.generationSpec?.repairPasses?.propInteraction ? [recipe.generationSpec.repairPasses.propInteraction] : [])).some((item) => item?.gazeMode && item.gazeMode !== "independent")
    || initialStructuredGazePlan.hasStructuredTarget;
  const initialReferences =
    recipe.characterCount > 1 && recipe.identityRefinement?.enabled
      ? allReferences.filter((reference) => reference.role === "identity" && !reference.stagedOnly)
      : allReferences.filter((reference) => !reference.stagedOnly);
  const initialIdentityReferences = initialReferences.filter((reference) => reference.role === "identity");
  for (const [initialReferenceIndex, reference] of initialReferences.entries()) {
    const referencePath = path.resolve(root, reference.path);
    if (!fs.existsSync(referencePath)) continue;
    let effectiveRegionMask;
    let identityMaskPlan = null;
    if (reference.role === "identity") {
      const characterRegions = recipe.generationSpec?.characterRegions || [];
      const characterIndex = characterRegions.findIndex((item) => item.characterId === reference.characterId);
      const identityIndex = initialIdentityReferences.indexOf(reference);
      const poseIndex = characterIndex >= 0 ? characterIndex : Math.max(0, identityIndex);
      const fallbackRegion = initialIdentityReferences.length > 1
        ? { xStart: Math.max(0, identityIndex) / initialIdentityReferences.length, xEnd: (Math.max(0, identityIndex) + 1) / initialIdentityReferences.length }
        : { xStart: 0, xEnd: 1 };
      const characterRegion = reference.region || characterRegions[poseIndex]?.region || fallbackRegion;
      const poseNose = recipe.poseControl?.people?.[poseIndex]?.[0] || null;
      const cameraText = `${recipe.generationSpec?.visualSpec?.camera?.shotSize || ""} ${recipe.prompt || ""}`;
      identityMaskPlan = identityReferenceMaskPlan({ width: recipe.width, height: recipe.height, poseNose, region: characterRegion, shotSize: cameraText });
      const geometry = identityMaskPlan.pixelGeometry;
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${recipe.width}" height="${recipe.height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${geometry.cx}" cy="${geometry.cy}" rx="${geometry.rx}" ry="${geometry.ry}" fill="white"/></svg>`,
      );
      effectiveRegionMask = (await sharp(svg).png().toBuffer()).toString("base64");
    } else if (reference.region) {
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
        weight: offCameraGaze && reference.role === "identity" ? Math.min(reference.weight, 0.68) : reference.weight,
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
        control_mode: reference.role === "identity" && !offCameraGaze ? "ControlNet is more important" : "Balanced",
      pixel_perfect: true,
      role: reference.role,
      stage: reference.role === "outfit" ? "outfit_reference" : "identity_reference",
      characterId: reference.characterId || null,
      initialReferenceIndex,
      identityMaskPlan,
      });
  }
  if (poseImageBase64 && poseControl?.model) {
    const requiredInteraction = (recipe.generationSpec?.repairPasses?.propInteractions || []).some((item) => item?.required !== false);
    controlUnits.push({
      enabled: true,
      module: poseControl.module || "none",
      model: poseControl.model,
      weight: requiredInteraction ? Math.max(1, Number(poseControl.weight ?? 0.9)) : poseControl.weight ?? 0.9,
      image: poseImageBase64,
      resize_mode: "Just Resize",
      low_vram: true,
      processor_res: 512,
      guidance_start: poseControl.guidanceStart ?? 0,
      guidance_end: poseControl.guidanceEnd ?? 0.82,
      control_mode: "ControlNet is more important",
      pixel_perfect: false,
      stage: "pose",
    });
  }
  const initialCannyModel = recipe.generationSpec?.structureControl?.cannyModel;
  const initialPropInteractions = recipe.generationSpec?.repairPasses?.propInteractions || (recipe.generationSpec?.repairPasses?.propInteraction ? [recipe.generationSpec.repairPasses.propInteraction] : []);
  if (initialCannyModel) for (const initialPropInteraction of initialPropInteractions.filter((item) => item?.required)) {
    const initialCharacterIndex = (recipe.generationSpec?.characterRegions || []).findIndex((item) => item.characterId === initialPropInteraction.characterId);
    const initialGeometry = propInteractionGeometry(initialPropInteraction, recipe.poseControl?.people || [], initialCharacterIndex >= 0 ? initialCharacterIndex : 0, recipe.width, recipe.height, recipe.poseControl?.scenePlan?.people || []);
    const sharedUmbrella = initialPropInteraction.executor === "umbrella_handoff"
      ? umbrellaGeometry({ width: recipe.width, height: recipe.height, target: initialPropInteraction.ownership?.actorCharacterIds?.length > 1 ? (recipe.poseControl?.scenePlan?.interactionTarget || initialPropInteraction.objectCenter || { x: .5, y: .48 }) : (initialPropInteraction.objectCenter || recipe.poseControl?.scenePlan?.interactionTarget || { x: .5, y: .48 }), anchors: recipe.poseControl?.scenePlan?.people?.map((person) => person.anchor) || [] })
      : null;
    const guideGeometry = sharedUmbrella
      ? { ...initialGeometry, center: { x: sharedUmbrella.center.x / recipe.width, y: sharedUmbrella.center.y / recipe.height }, bounds: { x: sharedUmbrella.bounds.x / recipe.width, y: sharedUmbrella.bounds.y / recipe.height, width: sharedUmbrella.bounds.width / recipe.width, height: sharedUmbrella.bounds.height / recipe.height }, sharedGeometryKey: initialPropInteraction.objectInstanceId || "umbrella-shared" }
      : initialGeometry;
    const px = recipe.width * Math.max(.12, Math.min(.88, guideGeometry.center.x));
    const py = recipe.height * Math.max(.3, Math.min(.78, guideGeometry.center.y));
    const pw = recipe.width * guideGeometry.bodySize.width;
    const ph = recipe.height * guideGeometry.bodySize.height;
    const shape = initialPropInteraction.shape || "landscape_rect";
    const shapeMarkup = shape === "umbrella"
      ? `<path d="M ${px - pw * .5} ${py - ph * .1} Q ${px} ${py - ph * .7} ${px + pw * .5} ${py - ph * .1}"/><path d="M ${px} ${py - ph * .45} L ${px} ${py + ph * .48}"/>`
      : shape === "elongated"
        ? `<path d="M ${px - pw * .42} ${py + ph * .28} L ${px + pw * .42} ${py - ph * .28}"/>`
        : shape === "cylinder"
          ? `<path d="M ${px - pw * .18} ${py - ph * .34} L ${px - pw * .18} ${py + ph * .34} Q ${px} ${py + ph * .44} ${px + pw * .18} ${py + ph * .34} L ${px + pw * .18} ${py - ph * .34}"/><ellipse cx="${px}" cy="${py - ph * .34}" rx="${pw * .18}" ry="${ph * .07}"/>`
          : shape === "bag"
            ? `<path d="M ${px - pw * .42} ${py - ph * .18} Q ${px} ${py - ph * .78} ${px + pw * .42} ${py - ph * .18}"/><rect x="${px - pw * .46}" y="${py - ph * .18}" width="${pw * .92}" height="${ph * .58}" rx="${Math.min(pw, ph) * .1}"/>`
            : shape === "dish"
              ? `<ellipse cx="${px}" cy="${py}" rx="${pw * .48}" ry="${ph * .2}"/><path d="M ${px - pw * .35} ${py} Q ${px} ${py + ph * .28} ${px + pw * .35} ${py}"/>`
              : `<rect x="${px - pw / 2}" y="${py - ph / 2}" width="${pw}" height="${ph}" rx="${Math.min(pw, ph) * .12}"/>`;
    const surfacePlane = initialPropInteraction.surfacePlan?.plane || "contextual";
    const surfaceMarkup = surfacePlane === "screen"
      ? `<line x1="${px - pw * .2}" y1="${py - ph * .3}" x2="${px + pw * .2}" y2="${py - ph * .3}"/>`
      : surfacePlane === "back"
        ? `<path d="M ${px - pw * .32} ${py - ph * .3} L ${px + pw * .3} ${py - ph * .18} L ${px + pw * .32} ${py + ph * .3}"/>`
        : surfacePlane === "side"
          ? `<line x1="${px + pw * .25}" y1="${py - ph * .38}" x2="${px + pw * .25}" y2="${py + ph * .38}"/>`
          : surfacePlane === "three_quarter"
            ? `<path d="M ${px - pw * .28} ${py - ph * .28} L ${px + pw * .25} ${py - ph * .2} L ${px + pw * .28} ${py + ph * .28}"/>`
            : "";
    const umbrellaMarkup = sharedUmbrella ? `<path d="M ${sharedUmbrella.canopy.x1} ${sharedUmbrella.canopy.y} Q ${sharedUmbrella.center.x} ${sharedUmbrella.canopy.y - recipe.height * .13} ${sharedUmbrella.canopy.x2} ${sharedUmbrella.canopy.y}"/><path d="M ${sharedUmbrella.shaft.x1} ${sharedUmbrella.shaft.y1} L ${sharedUmbrella.shaft.x2} ${sharedUmbrella.shaft.y2}"/>` : "";
    // The prop guide encodes only the object. Contact disks belong to the
    // OpenPose wrists; drawing them into Canny turns two hands into handles or
    // a cylindrical cage. A single surface cue is enough at base resolution.
    const propGuideSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${recipe.width}" height="${recipe.height}"><rect width="100%" height="100%" fill="black"/><g fill="none" stroke="white" stroke-width="${Math.max(5, recipe.width * .01)}" stroke-linecap="round" stroke-linejoin="round">${sharedUmbrella ? umbrellaMarkup : shapeMarkup}${surfaceMarkup}</g></svg>`);
    const propGuideImage = (await sharp(propGuideSvg).png().toBuffer()).toString("base64");
    const propGuideOutput = persistStageOutput("control_prop", initialPropInteraction.relationId || "legacy:1", propGuideImage);
    recipe.stageOutputs.push({ stage: "control_prop", relationId: initialPropInteraction.relationId || null, objectInstanceId: initialPropInteraction.objectInstanceId || null, output: propGuideOutput });
    const deferSmallPropFromUpperBodyBase = profilePlan.cpu && Boolean(initialPropInteraction.handMode);
    controlUnits.push({ enabled: true, module: "none", model: initialCannyModel, weight: .84, image: propGuideImage, resize_mode: "Just Resize", low_vram: true, processor_res: 512, threshold_a: 64, threshold_b: 128, guidance_start: 0, guidance_end: .78, control_mode: "Balanced", pixel_perfect: false, relationId: initialPropInteraction.relationId || "legacy:1", objectInstanceId: initialPropInteraction.objectInstanceId, expectedCount: initialPropInteraction.expectedCount || 1, shape: initialPropInteraction.shape, surfacePlan: initialPropInteraction.surfacePlan, geometry: guideGeometry, objectBounds: { x: (px - pw / 2) / recipe.width, y: (py - ph / 2) / recipe.height, width: pw / recipe.width, height: ph / recipe.height }, stage: deferSmallPropFromUpperBodyBase ? "deferred_prop_structure" : "initial_prop_structure", deferredReason: deferSmallPropFromUpperBodyBase ? "cpu_base_prioritizes_non_serial_pose_and_support; serial_prop_pass_owns_object" : null, guideEncoding: "precomputed_edge", sharedGeometryKey: guideGeometry.sharedGeometryKey || null, exclusionRegions: initialPropInteraction.surfacePlan?.exclusionRegions || [] });
  }
  const supportRelations = recipe.poseControl?.scenePlan?.supportRelations || [];
  if (initialCannyModel && supportRelations.length) {
    const supportMarkup = supportRelations.map((support) => {
      const x1 = support.visibleEdge.xStart * recipe.width;
      const x2 = support.visibleEdge.xEnd * recipe.width;
      const y = support.visibleEdge.y * recipe.height;
      const cx = support.pelvisAnchor.x * recipe.width;
      const width = Math.max(1, x2 - x1);
      const shape = support.supportKind === "sofa"
        ? `<path d="M ${x1} ${y} Q ${cx} ${y - recipe.height * .035} ${x2} ${y}"/><path d="M ${x1 + width * .08} ${y} L ${x1 + width * .08} ${y + recipe.height * .08}"/><path d="M ${x2 - width * .08} ${y} L ${x2 - width * .08} ${y + recipe.height * .08}"/>`
        : support.supportKind === "chair"
          ? `<path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1 + width * .12} ${y} L ${x1 + width * .2} ${y + recipe.height * .12}"/><path d="M ${x2 - width * .12} ${y} L ${x2 - width * .2} ${y + recipe.height * .12}"/>`
          : support.supportKind === "bed"
            ? `<path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1} ${y - recipe.height * .04} L ${x1} ${y + recipe.height * .08}"/>`
            : `<path d="M ${x1} ${y} L ${x2} ${y}"/>`;
      // OpenPose is the only control allowed to describe the actor skeleton.
      // Repeating torso/pelvis lines in a separate Canny unit can be interpreted
      // as a second person, especially in close and medium seated shots.  The
      // support guide therefore contains only the furniture/contact boundary;
      // torso/pelvis anchors remain in the recipe trace for validation.
      return shape;
    }).join("");
    const supportSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${recipe.width}" height="${recipe.height}"><rect width="100%" height="100%" fill="black"/><g fill="none" stroke="white" stroke-width="${Math.max(7, recipe.width * .014)}" stroke-linecap="round">${supportMarkup}</g></svg>`);
    controlUnits.push({ enabled: true, module: "none", model: initialCannyModel, weight: .64, image: (await sharp(supportSvg).png().toBuffer()).toString("base64"), resize_mode: "Just Resize", low_vram: true, processor_res: 512, threshold_a: 64, threshold_b: 128, guidance_start: 0, guidance_end: .68, control_mode: "Balanced", pixel_perfect: false, stage: "support_surface_geometry", guideEncoding: "precomputed_edge", supportSurfaceIds: supportRelations.map((support) => support.supportSurfaceId), supportKinds: supportRelations.map((support) => support.supportKind) });
    recipe.supportControl = { status: "requested", supportSurfaceIds: supportRelations.map((support) => support.supportSurfaceId), framingMode: recipe.poseControl?.framingMode || "unknown", actorSkeletonSource: "openpose_only", actorChainRenderedInCanny: false };
  }
  if (initialCannyModel && recipe.poseControl?.framingMode === "upper_body") {
    const visibleIndices = [...Array.from({ length: 8 }, (_, index) => index), 14, 15, 16, 17];
    const visibleBounds = (recipe.poseControl.people || []).map((person) => {
      const points = visibleIndices.map((index) => person[index]).filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      return { x: Math.max(0, minX - .035), y: Math.max(0, minY - .035), width: Math.min(1, maxX - minX + .07), height: Math.min(1, maxY - minY + .07) };
    });
    recipe.framingControl = { status: "prompt_and_openpose_applied", framingGeometry: recipe.poseControl.scenePlan?.framingGeometry || null, visibleBounds, hiddenJointIndices: recipe.poseControl.hiddenJointIndices || [], syntheticCannyBoxApplied: false };
  }
  const requestedControlUnits = [...controlUnits];
  const initialControlUnitCount = controlUnits.length;
  const requestedInitialControlStages = controlUnits.map((unit) => unit.stage || unit.role || "initial");
  controlUnits = selectControlUnitsForProfile(controlUnits, profilePlan.id);
  const appliedControlUnits = new Set(controlUnits);
  const omittedControlUnits = requestedControlUnits.filter((unit) => !appliedControlUnits.has(unit));
  const omittedInitialControlStages = omittedControlUnits.map((unit) => unit.stage || unit.role || "initial");
  const deferredDraftControlStages = omittedControlUnits
    .filter((unit) => unit.deferredReason)
    .map((unit) => unit.stage || unit.role || "initial");
  if (recipe.supportControl) {
    recipe.supportControl.status = controlUnits.some((unit) => unit.stage === "support_surface_geometry")
      ? "canny_control_applied"
      : "omitted_by_profile";
  }
  recipe.generationSpec.basePropControls = requestedControlUnits
    .filter((unit) => ["initial_prop_structure", "deferred_prop_structure"].includes(unit.stage))
    .map((unit) => ({
      relationId: unit.relationId || null,
      objectInstanceId: unit.objectInstanceId || null,
      requestedStage: unit.stage,
      status: appliedControlUnits.has(unit) ? "applied" : unit.deferredReason ? "deferred" : "omitted_by_profile",
      reason: appliedControlUnits.has(unit) ? null : unit.deferredReason || "generation_profile_control_unit_limit",
    }));
  recipe.identityReferenceControls = requestedControlUnits
    .filter((unit) => unit.stage === "identity_reference")
    .map((unit) => ({
      characterId: unit.characterId || null,
      status: appliedControlUnits.has(unit) ? "applied" : "omitted_by_profile",
      controlApplied: appliedControlUnits.has(unit),
      effectiveRegionMaskPrepared: Boolean(unit.effective_region_mask),
      effectiveRegionMaskApplied: appliedControlUnits.has(unit) && Boolean(unit.effective_region_mask),
      maskShape: unit.identityMaskPlan?.shape || null,
      maskBounds: unit.identityMaskPlan?.bounds || null,
      normalizedMaskBounds: unit.identityMaskPlan?.normalizedBounds || null,
      maskCenter: unit.identityMaskPlan?.center || null,
      characterRegion: unit.identityMaskPlan?.region || null,
      coordinateSources: unit.identityMaskPlan ? { x: unit.identityMaskPlan.sourceX, y: unit.identityMaskPlan.sourceY, shotClass: unit.identityMaskPlan.shotClass } : null,
    }));
  recipe.profileExecution = {
    profile: profilePlan.id,
    initialControlUnitCount,
    appliedInitialControlUnitCount: controlUnits.length,
    omittedInitialControlUnits: Math.max(0, initialControlUnitCount - controlUnits.length),
    requestedInitialControlStages,
    appliedInitialControlStages: controlUnits.map((unit) => unit.stage || unit.role || "initial"),
    omittedInitialControlStages,
    deferredDraftControlStages,
    draftRefinementsEnabled: phase !== "draft" || profilePlan.runDraftRefinements,
    executionStrategy: profilePlan.cpu ? "bounded_base_controls_with_serial_refinements" : "parallel_base_controls_with_serial_refinements",
  };
  const requiredControlCoverage = controlExecutionCoverage(requestedControlUnits, controlUnits, {
    runRefinements: phase !== "draft" || profilePlan.runDraftRefinements,
  });
  recipe.profileExecution.requiredControlCoverage = requiredControlCoverage;
  if (!requiredControlCoverage.complete) {
    throw new Error(`生成档位无法覆盖必需控制：${requiredControlCoverage.uncovered.map((item) => item.stage).join(", ")}`);
  }
  recipe.controlUnitTrace = controlUnits.map((unit, index) => ({
    order: index + 1,
    stage: unit.stage || "initial",
    module: unit.module,
    model: unit.model,
    relationId: unit.relationId || null,
    objectInstanceId: unit.objectInstanceId || null,
    expectedCount: unit.expectedCount || null,
    shape: unit.shape || null,
    supportSurfaceIds: unit.supportSurfaceIds || null,
    supportKinds: unit.supportKinds || null,
    framingGeometry: unit.framingGeometry || null,
    visibleBounds: unit.visibleBounds || null,
    geometry: unit.geometry ? { center: unit.geometry.center, bounds: unit.geometry.bounds, depthPlane: unit.geometry.depthPlane, occlusionOrder: unit.geometry.occlusionOrder, source: unit.geometry.source } : null,
    objectBounds: unit.objectBounds || null,
    surfacePlan: unit.surfacePlan ? { plane: unit.surfacePlan.plane, visibleFace: unit.surfacePlan.visibleFace, normal: unit.surfacePlan.normal, exclusionRegions: unit.surfacePlan.exclusionRegions } : null,
    sharedGeometryKey: unit.sharedGeometryKey || null,
    deferredReason: unit.deferredReason || null,
    characterId: unit.characterId || null,
    effectiveRegionMaskApplied: Boolean(unit.effective_region_mask),
    effectiveRegionMaskBounds: unit.identityMaskPlan?.bounds || null,
    normalizedEffectiveRegionMaskBounds: unit.identityMaskPlan?.normalizedBounds || null,
  }));
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
    const baseRequestPrompt = recipe.generationSpec.deferRequiredProps
        ? deferredBase.prompt
        : recipe.regionalPrompter?.enabled
        ? recipe.regionalPrompter.prompt
        : recipe.prompt;
    const suppressForegroundClutter = recipe.poseControl?.framingMode === "upper_body"
      && requiredBaseInteractions.some((item) => item?.handMode && item?.shape !== "umbrella");
    const raisedHandContact = suppressForegroundClutter
      && requiredBaseInteractions.some((item) => item?.handMode === "two" && Number(item?.objectCenter?.y ?? 1) <= .53);
    const upperBodyNegative = recipe.poseControl?.framingMode === "upper_body"
      ? "foreground human body, secondary human head or torso below the acting hands, unrelated foreground hands, foreground legs, foreground lap, visible floor or ground plane, foreground rug or carpet, point-of-view limbs, first-person hands, over-the-shoulder body"
      : "";
    const requestPayload = {
      prompt: recipe.poseControl?.framingMode === "upper_body" ? upperBodyVisiblePrompt(baseRequestPrompt, { suppressForegroundClutter, raisedHandContact }) : baseRequestPrompt,
      negative_prompt: [
        recipe.generationSpec.deferRequiredProps
          ? [recipe.negativePrompt, deferredBase.negative].join(", ")
          : recipe.negativePrompt,
        upperBodyNegative,
      ].filter(Boolean).join(", "),
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
      controlUnits: controlUnits.map((unit) => ({ module: unit.module, model: unit.model, weight: unit.weight, control_mode: unit.control_mode, relationId: unit.relationId || null, stage: unit.stage || "initial", characterId: unit.characterId || null, effectiveRegionMaskApplied: Boolean(unit.effective_region_mask), effectiveRegionMaskBounds: unit.identityMaskPlan?.bounds || null })),
      recordedAt: new Date().toISOString(),
    };
    if (phase === "final") {
      const draftRelativePath = String(recipe.approvedDraftPath || payload.draftImagePath || "").trim();
      if (draftRelativePath) {
        const draftPath = path.resolve(root, draftRelativePath);
        const draftStat = fs.existsSync(draftPath) ? fs.statSync(draftPath) : null;
        if (!draftStat?.isFile()) throw new Error("已批准的构图草稿不存在或不是图片文件");
        requestPayload.init_images = [
          fs.readFileSync(draftPath).toString("base64"),
        ];
        requestPayload.denoising_strength = recipe.denoisingStrength ?? 0.35;
        requestPayload.resize_mode = 0;
      }
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
  const initialStageOutput = persistStageOutput("initial", "base", response.images[0]);
  recipe.stageOutputs.push({ stage: "initial", relationId: null, output: initialStageOutput });
  // Close shots need a deterministic presentation crop because SD can complete
  // legs from a seated context even when lower-body joints and prompt clauses
  // are absent. Keep the uncropped source for final passes; approval stores the
  // preview separately and the final worker reapplies the identical crop only
  // after identity/prop/hand/gaze processing has finished in original coords.
  const framingCameraText = `${recipe.generationSpec?.visualSpec?.camera?.shotSize || ""} ${recipe.prompt || ""}`;
  const deterministicCloseCrop = /close-up|close shot|medium close-up|chest-up|head-and-shoulders|近景|胸像/i.test(framingCameraText);
  const framingPerson = recipe.poseControl?.people?.[0] || [];
  const occupancyPoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11]
    .map((index) => framingPerson[index])
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1);
  const poseOccupancyHeight = occupancyPoints.length
    ? Math.max(...occupancyPoints.map((point) => point.y)) - Math.min(...occupancyPoints.map((point) => point.y))
    : 0;
  const occupancyCropRequired = deterministicCloseCrop && poseOccupancyHeight < .68;
  if (phase === "draft" && recipe.poseControl?.framingMode === "upper_body" && Number(recipe.characterCount || 1) === 1 && (recipe.poseControl?.rasterPostCropRequired === true || occupancyCropRequired)) {
    const scale = Number(recipe.poseControl?.scenePlan?.framingGeometry?.scale || 1);
    const cropRatio = scale >= 1.5 ? .74 : scale >= 1.35 ? .82 : .9;
    const sourceBuffer = Buffer.from(response.images[0], "base64");
    const metadata = await sharp(sourceBuffer).metadata();
    const sourceWidth = metadata.width || recipe.width;
    const sourceHeight = metadata.height || recipe.height;
    const cropSize = Math.max(64, Math.floor(Math.min(sourceWidth, sourceHeight) * cropRatio));
    const horizontalPoints = [framingPerson[0], framingPerson[2], framingPerson[5], framingPerson[4], framingPerson[7]].filter(Boolean);
    const centerX = horizontalPoints.length
      ? horizontalPoints.reduce((sum, point) => sum + Number(point.x || 0), 0) / horizontalPoints.length
      : .5;
    const left = Math.max(0, Math.min(sourceWidth - cropSize, Math.round(centerX * sourceWidth - cropSize / 2)));
    const top = Math.max(0, Math.min(sourceHeight - cropSize, Math.round(sourceHeight * .02)));
    const framedBuffer = await sharp(sourceBuffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .resize(recipe.width, recipe.height, { fit: "fill" })
      .png()
      .toBuffer();
    response.images[0] = framedBuffer.toString("base64");
    const framedStageOutput = persistStageOutput("framing_post_crop", "upper_body", response.images[0]);
    recipe.stageOutputs.push({ stage: "framing_post_crop", relationId: null, output: framedStageOutput });
    recipe.framingPostCrop = {
      status: "applied",
      source: "poseControl.scenePlan.framingGeometry",
      sourceImagePath: initialStageOutput?.path || null,
      cropRatio,
      sourceBounds: { left, top, width: cropSize, height: cropSize },
      output: { width: recipe.width, height: recipe.height },
      poseOccupancyHeight,
    };
  } else if (phase === "draft" && recipe.poseControl?.framingMode === "upper_body" && Number(recipe.characterCount || 1) === 1) {
    recipe.framingPostCrop = {
      status: "not_required_pose_occupancy",
      source: "poseControl.people upper-body occupancy",
      poseOccupancyHeight,
      minimumOccupancyHeight: .68,
    };
  }
  if (recipe.requestTrace) recipe.requestTrace.stageOutputs = recipe.stageOutputs;
  const postprocessWarnings = [];
  const runRefinements = phase !== "draft" || profilePlan.runDraftRefinements;
  // CPU execution keeps peak memory bounded by staging identity separately from
  // the pose/structure controls. It also prevents a broad identity reference
  // from competing with later off-camera gaze reconstruction.
  const skipStandaloneIdentity = false;
  const identityReferences = (recipe.references || []).filter(
    (reference) => reference.role === "identity",
  );
  if (
    runRefinements && !skipStandaloneIdentity && identityReferences.length > 0 && recipe.identityRefinement?.enabled
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
      const identityTrace={type:"identity",order:recipe.faceRefinementPasses.length+1,characterId:reference.characterId,centerX:refinementPlan.center.x,centerY:refinementPlan.center.y,sourceX:refinementPlan.center.sourceX,sourceY:refinementPlan.center.sourceY,denoisingStrength:refinementPlan.denoisingStrength,identityControl:refinementPlan.identityControl,output:null};
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
        prompt: `${reference.characterPrompt || recipe.prompt}, detailed facial features, ${preservesOffCameraGaze ? "directional readable eyes with natural asymmetry, defined pupils, preserve the off-camera gaze, head angle and target direction, do not rotate the face toward the viewer" : "symmetrical readable eyes, defined pupils, soft frontal fill light, both eyes fully visible"}, defined nose and lips, clean facial contour, unobstructed face`,
        negative_prompt: `blurry face, featureless face, melted facial features, asymmetrical eyes, mismatched eyes, crossed eyes, malformed pupils, pointed ears, elf ears, animal ears, face hidden by hair, face covered by prop, deep shadow across eyes, wrong identity, wrong hair color, wrong eye color, duplicate face${allowsCameraGaze?"":", looking at viewer, eye contact with camera, front-facing portrait gaze"}`,
        init_images: [currentImage],
        mask,
        width,
        height,
        steps: phase === "draft" ? 12 : profilePlan.cpu ? 8 : 16,
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
                weight: offCameraGaze ? Math.min(refinementPlan.identityControl.weight, 0.68) : refinementPlan.identityControl.weight,
                image: fs.readFileSync(referencePath).toString("base64"),
                effective_region_mask: mask,
                resize_mode: "Crop and Resize",
                low_vram: true,
                processor_res: 512,
                guidance_start: 0,
                guidance_end: 1,
                control_mode: offCameraGaze ? "Balanced" : "ControlNet is more important",
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
        identityTrace.output = persistStageOutput("identity_refinement", reference.characterId, currentImage);
        recipe.stageOutputs.push({ stage: "identity_refinement", relationId: null, characterId: reference.characterId, output: identityTrace.output });
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
  const outfitReferences = (recipe.references || []).filter((reference) => reference.role === "outfit");
  if (runRefinements && outfitReferences.length) {
    let currentImage = response.images[0];
    for (const [outfitIndex, reference] of outfitReferences.entries()) {
      if (status() === "cancelled") process.exit(0);
      const characterRegions = recipe.generationSpec?.characterRegions || [];
      const characterIndex = characterRegions.findIndex((item) => item.characterId === reference.characterId);
      const poseIndex = characterIndex >= 0 ? characterIndex : outfitIndex;
      const person = recipe.poseControl?.people?.[poseIndex] || [];
      const region = reference.region || characterRegions[poseIndex]?.region || { xStart: 0, xEnd: 1 };
      const shoulders = [person[2], person[5]].filter(Boolean);
      const hips = [person[8], person[11]].filter(Boolean);
      const left = Math.max(region.xStart, Math.min(...(shoulders.length ? shoulders : [{ x: region.xStart + .18 }]).map((point) => point.x)) - .12);
      const right = Math.min(region.xEnd, Math.max(...(shoulders.length ? shoulders : [{ x: region.xEnd - .18 }]).map((point) => point.x)) + .12);
      const top = Math.max(.12, Math.min(...(shoulders.length ? shoulders : [{ y: .28 }]).map((point) => point.y)) - .04);
      const hipY = Math.max(...(hips.length ? hips : [{ y: .68 }]).map((point) => point.y));
      const bottom = Math.min(1, Math.max(top + .28, hipY + .3));
      const facePoint = person[0];
      const referencePath = path.resolve(root, reference.path);
      const garmentZones = outfitGarmentZones(reference.outfitPrompt || reference.name);
      const outfitTrace = { stage: "outfit_refinement", characterId: reference.characterId, requestStatus: "pending", outfitAssetId: reference.assetId || null, outfitPrompt: reference.outfitPrompt || "", garmentZones, maskBounds: { xStart: left, xEnd: right, yStart: top, yEnd: bottom }, outputs: [], output: null };
      recipe.passTraces = recipe.passTraces || [];
      recipe.passTraces.push(outfitTrace);
      update(phase === "draft" ? "draft_running" : "final_running", 94, "", `正在落实第 ${outfitIndex + 1}/${outfitReferences.length} 个人物服装`);
      try {
        if (!fs.existsSync(referencePath)) throw new Error("已选择服装参考文件不存在");
        if (!reference.isolatedGarmentReference) {
          outfitTrace.requestStatus = "skipped_unisolated_reference";
          outfitTrace.skipReason = "局部服装精修仅接受隔离服装参考；保留基础生成已建立的服装与人物结构";
          outfitTrace.output = persistStageOutput("outfit_refinement_skipped", reference.characterId, currentImage);
          recipe.stageOutputs.push({ stage: "outfit_refinement_skipped", relationId: null, characterId: reference.characterId, output: outfitTrace.output });
          continue;
        }
        for (const garment of garmentZones) {
          const zoneTop = garment.zone === "lower" ? Math.max(top + .2, hipY - .08) : top;
          const zoneBottom = garment.zone === "upper" ? Math.min(bottom, hipY + .06) : bottom;
          const faceProtection = facePoint && garment.zone !== "lower"
            ? `<ellipse cx="${facePoint.x * recipe.width}" cy="${facePoint.y * recipe.height}" rx="${recipe.width * .14}" ry="${recipe.height * .19}" fill="black"/>`
            : "";
          const maskSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${recipe.width}" height="${recipe.height}"><rect width="100%" height="100%" fill="black"/><path d="M ${left * recipe.width} ${zoneTop * recipe.height} L ${right * recipe.width} ${zoneTop * recipe.height} L ${Math.min(region.xEnd, right + .08) * recipe.width} ${zoneBottom * recipe.height} L ${Math.max(region.xStart, left - .08) * recipe.width} ${zoneBottom * recipe.height} Z" fill="white"/>${faceProtection}</svg>`);
          const outfitMask = (await sharp(maskSvg).png().toBuffer()).toString("base64");
          const useVisualReference = shouldUseOutfitVisualReference(garment.zone, reference.isolatedGarmentReference);
          const outfitPayload = {
            prompt: ["masterpiece, best quality, anime illustration", `(${garment.prompt}:1.9)`, `apply the exact garment category and color only to the ${garment.zone === "full" ? "clothing" : garment.zone + "-body clothing region"}`, "the named color belongs to this garment and no other garment", "preserve every garment outside this region unchanged", "preserve the established body pose, face, hair, hands and composition"].join(", "),
            negative_prompt: [recipe.negativePrompt, "wrong outfit, wrong garment color, color assigned to the wrong garment, changed garment category, missing clothing layer, extra coat, extra accessories, changed face, changed hair, changed pose"].join(", "),
            init_images: [currentImage], mask: outfitMask, width: recipe.width, height: recipe.height,
            steps: profilePlan.cpu ? 8 : 12, cfg_scale: 6.8, denoising_strength: .48,
            sampler_name: recipe.sampler, scheduler: recipe.scheduler, batch_size: 1, n_iter: 1,
            mask_blur: 8, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 40, send_images: true,
            ...(useVisualReference ? { alwayson_scripts: { ControlNet: { args: [{ enabled: true, module: reference.module, model: reference.model, weight: Math.max(.32, Number(reference.weight || .36) * .8), image: fs.readFileSync(referencePath).toString("base64"), effective_region_mask: outfitMask, resize_mode: "Crop and Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .82, control_mode: "Balanced", pixel_perfect: true }] } } } : {}),
          };
          const outfitResult = await postJson(recipe.endpoint.replace(/\/txt2img$/, "/img2img"), outfitPayload);
          if (outfitResult.status < 200 || outfitResult.status >= 300) throw new Error(`服务返回 ${outfitResult.status}：${outfitResult.body.slice(0, 180)}`);
          const outfitResponse = JSON.parse(outfitResult.body);
          if (!outfitResponse.images?.[0]) throw new Error("服装精修没有返回图片");
          currentImage = await compositeMaskedOutput(currentImage, outfitResponse.images[0], outfitMask);
          const zoneOutput = persistStageOutput(`outfit_${garment.zone}`, reference.characterId, currentImage);
          outfitTrace.outputs.push({ zone: garment.zone, prompt: garment.prompt, visualReferenceApplied: useVisualReference, output: zoneOutput });
          recipe.stageOutputs.push({ stage: `outfit_${garment.zone}`, relationId: null, characterId: reference.characterId, output: zoneOutput });
        }
        outfitTrace.output = persistStageOutput("outfit_refinement", reference.characterId, currentImage);
        recipe.stageOutputs.push({ stage: "outfit_refinement", relationId: null, characterId: reference.characterId, output: outfitTrace.output });
        outfitTrace.requestStatus = "succeeded";
      } catch (error) {
        outfitTrace.requestStatus = "failed";
        const warning = `人物服装精修未应用，已保留上一阶段图片：${error instanceof Error ? error.message : String(error)}`;
        outfitTrace.error = warning;
        postprocessWarnings.push(warning);
        update(phase === "draft" ? "draft_running" : "final_running", 94, "", warning);
      }
    }
    response = { ...response, images: [currentImage] };
  }
  const propInteraction=recipe.generationSpec?.repairPasses?.propInteraction;
  const propInteractions=runRefinements ? (recipe.generationSpec?.repairPasses?.propInteractions || (propInteraction ? [propInteraction] : [])) : [];
  const relationGazeCoveredCharacterIds = new Set();
  recipe.relationTraces = propInteractions.map((item, index) => ({ relationId: item.relationId || `legacy:${index + 1}`, characterId: item.characterId || "", object: item.object || "", objectInstanceId: item.objectInstanceId || `prop:${item.object || "story-object"}`, expectedCount: item.expectedCount || 1, executor: item.executor || "generic_prop", passGraph: recipe.generationSpec?.repairPasses?.passGraph?.find((pass) => pass.relationId === (item.relationId || `legacy:${index + 1}`)) || null, required: Boolean(item?.required), orientation: item.orientation || "", handMode: item.handMode || "", targetCenter: item.objectCenter || null, surfacePlan: item.surfacePlan || null, exclusionRegions: item.surfacePlan?.exclusionRegions || [], status: item?.required ? "queued" : "not_required" }));
  const updateRelationTrace = (relationId, status, error = "") => {
    const trace = recipe.relationTraces.find((item) => item.relationId === relationId);
    if (trace) Object.assign(trace, { status: status === "request_succeeded" ? "semantic_pending" : status, ...(status === "request_succeeded" ? { requestStatus: "succeeded" } : {}), ...(error ? { error } : {}) });
  };
  for (const propInteraction of propInteractions.filter((item) => item?.required && (item.executor || "generic_prop") !== "umbrella_handoff")) {
  const relationId = propInteraction.relationId || `legacy:${propInteractions.indexOf(propInteraction) + 1}`;
  updateRelationTrace(relationId, "executing");
  let relationFailed = false;
  if(propInteraction.required && response.images?.[0]) {
    if(status()==="cancelled")process.exit(0);
    const width=recipe.width,height=recipe.height;
    const characterIndexForGeometry = (recipe.generationSpec?.characterRegions || []).findIndex((item) => item.characterId === propInteraction.characterId);
    const geometry = propInteractionGeometry(propInteraction, recipe.poseControl?.people || [], characterIndexForGeometry >= 0 ? characterIndexForGeometry : 0, width, height, recipe.poseControl?.scenePlan?.people || []);
    const relationTrace = recipe.relationTraces.find((item) => item.relationId === relationId);
    if (relationTrace) Object.assign(relationTrace, { geometryBounds: geometry.bounds, contactAnchors: geometry.contacts, depthPlane: geometry.depthPlane, occlusionOrder: geometry.occlusionOrder, geometrySource: geometry.source, shape: propInteraction.shape, surfaceNormal: propInteraction.surfacePlan?.normal || null, surfacePlane: propInteraction.surfacePlan?.plane || "contextual", exclusionRegions: propInteraction.surfacePlan?.exclusionRegions || [] });
    const centerX=width*geometry.center.x;
    const centerY=height*geometry.center.y;
    const radiusX=width*geometry.bounds.width*.56;
    const radiusY=height*geometry.bounds.height*.72;
    const portrait=propInteraction.orientation==="portrait";
    const landscape=propInteraction.orientation==="landscape";
    // Keep the refinement silhouette identical to the base-stage guide.  The
    // geometry bounds include the hand-contact span, so treating the complete
    // bounds as the object body makes a portable prop several times too large.
    const objectWidth=width*geometry.bodySize.width;
    const objectHeight=height*geometry.bodySize.height;
    const objectHalfWidth=objectWidth/2;
    const objectHalfHeight=objectHeight/2;
    // Object/contact reconstruction and eye direction operate at very different
    // spatial scales. Keep them as sequential passes on every profile so the
    // large hand/prop mask cannot dilute or overwrite the gaze instruction.
    const mergeGazeIntoProp = false;
    const facePoint = recipe.poseControl?.people?.[characterIndexForGeometry >= 0 ? characterIndexForGeometry : 0]?.[0];
    const gazeMarkup = mergeGazeIntoProp && facePoint
      ? `<ellipse cx="${facePoint.x * width}" cy="${facePoint.y * height}" rx="${Math.max(38, width * .09)}" ry="${Math.max(48, height * .12)}" fill="white"/>`
      : "";
    // The base model may place a required prop near, but not exactly on, its
    // declared center. Include a bounded uncertainty corridor around the target
    // and both contact anchors so an existing misplaced prop is replaced rather
    // than left outside the mask and duplicated at the canonical location.
    const deferredProp = recipe.generationSpec?.deferRequiredProps === true;
    const maskPaddingX = Math.max(3, objectHalfWidth * .14);
    const maskPaddingY = Math.max(4, objectHalfHeight * .1);
    const uncertaintyMarkup = deferredProp ? "" : `<rect x="${Math.max(0, centerX-objectHalfWidth-maskPaddingX*2)}" y="${Math.max(0, centerY-objectHalfHeight-maskPaddingY*2)}" width="${Math.min(width, objectWidth+maskPaddingX*4)}" height="${Math.min(height, objectHeight+maskPaddingY*4)}" rx="${Math.max(8, objectHalfWidth*.2)}" fill="white"/>`;
    // Hands are deliberately excluded here.  They have their own contact and
    // HandRefiner passes; letting the object pass repaint them creates cuffs,
    // mechanical fingers and a feedback loop around malformed base hands.
    const maskSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/>${uncertaintyMarkup}<rect x="${centerX-objectHalfWidth-maskPaddingX}" y="${centerY-objectHalfHeight-maskPaddingY}" width="${objectWidth+maskPaddingX*2}" height="${objectHeight+maskPaddingY*2}" rx="${Math.max(8,objectHalfWidth*.2)}" fill="white"/>${gazeMarkup}</svg>`);
    const mask=(await sharp(maskSvg).png().toBuffer()).toString("base64");
    const shape=propInteraction.shape||"landscape_rect",stroke=Math.max(5,Math.round(Math.min(width,height)*.012));
    const sx=centerX-radiusX*.46,sy=centerY-radiusY*.5,sw=radiusX*.92,sh=radiusY;
    const shapeMarkup=(shape==="portrait_rect"||shape==="landscape_rect")
      ? portrait
        ? `<rect x="${centerX-objectHalfWidth}" y="${centerY-objectHalfHeight}" width="${objectWidth}" height="${objectHeight}" rx="${stroke*1.6}"/>`
        : landscape
          ? `<rect x="${centerX-objectHalfWidth}" y="${centerY-objectHalfHeight}" width="${objectWidth}" height="${objectHeight}" rx="${stroke*1.6}"/>`
          : `<rect x="${centerX-sw*.4}" y="${centerY-sh*.32}" width="${sw*.8}" height="${sh*.64}" rx="${stroke*1.4}"/>`
      : shape==="cylinder"?`<path d="M ${centerX-sw*.2} ${centerY-sh*.38} L ${centerX-sw*.17} ${centerY+sh*.38} Q ${centerX} ${centerY+sh*.48} ${centerX+sw*.17} ${centerY+sh*.38} L ${centerX+sw*.2} ${centerY-sh*.38} Z"/><ellipse cx="${centerX}" cy="${centerY-sh*.38}" rx="${sw*.2}" ry="${sh*.08}"/>`
      : shape==="umbrella"?`<path d="M ${centerX-sw*.48} ${centerY-sh*.12} Q ${centerX} ${centerY-sh*.75} ${centerX+sw*.48} ${centerY-sh*.12}"/><path d="M ${centerX} ${centerY-sh*.5} L ${centerX} ${centerY+sh*.45} q 0 ${sh*.16} ${-sw*.12} ${sh*.16}"/>`
      : shape==="bag"?`<rect x="${sx}" y="${centerY-sh*.18}" width="${sw}" height="${sh*.62}" rx="${stroke*2}"/><path d="M ${centerX-sw*.28} ${centerY-sh*.18} Q ${centerX} ${centerY-sh*.7} ${centerX+sw*.28} ${centerY-sh*.18}"/>`
      : shape==="dish"?`<ellipse cx="${centerX}" cy="${centerY}" rx="${sw*.48}" ry="${sh*.22}"/>`
      : shape==="elongated"?`<path d="M ${centerX-sw*.38} ${centerY+sh*.22} L ${centerX+sw*.34} ${centerY-sh*.28}"/><rect x="${centerX-sw*.46}" y="${centerY+sh*.16}" width="${sw*.22}" height="${sh*.16}" rx="${stroke}" transform="rotate(-35 ${centerX-sw*.35} ${centerY+sh*.24})"/>`
      : `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${stroke}"/><path d="M ${centerX} ${sy} L ${centerX} ${sy+sh}"/>`;
    const postSurfaceMarkup = propInteraction.surfacePlan?.plane === "screen"
      ? portrait
        ? `<rect x="${centerX - objectHalfWidth * .72}" y="${centerY - objectHalfHeight * .78}" width="${objectWidth * .72}" height="${objectHeight * .72}" rx="${stroke * .7}"/><line x1="${centerX - objectHalfWidth * .45}" y1="${centerY - objectHalfHeight * .5}" x2="${centerX + objectHalfWidth * .45}" y2="${centerY - objectHalfHeight * .5}"/>`
        : `<rect x="${centerX - objectHalfWidth * .78}" y="${centerY - objectHalfHeight * .7}" width="${objectWidth * .78}" height="${objectHeight * .7}" rx="${stroke}"/><line x1="${centerX - objectHalfWidth * .58}" y1="${centerY - objectHalfHeight * .32}" x2="${centerX + objectHalfWidth * .58}" y2="${centerY - objectHalfHeight * .32}"/>`
      : propInteraction.surfacePlan?.plane === "back"
        ? `<path d="M ${centerX - sw * .3} ${centerY - sh * .28} L ${centerX + sw * .28} ${centerY - sh * .16} L ${centerX + sw * .3} ${centerY + sh * .28}"/>`
        : propInteraction.surfacePlan?.plane === "side"
          ? `<line x1="${centerX + sw * .26}" y1="${centerY - sh * .36}" x2="${centerX + sw * .26}" y2="${centerY + sh * .36}"/>`
          : propInteraction.surfacePlan?.plane === "three_quarter"
            ? `<path d="M ${centerX - sw * .26} ${centerY - sh * .26} L ${centerX + sw * .24} ${centerY - sh * .18} L ${centerX + sw * .26} ${centerY + sh * .26}"/>`
            : "";
    const posePerson = recipe.poseControl?.people?.[characterIndexForGeometry >= 0 ? characterIndexForGeometry : 0] || [];
    // Actor joints belong exclusively to OpenPose.  Repeating elbow/wrist
    // chains in an object Canny guide makes SD interpret limbs as rigid object
    // edges (often a diamond or mechanical frame around the prop).
    const guideSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${shapeMarkup}${postSurfaceMarkup}</g></svg>`);
    const guide=(await sharp(guideSvg).png().toBuffer()).toString("base64");
    const refinementGuideOutput = persistStageOutput("control_prop_refinement", relationId, guide);
    const refinementMaskOutput = persistStageOutput("mask_prop_refinement", relationId, mask);
    recipe.stageOutputs.push({ stage: "control_prop_refinement", relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: refinementGuideOutput });
    recipe.stageOutputs.push({ stage: "mask_prop_refinement", relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: refinementMaskOutput });
    // A phone-sized or tool-sized object is only a few dozen pixels in the
    // full frame. Full-frame img2img cannot reliably recover its semantic
    // category even when the edge guide is correct. Crop a square context
    // around the canonical object, upscale it for the model, then map the
    // masked result back. This is derived entirely from structured geometry
    // and therefore applies to every portable object category.
    const propCropSize = Math.max(128, Math.min(width, height, Math.ceil(Math.max(objectWidth * 3.4, objectHeight * 2.2))));
    const propCropLeft = Math.max(0, Math.min(width - propCropSize, Math.round(centerX - propCropSize / 2)));
    const propCropTop = Math.max(0, Math.min(height - propCropSize, Math.round(centerY - propCropSize / 2)));
    const propModelResolution = 512;
    const [localBaseBuffer, localMaskBuffer, localGuideBuffer] = await Promise.all([
      sharp(Buffer.from(response.images[0], "base64")).extract({ left: propCropLeft, top: propCropTop, width: propCropSize, height: propCropSize }).resize(propModelResolution, propModelResolution, { fit: "fill" }).png().toBuffer(),
      sharp(Buffer.from(mask, "base64")).extract({ left: propCropLeft, top: propCropTop, width: propCropSize, height: propCropSize }).resize(propModelResolution, propModelResolution, { fit: "fill", kernel: "nearest" }).png().toBuffer(),
      sharp(Buffer.from(guide, "base64")).extract({ left: propCropLeft, top: propCropTop, width: propCropSize, height: propCropSize }).resize(propModelResolution, propModelResolution, { fit: "fill", kernel: "nearest" }).png().toBuffer(),
    ]);
    const localBase = localBaseBuffer.toString("base64");
    const localMask = localMaskBuffer.toString("base64");
    const localGuide = localGuideBuffer.toString("base64");
    const cannyModel=recipe.generationSpec?.structureControl?.cannyModel;
    const propControlUnits = [];
    if (cannyModel) propControlUnits.push({enabled:true,module:"none",model:cannyModel,weight:.88,image:localGuide,effective_region_mask:localMask,resize_mode:"Just Resize",low_vram:true,processor_res:512,threshold_a:64,threshold_b:128,guidance_start:0,guidance_end:.82,control_mode:"Balanced",pixel_perfect:false,guideEncoding:"precomputed_edge",relationId,objectInstanceId:propInteraction.objectInstanceId,expectedCount:propInteraction.expectedCount || 1,shape: propInteraction.shape, surfacePlan: propInteraction.surfacePlan, depthPlane: geometry.depthPlane, occlusionOrder: geometry.occlusionOrder});
    if (mergeGazeIntoProp) {
      const identityReference = identityReferenceForCharacter(identityReferences, propInteraction.characterId, characterIndexForGeometry >= 0 ? characterIndexForGeometry : 0);
      const identityPath = identityReference?.path ? path.resolve(root, identityReference.path) : "";
      if (identityReference && identityPath && fs.existsSync(identityPath)) propControlUnits.push({
        enabled: true, module: identityReference.module, model: identityReference.model,
        weight: Math.min(.62, Number(identityReference.weight || .68)), image: fs.readFileSync(identityPath).toString("base64"),
        effective_region_mask: localMask, resize_mode: "Crop and Resize", low_vram: true, processor_res: 512,
        guidance_start: 0, guidance_end: .9, control_mode: "Balanced", pixel_perfect: true,
        relationId, objectInstanceId: propInteraction.objectInstanceId, role: "identity_preservation",
      });
    }
    update(phase==="draft"?"draft_running":"final_running",95,"",`正在校正手部与剧情道具：${propInteraction.object}`);
    const appearanceContract = propAppearanceContract(propInteraction);
    const payload={
      prompt:["masterpiece, best quality, anime illustration",...(propInteraction.positive||[]),...appearanceContract.positive,`one coherent ${propInteraction.object}, exactly one story instance ${propInteraction.objectInstanceId || relationId}, ${propInteraction.orientation} orientation, ${propInteraction.viewerSurface} surface readable to the viewer without flattening the character-facing angle, ${propInteraction.handMode}-hand interaction`,`preserve the declared ${propInteraction.surfacePlan?.plane || "contextual"} surface plane and normal ${JSON.stringify(propInteraction.surfacePlan?.normal || { x: 0, y: 0 })}`,`respect exclusion regions ${JSON.stringify(propInteraction.surfacePlan?.exclusionRegions || [])}`,`hands in front of the object only at declared wrist anchors, ${geometry.occlusionOrder}`,"anatomically credible hands, only fingers required by the grip remain visible, physically credible object contact, preserve the shared depth plane and wrist anchors"].filter(Boolean).join(", "),
      negative_prompt:[recipe.negativePrompt,...(propInteraction.negative||[]),...appearanceContract.negative,"malformed hands, extra fingers, missing fingers, fused fingers, detached object, duplicated prop, oversized prop, prop transformed into an unrelated object, foreground display prop, pseudo-text"].filter(Boolean).join(", "),
      init_images:[localBase],mask:localMask,width:propModelResolution,height:propModelResolution,
      steps:phase==="draft"?10:14,cfg_scale:6.4,
      denoising_strength:phase==="draft"?0.5:0.58,
      sampler_name:recipe.sampler,scheduler:recipe.scheduler,batch_size:1,n_iter:1,
      mask_blur:8,inpainting_fill:1,inpaint_full_res:false,inpaint_full_res_padding:0,send_images:true,
      ...(propControlUnits.length?{alwayson_scripts:{ControlNet:{args:propControlUnits}}}:{}),
    };
    recipe.passTraces = recipe.passTraces || [];
    const propPassTrace = { stage: "generic_prop", relationId, objectInstanceId: propInteraction.objectInstanceId || null, requestStatus: "pending", output: null, shape: propInteraction.shape || null, surfacePlan: propInteraction.surfacePlan || null, maskBounds: geometry.bounds, objectPixelBounds: { x: centerX-objectHalfWidth, y: centerY-objectHalfHeight, width: objectWidth, height: objectHeight }, localCropBounds: { left: propCropLeft, top: propCropTop, width: propCropSize, height: propCropSize }, modelResolution: { width: propModelResolution, height: propModelResolution }, maskIncludesHands: false, guideIncludesActorSkeleton: false, poseControlExcludedFromObjectPass: true, guideOutput: refinementGuideOutput, maskOutput: refinementMaskOutput, contactAnchors: geometry.contacts, depthPlane: geometry.depthPlane, occlusionOrder: geometry.occlusionOrder, gazeMerged: mergeGazeIntoProp, controlUnits: propControlUnits.map((unit) => ({ module: unit.module, model: unit.model, weight: unit.weight, controlMode: unit.control_mode, relationId: unit.relationId || null, objectInstanceId: unit.objectInstanceId || null })), exclusionRegions: propInteraction.surfacePlan?.exclusionRegions || [] };
    recipe.passTraces.push(propPassTrace);
    try {
      const result=await postJson(recipe.endpoint.replace(/\/txt2img$/,"/img2img"),payload);
      if(result.status<200||result.status>=300)throw new Error(`服务返回 ${result.status}：${result.body.slice(0,180)}`);
      const repaired=JSON.parse(result.body);
      if(!repaired.images?.[0])throw new Error("没有返回图片");
      const repairedLocal = await compositeMaskedOutput(localBase, repaired.images[0], localMask);
      const repairedPatch = await sharp(Buffer.from(repairedLocal, "base64")).resize(propCropSize, propCropSize, { fit: "fill" }).png().toBuffer();
      const repairedFull = await sharp(Buffer.from(response.images[0], "base64")).composite([{ input: repairedPatch, left: propCropLeft, top: propCropTop }]).png().toBuffer();
      response={...response,images:[repairedFull.toString("base64")]};
      propPassTrace.output = persistStageOutput("generic_prop", relationId, response.images[0]);
      recipe.stageOutputs.push({ stage: "generic_prop", relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: propPassTrace.output });
      propPassTrace.requestStatus = "succeeded";
      updateRelationTrace(relationId, "request_succeeded");
    } catch(error) {
      relationFailed = true;
      const warning=`剧情道具与手部校正失败，已保留上一阶段图片：${error instanceof Error?error.message:String(error)}`;
      postprocessWarnings.push(warning);
      update(phase==="draft"?"draft_running":"final_running",96,"",warning);
      propPassTrace.requestStatus = "failed";
      updateRelationTrace(relationId, "failed", warning);
    }
    if (response.images?.[0] && geometry.contacts.length > 0 && poseImageBase64 && poseControl?.model) {
      const contactStroke = Math.max(18, Math.round(Math.min(width, height) * .045));
      const contactMasks = await Promise.all(geometry.contacts.map(async (anchor) => {
        const elbowIndex = anchor.hand === "left" ? 6 : 3;
        const elbow = posePerson[elbowIndex] || anchor;
        // Repaint only the hand/wrist and a short proximal bridge.  Masking the
        // complete elbow-to-wrist chain at full-frame resolution makes the
        // contact pass invent replacement forearms or mechanical braces.
        const bridge = { x: anchor.x + (elbow.x - anchor.x) * .24, y: anchor.y + (elbow.y - anchor.y) * .24 };
        const coreInsetX = Math.max(4, objectHalfWidth * .28);
        const coreInsetY = Math.max(4, objectHalfHeight * .18);
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g fill="white" stroke="white" stroke-width="${contactStroke}" stroke-linecap="round"><path d="M ${bridge.x * width} ${bridge.y * height} L ${anchor.x * width} ${anchor.y * height}"/><circle cx="${anchor.x * width}" cy="${anchor.y * height}" r="${contactStroke * .72}"/></g><rect x="${centerX - objectHalfWidth + coreInsetX}" y="${centerY - objectHalfHeight + coreInsetY}" width="${Math.max(1, objectHalfWidth * 2 - coreInsetX * 2)}" height="${Math.max(1, objectHalfHeight * 2 - coreInsetY * 2)}" rx="${Math.max(4, Math.min(objectHalfWidth, objectHalfHeight) * .12)}" fill="black"/></svg>`);
        return { anchor, mask: (await sharp(svg).png().toBuffer()).toString("base64") };
      }));
      const contactTrace = { stage: "contact_completion", relationId, objectInstanceId: propInteraction.objectInstanceId || null, requestStatus: "pending", mode: "sequential_per_hand_local_inpaint", contactAnchors: geometry.contacts, outputs: [], output: null };
      recipe.passTraces.push(contactTrace);
      update(phase === "draft" ? "draft_running" : "final_running", 96, "", `正在补全 ${geometry.contacts.length} 个手物接触点：${propInteraction.object}`);
      try {
        for (const [contactIndex, contact] of contactMasks.entries()) {
          const contactControls = [
            { enabled: true, module: poseControl.module || "none", model: poseControl.model, weight: .62, image: poseImageBase64, effective_region_mask: contact.mask, resize_mode: "Just Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .7, control_mode: "Balanced", pixel_perfect: false },
          ];
          const contactResult = await postJson(recipe.endpoint.replace(/\/txt2img$/, "/img2img"), {
            prompt: ["masterpiece, best quality, anime illustration", `one anatomically correct ${contact.anchor.hand} hand`, "five separated natural fingers with plausible joints", "coherent wrist continuing from the existing forearm", `the hand visibly wraps around its own edge of the established ${propInteraction.object}`, "preserve the existing object core shape position orientation and the opposite hand"].join(", "),
            negative_prompt: [recipe.negativePrompt, "fused fingers, elongated fingers, extra fingers, missing fingers, detached hand, extra hand, mechanical hand, cuff replacing wrist, changed prop, moved prop, duplicate prop"].join(", "),
            init_images: [response.images[0]], mask: contact.mask, width, height,
            steps: profilePlan.cpu ? 9 : 12, cfg_scale: 6, denoising_strength: .5,
            sampler_name: recipe.sampler, scheduler: recipe.scheduler, batch_size: 1, n_iter: 1,
            mask_blur: 6, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 64, send_images: true,
            alwayson_scripts: { ControlNet: { args: contactControls } },
          });
          if (contactResult.status < 200 || contactResult.status >= 300) throw new Error(`${contact.anchor.hand} 手接触补全返回 ${contactResult.status}：${contactResult.body.slice(0, 180)}`);
          const contactResponse = JSON.parse(contactResult.body);
          if (!contactResponse.images?.[0]) throw new Error(`${contact.anchor.hand} 手接触补全没有返回图片`);
          response = { ...response, images: [await compositeMaskedOutput(response.images[0], contactResponse.images[0], contact.mask)] };
          const contactOutput = persistStageOutput(`contact_completion_${contact.anchor.hand}`, relationId, response.images[0]);
          contactTrace.outputs.push({ hand: contact.anchor.hand, order: contactIndex + 1, output: contactOutput });
          recipe.stageOutputs.push({ stage: `contact_completion_${contact.anchor.hand}`, relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: contactOutput });
        }
        contactTrace.output = contactTrace.outputs.at(-1)?.output || null;
        contactTrace.requestStatus = "succeeded";
      } catch (error) {
        relationFailed = true;
        contactTrace.requestStatus = "failed";
        const warning = `手物接触补全未应用，已保留道具阶段图片：${error instanceof Error ? error.message : String(error)}`;
        contactTrace.error = warning;
        postprocessWarnings.push(warning);
        update(phase === "draft" ? "draft_running" : "final_running", 96, "", warning);
      }
    }
    if (response.images?.[0] && recipe.handRefinement?.enabled && recipe.handRefinement?.model && geometry.contacts.length) {
      const contactSpanPx = geometry.contacts.length > 1 ? Math.max(...geometry.contacts.map((anchor) => anchor.x * width)) - Math.min(...geometry.contacts.map((anchor) => anchor.x * width)) : Infinity;
      const handRadius = Math.max(22, Math.min(34, Math.round(Math.min(width, height) * .06), Number.isFinite(contactSpanPx) ? Math.floor(contactSpanPx * .44) : 34));
      const handMasks = await Promise.all(geometry.contacts.map(async (anchor) => {
        const elbowIndex = anchor.hand === "left" ? 6 : 3;
        const elbow = posePerson[elbowIndex] || anchor;
        const bridge = { x: anchor.x + (elbow.x - anchor.x) * .2, y: anchor.y + (elbow.y - anchor.y) * .2 };
        const coreInsetX = Math.max(3, objectHalfWidth * .24), coreInsetY = Math.max(3, objectHalfHeight * .14);
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g fill="white" stroke="white" stroke-width="${Math.max(12, handRadius * .68)}" stroke-linecap="round"><path d="M ${bridge.x * width} ${bridge.y * height} L ${anchor.x * width} ${anchor.y * height}"/><circle cx="${anchor.x * width}" cy="${anchor.y * height}" r="${handRadius}"/></g><rect x="${centerX-objectHalfWidth+coreInsetX}" y="${centerY-objectHalfHeight+coreInsetY}" width="${Math.max(1,objectWidth-coreInsetX*2)}" height="${Math.max(1,objectHeight-coreInsetY*2)}" rx="${Math.max(3,objectHalfWidth*.12)}" fill="black"/></svg>`);
        return { anchor, mask: (await sharp(svg).png().toBuffer()).toString("base64") };
      }));
      const handTrace = { stage: "hand_refinement", relationId, objectInstanceId: propInteraction.objectInstanceId || null, requestStatus: "detecting", detector: recipe.handRefinement.module, model: recipe.handRefinement.model, weight: recipe.handRefinement.weight, mode: "sequential_per_hand_protected_prop_core", contactAnchors: geometry.contacts, maskRadiusPx: handRadius, masksOverlapPreventedByContactSpan: geometry.contacts.length < 2 || handRadius * 2 <= contactSpanPx, depthOutput: null, outputs: [], output: null, detectionVariance: null };
      recipe.passTraces.push(handTrace);
      update(phase === "draft" ? "draft_running" : "final_running", 96, "", `正在检测并修复手部：${propInteraction.object}`);
      try {
        const contactXs = geometry.contacts.map((anchor) => anchor.x * width);
        const contactYs = geometry.contacts.map((anchor) => anchor.y * height);
        const cropCenterX = (Math.min(...contactXs) + Math.max(...contactXs)) / 2;
        const cropCenterY = (Math.min(...contactYs) + Math.max(...contactYs)) / 2;
        const detectorCropSize = Math.min(width, height, Math.max(192, Math.round(Math.min(width, height) * .46)));
        const detectorLeft = Math.max(0, Math.min(width - detectorCropSize, Math.round(cropCenterX - detectorCropSize / 2)));
        const detectorTop = Math.max(0, Math.min(height - detectorCropSize, Math.round(cropCenterY - detectorCropSize / 2)));
        const detectorInput = (await sharp(Buffer.from(response.images[0], "base64"))
          .extract({ left: detectorLeft, top: detectorTop, width: detectorCropSize, height: detectorCropSize })
          .resize(512, 512, { fit: "fill" }).png().toBuffer()).toString("base64");
        handTrace.detectorCrop = { left: detectorLeft, top: detectorTop, width: detectorCropSize, height: detectorCropSize, resizedTo: 512 };
        const detectorCandidates = [
          { module: recipe.handRefinement.module, model: recipe.handRefinement.model, kind: "depth" },
          { module: "openpose_hand", model: poseControl.model, kind: "hand_pose" },
        ].filter((item, index, list) => item.module && item.model && list.findIndex((candidate) => candidate.module === item.module) === index);
        let detectedImage = "", selectedDetector = null, detectionVariance = 0;
        const detectorAttempts = [];
        for (const candidate of detectorCandidates) {
          try {
            const detectResult = await postJson(new URL("/controlnet/detect", recipe.endpoint).toString(), {
              controlnet_module: candidate.module,
              controlnet_input_images: [detectorInput],
              controlnet_processor_res: 512,
            });
            if (detectResult.status < 200 || detectResult.status >= 300) {
              detectorAttempts.push({ module: candidate.module, model: candidate.model, status: "http_error", httpStatus: detectResult.status });
              continue;
            }
            const detected = JSON.parse(detectResult.body);
            if (!detected.images?.[0]) {
              detectorAttempts.push({ module: candidate.module, model: candidate.model, status: "no_image" });
              continue;
            }
            const candidateBuffer = Buffer.from(detected.images[0], "base64");
            const candidateStats = await sharp(candidateBuffer).stats();
            const pixelEvidence = handDepthDetectionUsable(candidateStats.channels);
            let semanticEvidence = null;
            if (candidate.kind === "hand_pose") {
              semanticEvidence = handPoseDetectionUsable(detected, { requiredHands: geometry.contacts.length, anchors: geometry.contacts, detectorCrop: { left: detectorLeft, top: detectorTop, width: detectorCropSize, height: detectorCropSize }, imageWidth: width, imageHeight: height });
            } else {
              const metadata = await sharp(candidateBuffer).metadata();
              const detectorWidth = metadata.width || 512, detectorHeight = metadata.height || 512;
              const perAnchor = [];
              for (const anchor of geometry.contacts) {
                const cx = ((anchor.x * width - detectorLeft) / detectorCropSize) * detectorWidth;
                const cy = ((anchor.y * height - detectorTop) / detectorCropSize) * detectorHeight;
                const radius = Math.max(24, Math.round(Math.min(detectorWidth, detectorHeight) * .075));
                const left = Math.max(0, Math.min(detectorWidth - 2, Math.round(cx - radius)));
                const top = Math.max(0, Math.min(detectorHeight - 2, Math.round(cy - radius)));
                const regionWidth = Math.max(2, Math.min(detectorWidth - left, radius * 2));
                const regionHeight = Math.max(2, Math.min(detectorHeight - top, radius * 2));
                const localStats = await sharp(candidateBuffer).extract({ left, top, width: regionWidth, height: regionHeight }).stats();
                const localEvidence = handDepthDetectionUsable(localStats.channels);
                perAnchor.push({ hand: anchor.hand, usable: localEvidence.usable, variance: localEvidence.variance, bounds: { left, top, width: regionWidth, height: regionHeight } });
              }
              semanticEvidence = { usable: perAnchor.length >= geometry.contacts.length && perAnchor.every((item) => item.usable), perAnchor };
            }
            const usable = pixelEvidence.usable && semanticEvidence?.usable === true;
            detectorAttempts.push({ module: candidate.module, model: candidate.model, status: usable ? "usable" : candidate.kind === "hand_pose" ? "no_valid_hand_keypoints" : "missing_anchor_depth", variance: pixelEvidence.variance, evidence: semanticEvidence });
            if (!usable) continue;
            detectedImage = detected.images[0];
            selectedDetector = candidate;
            detectionVariance = pixelEvidence.variance;
            break;
          } catch (candidateError) {
            detectorAttempts.push({ module: candidate.module, model: candidate.model, status: "detector_error", error: candidateError instanceof Error ? candidateError.message : String(candidateError) });
          }
        }
        handTrace.detectorAttempts = detectorAttempts;
        if (!detectedImage || !selectedDetector) throw new Error("所有可用手部检测器均未返回可用轮廓");
        handTrace.detector = selectedDetector.module;
        handTrace.model = selectedDetector.model;
        handTrace.detectorKind = selectedDetector.kind;
        const detectedCropBuffer = Buffer.from(detectedImage, "base64");
        const depthBuffer = await sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
          .composite([{ input: await sharp(detectedCropBuffer).resize(detectorCropSize, detectorCropSize).png().toBuffer(), left: detectorLeft, top: detectorTop }])
          .png().toBuffer();
        const fullDepthBase64 = depthBuffer.toString("base64");
        handTrace.detectionVariance = detectionVariance;
        handTrace.depthOutput = persistStageOutput("hand_depth_detect", relationId, fullDepthBase64);
        recipe.stageOutputs.push({ stage: "hand_depth_detect", relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: handTrace.depthOutput });
        handTrace.requestStatus = "refining";
        for (const [handIndex, hand] of handMasks.entries()) {
          const handPayload = {
            prompt: ["masterpiece, best quality, anime illustration", `one anatomically correct ${hand.anchor.hand} hand`, "five separated natural fingers, coherent palm and wrist, physically credible grip", `preserve the established ${propInteraction.object}, its protected core and the opposite hand`].join(", "),
            negative_prompt: [recipe.negativePrompt, "malformed hand, elongated fingers, extra fingers, missing fingers, fused fingers, duplicated hand, detached hand, broken wrist, mechanical hand, cuff replacing wrist, changed prop, missing prop"].join(", "),
            init_images: [response.images[0]], mask: hand.mask, width, height,
            steps: profilePlan.cpu ? 8 : 12, cfg_scale: 6, denoising_strength: .42,
            sampler_name: recipe.sampler, scheduler: recipe.scheduler, batch_size: 1, n_iter: 1,
            mask_blur: 6, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 52, send_images: true,
            alwayson_scripts: { ControlNet: { args: [{ enabled: true, module: "none", model: selectedDetector.model, weight: recipe.handRefinement.weight ?? .58, image: fullDepthBase64, effective_region_mask: hand.mask, resize_mode: "Just Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .82, control_mode: "Balanced", pixel_perfect: false }] } },
          };
          const handResult = await postJson(recipe.endpoint.replace(/\/txt2img$/, "/img2img"), handPayload);
          if (handResult.status < 200 || handResult.status >= 300) throw new Error(`${hand.anchor.hand} 手部修复返回 ${handResult.status}：${handResult.body.slice(0, 180)}`);
          const handResponse = JSON.parse(handResult.body);
          if (!handResponse.images?.[0]) throw new Error(`${hand.anchor.hand} 手部修复没有返回图片`);
          response = { ...response, images: [await compositeMaskedOutput(response.images[0], handResponse.images[0], hand.mask)] };
          const handOutput = persistStageOutput(`hand_refinement_${hand.anchor.hand}`, relationId, response.images[0]);
          handTrace.outputs.push({ hand: hand.anchor.hand, order: handIndex + 1, output: handOutput });
          recipe.stageOutputs.push({ stage: `hand_refinement_${hand.anchor.hand}`, relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: handOutput });
        }
        handTrace.output = handTrace.outputs.at(-1)?.output || null;
        handTrace.requestStatus = "succeeded";
      } catch (error) {
        relationFailed = true;
        handTrace.requestStatus = "failed";
        const warning = `手部深度修复未应用，已保留道具阶段图片：${error instanceof Error ? error.message : String(error)}`;
        handTrace.error = warning;
        postprocessWarnings.push(warning);
        update(phase === "draft" ? "draft_running" : "final_running", 96, "", warning);
      }
    }
    const structuredGazeTarget = propInteraction.gazeTarget?.kind !== "independent" && propInteraction.gazeTarget?.point
      ? propInteraction.gazeTarget.point
      : propInteraction.gazeMode && propInteraction.gazeMode !== "independent"
        ? propInteraction.objectCenter
        : null;
    if(response.images?.[0]&&propInteraction.gaze&&structuredGazeTarget&&!mergeGazeIntoProp) {
      const cameraText=`${recipe.generationSpec?.visualSpec?.camera?.shotSize||""} ${recipe.prompt||""}`;
      const close=/close-up|extreme close|特写|近景/i.test(cameraText),medium=/medium shot|waist-up|中景/i.test(cameraText);
      const regions=recipe.generationSpec?.characterRegions||[];
      const characterIndex=regions.findIndex((item)=>item.characterId===propInteraction.characterId);
      const characterRegion=characterIndex>=0?regions[characterIndex]:regions[0];
      const poseNose=recipe.poseControl?.people?.[characterIndex>=0?characterIndex:0]?.[0];
      const identityReference=identityReferenceForCharacter(identityReferences,propInteraction.characterId,characterIndex>=0?characterIndex:0);
      const gazePlan=faceRefinementPassPlan({phase,pass:"gaze",shotSize:cameraText,poseNose,region:characterRegion?.region,identityReference,gazeText:propInteraction.gaze});
      const gazeDistance=Math.hypot(structuredGazeTarget.x - gazePlan.center.x, structuredGazeTarget.y - gazePlan.center.y);
      // On CPU, a target-spanning inpaint crop plus two ControlNet units can
      // exceed practical RAM after the preceding pose/prop passes. The target
      // coordinates are already explicit in the prompt; only the face pixels
      // need regeneration, so keep a bounded local crop and preserve identity
      // from the accepted image instead of reloading adapters yet again.
      const gazePadding=profilePlan.cpu
        ? Math.max(48, Math.round(Math.max(width,height) * .14))
        : Math.max(48,Math.round(gazeDistance * Math.max(width,height) + Math.max(width,height) * .12));
      const gazeGeometry=gazeMaskGeometry({width,height,face:{x:gazePlan.center.x,y:gazePlan.center.y,radiusXRatio:gazePlan.radiusXRatio,radiusYRatio:gazePlan.radiusYRatio},target:structuredGazeTarget,inpaintPadding:gazePadding});
      const plannedHeadDirection=recipe.poseControl?.scenePlan?.people?.[characterIndex>=0?characterIndex:0]?.headDirection || null;
      const headTargetMatchesStructured = Boolean(plannedHeadDirection?.target)
        && Math.hypot(plannedHeadDirection.target.x - structuredGazeTarget.x, plannedHeadDirection.target.y - structuredGazeTarget.y) <= .025;
      const canonicalGazeDirection=plannedHeadDirection?.mode && headTargetMatchesStructured
        ? String(plannedHeadDirection.mode).replace(/_/g,"-")
        : gazeGeometry.direction;
      const gazeUsesFullImageContext=profilePlan.cpu || !gazeGeometry.containsTarget;
      const faceCenterX=gazeGeometry.face.cx;
      const faceCenterY=gazeGeometry.face.cy;
      const faceRadiusX=gazeGeometry.face.rx,faceRadiusY=gazeGeometry.face.ry;
      const gazeMaskSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${faceCenterX}" cy="${faceCenterY}" rx="${Math.max(36,faceRadiusX)}" ry="${Math.max(46,faceRadiusY)}" fill="white"/></svg>`);
      const gazeMask=(await sharp(gazeMaskSvg).png().toBuffer()).toString("base64");
      recipe.debugMasks = recipe.debugMasks || [];
      recipe.faceRefinementPasses = recipe.faceRefinementPasses || [];
      const gazeIdentityControl = gazePlan.identityControl ? { ...gazePlan.identityControl, weight: offCameraGaze ? Math.min(gazePlan.identityControl.weight, 0.68) : gazePlan.identityControl.weight, controlMode: offCameraGaze ? "Balanced" : "ControlNet is more important" } : null;
      const gazeTrace={type:"gaze",relationId,order:recipe.faceRefinementPasses.length+1,characterId:propInteraction.characterId,centerX:gazePlan.center.x,centerY:gazePlan.center.y,targetCenter:structuredGazeTarget,gazeTarget:propInteraction.gazeTarget||null,gazeTargetKind:propInteraction.gazeTarget?.kind||propInteraction.gazeMode||"legacy",gazeTargetSource:propInteraction.gazeTarget?.source||"legacy.object_center",vector:gazeGeometry.vector,direction:canonicalGazeDirection,headDirection:plannedHeadDirection,headTargetMatchesStructured,faceMaskBounds:gazeGeometry.faceMaskBounds,contextBounds:gazeGeometry.contextBounds,modelCropBounds:gazeUsesFullImageContext?{x:0,y:0,width,height}:gazeGeometry.crop,cropBounds:gazeGeometry.crop,targetBox:gazeGeometry.targetBox,localCropContainsTarget:gazeGeometry.containsTarget,modelSeesTarget:gazeUsesFullImageContext||gazeGeometry.containsTarget,sourceX:gazePlan.center.sourceX,sourceY:gazePlan.center.sourceY,denoisingStrength:gazePlan.denoisingStrength,identityControl:gazeIdentityControl};
      recipe.debugMasks.push(gazeTrace);
      recipe.faceRefinementPasses.push(gazeTrace);
      update(phase==="draft"?"draft_running":"final_running",97,"",`正在校正人物视线与剧情道具：${propInteraction.object}`);
      const expression = recipe.characterLooks?.[propInteraction.characterId]?.expressionEn || recipe.generationSpec?.visualSpec?.characters?.find((item) => item.characterId === propInteraction.characterId)?.expression || "";
      const gazeIdentityPath=identityReference?.path?path.resolve(root,identityReference.path):"";
      const gazeIdentityUnit=!profilePlan.cpu&&gazePlan.identityControl&&gazeIdentityPath&&fs.existsSync(gazeIdentityPath)?{
        enabled:true,
        module:gazePlan.identityControl.module,
        model:gazePlan.identityControl.model,
        weight:offCameraGaze ? Math.min(gazePlan.identityControl.weight, 0.68) : gazePlan.identityControl.weight,
        image:fs.readFileSync(gazeIdentityPath).toString("base64"),
        effective_region_mask:gazeMask,
        resize_mode:"Crop and Resize",low_vram:true,processor_res:512,guidance_start:0,guidance_end:1,control_mode:offCameraGaze?"Balanced":"ControlNet is more important",pixel_perfect:true,
      }:null;
      const gazePoseUnit = offCameraGaze && poseImageBase64 && poseControl?.model ? {
        enabled: true,
        module: poseControl.module || "none",
        model: poseControl.model,
        weight: Math.min(.62, Number(poseControl.weight || .82)),
        image: poseImageBase64,
        effective_region_mask: gazeMask,
        resize_mode: "Just Resize", low_vram: true, processor_res: 512,
        guidance_start: 0, guidance_end: .72, control_mode: "Balanced", pixel_perfect: false,
        relationId,
      } : null;
      const gazeControlSummary = [
        gazeIdentityUnit ? { role: "identity", characterId: propInteraction.characterId, weight: gazeIdentityUnit.weight, controlMode: gazeIdentityUnit.control_mode, masked: true } : null,
        gazePoseUnit ? { role: "head_direction_pose", relationId, weight: gazePoseUnit.weight, controlMode: gazePoseUnit.control_mode, masked: true } : null,
      ].filter(Boolean);
      gazeTrace.controlUnits = gazeControlSummary;
      const gazePayload={
        prompt:["masterpiece, best quality, anime illustration, consistent established face",expressionCue(expression),propInteraction.gaze,`head, nose, neck, irises, and pupils visibly converge toward the ${canonicalGazeDirection} target at normalized coordinates ${structuredGazeTarget.x.toFixed(2)},${structuredGazeTarget.y.toFixed(2)} (${gazeGeometry.vector.distance.toFixed(2)} distance)`,propInteraction.gazeTarget?.kind==="object"?`the ${propInteraction.object} is the gaze target`:propInteraction.gazeTarget?.kind==="work_point"?"the tool contact point is the gaze target":"the interaction target is the gaze target","natural directional eyelids and asymmetric eye placement matching the head turn, no eye contact with viewer"].join(", "),
        negative_prompt:[recipe.negativePrompt,expressionNegativeCue(expression),"looking at viewer, eye contact with camera, front-facing portrait gaze, pupils aimed at camera, crossed eyes, mismatched pupils, malformed eyes"].filter(Boolean).join(", "),
        init_images:[response.images[0]],mask:gazeMask,width,height,
        steps:phase==="draft"?10:profilePlan.cpu?8:14,cfg_scale:6.4,denoising_strength:gazePlan.denoisingStrength,
        sampler_name:recipe.sampler,scheduler:recipe.scheduler,batch_size:1,n_iter:1,
        mask_blur:8,inpainting_fill:1,inpaint_full_res:!gazeUsesFullImageContext,inpaint_full_res_padding:gazeUsesFullImageContext?0:gazePadding,send_images:true,
        ...(gazeControlSummary.length?{alwayson_scripts:{ControlNet:{args:[gazeIdentityUnit, gazePoseUnit].filter(Boolean)}}}:{}),
      };
      recipe.passTraces = recipe.passTraces || [];
      const gazePassTrace = { stage: "gaze", executor: "relation_gaze", relationId, characterId: propInteraction.characterId || null, objectInstanceId: propInteraction.objectInstanceId || null, requestStatus: "pending", semanticStatus: "not_reviewed", output: null, targetCenter: structuredGazeTarget, gazeTargetKind: gazeTrace.gazeTargetKind, gazeTargetSource: gazeTrace.gazeTargetSource, direction: canonicalGazeDirection, headDirection: gazeTrace.headDirection, headTargetMatchesStructured, faceMaskBounds: gazeGeometry.faceMaskBounds, contextBounds: gazeGeometry.contextBounds, modelCropBounds:gazeTrace.modelCropBounds,targetBox: gazeGeometry.targetBox, modelSeesTarget:gazeTrace.modelSeesTarget,controlUnits: gazeControlSummary, poseControlApplied: Boolean(gazePoseUnit), identityControlApplied: Boolean(gazeIdentityUnit) };
      recipe.passTraces.push(gazePassTrace);
      try {
        const gazeResult=await postJson(recipe.endpoint.replace(/\/txt2img$/,"/img2img"),gazePayload);
        if(gazeResult.status<200||gazeResult.status>=300)throw new Error(`服务返回 ${gazeResult.status}：${gazeResult.body.slice(0,180)}`);
        const gazeResponse=JSON.parse(gazeResult.body);if(!gazeResponse.images?.[0])throw new Error("没有返回图片");
        response={...response,images:[await compositeMaskedOutput(response.images[0], gazeResponse.images[0], gazeMask)]};
        gazePassTrace.output = persistStageOutput("gaze", relationId, response.images[0]);
        recipe.stageOutputs.push({ stage: "gaze", relationId, objectInstanceId: propInteraction.objectInstanceId || null, output: gazePassTrace.output });
        gazePassTrace.requestStatus = "succeeded";
        gazePassTrace.semanticStatus = "pending_review";
        if (propInteraction.characterId) relationGazeCoveredCharacterIds.add(String(propInteraction.characterId));
      }catch(error){relationFailed = true; gazePassTrace.requestStatus = "failed"; gazePassTrace.semanticStatus = "not_applied"; const warning=`视线校正失败，已保留手部与道具校正结果：${error instanceof Error?error.message:String(error)}`; gazePassTrace.error = warning; postprocessWarnings.push(warning);update(phase==="draft"?"draft_running":"final_running",97,"",warning);}
    }
    updateRelationTrace(relationId, relationFailed ? "failed" : "semantic_pending", relationFailed ? "gaze or prop pass failed" : "semantic QA requires review");
  }
  }
  if (recipe.generationSpec?.repairPasses?.handoff && response.images?.[0]) {
    if (status() === "cancelled") process.exit(0);
    const width = recipe.width;
    const height = recipe.height;
    const scenePlan = recipe.poseControl?.scenePlan;
    const swapped = Boolean(recipe.poseControl?.override?.swapRoles);
    const handoffContracts = propInteractions.filter((item) => item?.required && (item.executor || "generic_prop") === "umbrella_handoff");
    for (const handoffContract of handoffContracts) {
    const handoffRelation = (recipe.generationSpec?.visualSpec?.interactions || []).find((item) => item.actorCharacterId === handoffContract?.characterId && (!handoffContract?.targetCharacterId || item.targetCharacterId === handoffContract.targetCharacterId) && /umbrella|伞/i.test(item.propId || "") && /handover|offer|递|交|transfer|pass/i.test(`${item.type || ""} ${item.action || ""}`)) || null;
    const handoffRelationIds = [handoffContract.relationId].filter(Boolean);
    handoffRelationIds.forEach((relationId) => updateRelationTrace(relationId, "executing"));
    const regionFor = (characterId) => recipe.generationSpec?.characterRegions?.find((item) => item.characterId === characterId)?.region || null;
    const actorRegion = handoffContract ? regionFor(handoffContract.characterId) : handoffRelation ? regionFor(handoffRelation.actorCharacterId) : null;
    const targetRegion = handoffContract?.targetCharacterId ? regionFor(handoffContract.targetCharacterId) : handoffRelation ? regionFor(handoffRelation.targetCharacterId) : null;
    const actorIsLeft = actorRegion && targetRegion ? (actorRegion.xStart + actorRegion.xEnd) / 2 < (targetRegion.xStart + targetRegion.xEnd) / 2 : false;
    const giverLeft = swapped ? !actorIsLeft : actorIsLeft;
    const giverSide = giverLeft ? "left-side giver" : "right-side giver";
    const receiverSide = giverLeft ? "right-side receiver" : "left-side receiver";
    const sharedUmbrella = (handoffContract?.ownership?.actorCharacterIds?.length || 0) > 1;
    const umbrella = umbrellaGeometry({ width, height, target: sharedUmbrella ? (scenePlan?.interactionTarget || handoffContract?.objectCenter || { x: .5, y: .48 }) : (handoffContract?.objectCenter || scenePlan?.interactionTarget || { x: .5, y: .48 }), anchors: scenePlan?.people?.map((person) => person.anchor) || [] });
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
          relationId: handoffContract?.relationId || null,
          objectInstanceId: handoffContract?.objectInstanceId || null,
          sharedGeometryKey: handoffContract?.objectInstanceId || "umbrella-shared",
        }]
      : [];
    if (poseControl?.cannyModel) {
      const guideSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="black"/><path d="M ${umbrella.canopy.x1} ${umbrella.canopy.y} Q ${umbrella.center.x} ${umbrella.canopy.y-height*.13} ${umbrella.canopy.x2} ${umbrella.canopy.y}" fill="none" stroke="white" stroke-width="${Math.max(6,width*.012)}"/><path d="M ${umbrella.shaft.x1} ${umbrella.shaft.y1} L ${umbrella.shaft.x2} ${umbrella.shaft.y2}" fill="none" stroke="white" stroke-width="${Math.max(6,width*.011)}" stroke-linecap="round"/></svg>`,
      );
      const guideImage = (await sharp(guideSvg).png().toBuffer()).toString("base64");
      handoffControlUnits.push({
        enabled: true,
        module: "none",
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
        guideEncoding: "precomputed_edge",
        relationId: handoffContract?.relationId || null,
        objectInstanceId: handoffContract?.objectInstanceId || null,
        sharedGeometryKey: handoffContract?.objectInstanceId || "umbrella-shared",
      });
    }
    recipe.debugMasks = recipe.debugMasks || [];
    recipe.debugMasks.push({ type: "umbrella_handoff", relationId: handoffContract?.relationId || null, objectInstanceId: handoffContract?.objectInstanceId || null, sharedGeometryKey: handoffContract?.objectInstanceId || "umbrella-shared", bounds: umbrella.bounds, canopy: umbrella.canopy, shaft: umbrella.shaft, maskGuideIntersection: umbrella.maskGuideIntersection });
    if (!umbrella.maskGuideIntersection) {
      const warning = "雨伞结构引导未被有效遮罩完整覆盖，已拒绝交接局部修复";
      postprocessWarnings.push(warning);
      update(phase === "draft" ? "draft_running" : "final_running", 97, "", warning);
      handoffRelationIds.forEach((relationId) => updateRelationTrace(relationId, "failed", warning));
    } else {
    recipe.passTraces = recipe.passTraces || [];
    const handoffPassTrace = { stage: "umbrella_handoff", relationId: handoffContract?.relationId || null, objectInstanceId: handoffContract?.objectInstanceId || null, sharedGeometryKey: handoffContract?.objectInstanceId || "umbrella-shared", requestStatus: "pending", output: null, geometry: { bounds: umbrella.bounds, canopy: umbrella.canopy, shaft: umbrella.shaft }, actorCharacterId: handoffContract?.characterId || handoffRelation?.actorCharacterId || null, targetCharacterId: handoffContract?.targetCharacterId || handoffRelation?.targetCharacterId || null, controlUnits: handoffControlUnits.map((unit) => ({ module: unit.module, model: unit.model, weight: unit.weight, controlMode: unit.control_mode, relationId: unit.relationId || null, objectInstanceId: unit.objectInstanceId || null })) };
    recipe.passTraces.push(handoffPassTrace);
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
    try {
      const handoffResult = await postJson(
        recipe.endpoint.replace(/\/txt2img$/, "/img2img"),
        handoffPayload,
      );
      if (handoffResult.status < 200 || handoffResult.status >= 300)
        throw new Error(`手部与伞柄校正失败 ${handoffResult.status}：${handoffResult.body.slice(0, 180)}`);
      const handoffResponse = JSON.parse(handoffResult.body);
      if (!handoffResponse.images?.[0]) throw new Error("手部与伞柄校正没有返回图片");
      response = { ...response, images: [handoffResponse.images[0]] };
      handoffPassTrace.output = persistStageOutput("umbrella_handoff", handoffContract?.relationId || "handoff", response.images[0]);
      recipe.stageOutputs.push({ stage: "umbrella_handoff", relationId: handoffContract?.relationId || null, objectInstanceId: handoffContract?.objectInstanceId || null, output: handoffPassTrace.output });
      handoffPassTrace.requestStatus = "succeeded";
      handoffRelationIds.forEach((relationId) => { updateRelationTrace(relationId, "request_succeeded"); updateRelationTrace(relationId, "semantic_pending", "semantic QA requires review"); });
    } catch (error) {
      const warning = `雨伞交接关系 ${handoffContract?.relationId || "unknown"} 修复失败，已保留上一阶段图片：${error instanceof Error ? error.message : String(error)}`;
      handoffPassTrace.requestStatus = "failed";
      postprocessWarnings.push(warning);
      update(phase === "draft" ? "draft_running" : "final_running", 97, "", warning);
      handoffRelationIds.forEach((relationId) => updateRelationTrace(relationId, "failed", warning));
    }
    }
  }
  }
  const finalStructuredGazePlan = structuredGazeExecutionPlan({
    people: recipe.poseControl?.scenePlan?.people || [],
    coveredCharacterIds: [...relationGazeCoveredCharacterIds],
  });
  recipe.structuredGazeExecution = {
    version: "structured-gaze-executor-v1",
    phase,
    status: phase !== "final"
      ? "deferred_final_only"
      : finalStructuredGazePlan.passes.length
        ? "executing"
        : "not_required_or_relation_covered",
    successfulRelationCoverage: [...relationGazeCoveredCharacterIds],
    plannedPasses: finalStructuredGazePlan.passes,
    skipped: finalStructuredGazePlan.skipped,
    passes: [],
  };
  // Run one bounded face pass per remaining structured scene target. This is
  // deliberately after every prop/handoff pass (which may repaint faces) and
  // before the deterministic final crop (whose coordinates differ from the
  // canonical scene-plan coordinate space).
  if (phase === "final" && runRefinements && response.images?.[0]) {
    for (const gazeCandidate of finalStructuredGazePlan.passes) {
      if (status() === "cancelled") process.exit(0);
      const width = recipe.width;
      const height = recipe.height;
      const characterId = gazeCandidate.characterId;
      const personIndex = gazeCandidate.personIndex;
      const targetCenter = gazeCandidate.targetCenter;
      const cameraText = `${recipe.generationSpec?.visualSpec?.camera?.shotSize || ""} ${recipe.prompt || ""}`;
      const regions = recipe.generationSpec?.characterRegions || [];
      const characterRegion = regions.find((item) => item.characterId === characterId) || regions[personIndex] || null;
      const poseNose = recipe.poseControl?.people?.[personIndex]?.[0];
      const identityReference = identityReferenceForCharacter(identityReferences, characterId, personIndex);
      const visualCharacter = recipe.generationSpec?.visualSpec?.characters?.find((item) => item.characterId === characterId) || null;
      const expression = recipe.characterLooks?.[characterId]?.expressionEn || visualCharacter?.expression || "";
      const gazeText = visualCharacter?.gazeTarget || `eyes focused on structured ${gazeCandidate.gazeTargetKind} target, no eye contact with camera`;
      const gazePlan = faceRefinementPassPlan({ phase, pass: "gaze", shotSize: cameraText, poseNose, region: characterRegion?.region, identityReference, gazeText });
      const gazeDistance = Math.hypot(targetCenter.x - gazePlan.center.x, targetCenter.y - gazePlan.center.y);
      const gazePadding = profilePlan.cpu
        ? Math.max(48, Math.round(Math.max(width, height) * .14))
        : Math.max(48, Math.round(gazeDistance * Math.max(width, height) + Math.max(width, height) * .12));
      const gazeGeometry = gazeMaskGeometry({
        width,
        height,
        face: { x: gazePlan.center.x, y: gazePlan.center.y, radiusXRatio: gazePlan.radiusXRatio, radiusYRatio: gazePlan.radiusYRatio },
        target: targetCenter,
        inpaintPadding: gazePadding,
      });
      const canonicalGazeDirection = gazeCandidate.canonicalHeadDirection || gazeGeometry.direction;
      const gazeUsesFullImageContext = profilePlan.cpu || !gazeGeometry.containsTarget;
      const gazeMaskSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${gazeGeometry.face.cx}" cy="${gazeGeometry.face.cy}" rx="${Math.max(36, gazeGeometry.face.rx)}" ry="${Math.max(46, gazeGeometry.face.ry)}" fill="white"/></svg>`);
      const gazeMask = (await sharp(gazeMaskSvg).png().toBuffer()).toString("base64");
      const identityPath = identityReference?.path ? path.resolve(root, identityReference.path) : "";
      const identityReferenceAvailable = Boolean(gazePlan.identityControl && identityPath && fs.existsSync(identityPath));
      const gazeIdentityUnit = !profilePlan.cpu && identityReferenceAvailable ? {
        enabled: true,
        module: gazePlan.identityControl.module,
        model: gazePlan.identityControl.model,
        weight: Math.min(gazePlan.identityControl.weight, .68),
        image: fs.readFileSync(identityPath).toString("base64"),
        effective_region_mask: gazeMask,
        resize_mode: "Crop and Resize",
        low_vram: true,
        processor_res: 512,
        guidance_start: 0,
        guidance_end: 1,
        control_mode: "Balanced",
        pixel_perfect: true,
      } : null;
      const gazePoseUnit = poseImageBase64 && poseControl?.model ? {
        enabled: true,
        module: poseControl.module || "none",
        model: poseControl.model,
        weight: Math.min(.62, Number(poseControl.weight || .82)),
        image: poseImageBase64,
        effective_region_mask: gazeMask,
        resize_mode: "Just Resize",
        low_vram: true,
        processor_res: 512,
        guidance_start: 0,
        guidance_end: .72,
        control_mode: "Balanced",
        pixel_perfect: false,
        characterId,
      } : null;
      const gazeControlSummary = [
        gazeIdentityUnit ? { role: "identity", characterId, weight: gazeIdentityUnit.weight, controlMode: gazeIdentityUnit.control_mode, masked: true } : null,
        gazePoseUnit ? { role: "head_direction_pose", characterId, weight: gazePoseUnit.weight, controlMode: gazePoseUnit.control_mode, masked: true } : null,
      ].filter(Boolean);
      const targetDescription = gazeCandidate.gazeTargetKind === "object"
        ? "structured story object"
        : gazeCandidate.gazeTargetKind === "work_point"
          ? "structured hand-tool work point"
          : "structured story target";
      const passKey = `scene:${characterId}`;
      const gazePassTrace = {
        stage: "structured_gaze",
        executor: "scene_plan_gaze",
        relationId: null,
        characterId,
        personIndex,
        requestStatus: "pending",
        semanticStatus: "not_reviewed",
        output: null,
        targetCenter,
        gazeTarget: gazeCandidate.gazeTarget,
        gazeTargetKind: gazeCandidate.gazeTargetKind,
        gazeTargetSource: gazeCandidate.gazeTargetSource,
        gazeTargetId: gazeCandidate.gazeTargetId,
        direction: canonicalGazeDirection,
        headDirection: gazeCandidate.plannedHeadDirection,
        headTargetMatchesStructured: gazeCandidate.headTargetMatchesStructured,
        faceMaskBounds: gazeGeometry.faceMaskBounds,
        contextBounds: gazeGeometry.contextBounds,
        modelCropBounds: gazeUsesFullImageContext ? { x: 0, y: 0, width, height } : gazeGeometry.crop,
        targetBox: gazeGeometry.targetBox,
        modelSeesTarget: gazeUsesFullImageContext || gazeGeometry.containsTarget,
        identityReferenceAvailable,
        identityControlApplied: Boolean(gazeIdentityUnit),
        poseControlApplied: Boolean(gazePoseUnit),
        controlUnits: gazeControlSummary,
      };
      recipe.passTraces = recipe.passTraces || [];
      recipe.debugMasks = recipe.debugMasks || [];
      recipe.faceRefinementPasses = recipe.faceRefinementPasses || [];
      recipe.passTraces.push(gazePassTrace);
      recipe.structuredGazeExecution.passes.push(gazePassTrace);
      recipe.debugMasks.push({ type: "structured_gaze", characterId, targetCenter, faceMaskBounds: gazeGeometry.faceMaskBounds, contextBounds: gazeGeometry.contextBounds, direction: canonicalGazeDirection });
      recipe.faceRefinementPasses.push({ type: "structured_gaze", order: recipe.faceRefinementPasses.length + 1, characterId, centerX: gazePlan.center.x, centerY: gazePlan.center.y, targetCenter, gazeTargetKind: gazeCandidate.gazeTargetKind, gazeTargetSource: gazeCandidate.gazeTargetSource, direction: canonicalGazeDirection, headDirection: gazeCandidate.plannedHeadDirection, headTargetMatchesStructured: gazeCandidate.headTargetMatchesStructured, denoisingStrength: gazePlan.denoisingStrength, identityControl: gazeIdentityUnit ? gazePlan.identityControl : null, requestStatus: "pending", output: null });
      const faceTrace = recipe.faceRefinementPasses.at(-1);
      update("final_running", 98, "", `正在按结构化目标校正人物视线：${characterId}`);
      const gazePayload = {
        prompt: [
          "masterpiece, best quality, anime illustration, consistent established facial identity",
          expressionCue(expression),
          gazeText,
          `head yaw and pitch, nose axis, neck rotation, both irises, and both pupils all converge toward exactly the same ${canonicalGazeDirection} ${targetDescription} at normalized frame coordinates ${targetCenter.x.toFixed(2)},${targetCenter.y.toFixed(2)}`,
          `the single canonical target is ${gazeCandidate.gazeTargetId || targetDescription}; do not split head direction from eye direction`,
          "natural directional eyelids and asymmetric eye placement matching the head turn, no eye contact with viewer",
        ].filter(Boolean).join(", "),
        negative_prompt: [recipe.negativePrompt, expressionNegativeCue(expression), "looking at viewer, eye contact with camera, front-facing portrait gaze, pupils aimed at camera, head facing one target while eyes face another, divergent pupils, crossed eyes, mismatched pupils, malformed eyes, changed identity"].filter(Boolean).join(", "),
        init_images: [response.images[0]],
        mask: gazeMask,
        width,
        height,
        steps: profilePlan.cpu ? 8 : 14,
        cfg_scale: 6.4,
        denoising_strength: gazePlan.denoisingStrength,
        sampler_name: recipe.sampler,
        scheduler: recipe.scheduler,
        batch_size: 1,
        n_iter: 1,
        mask_blur: 8,
        inpainting_fill: 1,
        inpaint_full_res: !gazeUsesFullImageContext,
        inpaint_full_res_padding: gazeUsesFullImageContext ? 0 : gazePadding,
        send_images: true,
        ...(gazeControlSummary.length ? { alwayson_scripts: { ControlNet: { args: [gazeIdentityUnit, gazePoseUnit].filter(Boolean) } } } : {}),
      };
      try {
        const gazeResult = await postJson(recipe.endpoint.replace(/\/txt2img$/, "/img2img"), gazePayload);
        if (gazeResult.status < 200 || gazeResult.status >= 300) throw new Error(`服务返回 ${gazeResult.status}：${gazeResult.body.slice(0, 180)}`);
        const gazeResponse = JSON.parse(gazeResult.body);
        if (!gazeResponse.images?.[0]) throw new Error("没有返回图片");
        response = { ...response, images: [await compositeMaskedOutput(response.images[0], gazeResponse.images[0], gazeMask)] };
        gazePassTrace.output = persistStageOutput("structured_gaze", passKey, response.images[0]);
        recipe.stageOutputs.push({ stage: "structured_gaze", relationId: null, characterId, output: gazePassTrace.output });
        gazePassTrace.requestStatus = "succeeded";
        gazePassTrace.semanticStatus = "pending_review";
        faceTrace.requestStatus = "succeeded";
        faceTrace.output = gazePassTrace.output;
      } catch (error) {
        const warning = `人物 ${characterId} 的结构化视线校正未应用，已保留上一阶段图片：${error instanceof Error ? error.message : String(error)}`;
        gazePassTrace.requestStatus = "failed";
        gazePassTrace.semanticStatus = "not_applied";
        gazePassTrace.error = warning;
        faceTrace.requestStatus = "failed";
        faceTrace.error = warning;
        postprocessWarnings.push(warning);
        update("final_running", 98, "", warning);
      }
    }
    const succeeded = recipe.structuredGazeExecution.passes.filter((item) => item.requestStatus === "succeeded").length;
    const failed = recipe.structuredGazeExecution.passes.filter((item) => item.requestStatus === "failed").length;
    recipe.structuredGazeExecution.status = failed
      ? (succeeded ? "partially_failed_not_applied_for_failed_passes" : "failed_not_applied")
      : succeeded
        ? "request_succeeded_semantic_pending"
        : "not_required_or_relation_covered";
  }
  if (phase === "final" && recipe.framingPostCrop?.status === "applied" && response.images?.[0]) {
    const sourceBuffer = Buffer.from(response.images[0], "base64");
    const metadata = await sharp(sourceBuffer).metadata();
    const sourceWidth = metadata.width || recipe.width;
    const sourceHeight = metadata.height || recipe.height;
    const originalBounds = recipe.framingPostCrop.sourceBounds || {};
    const baseWidth = Number(recipe.framingPostCrop.output?.width || recipe.width || sourceWidth);
    const baseHeight = Number(recipe.framingPostCrop.output?.height || recipe.height || sourceHeight);
    const scaleX = sourceWidth / Math.max(1, baseWidth);
    const scaleY = sourceHeight / Math.max(1, baseHeight);
    const cropSize = Math.max(64, Math.min(sourceWidth, sourceHeight, Math.round(Number(originalBounds.width || Math.min(sourceWidth, sourceHeight)) * Math.min(scaleX, scaleY))));
    const left = Math.max(0, Math.min(sourceWidth - cropSize, Math.round(Number(originalBounds.left || 0) * scaleX)));
    const top = Math.max(0, Math.min(sourceHeight - cropSize, Math.round(Number(originalBounds.top || 0) * scaleY)));
    const framedBuffer = await sharp(sourceBuffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .resize(recipe.width, recipe.height, { fit: "fill" })
      .png()
      .toBuffer();
    response = { ...response, images: [framedBuffer.toString("base64")] };
    const output = persistStageOutput("final_framing_post_crop", "upper_body", response.images[0]);
    recipe.stageOutputs.push({ stage: "final_framing_post_crop", relationId: null, output });
    recipe.framingPostCrop = { ...recipe.framingPostCrop, finalApplied: true, finalSourceBounds: { left, top, width: cropSize, height: cropSize } };
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
    const reviewContract=semanticReviewContractForStage({generationSpec:recipe.generationSpec,references:recipe.references||[],adapterStatus:recipe.adapterStatus||{},characterLooks:recipe.characterLooks||{},environment:recipe.environment||{}}, phase);
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
  if (postprocessWarnings.length || pixelQa.status === "blocked" || semanticQa.status === "blocked") {
    db.prepare("UPDATE jobs SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(payload), jobId);
    db.prepare("UPDATE shots SET status=? WHERE id=?").run("draft", row.shot_id);
    update("failed", 100, [...postprocessWarnings,...pixelQa.blockers].join("；"), "正式成品质检失败，未写入候选");
    process.exit(0);
  }
  if (status() === "cancelled") process.exit(0);
  const finalImage = Buffer.from(response.images[0], "base64");
  const visualGateConfig = recipe.automaticVisualGate || {};
  let automaticVisualGate = { status: "not_required", method: visualGateConfig.method || "none", caption: "", checks: [], missing: [] };
  if (profilePlan.cpu && visualGateConfig.enabled) {
    automaticVisualGate = { status: "unverified", method: "manual_semantic_review", caption: "", checks: [], missing: [], reason: "cpu_memory_guard_skipped_clip_interrogate" };
  } else if (visualGateConfig.enabled && Array.isArray(visualGateConfig.requiredPropInteractions) && visualGateConfig.requiredPropInteractions.length) {
    try {
      const interrogation = await postJson(recipe.endpoint.replace(/\/sdapi\/v1\/(?:txt2img|img2img)$/, "/sdapi/v1/interrogate"), {
        image: finalImage.toString("base64"),
        model: "clip",
      });
      if (interrogation.status < 200 || interrogation.status >= 300)
        throw new Error(`CLIP interrogate returned ${interrogation.status}`);
      const caption = String(JSON.parse(interrogation.body)?.caption || "");
      const evaluated = evaluateCaptionForRequiredProps(caption, visualGateConfig.requiredPropInteractions);
      automaticVisualGate = { status: evaluated.missing.length ? "blocked" : "passed", method: "sd_webui_clip_interrogate", ...evaluated };
    } catch (error) {
      automaticVisualGate = { status: "unverified", method: "sd_webui_clip_interrogate", caption: "", checks: [], missing: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
  payload.recipe.automaticVisualGateResult = automaticVisualGate;
  const currentAttempt = Number(one("SELECT attempt FROM jobs WHERE id=?", jobId)?.attempt || 1);
  const maxAttempts = Math.max(1, Number(visualGateConfig.maxAttempts || 2));
  if (automaticVisualGate.status === "blocked" && currentAttempt < maxAttempts) {
    payload.recipe.seed = Number.isFinite(Number(actualSeed)) ? Number(actualSeed) + 7919 : Number(recipe.seed || -1) + 7919;
    payload.recipe.automaticVisualGateRetries = [
      ...(Array.isArray(recipe.automaticVisualGateRetries) ? recipe.automaticVisualGateRetries : []),
      { attempt: currentAttempt, seed: actualSeed, result: automaticVisualGate, retriedAt: new Date().toISOString() },
    ];
    db.prepare("UPDATE jobs SET status='final_queued',payload=?,progress=0,error='',stage='关键道具未检出，正在自动换 Seed 重试',worker_id='',lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(JSON.stringify(payload), jobId);
    const retryWorker = spawn(process.execPath, [path.join(root, "scripts", "sd-worker.mjs"), String(jobId)], { cwd: root, detached: true, stdio: "ignore" });
    retryWorker.unref();
    process.exit(0);
  }
  const filename = `sd-final-job-${jobId}-${randomUUID()}.png`;
  fs.writeFileSync(path.join(directory, filename), finalImage);
  payload.finalReviewImagePath = `workspace/generated/${filename}`;
  payload.phase = "final";
  payload.recipe.finalReview = {
    status: "awaiting_manual_approval",
    stage: "final",
    imageSha256: createHash("sha256").update(finalImage).digest("hex"),
    generatedAt: new Date().toISOString(),
    reviewMode: "manual_semantic_review",
    reviewItemIds: (semanticQa.items || []).map((item) => item.id),
    automaticVisualGate,
  };
  db.prepare("UPDATE jobs SET status='awaiting_final_approval',payload=?,progress=100,error='',stage='正式图已生成，等待逐项语义复核',updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(JSON.stringify(payload), jobId);
  db.prepare("UPDATE shots SET status='awaiting_final_approval' WHERE id=?").run(row.shot_id);
} catch (error) {
  update(
    "failed",
    0,
    error instanceof Error ? error.message : String(error),
    "独立 worker 执行失败",
  );
}

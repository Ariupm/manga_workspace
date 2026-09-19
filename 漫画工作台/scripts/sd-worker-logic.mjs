export function identityRefinementPlan(characterPrompt = "", phase = "draft") {
  const allowsCameraGaze = !/(?:no|without|avoid) eye contact with (?:the )?camera/i.test(characterPrompt) && /(?:looking|gazing) (?:at|toward) (?:the )?(?:viewer|camera)|eye contact with (?:the )?camera/i.test(characterPrompt);
  const preservesOffCameraGaze = !allowsCameraGaze && /(?:looking|gazing|focused)\s+(?:at|on|toward)|pupils?\s+(?:aimed|directed)|head\s+(?:turned|tilted|facing)|no eye contact with (?:the )?(?:viewer|camera)/i.test(characterPrompt);
  return { allowsCameraGaze, preservesOffCameraGaze, denoisingStrength: preservesOffCameraGaze ? (phase === "draft" ? .28 : .24) : (phase === "draft" ? .38 : .32), controlWeightMode: preservesOffCameraGaze ? "capped_0.78" : "front_facing_min_0.85" };
}
export function gazeMaskCenter({ width, height, poseNose, region = { xStart: 0, xEnd: 1 }, shotSize = "" }) {
  const close = /close-up|extreme close|特写|近景/i.test(shotSize), medium = /medium shot|waist-up|中景/i.test(shotSize);
  const regionCenter = (region.xStart + region.xEnd) / 2;
  return { x: Math.max(.12, Math.min(.88, poseNose?.x ?? regionCenter)), y: Math.max(.12, Math.min(.5, poseNose?.y ?? (close ? .3 : medium ? .27 : .23))), sourceX: poseNose ? "pose_nose" : "region", sourceY: poseNose?.y == null ? "shot_size" : "pose_nose" };
}

const clampNumber = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

/**
 * Plan the effective region for a base-stage identity adapter.
 *
 * Identity references commonly contain clothing as well as a face. Applying
 * them to a full character region lets the reference garment override the
 * shot's canonical outfit prompt. The base adapter only needs the head/face,
 * so this plan anchors an ellipse to the OpenPose nose, constrains it to the
 * character's horizontal region, and sizes it from the requested shot size.
 */
export function identityReferenceMaskPlan({ width = 512, height = 512, poseNose = null, region = null, shotSize = "" } = {}) {
  const imageWidth = Math.max(1, Math.round(Number(width) || 512));
  const imageHeight = Math.max(1, Math.round(Number(height) || 512));
  const requestedStart = Number(region?.xStart);
  const requestedEnd = Number(region?.xEnd);
  const xStart = Number.isFinite(requestedStart) ? clampNumber(requestedStart, 0, 1) : 0;
  const xEndCandidate = Number.isFinite(requestedEnd) ? clampNumber(requestedEnd, 0, 1) : 1;
  const xEnd = xEndCandidate > xStart + .02 ? xEndCandidate : Math.min(1, xStart + .02);
  const normalizedRegion = { xStart, xEnd };
  const regionSpan = Math.max(.02, xEnd - xStart);
  const source = String(shotSize || "");
  const mediumClose = /medium\s+close|close\s+shot|chest-up|chest up|waist-up|waist up|近景|胸像/i.test(source);
  const close = !mediumClose && /extreme\s+close|close-up|close up|head-and-shoulders|head and shoulders|face\s+shot|特写/i.test(source);
  const distant = /wide|full\s+shot|full-body|full body|long\s+shot|远景|全景|全身/i.test(source);
  const medium = mediumClose || /medium\s+shot|中景/i.test(source);
  const radiusXRatio = Math.min(close ? .13 : medium ? .1 : distant ? .065 : .08, Math.max(.01, regionSpan / 2 - .006));
  const radiusYRatio = radiusXRatio * (close ? 1.32 : 1.28);
  const validNoseX = Number.isFinite(Number(poseNose?.x));
  const validNoseY = Number.isFinite(Number(poseNose?.y));
  const fallbackY = close ? .3 : medium ? .26 : distant ? .18 : .23;
  const minimumCenterX = xStart + radiusXRatio;
  const maximumCenterX = xEnd - radiusXRatio;
  const rawCenterX = validNoseX ? Number(poseNose.x) : (xStart + xEnd) / 2;
  const centerX = minimumCenterX <= maximumCenterX
    ? clampNumber(rawCenterX, minimumCenterX, maximumCenterX)
    : (xStart + xEnd) / 2;
  const centerY = clampNumber(validNoseY ? Number(poseNose.y) : fallbackY, radiusYRatio + .004, 1 - radiusYRatio - .004);
  const radiusX = imageWidth * radiusXRatio;
  const radiusY = imageHeight * radiusYRatio;
  const cx = imageWidth * centerX;
  const cy = imageHeight * centerY;
  const regionLeft = Math.floor(imageWidth * xStart);
  const regionRight = Math.ceil(imageWidth * xEnd);
  const left = Math.max(regionLeft, Math.floor(cx - radiusX));
  const top = Math.max(0, Math.floor(cy - radiusY));
  const right = Math.min(regionRight, imageWidth, Math.ceil(cx + radiusX));
  const bottom = Math.min(imageHeight, Math.ceil(cy + radiusY));
  const bounds = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  return {
    applied: true,
    shape: "ellipse",
    center: { x: centerX, y: centerY },
    radius: { x: radiusXRatio, y: radiusYRatio },
    pixelGeometry: { cx, cy, rx: radiusX, ry: radiusY },
    bounds,
    normalizedBounds: { x: bounds.x / imageWidth, y: bounds.y / imageHeight, width: bounds.width / imageWidth, height: bounds.height / imageHeight },
    region: normalizedRegion,
    sourceX: validNoseX ? (rawCenterX === centerX ? "pose_nose" : "pose_nose_clamped_to_character_region") : "character_region",
    sourceY: validNoseY ? "pose_nose" : "shot_size",
    shotClass: close ? "close" : medium ? "medium" : distant ? "distant" : "default",
  };
}

export function gazeMaskGeometry({ width, height, face, target = null, inpaintPadding = 48, targetRadius = { x: .1, y: .1 } }) {
  const fx = width * face.x, fy = height * face.y;
  const rx = width * (face.radiusXRatio || .1), ry = height * (face.radiusYRatio || .13);
  const tx = target ? width * target.x : fx, ty = target ? height * target.y : fy;
  const minX = Math.max(0, Math.min(fx - rx, tx - (target ? width * .1 : rx)));
  const maxX = Math.min(width, Math.max(fx + rx, tx + (target ? width * .1 : rx)));
  const minY = Math.max(0, Math.min(fy - ry, ty - (target ? height * .1 : ry)));
  const maxY = Math.min(height, Math.max(fy + ry, ty + (target ? height * .1 : ry)));
  const dx = target ? target.x - face.x : 0, dy = target ? target.y - face.y : 0;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const direction = !target ? "independent" : Math.abs(dx) < .08 && dy > .08 ? "down" : Math.abs(dx) < .08 && dy < -.08 ? "up" : dx > .08 && Math.abs(dy) <= .2 ? "right" : dx < -.08 && Math.abs(dy) <= .2 ? "left" : dx > 0 && dy > 0 ? "down-right" : dx < 0 && dy > 0 ? "down-left" : dx > 0 ? "up-right" : "up-left";
  const maskBounds = { x: Math.max(0, fx - rx), y: Math.max(0, fy - ry), width: Math.min(width, fx + rx) - Math.max(0, fx - rx), height: Math.min(height, fy + ry) - Math.max(0, fy - ry) };
  const crop = {
    x: Math.max(0, maskBounds.x - inpaintPadding),
    y: Math.max(0, maskBounds.y - inpaintPadding),
    width: Math.min(width, maskBounds.x + maskBounds.width + inpaintPadding) - Math.max(0, maskBounds.x - inpaintPadding),
    height: Math.min(height, maskBounds.y + maskBounds.height + inpaintPadding) - Math.max(0, maskBounds.y - inpaintPadding),
  };
  const targetBox = target ? { x: tx - width * targetRadius.x, y: ty - height * targetRadius.y, width: width * targetRadius.x * 2, height: height * targetRadius.y * 2 } : null;
  const containsTarget = Boolean(targetBox && targetBox.x >= crop.x && targetBox.y >= crop.y && targetBox.x + targetBox.width <= crop.x + crop.width && targetBox.y + targetBox.height <= crop.y + crop.height);
  return { face: { cx: fx, cy: fy, rx, ry }, target: target ? { cx: tx, cy: ty } : null, vector: { x: dx, y: dy, distance: Math.hypot(dx, dy), angle }, direction, faceMaskBounds: maskBounds, contextBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, crop, targetBox, containsTarget };
}

const finiteGazePoint = (point) => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

/**
 * Select the per-person gaze passes that still need a final executor.
 *
 * The scene plan is the canonical fact source. Relation gaze passes may have
 * already consumed the same character target, so successful relation coverage
 * is explicitly excluded. Independent/null targets are descriptive freedom,
 * not an instruction to rotate a face toward an invented point.
 */
export function structuredGazeExecutionPlan({ people = [], coveredCharacterIds = [] } = {}) {
  const covered = new Set((coveredCharacterIds || []).filter(Boolean).map(String));
  const scheduled = new Set();
  const passes = [];
  const skipped = [];
  for (const [personIndex, person] of (people || []).entries()) {
    const characterId = String(person?.characterId || `person:${personIndex + 1}`);
    const gazeTarget = person?.gazeTarget || null;
    if (!gazeTarget || gazeTarget.kind === "independent" || gazeTarget.point == null) {
      skipped.push({ personIndex, characterId, reason: "independent_or_null_target", gazeTargetKind: gazeTarget?.kind || "independent" });
      continue;
    }
    if (!finiteGazePoint(gazeTarget.point)) {
      skipped.push({ personIndex, characterId, reason: "invalid_structured_target", gazeTargetKind: gazeTarget.kind || "target" });
      continue;
    }
    if (covered.has(characterId)) {
      skipped.push({ personIndex, characterId, reason: "successful_relation_gaze_coverage", gazeTargetKind: gazeTarget.kind || "target" });
      continue;
    }
    if (scheduled.has(characterId)) {
      skipped.push({ personIndex, characterId, reason: "duplicate_character_plan", gazeTargetKind: gazeTarget.kind || "target" });
      continue;
    }
    scheduled.add(characterId);
    const targetCenter = { x: gazeTarget.point.x, y: gazeTarget.point.y };
    const plannedHeadDirection = person?.headDirection || null;
    const headTargetMatchesStructured = finiteGazePoint(plannedHeadDirection?.target)
      && Math.hypot(plannedHeadDirection.target.x - targetCenter.x, plannedHeadDirection.target.y - targetCenter.y) <= .025;
    passes.push({
      personIndex,
      characterId,
      targetCenter,
      gazeTarget: { ...gazeTarget, point: targetCenter },
      gazeTargetKind: gazeTarget.kind || "target",
      gazeTargetSource: gazeTarget.source || "poseControl.scenePlan.people.gazeTarget",
      gazeTargetId: gazeTarget.targetId || null,
      plannedHeadDirection,
      headTargetMatchesStructured,
      canonicalHeadDirection: headTargetMatchesStructured && plannedHeadDirection?.mode
        ? String(plannedHeadDirection.mode).replace(/_/g, "-")
        : null,
    });
  }
  return {
    passes,
    skipped,
    hasStructuredTarget: passes.length > 0 || skipped.some((item) => item.reason === "successful_relation_gaze_coverage"),
  };
}

export function umbrellaGeometry({ width, height, target = { x: .5, y: .48 }, anchors = [] } = {}) {
  const cx = width * target.x, contactY = height * target.y;
  const spread = Math.min(width * .42, Math.max(width * .22, Math.abs((anchors[1]?.x || .7) - (anchors[0]?.x || .3)) * width * .34));
  const canopyY = Math.max(height * .08, contactY - height * .34);
  const bounds = { x: Math.max(0, cx - spread), y: canopyY - height * .18, width: Math.min(width, spread * 2), height: Math.min(height - (canopyY - height * .18), contactY - canopyY + height * .4) };
  const clippedBounds = { x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), width: Math.min(width - Math.max(0, bounds.x), bounds.width), height: Math.min(height - Math.max(0, bounds.y), bounds.height) };
  const canopyX1 = Math.max(0, cx - spread), canopyX2 = Math.min(width, cx + spread);
  const points = [
    [canopyX1, canopyY], [cx, canopyY - height * .13], [canopyX2, canopyY],
    [cx, canopyY], [cx, contactY + height * .18],
  ];
  const maskGuideIntersection = points.every(([x, y]) => x >= clippedBounds.x && x <= clippedBounds.x + clippedBounds.width && y >= clippedBounds.y && y <= clippedBounds.y + clippedBounds.height);
  return { center: { x: cx, y: contactY }, canopy: { x1: Math.max(0, cx - spread), x2: Math.min(width, cx + spread), y: canopyY }, shaft: { x1: cx, y1: canopyY, x2: cx, y2: contactY + height * .18 }, bounds: clippedBounds, maskGuideIntersection };
}

export function compositionDepthPlan({ width = 512, height = 512, shotSize = "", characterCount = 1, available = false } = {}) {
  const close = /close|medium|近景|中景/i.test(shotSize);
  return { version: "composition-depth-v1", enabled: false, status: available ? "planned_unavailable" : "unavailable_manual_required", subjectBox: { x: .12, y: close ? .12 : .08, width: .76, height: close ? .68 : .84 }, cropBoundary: close ? { top: .05, bottom: .72 } : { top: 0, bottom: 1 }, foregroundExclusion: close ? .2 : .08, depthLayers: characterCount > 1 ? ["foreground subjects", "shared action plane", "background"] : ["subject", "environment"] };
}

export function identityReferenceForCharacter(references = [], characterId = "", fallbackIndex = 0) {
  return references.find((reference) => reference?.characterId === characterId) || references[fallbackIndex] || null;
}

export function faceRefinementPassPlan({
  phase = "draft",
  pass = "identity",
  shotSize = "",
  poseNose,
  region = { xStart: 0, xEnd: 1 },
  identityReference = null,
  gazeText = "",
}) {
  const center = gazeMaskCenter({ poseNose, region, shotSize });
  const close = /close-up|extreme close|特写|近景/i.test(shotSize);
  const medium = /medium shot|waist-up|中景/i.test(shotSize);
  const radiusXRatio = close ? .14 : medium ? .1 : .075;
  const gazePlan = identityRefinementPlan(gazeText, phase);
  const weight = identityReference
    ? (gazePlan.preservesOffCameraGaze ? Math.min(identityReference.weight, .78) : Math.max(identityReference.weight, .85))
    : null;
  return {
    pass,
    center,
    radiusXRatio,
    radiusYRatio: radiusXRatio * 1.28,
    denoisingStrength: pass === "gaze" ? (phase === "draft" ? .36 : .28) : gazePlan.denoisingStrength,
    gazePlan,
    identityControl: identityReference ? {
      enabled: true,
      role: "identity",
      characterId: identityReference.characterId || "",
      module: identityReference.module,
      model: identityReference.model,
      weight,
    } : null,
  };
}
export function semanticReviewContract({ generationSpec = {}, references = [], adapterStatus = {}, characterLooks = {}, environment = {} } = {}) {
  const spec = generationSpec.visualSpec || {};
  const execution = generationSpec.reviewInputs || {};
  const repair = generationSpec.repairPasses || {};
  const interaction = repair.propInteraction || null;
  const repairRelations = Array.isArray(repair.propInteractions) ? repair.propInteractions : (interaction ? [interaction] : []);
  const relations = Array.isArray(spec.interactions) ? spec.interactions : spec.interaction ? [spec.interaction] : [];
  const items = [];
  const add = (id, label, priority, expectation, sources) => {
    if (!items.some((item) => item.id === id)) items.push({ id, label, priority, required: true, expectation, sources: [...new Set(sources.filter(Boolean))] });
  };
  const hasInteraction = Boolean(repairRelations.length || relations.length);
  const characters = Array.isArray(spec.characters) && spec.characters.length
    ? spec.characters
    : Array.isArray(execution.characters) ? execution.characters : [];
  const characterCount = Number(execution.characterCount || characters.length || 0);
  if (characterCount) add("character_count_review_required", "人物数量", "P0", `画面必须恰好包含 ${characterCount} 名指定人物，不得缺失、重复或增加人物`, [spec.characters?.length ? "generationSpec.visualSpec.characters" : "generationSpec.reviewInputs.characterCount"]);
  if (characterCount) add("anatomy_review_required", "全身解剖与肢体", "P0", "所有可见人物必须具备正确头身比例、四肢数量、手指分离度和关节连接；上身景别若出现下肢必须人工复核", [spec.characters?.length ? "generationSpec.visualSpec.characters" : "generationSpec.reviewInputs.characters", "generationSpec.negative", "generationSpec.poseControl"]);
  const expressions = characters.filter((item) => item.expression && !/gentle, natural expression|unknown/i.test(item.expression));
  if (expressions.length) add("expression_review_required", "剧情表情", "P1", `人物表情必须分别落实剧情要求：${expressions.map((item) => `${item.characterId}: ${item.expression}`).join("；")}`, expressions.map((item) => `${spec.characters?.length ? "visualSpec.characters" : "reviewInputs.characters"}.${item.characterId}.expression`));
  if (hasInteraction) add("interaction_review_required", "关键交互", "P0", `全部 ${Math.max(repairRelations.length, relations.length)} 条人物、手部和剧情对象关系必须形成清楚且符合动作阶段的物理关系`, repairRelations.length ? repairRelations.map((item) => `propInteraction:${item.relationId || item.object || "relation"}:${item.objectInstanceId || "instance"}`) : ["generationSpec.visualSpec.interactions"]);
  const gazeModes = repairRelations.map((item) => item.gazeMode).filter(Boolean);
  const hasGaze = gazeModes.some((mode) => ["object", "work_point", "target"].includes(mode)) || relations.some((item) => item.gazeTarget) || characters.some((item) => item.gazeTarget);
  if (hasGaze) add("gaze_review_required", "视线方向", "P0", "头部和双眼看向结构化剧情目标，不得误看镜头", gazeModes.map((mode) => `propInteraction.gazeMode=${mode}`));
  const shotSize = spec.camera?.shotSize || execution.shotSize || "";
  if (/close|medium|wide|full|long|特写|近景|中景|远景|全景/i.test(shotSize)) add("framing_review_required", "景别裁切", "P0", `实际画面必须遵守 ${shotSize} 的人物范围和裁切契约`, ["generationSpec.visualSpec.camera.shotSize"]);
  if (generationSpec.poseControl) add("pose_review_required", "动作姿势", "P0", `姿势必须落实 ${generationSpec.poseControl.kind || "当前动作"}，关节方向与剧情一致`, ["generationSpec.poseControl"]);
  const identityRefs = references.filter((item) => item?.role === "identity");
  if (identityRefs.length) add("identity_review_required", "身份与发型", "P1", "人物脸型、五官、发色、发型和稳定身份特征必须与对应身份参考一致", identityRefs.map((item) => `identity reference:${item.characterId || item.name || "character"}`));
  const outfitPlans = generationSpec.qualityGate?.outfitConditioning || [];
  const hasOutfit = outfitPlans.length || /outfit|text_only/i.test(String(adapterStatus.outfit || "")) || Object.values(characterLooks).some((look) => look && (look.outfitId || look.outfitEn));
  if (hasOutfit) add("outfit_review_required", "服装一致性", "P1", "服装类别、剪裁、层次和颜色必须与当前角色服装规格一致", outfitPlans.length ? outfitPlans.map((item) => `outfitConditioning:${item.characterId}:${item.status}`) : [`adapterStatus.outfit=${adapterStatus.outfit || "text"}`]);
  const handRequirement = hasInteraction || characters.some((item) => item.hands && !/out of frame|not visible|unknown/i.test(item.hands));
  if (handRequirement) add("hands_review_required", "手部与接触", "P0", "手指数量、分离度、握持方式和手物接触必须自然且无粘连穿插", [hasInteraction ? "interaction hand/contact contract" : "visualSpec.characters.hands"]);
  if (hasInteraction) add("prop_review_required", "道具形态与表面", "P0", `全部剧情道具必须存在且每个 objectInstanceId 的 expectedCount 必须满足，朝向、透视和可见表面符合用途`, repairRelations.length ? repairRelations.map((item) => `propInteraction:${item.object || "object"}:${item.objectInstanceId || "instance"}:count=${item.expectedCount || 1}:surface=${item.surfacePlan?.plane || "contextual"}`) : ["visualSpec.interactions.propId"]);
  if (hasInteraction) add("prop_cardinality_review_required", "道具唯一实例与全图计数", "P0", "逐项确认剧情道具数量符合 expectedCount；目标区域外不得出现同类重复道具，未配置像素计数器时必须由人工 P0 审批确认", repairRelations.length ? repairRelations.map((item) => `propInteraction:${item.objectInstanceId || item.object || "instance"}:expectedCount=${item.expectedCount || 1}:exclusionRegions`) : ["generationSpec.propInstancePlan"]);
  const supportRelations = generationSpec.poseControl?.scenePlan?.supportRelations || [];
  if (supportRelations.length) {
    const upperBodyFraming = generationSpec.poseControl?.framingMode === "upper_body" || /close|medium close|chest-up|waist-up|特写|近景/i.test(shotSize);
    add(
      "support_review_required",
      "人物支持面",
      "P0",
      upperBodyFraming
        ? "近景中支持面环境和上身姿态必须与 supportSurfaceId 一致，不得出现站立、悬空或落地等反证；髋部接触点可按景别合理位于画外"
        : "坐、靠、卧或跪姿必须与同一 supportSurfaceId 的座面/床面/地面形成可审计接触关系",
      supportRelations.map((item) => `support:${item.characterId}:${item.supportSurfaceId}:${item.status}`),
    );
  }
  if (spec.camera?.composition || environment.depth || environment.foreground || environment.background) add("composition_review_required", "构图与景深", "P2", "主体占比、前中后景和景深必须服务剧情，避免无关前景压迫主体", [spec.camera?.composition ? "visualSpec.camera.composition" : "recipe.environment depth layers"]);
  if (spec.scene?.lighting || environment.keyLight || environment.ambientLight) add("lighting_review_required", "光照与曝光", "P2", "人物、道具和环境曝光均衡，高光与暗部不得吞没关键细节", [spec.scene?.lighting ? "visualSpec.scene.lighting" : "recipe.environment lighting"]);
  return { version: "semantic-review-v1", items, labels: items.map((item) => item.id) };
}

export function semanticReviewLabels({ hasInteraction, gazeMode, shotSize, poseRequired }) {
  const contract = semanticReviewContract({ generationSpec: { visualSpec: { camera: { shotSize }, interactions: hasInteraction ? [{ gazeTarget: gazeMode === "object" || gazeMode === "work_point" ? "object" : "" }] : [] }, poseControl: poseRequired ? { kind: "legacy_pose" } : null, repairPasses: { propInteraction: hasInteraction ? { gazeMode, object: "story prop" } : null } } });
  return contract.labels;
}

export function semanticApprovalCoversItems(items = [], approval = null) {
  if (!items.length) return true;
  if (!approval || approval.version !== "semantic-review-v1" || !approval.verdicts) return false;
  return items.every((item) => !item.required || approval.verdicts[item.id] === "pass");
}

export function generationProfilePlan(profile = "cpu_local_fast", characterCount = 1) {
  const normalized = ["cpu_local_fast", "cpu_local_complex", "gpu_full"].includes(profile) ? profile : "cpu_local_fast";
  if (normalized === "gpu_full") return { id: normalized, cpu: false, maxInitialControlUnits: 8, runDraftRefinements: true, draftLongEdge: 512, maxTargetEdge: 1024, draftSteps: characterCount > 1 ? 16 : 12, finalSteps: 18 };
  if (normalized === "cpu_local_complex") return { id: normalized, cpu: true, maxInitialControlUnits: 3, runDraftRefinements: true, draftLongEdge: 512, maxTargetEdge: 640, draftSteps: 12, finalSteps: 16 };
  return { id: normalized, cpu: true, maxInitialControlUnits: 3, runDraftRefinements: true, draftLongEdge: 448, maxTargetEdge: 640, draftSteps: 10, finalSteps: 14 };
}

export function selectControlUnitsForProfile(units = [], profile = "cpu_local_fast") {
  const plan = generationProfilePlan(profile);
  if (!plan.cpu || units.length <= plan.maxInitialControlUnits) return [...units];
  const priority = (unit) => {
    if (unit.stage === "pose") return 100;
    if (unit.stage === "support_surface_geometry") return 95;
    if (["initial_prop_structure", "deferred_prop_structure"].includes(unit.stage)) return 90;
    if (unit.stage === "identity_reference") return 50;
    if (unit.stage === "upper_body_composition_scale") return 60;
    if (unit.stage === "outfit_reference") return 50;
    return 10;
  };
  return units.map((unit, index) => ({ unit, index, priority: priority(unit) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, plan.maxInitialControlUnits)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.unit);
}

export function controlExecutionCoverage(units = [], selectedUnits = [], { runRefinements = false, serialCapabilities = {} } = {}) {
  const selected = new Set(selectedUnits);
  const requiredStages = new Set(["identity_reference", "pose", "initial_prop_structure", "deferred_prop_structure", "support_surface_geometry"]);
  const entries = units.filter((unit) => requiredStages.has(unit.stage)).map((unit) => {
    const appliedInBase = selected.has(unit);
    const capability = serialCapabilities[unit.stage];
    const seriallyCompensated = !appliedInBase && runRefinements && capability?.available === true
      && (unit.stage === "identity_reference" || capability.preservesPose === true)
      && (!["initial_prop_structure", "deferred_prop_structure"].includes(unit.stage)
        || (capability.includesObject === true && capability.includesRequiredHands === true && capability.includesPoseContact === true));
    return {
      stage: unit.stage,
      characterId: unit.characterId || null,
      relationId: unit.relationId || null,
      objectInstanceId: unit.objectInstanceId || null,
      status: appliedInBase ? "applied_in_base" : seriallyCompensated ? "scheduled_serial_refinement" : "uncovered",
      serialCapability: appliedInBase ? null : capability || null,
    };
  });
  return { entries, complete: entries.every((item) => item.status !== "uncovered"), uncovered: entries.filter((item) => item.status === "uncovered") };
}

const propAliases = {
  smartphone: ["smartphone", "phone", "cell phone", "mobile phone", "iphone"],
  umbrella: ["umbrella", "parasol"],
  laptop: ["laptop", "notebook computer"],
  tablet: ["tablet", "ipad"],
  book: ["book", "novel"],
};

export function evaluateCaptionForRequiredProps(caption = "", interactions = []) {
  const normalizedCaption = String(caption || "").toLowerCase();
  const required = interactions.filter((item) => item?.required !== false && item?.object);
  const checks = required.map((item) => {
    const object = String(item.object).toLowerCase();
    const aliases = propAliases[object] || [object.replace(/_/g, " ")];
    return { relationId: item.relationId || null, object, detected: aliases.some((alias) => normalizedCaption.includes(alias)), aliases };
  });
  return { caption: String(caption || ""), checks, missing: checks.filter((item) => !item.detected) };
}

export function handDepthDetectionUsable(channels = [], minimumStdev = 4) {
  const values = channels.slice(0, 3).map((channel) => Number(channel?.stdev)).filter(Number.isFinite);
  const variance = values.length ? Math.max(...values) : Number.NaN;
  return { usable: Number.isFinite(variance) && variance >= minimumStdev, variance };
}

const parseHandKeypoints = (values) => {
  if (!Array.isArray(values)) return [];
  const points = [];
  for (let index = 0; index + 2 < values.length; index += 3) {
    const x = Number(values[index]), y = Number(values[index + 1]), confidence = Number(values[index + 2]);
    points.push({ x, y, confidence, valid: Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(confidence) && x >= 0 && x <= 1 && y >= 0 && y <= 1 && confidence > .05 });
  }
  return points;
};

export function handPoseDetectionUsable(payload = {}, options = {}) {
  const requiredHands = Math.max(1, Number(options.requiredHands || 1));
  const minimumPoints = Math.max(5, Number(options.minimumPoints || 8));
  const candidates = [];
  for (const pose of Array.isArray(payload?.poses) ? payload.poses : []) for (const [personIndex, person] of (pose?.people || []).entries()) {
    for (const [side, field] of [["left", "hand_left_keypoints_2d"], ["right", "hand_right_keypoints_2d"]]) {
      const points = parseHandKeypoints(person?.[field]);
      const valid = points.map((point, index) => ({ ...point, index })).filter((point) => point.valid);
      const fingerChains = [1, 5, 9, 13, 17].filter((start) => valid.some((point) => point.index >= start && point.index < start + 4)).length;
      const xs = valid.map((point) => point.x), ys = valid.map((point) => point.y);
      const bounds = valid.length ? { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } : null;
      const center = valid.length ? { x: xs.reduce((sum, value) => sum + value, 0) / valid.length, y: ys.reduce((sum, value) => sum + value, 0) / valid.length } : null;
      const usable = Boolean(points[0]?.valid && valid.length >= minimumPoints && fingerChains >= 3 && bounds && Math.max(bounds.width, bounds.height) >= .015);
      candidates.push({ personIndex, side, validPointCount: valid.length, fingerChains, wristValid: Boolean(points[0]?.valid), bounds, center, usable });
    }
  }
  const usableCandidates = candidates.filter((candidate) => candidate.usable);
  const anchors = Array.isArray(options.anchors) ? options.anchors : [];
  const crop = options.detectorCrop;
  const imageWidth = Number(options.imageWidth || 1), imageHeight = Number(options.imageHeight || 1);
  const normalizedAnchors = anchors.map((anchor) => ({
    hand: anchor.hand,
    x: crop ? (anchor.x * imageWidth - crop.left) / crop.width : anchor.x,
    y: crop ? (anchor.y * imageHeight - crop.top) / crop.height : anchor.y,
  }));
  const unmatched = new Set(usableCandidates.map((_, index) => index));
  const matches = normalizedAnchors.map((anchor) => {
    const ranked = [...unmatched].map((index) => ({ index, candidate: usableCandidates[index] }))
      .filter(({ candidate }) => !anchor.hand || candidate.side === anchor.hand)
      .map((item) => ({ ...item, distance: item.candidate.center ? Math.hypot(item.candidate.center.x - anchor.x, item.candidate.center.y - anchor.y) : Infinity }))
      .sort((a, b) => a.distance - b.distance);
    const best = ranked[0];
    if (!best || best.distance > .34) return { hand: anchor.hand || null, matched: false, distance: best?.distance ?? null };
    unmatched.delete(best.index);
    return { hand: anchor.hand || null, matched: true, detectedSide: best.candidate.side, personIndex: best.candidate.personIndex, distance: best.distance, validPointCount: best.candidate.validPointCount };
  });
  const usable = anchors.length ? matches.length >= requiredHands && matches.filter((match) => match.matched).length >= requiredHands : usableCandidates.length >= requiredHands;
  return { usable, requiredHands, detectedHands: usableCandidates.length, candidates, matches };
}

export function outfitGarmentZones(description = "") {
  const source = String(description || "").trim();
  if (!source) return [{ zone: "full", prompt: "selected outfit" }];
  const parts = source.split(/\s+(?:with|and|plus)\s+|[,;]+/i).map((part) => part.trim()).filter(Boolean);
  const upperPattern = /\b(top|blouse|shirt|tee|t-shirt|sweater|cardigan|jacket|coat|hoodie|bodice)\b/i;
  const lowerPattern = /\b(skirt|pants|trousers|shorts|jeans|leggings)\b/i;
  const zones = parts.map((prompt) => {
    const upper = upperPattern.test(prompt);
    const lower = lowerPattern.test(prompt);
    return { zone: upper && !lower ? "upper" : lower && !upper ? "lower" : "full", prompt };
  });
  return zones.length > 1 && zones.some((item) => item.zone !== "full") ? zones : [{ zone: "full", prompt: source }];
}

export function shouldUseOutfitVisualReference(zone = "full", isolatedGarmentReference = false) {
  return Boolean(zone) && isolatedGarmentReference === true;
}

export function propSizePlan({ shape = "", orientation = "", contactSpan = 0, hasPoseContact = false, regionWidth = 1 } = {}) {
  const rectangular = shape === "portrait_rect" || shape === "landscape_rect";
  const widthPadding = rectangular ? .045 : shape === "cylinder" ? .06 : .08;
  const minimumWidth = rectangular ? .09 : shape === "elongated" ? .14 : .11;
  const maximumWidth = shape === "elongated" ? .3 : rectangular ? .18 : .26;
  const width = hasPoseContact
    ? Math.min(maximumWidth, Math.max(minimumWidth, contactSpan + widthPadding))
    : Math.min(maximumWidth, Math.max(minimumWidth, regionWidth * (rectangular ? .18 : .28), contactSpan + widthPadding));
  const height = shape === "umbrella" ? .38
    : shape === "portrait_rect" || orientation === "portrait" ? Math.min(.2, Math.max(.14, width * 1.45))
      : shape === "landscape_rect" || orientation === "landscape" ? Math.min(.15, Math.max(.09, width * .68))
        : shape === "elongated" ? .22 : .18;
  return { width, height };
}

export function propBodySizePlan({ shape = "", orientation = "", ...options } = {}) {
  const envelope = propSizePlan({ shape, orientation, ...options });
  const portrait = shape === "portrait_rect" || orientation === "portrait";
  const landscape = shape === "landscape_rect" || orientation === "landscape";
  return {
    width: envelope.width * (portrait ? .52 : landscape ? .72 : .64),
    height: envelope.height * (portrait ? .82 : landscape ? .7 : .74),
    envelope,
  };
}

function splitPromptClauses(prompt = "") {
  const clauses = [];
  let depth = 0;
  let start = 0;
  const source = String(prompt || "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      const clause = source.slice(start, index).trim();
      if (clause) clauses.push(clause);
      start = index + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) clauses.push(tail);
  return clauses;
}

export function upperBodyVisiblePrompt(prompt = "", { suppressForegroundClutter = false, raisedHandContact = false } = {}) {
  const lowerGarment = "(?:midi\\s+|mini\\s+|long\\s+|short\\s+)?(?:skirt|pants|trousers|shorts|jeans|leggings)";
  return splitPromptClauses(String(prompt || "")
    .replace(new RegExp(`\\s+(?:with|and|plus)\\s+(?:a|an|the)?\\s*[^,()]*?\\b${lowerGarment}\\b`, "gi"), ""))
    .filter((clause) => !/\b(?:shoes?|sneakers?|boots?|sandals?|heels?)\b/i.test(clause))
    .filter((clause) => !/\b(?:sofa|couch|chair|bed|stool|bench)\b/i.test(clause))
    .filter((clause) => !suppressForegroundClutter || !/\b(?:foreground|coffee table|side table|dining table|desk|countertop|floor|ground|rug|carpet|mat)\b/i.test(clause))
    .concat([
      "tight head torso and acting-forearms composition filling the canvas",
      "lower body and support surface remain outside the frame",
      ...(raisedHandContact ? [
        "upright torso with acting elbows bent beside the ribcage",
        "acting forearms rise into the frame and the hands meet at the declared mid-chest contact point",
        "acting hands remain above the waist and do not press downward onto a lap or foreground surface",
      ] : []),
      ...(suppressForegroundClutter ? [
        "simple softly blurred interior backdrop with no visible floor or ground plane",
        "external-observer camera with only the declared story characters visible",
      ] : []),
    ])
    .join(", ");
}

export function deferRequiredPropsFromBasePrompt(prompt = "", interactions = []) {
  const objects = interactions.filter((item) => item?.required !== false && item?.object).map((item) => String(item.object).toLowerCase().replace(/_/g, " "));
  if (!objects.length) return { prompt: String(prompt || ""), removed: [], objects: [] };
  const removed = [];
  const kept = splitPromptClauses(prompt).map((part) => {
    // Surface deferral is a local rewrite, never a clause deletion. A clause
    // may simultaneously encode hand ownership, another action, placement and
    // gaze. Negative phrases such as "no legible text" are already compatible
    // with the deferred pass and must be preserved verbatim.
    return part.replace(/(?:legible|readable) (?:screen |prop )?text|intricate (?:screen |prop )?surface (?:content|detail)|fine (?:screen |prop )?(?:content|detail)|pseudo-text/gi, (match, offset, source) => {
      if (/\b(?:no|without|avoid)\s*$/.test(source.slice(Math.max(0, offset - 16), offset))) return match;
      removed.push(match);
      return "simplified non-legible prop surface detail";
    });
  });
  const portable = interactions.filter((item) => item?.required !== false && item?.handMode && item.shape !== "umbrella").map((item) => {
    const contacts = item.contactAnchors || [];
    const contactSpan = contacts.length > 1 ? Math.max(...contacts.map((point) => point.x)) - Math.min(...contacts.map((point) => point.x)) : 0;
    const size = propBodySizePlan({ shape: item.shape, orientation: item.orientation, contactSpan, hasPoseContact: contacts.length > 0, regionWidth: Math.max(.1, Number(item.region?.xEnd || 1) - Number(item.region?.xStart || 0)) });
    const silhouette = /portrait_rect|landscape_rect/.test(item.shape || "") ? "thin rectangular" : item.shape === "cylinder" ? "slender cylindrical" : item.shape === "elongated" ? "narrow elongated" : "compact";
    const placement = item.objectCenter ? `centered at normalized frame position ${Number(item.objectCenter.x).toFixed(2)} ${Number(item.objectCenter.y).toFixed(2)}` : "centered between the acting hands";
    const objectClass = String(item.object || "story object").toLowerCase().replace(/_/g, " ");
    const activeHand = item.activeHand || contacts.find((point) => point.role === "active")?.hand || "declared active";
    const handContract = item.handMode === "two"
      ? "both declared hands contact distinct object-side anchors"
      : `only the ${activeHand} hand contacts the object; the other hand remains available for its declared action`;
    const purpose = item.purpose ? `purpose ${String(item.purpose).replace(/_/g, " ")}` : "preserve the declared action purpose";
    const gaze = item.gazeMode === "object" || item.gazeTarget
      ? `preserve gaze toward ${item.gazeTarget || `${objectClass} surface`}`
      : "preserve the independently declared gaze";
    return `(exactly one clearly visible actual ${objectClass} with a ${silhouette} silhouette:1.5), approximately ${size.width.toFixed(2)} frame-width by ${size.height.toFixed(2)} frame-height, ${placement}, (${handContract}:1.45), ${purpose}, ${gaze}, recognizable as its object category with surface detail deferred, never enlarged into furniture clothing jewelry or a body-sized foreground form`;
  });
  kept.push(...portable, "fine prop surface rendering is deferred without changing story action hand count or gaze", "preserve the planned wrist elbow and contact-anchor geometry");
  return {
    prompt: kept.join(", "),
    removed,
    objects,
    negative: "readable prop text, intricate prop surface content, duplicate prop, extra object outside the declared geometry scaffold, oversized scaffold, body-sized object, giant foreground object, circular furniture around the hands, necklace or dangling cord replacing the handheld object",
  };
}

export function semanticReviewContractForStage(args = {}, stage = "final") {
  const contract = semanticReviewContract(args);
  if (stage !== "draft") return contract;
  const draftIds = new Set([
    "character_count_review_required",
    "anatomy_review_required",
    "framing_review_required",
    "pose_review_required",
    "interaction_review_required",
    "hands_review_required",
    "prop_review_required",
    "prop_cardinality_review_required",
    "gaze_review_required",
    "identity_review_required",
    "outfit_review_required",
    "expression_review_required",
    "support_review_required",
    "composition_review_required",
    "lighting_review_required",
  ]);
  const items = contract.items.filter((item) => draftIds.has(item.id));
  return { ...contract, version: "semantic-review-v1", items, labels: items.map((item) => item.id) };
}

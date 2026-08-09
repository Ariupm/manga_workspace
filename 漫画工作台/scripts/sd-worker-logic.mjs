export function identityRefinementPlan(characterPrompt = "", phase = "draft") {
  const allowsCameraGaze = !/(?:no|without|avoid) eye contact with (?:the )?camera/i.test(characterPrompt) && /(?:looking|gazing) (?:at|toward) (?:the )?(?:viewer|camera)|eye contact with (?:the )?camera/i.test(characterPrompt);
  const preservesOffCameraGaze = !allowsCameraGaze && /(?:gaze|looking|focused|directed|pupils|eyes|head)/i.test(characterPrompt);
  return { allowsCameraGaze, preservesOffCameraGaze, denoisingStrength: preservesOffCameraGaze ? (phase === "draft" ? .28 : .24) : (phase === "draft" ? .38 : .32), controlWeightMode: preservesOffCameraGaze ? "capped_0.78" : "front_facing_min_0.85" };
}
export function gazeMaskCenter({ width, height, poseNose, region = { xStart: 0, xEnd: 1 }, shotSize = "" }) {
  const close = /close-up|extreme close|特写|近景/i.test(shotSize), medium = /medium shot|waist-up|中景/i.test(shotSize);
  const regionCenter = (region.xStart + region.xEnd) / 2;
  return { x: Math.max(.12, Math.min(.88, poseNose?.x ?? regionCenter)), y: Math.max(.12, Math.min(.5, poseNose?.y ?? (close ? .3 : medium ? .27 : .23))), sourceX: poseNose ? "pose_nose" : "region", sourceY: poseNose?.y == null ? "shot_size" : "pose_nose" };
}

export function gazeMaskGeometry({ width, height, face, target = null }) {
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
  return { face: { cx: fx, cy: fy, rx, ry }, target: target ? { cx: tx, cy: ty } : null, vector: { x: dx, y: dy, distance: Math.hypot(dx, dy), angle }, direction, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, containsTarget: Boolean(target) };
}

export function umbrellaGeometry({ width, height, target = { x: .5, y: .48 }, anchors = [] } = {}) {
  const cx = width * target.x, contactY = height * target.y;
  const spread = Math.min(width * .42, Math.max(width * .22, Math.abs((anchors[1]?.x || .7) - (anchors[0]?.x || .3)) * width * .34));
  const canopyY = Math.max(height * .08, contactY - height * .34);
  const bounds = { x: Math.max(0, cx - spread), y: canopyY - height * .06, width: Math.min(width, spread * 2), height: Math.min(height - (canopyY - height * .06), contactY - canopyY + height * .22) };
  return { center: { x: cx, y: contactY }, canopy: { x1: Math.max(0, cx - spread), x2: Math.min(width, cx + spread), y: canopyY }, shaft: { x1: cx, y1: canopyY, x2: cx, y2: contactY + height * .18 }, bounds: { x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), width: Math.min(width - Math.max(0, bounds.x), bounds.width), height: Math.min(height - Math.max(0, bounds.y), bounds.height) } };
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
  const repair = generationSpec.repairPasses || {};
  const interaction = repair.propInteraction || null;
  const relations = Array.isArray(spec.interactions) ? spec.interactions : spec.interaction ? [spec.interaction] : [];
  const items = [];
  const add = (id, label, priority, expectation, sources) => {
    if (!items.some((item) => item.id === id)) items.push({ id, label, priority, required: true, expectation, sources: [...new Set(sources.filter(Boolean))] });
  };
  const hasInteraction = Boolean(interaction || relations.length);
  if (hasInteraction) add("interaction_review_required", "关键交互", "P0", "人物、手部和剧情对象必须形成清楚且符合动作阶段的物理关系", [interaction ? "generationSpec.repairPasses.propInteraction" : "generationSpec.visualSpec.interactions"]);
  const gazeMode = interaction?.gazeMode || "";
  const hasGaze = ["object", "work_point", "target"].includes(gazeMode) || relations.some((item) => item.gazeTarget) || (spec.characters || []).some((item) => item.gazeTarget);
  if (hasGaze) add("gaze_review_required", "视线方向", "P0", "头部和双眼看向结构化剧情目标，不得误看镜头", [gazeMode ? `propInteraction.gazeMode=${gazeMode}` : "visualSpec character/relation gazeTarget"]);
  const shotSize = spec.camera?.shotSize || "";
  if (/close|medium|wide|full|long|特写|近景|中景|远景|全景/i.test(shotSize)) add("framing_review_required", "景别裁切", "P0", `实际画面必须遵守 ${shotSize} 的人物范围和裁切契约`, ["generationSpec.visualSpec.camera.shotSize"]);
  if (generationSpec.poseControl) add("pose_review_required", "动作姿势", "P0", `姿势必须落实 ${generationSpec.poseControl.kind || "当前动作"}，关节方向与剧情一致`, ["generationSpec.poseControl"]);
  const identityRefs = references.filter((item) => item?.role === "identity");
  if (identityRefs.length) add("identity_review_required", "身份与发型", "P1", "人物脸型、五官、发色、发型和稳定身份特征必须与对应身份参考一致", identityRefs.map((item) => `identity reference:${item.characterId || item.name || "character"}`));
  const outfitPlans = generationSpec.qualityGate?.outfitConditioning || [];
  const hasOutfit = outfitPlans.length || /outfit|text_only/i.test(String(adapterStatus.outfit || "")) || Object.values(characterLooks).some((look) => look && (look.outfitId || look.outfitEn));
  if (hasOutfit) add("outfit_review_required", "服装一致性", "P1", "服装类别、剪裁、层次和颜色必须与当前角色服装规格一致", outfitPlans.length ? outfitPlans.map((item) => `outfitConditioning:${item.characterId}:${item.status}`) : [`adapterStatus.outfit=${adapterStatus.outfit || "text"}`]);
  const handRequirement = hasInteraction || (spec.characters || []).some((item) => item.hands && !/out of frame|not visible|unknown/i.test(item.hands));
  if (handRequirement) add("hands_review_required", "手部与接触", "P0", "手指数量、分离度、握持方式和手物接触必须自然且无粘连穿插", [hasInteraction ? "interaction hand/contact contract" : "visualSpec.characters.hands"]);
  if (hasInteraction) add("prop_review_required", "道具形态与表面", "P0", `剧情道具 ${interaction?.object || relations[0]?.propId || "object"} 必须存在，朝向、透视和可见表面符合用途`, [interaction ? "propInteraction object/orientation/viewerSurface" : "visualSpec.interactions.propId"]);
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

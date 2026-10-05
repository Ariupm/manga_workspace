import {poseConditioningPolicy} from "../scripts/pose-conditioning-policy.mjs";
import type { Shot } from "./types";
import type { PoseControlV3 } from "./pose-v3/schema";
import { isNarrativeActionInstruction } from "./action-description";
import { positivePoseText, basicTemplateFromText, basicFamilyForTemplate } from "./pose-basic-semantics";

export type PosePoint = { x: number; y: number };
export type PoseGazeTargetKind = "object" | "work_point" | "target" | "independent";
export type PoseGazeTarget =
  | { kind: "independent"; point: null; targetId: null; source: string }
  | { kind: Exclude<PoseGazeTargetKind, "independent">; point: PosePoint; targetId: string | null; source: string };
export type PoseHeadDirection = {
  target: PosePoint | null;
  dx: number;
  dy: number;
  mode: "camera" | "left" | "right" | "down" | "up" | "down_left" | "down_right" | "up_left" | "up_right";
};
export type PosePhase = "anticipation" | "contact" | "follow_through";
export type PoseIntensity = "calm" | "normal" | "dynamic";
export type PoseHandedness = "left" | "right" | "both";
export type PoseFacing = "left" | "right" | "front";
export type PoseConfidence = "high" | "medium" | "low";
export type PoseFramingModeV2 = "upper_body" | "natural_body" | "full_body";
export type PoseLocomotionMode = "walk" | "run";
export type PoseGaitPhase = "heel_strike" | "mid_stance" | "toe_off";
export type PoseLocomotionPlanV2 = {
  mode: PoseLocomotionMode;
  gaitPhase: PoseGaitPhase;
  leadSide: "left" | "right";
  supportSide: "left" | "right";
  swingSide: "left" | "right";
  stride: number;
  torsoLean: number;
  armSwing: number;
  lowerBodyControl: "full" | "hidden_by_framing";
};
export type PoseFramingGeometry = {
  mode: PoseFramingModeV2;
  scale: number;
  visibleBoundsTarget: { x: number; y: number; width: number; height: number };
  source: "visualSpec.camera.shotSize" | "legacy_camera" | "default";
};

export type PoseActionFamilyV2 =
  | "static"
  | "locomotion"
  | "seated"
  | "crouch_kneel"
  | "recline"
  | "lie"
  | "turn"
  | "bend"
  | "point"
  | "reach"
  | "self_touch"
  | "head_gesture"
  | "hold_carry"
  | "pick_place"
  | "open_close"
  | "operate_environment"
  | "read_phone"
  | "write_tool"
  | "drink_eat"
  | "push_pull";

export type PoseInteractionKindV2 =
  | "conversation"
  | "reaction"
  | "handover"
  | "shared_prop"
  | "handshake_highfive"
  | "embrace_support"
  | "guide_pull"
  | "walk_together"
  | "confrontation";

export type PoseInteractionInput = {
  expectedCount?: number;
  actionPlan?:import("./story-action-contract").StoryActionContract;
  shape?: string;
  orientation?: string;
  relationId?: string;
  characterId: string;
  required: boolean;
  object: string;
  purpose: string;
  handMode: "one" | "two";
  objectCenter: PosePoint;
  region: { xStart: number; xEnd: number };
  gazeMode?: PoseGazeTargetKind;
  gazeTarget?: PoseGazeTarget;
  activeHand?: "left" | "right" | "both";
  objectInstanceId?: string;
  contactAnchors?: Array<{ hand: "left" | "right"; x: number; y: number }>;
};

export type SupportRelationGeometry = {
  characterId: string;
  supportSurfaceId: string;
  supportKind: "sofa" | "chair" | "bed" | "floor" | "wall" | "unknown";
  backEdge?: { x: number; yStart: number; yEnd: number };
  region: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  pelvisAnchor: PosePoint;
  torsoAnchor: PosePoint;
  contactPlaneY: number;
  depthOrder: "behind_actor" | "same_plane" | "under_actor";
  visibleEdge: { xStart: number; xEnd: number; y: number };
  status: "planned" | "canny_control_applied" | "manual_review_required";
};

export type PosePersonPlanV2 = {
  characterId: string;
  actions: PoseActionFamilyV2[];
  basePose: "standing" | "seated" | "crouch_kneel" | "recline" | "lie";
  primaryAction: PoseActionFamilyV2;
  templateId: string;
  variantId: number;
  phase: PosePhase;
  intensity: PoseIntensity;
  handedness: PoseHandedness;
  handMode: "one" | "two";
  activeHand: "left" | "right" | "both";
  facing: PoseFacing;
  anchor: PosePoint;
  scale: number;
  target: PosePoint | null;
  gazeTarget: PoseGazeTarget;
  relationTargets: Array<{ actionRelationAudit?:import("./pose-v3/action-relations").ActionRelationAudit; actionPlan?:import("./story-action-contract").StoryActionContract; relationId?: string; object: string; purpose: string; target: PosePoint; gazeTarget: PoseGazeTarget; handMode: "one" | "two"; activeHand: "left" | "right" | "both"; objectInstanceId?: string; contactAnchors?: Array<{ hand: "left" | "right"; x: number; y: number }>; wristAssignments?: Array<{ hand: "left" | "right"; joint: number; x: number; y: number }>; conflict?: "wrist_already_reserved" }>;
  supportRelation: SupportRelationGeometry;
  headDirection: PoseHeadDirection;
  locomotion: PoseLocomotionPlanV2 | null;
  mirror: boolean;
  sourceText: string;
};

export type PoseControlProfile = {
  id: "subtle_upper" | "standard_upper" | "dynamic_full" | "multi_contact" | "walk_upper" | "run_upper" | "walk_full" | "run_full";
  policyVersion?: "pose-conditioning-1" | "pose-conditioning-2";
  strength?: "auto"|"flexible"|"strict";
  controlMode?: string;
  reason?: string;
  weight: number;
  guidanceStart: number;
  guidanceEnd: number;
};

export type PoseScenePlanV2 = {
  schemaVersion: "2.0";
  shotId: number;
  peopleCount: number;
  framingMode: PoseFramingModeV2;
  framingGeometry: PoseFramingGeometry;
  people: PosePersonPlanV2[];
  interactionKind: PoseInteractionKindV2 | null;
  interactionTarget: PosePoint | null;
  supportRelations: SupportRelationGeometry[];
  overrideConflicts: string[];
  visualSpecConfirmed: boolean;
  relationConflicts: Array<{ characterId: string; hand: "left" | "right"; relationIds: string[]; resolution: "explicit_overlap_requires_review" }>;
  selectorSource: "visual_interaction" | "visual_character" | "shot_action" | "camera" | "fallback";
  selectorReason: string;
  confidence: PoseConfidence;
  variantSeed: number;
  controlProfile: PoseControlProfile;
  warnings: string[];
};

export type PoseSafetyResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contactError: number | null;
};

export type PoseControlOverrideV1 = {
  schemaVersion: "pose-override-v1";
  templateId?: string;
  actionGeometry?: import("./pose-v3/action-relations").ActionGeometryInput;
  conditioning?: import("../scripts/pose-conditioning-policy.mjs").PoseConditioningPreference;
  phase?: PosePhase;
  intensity?: PoseIntensity;
  handedness?: PoseHandedness;
  targetDirection?: "left" | "center" | "right" | "up" | "down";
  mirror?: boolean;
  spacing?: "close" | "normal" | "wide";
  bodyView?: "front" | "three_quarter" | "left_profile" | "right_profile";
  kneeSpacing?: "natural" | "together" | "apart";
  bodyTemplateId?: import("./pose-basic-semantics").BasicTemplateId;
  armTemplateId?: "hold_one" | "hold_two" | "phone_one" | "phone_two" | "none";
  swapRoles?: boolean;
  confirmPoseContract?: boolean;
  people?: PosePoint[][];
  editMode?: "preset" | "parameter_edit" | "joint_edit";
  coordinateSpace?: "projected_canvas" | "full_pose";
  projectionIntent?: "lock_current" | "recompute";
};

export type PoseControlV2 = {
  kind: string;
  posePlanVersion: "2.0";
  framingMode: PoseFramingModeV2;
  hiddenJointIndices: number[];
  source: "automatic_action_plan" | "automatic_interaction_plan" | "user_override";
  selectorReason: string;
  actionFamily: string;
  presetId: string;
  variantId: number;
  scenePlan: PoseScenePlanV2;
  controlProfile: PoseControlProfile;
  override: PoseControlOverrideV1 | null;
  safety: PoseSafetyResult;
  lowerBodyControl: "full" | "hidden_by_framing" | "not_applicable";
  framingWarnings: string[];
  width: number;
  height: number;
  people: PosePoint[][];
  svg: string;
};

export type PosePresetDefinition = {
  id: string;
  label: string;
  category: "姿态" | "移动" | "肢体表达" | "道具动作" | "双人互动";
  peopleCount: 1 | 2;
  family: PoseActionFamilyV2 | PoseInteractionKindV2;
  locomotionMode?: PoseLocomotionMode;
};

export const posePresetCatalog: PosePresetDefinition[] = [
  { id: "single_stand_v2", label: "站立重心", category: "姿态", peopleCount: 1, family: "static" },
  { id: "single_sit_rise_v2", label: "坐下／起身", category: "姿态", peopleCount: 1, family: "seated" },
  { id: "single_crouch_kneel_v2", label: "蹲下／跪姿", category: "姿态", peopleCount: 1, family: "crouch_kneel" },
  { id: "single_recline_v2", label: "斜靠", category: "姿态", peopleCount: 1, family: "recline" },
  { id: "single_lie_v2", label: "卧姿", category: "姿态", peopleCount: 1, family: "lie" },
  { id: "single_walk_v2", label: "行走／快走", category: "移动", peopleCount: 1, family: "locomotion", locomotionMode: "walk" },
  { id: "single_run_v2", label: "跑动／冲刺", category: "移动", peopleCount: 1, family: "locomotion", locomotionMode: "run" },
  { id: "single_turn_v2", label: "转身／回望", category: "肢体表达", peopleCount: 1, family: "turn" },
  { id: "single_bend_v2", label: "俯身", category: "肢体表达", peopleCount: 1, family: "bend" },
  { id: "single_point_v2", label: "指向", category: "肢体表达", peopleCount: 1, family: "point" },
  { id: "single_reach_v2", label: "伸手", category: "肢体表达", peopleCount: 1, family: "reach" },
  { id: "single_self_touch_v2", label: "自触摸", category: "肢体表达", peopleCount: 1, family: "self_touch" },
  { id: "single_head_gesture_v2", label: "头部反应", category: "肢体表达", peopleCount: 1, family: "head_gesture" },
  { id: "single_hold_carry_v2", label: "持有／搬运", category: "道具动作", peopleCount: 1, family: "hold_carry" },
  { id: "single_pick_place_v2", label: "拿取／放置", category: "道具动作", peopleCount: 1, family: "pick_place" },
  { id: "single_open_close_v2", label: "打开／关闭", category: "道具动作", peopleCount: 1, family: "open_close" },
  { id: "single_operate_environment_v2", label: "开关／环境操作", category: "道具动作", peopleCount: 1, family: "operate_environment" },
  { id: "single_read_phone_v2", label: "阅读／手机", category: "道具动作", peopleCount: 1, family: "read_phone" },
  { id: "single_write_tool_v2", label: "书写／剪切／工具", category: "道具动作", peopleCount: 1, family: "write_tool" },
  { id: "single_drink_eat_v2", label: "饮食", category: "道具动作", peopleCount: 1, family: "drink_eat" },
  { id: "single_push_pull_v2", label: "推／拉", category: "道具动作", peopleCount: 1, family: "push_pull" },
  { id: "double_conversation_v2", label: "面对交谈", category: "双人互动", peopleCount: 2, family: "conversation" },
  { id: "double_reaction_v2", label: "倾听／反应", category: "双人互动", peopleCount: 2, family: "reaction" },
  { id: "double_handover_v2", label: "递交／接收", category: "双人互动", peopleCount: 2, family: "handover" },
  { id: "double_shared_prop_v2", label: "共同查看道具", category: "双人互动", peopleCount: 2, family: "shared_prop" },
  { id: "double_handshake_highfive_v2", label: "握手／击掌", category: "双人互动", peopleCount: 2, family: "handshake_highfive" },
  { id: "double_embrace_support_v2", label: "拥抱／搀扶／扶起", category: "双人互动", peopleCount: 2, family: "embrace_support" },
  { id: "double_guide_pull_v2", label: "引导／拉拽／推挡", category: "双人互动", peopleCount: 2, family: "guide_pull" },
  { id: "double_walk_together_v2", label: "并行／擦肩", category: "双人互动", peopleCount: 2, family: "walk_together" },
  { id: "double_confrontation_v2", label: "对峙", category: "双人互动", peopleCount: 2, family: "confrontation" },
];

export const openPoseColors = [
  "#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00",
  "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff",
  "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055",
];

export const openPoseLimbs = [
  [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9],
  [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16],
  [0, 15], [15, 17],
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clean = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ");
const unique = <T,>(values: T[]) => [...new Set(values)];
const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function renderOpenPoseSvgV2(people: PosePoint[][], width = 512, height = 512) {
  const visible = (point: PosePoint | undefined) => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  const draw = (points: PosePoint[]) => [
    ...openPoseLimbs.flatMap(([a, b], index) => {
      const start = points[a], end = points[b];
      return visible(start) && visible(end)
        ? [`<line x1="${start.x * width}" y1="${start.y * height}" x2="${end.x * width}" y2="${end.y * height}" stroke="${openPoseColors[index]}" stroke-width="5" stroke-linecap="round"/>`]
        : [];
    }),
    ...points.flatMap((point, index) => visible(point)
      ? [`<circle cx="${point.x * width}" cy="${point.y * height}" r="4" fill="${openPoseColors[index % openPoseColors.length]}"/>`]
      : []),
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="black"/>${people.map(draw).join("")}</svg>`;
}

export function derivePoseFramingModeV2(shot: Shot): PoseFramingModeV2 {
  const visualShotSize = shot.visualSpecConfirmed ? shot.visualSpec?.camera?.shotSize || "" : "";
  const explicitCamera = `${visualShotSize} ${shot.cameraEn} ${shot.camera}`;
  if (/近景|中景|close-up|close shot|medium close-up|chest-up|head-and-shoulders|waist-up|medium shot/i.test(visualShotSize)) return "upper_body";
  if (/远景|全景|wide shot|full shot|long shot/i.test(visualShotSize)) return "full_body";
  if (/近景|中景/i.test(shot.camera || "")) return "upper_body";
  if (/远景|全景/i.test(shot.camera || "")) return "full_body";
  if (/close-up|close shot|medium close-up|chest-up|head-and-shoulders|waist-up|medium shot|近景|中景/i.test(explicitCamera)) return "upper_body";
  if (/wide shot|full shot|long shot|远景|全景/i.test(explicitCamera)) return "full_body";
  const camera = `${shot.cameraEn} ${shot.camera} ${shot.compositionEn} ${shot.visualSpecConfirmed ? shot.visualSpec?.camera.shotSize || "" : ""}`;
  if (/wide shot|full shot|long shot|远景|全景/i.test(camera)) return "full_body";
  if (/close-up|close shot|medium close-up|chest-up|head-and-shoulders|waist-up|medium shot|近景|中景/i.test(camera)) return "upper_body";
  return "natural_body";
}

const derivePoseFramingGeometry = (shot: Shot, mode: PoseFramingModeV2): PoseFramingGeometry => {
  if (mode !== "upper_body") return { mode, scale: 1, visibleBoundsTarget: { x: .08, y: .08, width: .84, height: .84 }, source: shot.visualSpecConfirmed ? "visualSpec.camera.shotSize" : "default" };
  const visualShotSize = shot.visualSpecConfirmed ? shot.visualSpec?.camera?.shotSize || "" : "";
  const sourceText = visualShotSize || `${shot.cameraEn} ${shot.camera}`;
  // `medium close-up` must be checked before the broader `close-up` pattern.
  const scale = /extreme close|特写/i.test(sourceText) ? 1.72 : /medium close-up|胸像|chest-up|head-and-shoulders|waist-up/i.test(sourceText) ? 1.36 : /close-up|close shot|近景/i.test(sourceText) ? 1.65 : /medium shot|中景/i.test(sourceText) ? 1.22 : 1.18;
  const height = scale >= 1.6 ? .84 : scale >= 1.35 ? .72 : .68;
  // Diffusion commonly renders the visible hair/head contour above the COCO
  // nose point. Keep a real head-safety margin instead of placing the nose at
  // the top edge of the requested bounds; otherwise close shots can satisfy
  // the skeleton while cropping the eyes or crown out of frame.
  const y = scale >= 1.6 ? .13 : scale >= 1.35 ? .2 : .16;
  return { mode, scale, visibleBoundsTarget: { x: .08, y, width: .84, height }, source: visualShotSize ? "visualSpec.camera.shotSize" : shot.cameraEn || shot.camera ? "legacy_camera" : "default" };
};

const actionRules: Array<[PoseActionFamilyV2, RegExp]> = [
  ["lie", /\b(?:lie|lies|lying|lay)\b|lie down|躺|卧倒|平卧/i],
  ["recline", /reclin|lean(?:ing|s)? back|斜靠|倚靠|半躺/i],
  ["crouch_kneel", /crouch|squat|kneel|跪|蹲/i],
  ["seated", /\b(?:sit|sits|sitting|seated)\b|坐/i],
  ["locomotion", /\b(?:walk|walking|walks|walked|run|running|runs|ran|stride|striding|step|stepping|enter|entering|exit|exiting|leave|leaving|approach|approaching)\b|走|跑|迈步|进入|离开|出门|走向/i],
  ["self_touch", /rub(?:bing|s)? .*?(?:eye|eyes|face)|touch(?:ing|es)? .*?(?:eye|eyes|face|forehead)|cover(?:ing|s)? .*?(?:face|eyes)|揉眼|揉脸|摸脸|捂脸|扶额/i],
  ["point", /\bpoint(?:ing|s|ed)?\s+(?:toward|at|to)\b|gesture(?:s|d|ing)? toward|指向|指着|指给/i],
  ["operate_environment", /(?:turn(?:ing|s|ed)?|rotat(?:e|ing)) (?:a |the )?(?:knob|handle)|旋钮|转动把手|turn(?:ing|s|ed)? (?:off|on)|switch(?:ing|es|ed)?|press(?:ing|es|ed)? .*?(?:switch|button)|开灯|关灯|开关|按(?:下)?按钮/i],
  ["push_pull", /\b(?:push|pushing|pull|pulling|drag|dragging)\b|推|拉|拖/i],
  ["pick_place", /\b(?:pick(?:ing)? up|take|taking|remove|removing|place|placing|put|putting|set down)\b|拿起|取出|放下|摆放/i],
  ["open_close", /\b(?:open|opening|close|closing|shut|unfold|fold|turning pages?|flip(?:ping)? pages?)\b|打开|关闭|合上|翻页/i],
  ["write_tool", /\b(?:write|writing|copy|copying|draw|drawing|cut|cutting|slice|slicing|type|typing)\b|书写|抄写|画|剪|切/i],
  ["drink_eat", /\b(?:drink|drinking|sip|sipping|eat|eating|bite|biting)\b|喝|吃|咬/i],
  ["read_phone", /\b(?:read|reading|phone|smartphone|message|notification|book|document|journal|notebook)\b|阅读|手机|书|文件/i],
  ["hold_carry", /\b(?:hold|holding|carry|carrying|hugging .*?(?:box|book|bag|package))\b|拿着|抱着|提着|携带/i],
  ["reach", /\breach(?:ing|es|ed)?\b|extend(?:ing|s|ed)? .*?(?:arm|hand)|伸手|探手|够向/i],
  ["bend", /\b(?:bend|bends|bending|stoop|stooping)\b|lean(?:ing|s)? forward|俯身|弯腰/i],
  ["turn", /turn(?:ing|s|ed)? (?:around|back|head|body)|look(?:ing|s)? back|回头|转身|扭头/i],
  ["head_gesture", /\b(?:nod|nods|nodding|yawn|yawning|frown|frowning|smile|smiling|sigh|sighing)\b|eyes? (?:light(?:ing)? up|widen(?:ing|s|ed)?)|look(?:ing|s)? up|raise(?:s|d|ing)? .*?head|tilt(?:ing)? .*?head|lower(?:ing)? .*?head|turn(?:ing)? .*?head|点头|低头|歪头|摇头|抬头|仰头|打哈欠|眼睛一亮|皱眉|微笑|叹气/i],
];

const primaryOrder: PoseActionFamilyV2[] = [
  "lie", "recline", "crouch_kneel", "seated", "locomotion", "bend", "turn",
  "self_touch", "point", "reach", "push_pull", "operate_environment", "pick_place", "open_close", "write_tool",
  "drink_eat", "read_phone", "hold_carry", "head_gesture", "static",
];

const templateForFamily = (family: PoseActionFamilyV2) => ({
  static: "single_stand_v2", locomotion: "single_walk_v2", seated: "single_sit_rise_v2",
  crouch_kneel: "single_crouch_kneel_v2", recline: "single_recline_v2", lie: "single_lie_v2",
  turn: "single_turn_v2", bend: "single_bend_v2", point: "single_point_v2", reach: "single_reach_v2",
  self_touch: "single_self_touch_v2", head_gesture: "single_head_gesture_v2", hold_carry: "single_hold_carry_v2",
  pick_place: "single_pick_place_v2", open_close: "single_open_close_v2", operate_environment: "single_operate_environment_v2",
  read_phone: "single_read_phone_v2", write_tool: "single_write_tool_v2", drink_eat: "single_drink_eat_v2",
  push_pull: "single_push_pull_v2",
} satisfies Record<PoseActionFamilyV2, string>)[family];

const familyFromTemplate = (templateId: string): PoseActionFamilyV2 | null => {
  if (templateId === "single_walk_run_v2") return "locomotion";
  const preset = posePresetCatalog.find((item) => item.id === templateId && item.peopleCount === 1);
  return preset ? preset.family as PoseActionFamilyV2 : null;
};

const locomotionModeFromTemplate = (templateId: string): PoseLocomotionMode | null => {
  if (templateId === "single_walk_run_v2" || templateId === "single_walk_v2") return "walk";
  if (templateId === "single_run_v2") return "run";
  return null;
};

const basePoseForFamily = (family: PoseActionFamilyV2): PosePersonPlanV2["basePose"] => {
  if (family === "seated") return "seated";
  if (family === "crouch_kneel") return "crouch_kneel";
  if (family === "recline") return "recline";
  if (family === "lie") return "lie";
  return "standing";
};

const interactionFromTemplate = (templateId: string): PoseInteractionKindV2 | null => {
  const preset = posePresetCatalog.find((item) => item.id === templateId && item.peopleCount === 2);
  return preset ? preset.family as PoseInteractionKindV2 : null;
};

const derivePhase = (text: string): PosePhase => {
  if (/after|finished|release|released|result|follow.?through|已经|完成|松开/i.test(text)) return "follow_through";
  if (/before|about to|prepar|begin|beginning|start|approach|伸向|准备|即将/i.test(text)) return "anticipation";
  return "contact";
};

const deriveLocomotionPlan = (
  source: string,
  phase: PosePhase,
  intensity: PoseIntensity,
  variantId: number,
  framingMode: PoseFramingModeV2,
  forcedMode?: PoseLocomotionMode | null,
): PoseLocomotionPlanV2 => {
  const mode = forcedMode || (/\b(?:run|running|runs|ran|sprint|sprinting|dash|dashing)\b|跑|冲刺/i.test(source) ? "run" : "walk");
  const gaitPhase: PoseGaitPhase = phase === "anticipation" ? "heel_strike" : phase === "follow_through" ? "toe_off" : "mid_stance";
  const phaseOffset = gaitPhase === "mid_stance" ? 1 : gaitPhase === "toe_off" ? 2 : 0;
  const leadSide = (variantId + phaseOffset) % 2 === 0 ? "right" as const : "left" as const;
  const supportSide = gaitPhase === "toe_off" ? (leadSide === "right" ? "left" : "right") : leadSide;
  const swingSide = supportSide === "right" ? "left" : "right";
  const intensityScale = intensity === "dynamic" ? 1.16 : intensity === "calm" ? .84 : 1;
  const phaseScale = gaitPhase === "mid_stance" ? .72 : gaitPhase === "toe_off" ? 1.08 : 1;
  return {
    mode,
    gaitPhase,
    leadSide,
    supportSide,
    swingSide,
    stride: (mode === "run" ? .24 : .15) * intensityScale * phaseScale,
    torsoLean: (mode === "run" ? .065 : .022) * intensityScale,
    armSwing: (mode === "run" ? .2 : .13) * intensityScale * phaseScale,
    lowerBodyControl: framingMode === "upper_body" ? "hidden_by_framing" : "full",
  };
};

const deriveIntensity = (text: string): PoseIntensity => {
  if (/run|sprint|jump|fall|struggle|forceful|sudden|strong|冲|跳|摔|用力|猛/i.test(text)) return "dynamic";
  if (/gently|slightly|calm|quiet|soft|relaxed|轻轻|微微|平静/i.test(text)) return "calm";
  return "normal";
};

const textForCharacter = (shot: Shot, characterId: string) => {
  const planned = shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item) => item.characterId === characterId) : null;
  const relations = shot.visualSpecConfirmed ? (shot.visualSpec?.interactions || []).filter((item) => item.actorCharacterId === characterId || item.targetCharacterId === characterId) : [];
  const look = shot.characterLooks?.[characterId];
  return clean([
    ...relations.flatMap((item) => [item.type, item.action, item.phase, item.propId, item.gazeTarget, ...item.contactPoints]),
    planned?.bodyPose, planned?.bodySupport, planned?.action, planned?.actionTarget, planned?.gazeTarget, planned?.hands,
    look?.actionEn, look?.gazeEn, look?.handsEn, shot.actionEn, shot.description,
    ...(shot.visualSpecConfirmed ? shot.visualSpec?.visibleFacts || [] : []),
  ].filter(value => Boolean(value) && !isNarrativeActionInstruction(value)).join("; "));
};

const primaryTextForCharacter = (shot: Shot, characterId: string) => {
  const planned = shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item) => item.characterId === characterId) : null;
  const relations = shot.visualSpecConfirmed ? (shot.visualSpec?.interactions || []).filter((item) => item.actorCharacterId === characterId) : [];
  const look = shot.characterLooks?.[characterId];
  return clean([
    ...relations.flatMap((item) => [item.type, item.action, item.phase, item.propId, item.gazeTarget, ...item.contactPoints]),
    planned?.bodyPose, planned?.bodySupport, planned?.action, planned?.actionTarget, planned?.hands,
    look?.actionEn, look?.handsEn, shot.actionEn,
  ].filter(value => Boolean(value) && !isNarrativeActionInstruction(value)).join("; "));
};

const regionForCharacter = (shot: Shot, characterId: string, index: number, count: number, interaction?: PoseInteractionInput) => {
  const planned = shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item) => item.characterId === characterId) : null;
  return planned?.region || interaction?.region || { xStart: index / count, xEnd: (index + 1) / count };
};

const supportForCharacter = (shot: Shot, characterId: string, basePose: PosePersonPlanV2["basePose"], region: { xStart: number; xEnd: number }): SupportRelationGeometry => {
  const planned=shot.visualSpecConfirmed?shot.visualSpec?.characters.find(c=>c.characterId===characterId):undefined;
  const actorText=textForCharacter(shot, characterId);
  // Scene furniture is a fallback only for a seated actor, never an instruction
  // for every person in the scene. Explicit actor support always wins.
  const explicitSupport=planned?.bodySupport;
  const sceneSeats=(shot.visualSpecConfirmed?shot.visualSpec?.scene?.anchors||[]:[]).filter(a=>/\b(?:chair|sofa|couch|bed)\b|椅子|沙发|床/i.test(a));
  const source=explicitSupport||(/\b(?:chair|sofa|couch|bed)\b|椅子|沙发|床/i.test(actorText)?actorText:basePose==='seated'&&sceneSeats.length===1?sceneSeats[0]:actorText);
  const supportKind: SupportRelationGeometry["supportKind"] = /\b(?:sofa|couch)\b|沙发/i.test(source) ? "sofa" : /\bchair\b|椅子/i.test(source) ? "chair" : /\bbed\b|床/i.test(source) ? "bed" : basePose === "standing" || basePose === "crouch_kneel" ? "floor" : "unknown";
  const supportSurfaceId = supportKind === "unknown" ? "support:manual-review" : `support:${supportKind}:primary`;
  const y = supportKind === "floor" ? .9 : supportKind === "bed" ? .74 : supportKind === "chair" ? .64 : supportKind === "sofa" ? .7 : .68;
  const actorWidth = Math.max(.2, region.xEnd - region.xStart);
  const surfaceWidth = supportKind === "sofa" ? Math.min(.84, Math.max(.48, actorWidth * .9 + .18)) : supportKind === "chair" ? Math.min(.62, Math.max(.34, actorWidth * .7 + .16)) : supportKind === "bed" ? Math.min(1, Math.max(.62, actorWidth + .28)) : .76;
  const cx = (region.xStart + region.xEnd) / 2;
  return { characterId, supportSurfaceId, supportKind, region: { xStart: Math.max(0, cx - surfaceWidth / 2), xEnd: Math.min(1, cx + surfaceWidth / 2), yStart: Math.max(0, y - .18), yEnd: Math.min(1, y + .12) }, pelvisAnchor: { x: cx, y: y - .06 }, torsoAnchor: { x: cx, y: y - .38 }, contactPlaneY: y, depthOrder: supportKind === "floor" ? "under_actor" : "behind_actor", visibleEdge: { xStart: Math.max(0, cx - surfaceWidth / 2), xEnd: Math.min(1, cx + surfaceWidth / 2), y }, status: supportKind === "unknown" ? "manual_review_required" : "planned" };
};

const retargetSupportForOverride = (person: PosePersonPlanV2, support: SupportRelationGeometry, nextBasePose: PosePersonPlanV2["basePose"]): SupportRelationGeometry => {
  const source = person.sourceText;
  const sourceKind: SupportRelationGeometry["supportKind"] = /\b(?:sofa|couch)\b|沙发/i.test(source) ? "sofa" : /\bchair\b|椅子/i.test(source) ? "chair" : /\bbed\b|床/i.test(source) ? "bed" : nextBasePose === "standing" || nextBasePose === "crouch_kneel" ? "floor" : "unknown";
  const supportKind = nextBasePose === "standing" || nextBasePose === "crouch_kneel" ? "floor" : sourceKind;
  const y = supportKind === "floor" ? .9 : supportKind === "bed" ? .74 : supportKind === "chair" ? .64 : supportKind === "sofa" ? .7 : .68;
  const region = support.region;
  return { ...support, supportSurfaceId: supportKind === "unknown" ? "support:manual-review" : `support:${supportKind}:override`, supportKind, region: { ...region, yStart: Math.max(0, y - .18), yEnd: Math.min(1, y + .12) }, pelvisAnchor: { x: (region.xStart + region.xEnd) / 2, y: y - .06 }, torsoAnchor: { x: (region.xStart + region.xEnd) / 2, y: y - .38 }, contactPlaneY: y, depthOrder: supportKind === "floor" ? "under_actor" : "behind_actor", visibleEdge: { xStart: region.xStart, xEnd: region.xEnd, y }, status: supportKind === "unknown" ? "manual_review_required" : "planned" };
};

const independentGazeTarget = (source: string): PoseGazeTarget => ({ kind: "independent", point: null, targetId: null, source });

const normalizeGazeTarget = (value: PoseGazeTarget | undefined, fallbackSource: string): PoseGazeTarget => {
  if (!value || value.kind === "independent" || !value.point) return independentGazeTarget(value?.source || fallbackSource);
  return {
    kind: value.kind,
    point: { x: clamp(value.point.x, .03, .97), y: clamp(value.point.y, .03, .97) },
    targetId: value.targetId || null,
    source: value.source || fallbackSource,
  };
};

const gazeTargetForInteraction = (interaction: PoseInteractionInput): PoseGazeTarget => {
  if (interaction.gazeTarget) return normalizeGazeTarget(interaction.gazeTarget, "interaction.gaze_target");
  if (!interaction.required || !interaction.gazeMode || interaction.gazeMode === "independent") {
    return independentGazeTarget(interaction.gazeMode === "independent" ? "legacy.interaction.independent" : "legacy.interaction.no_gaze_target");
  }
  // Old recipes only persisted gazeMode plus objectCenter. Preserve those
  // explicit modes as a labelled compatibility fact, but never infer gaze from
  // an arbitrary first required object when gazeMode itself is absent.
  return {
    kind: interaction.gazeMode,
    point: { x: clamp(interaction.objectCenter.x, .03, .97), y: clamp(interaction.objectCenter.y, .03, .97) },
    targetId: interaction.objectInstanceId || null,
    source: "legacy.interaction.gaze_mode_object_center",
  };
};

const gazeTargetForPersonPlan = (plan: PosePersonPlanV2): PoseGazeTarget => {
  const existing = plan.gazeTarget;
  if (existing) {
    plan.gazeTarget = normalizeGazeTarget(existing, "scene_plan.gaze_target");
    return plan.gazeTarget;
  }
  const legacyTarget = plan.headDirection?.target || null;
  plan.gazeTarget = legacyTarget
    ? { kind: "target", point: { ...legacyTarget }, targetId: null, source: "legacy.scene_plan.head_direction" }
    : independentGazeTarget("legacy.scene_plan.no_gaze_target");
  return plan.gazeTarget;
};

const headDirectionFor = (nose: PosePoint, target: PosePoint | null): PoseHeadDirection => {
  const dx = target ? target.x - nose.x : 0;
  const dy = target ? target.y - nose.y : 0;
  const mode: PoseHeadDirection["mode"] = !target ? "camera" : Math.abs(dx) < .08 && dy > .08 ? "down" : Math.abs(dx) < .08 && dy < -.08 ? "up" : dx < 0 && dy > .04 ? "down_left" : dx > 0 && dy > .04 ? "down_right" : dx < -.08 ? "left" : dx > .08 ? "right" : dy < 0 ? "up" : "camera";
  return { target, dx, dy, mode };
};

const detectInteractionKind = (source: string): PoseInteractionKindV2 => {
  if (/handshake|shake hands|high.?five|握手|击掌/i.test(source)) return "handshake_highfive";
  if (/embrace|hug|support|help .*?up|扶起|搀扶|拥抱/i.test(source)) return "embrace_support";
  if (/offer|hand(?:ing)?|give|pass|receive|递|交给|接过/i.test(source)) return "handover";
  if (/guide|lead|pull|drag|block|引导|拉拽|阻挡/i.test(source)) return "guide_pull";
  if (/walk .*?together|side by side|pass(?:ing)? by|并肩|擦肩/i.test(source)) return "walk_together";
  if (/together|shared|both .*?(?:look|read|hold)|共同|一起看|共同持有/i.test(source)) return "shared_prop";
  if (/confront|argue|threat|face.?off|对峙|争吵|威胁/i.test(source)) return "confrontation";
  if (/react|listen|surpris|回应|倾听|反应/i.test(source)) return "reaction";
  return "conversation";
};

export const profileForPlan = (peopleCount: number, framingMode: PoseFramingModeV2, people: PosePersonPlanV2[]): PoseControlProfile => {
  if (peopleCount === 2) return { id: "multi_contact", weight: 0.9, guidanceStart: 0, guidanceEnd: 0.85 };
  const locomotion = people.find((person) => person.primaryAction === "locomotion")?.locomotion;
  if (locomotion) {
    if (framingMode !== "upper_body") return locomotion.mode === "run"
      ? { id: "run_full", weight: .96, guidanceStart: 0, guidanceEnd: .9 }
      : { id: "walk_full", weight: .88, guidanceStart: 0, guidanceEnd: .84 };
    if (framingMode === "upper_body") return locomotion.mode === "run"
      ? { id: "run_upper", weight: .86, guidanceStart: 0, guidanceEnd: .8 }
      : { id: "walk_upper", weight: .78, guidanceStart: 0, guidanceEnd: .74 };
  }
  if (framingMode === "full_body" && people.some((person) => person.intensity === "dynamic" || person.primaryAction === "locomotion"))
    return { id: "dynamic_full", weight: 0.95, guidanceStart: 0, guidanceEnd: 0.88 };
  if (framingMode === "upper_body" && people.every((person) => person.actions.every((action) => ["static", "head_gesture", "self_touch", "turn"].includes(action))))
    return { id: "subtle_upper", weight: 0.72, guidanceStart: 0, guidanceEnd: 0.68 };
  return { id: "standard_upper", weight: 0.82, guidanceStart: 0, guidanceEnd: 0.76 };
};

export function derivePoseScenePlanV2(shot: Shot, interactions: PoseInteractionInput[] = []): PoseScenePlanV2 | null {
  const count = shot.characterIds.length;
  if (!count || count > 2) return null;
  const framingMode = derivePoseFramingModeV2(shot);
  const framingGeometry = derivePoseFramingGeometry(shot, framingMode);
  const variantSeed = hashText(`${shot.id}:${shot.actionEn}:${shot.description}`);
  const source = shot.visualSpecConfirmed && (shot.visualSpec?.interactions || []).length
    ? "visual_interaction" as const
    : shot.visualSpecConfirmed ? "visual_character" as const
      : clean(`${shot.actionEn} ${shot.description}`) ? "shot_action" as const : "fallback" as const;
  const people = shot.characterIds.map((characterId, index) => {
    const text = textForCharacter(shot, characterId);
    const primaryText = positivePoseText(primaryTextForCharacter(shot, characterId));
    const characterInteractions = interactions.filter((item) => item.characterId === characterId);
    const interaction = characterInteractions.find((item) => item.required) || characterInteractions[0];
    const explicitBasic = basicTemplateFromText(primaryText);
    const basicFamilies = new Set(["lie", "recline", "crouch_kneel", "seated", "static"]);
    const primaryDetected = unique(actionRules.filter(([, pattern]) => pattern.test(primaryText)).map(([family]) => family));
    const detected = unique([
      ...primaryDetected,
      ...actionRules.filter(([, pattern]) => pattern.test(positivePoseText(text))).map(([family]) => family),
    ]);
    if (explicitBasic) {
      const family = basicFamilyForTemplate(explicitBasic);
      for (const list of [primaryDetected, detected]) {
        for (let i=list.length-1;i>=0;i--) if(basicFamilies.has(list[i])) list.splice(i,1);
        if(family!=="static") list.unshift(family);
      }
    }
    for (const relation of characterInteractions) {
      if (relation.required) {
        if (["read", "watch", "inspect", "capture", "scan", "call"].includes(relation.purpose)) detected.push("read_phone");
        else if (["carry", "offer"].includes(relation.purpose)) detected.push("hold_carry");
        else if (relation.purpose === "place") detected.push("pick_place");
        else if (relation.purpose === "drink") detected.push("drink_eat");
        else if (relation.purpose === "operate") detected.push("write_tool");
      }
    }
    if (characterInteractions.some((relation) => relation.purpose === "operate")) {
      for (const family of ["point", "hold_carry", "read_phone"] as const) {
        const index = detected.indexOf(family);
        if (index >= 0) detected.splice(index, 1);
      }
      detected.push("write_tool");
    }
    const actions = unique(detected.length ? detected : ["static" as const]);
    const basePose: PosePersonPlanV2["basePose"] = ([("lie"), ("recline"), ("crouch_kneel"), ("seated")] as const).find((family) => actions.includes(family)) || "standing";
    const primaryAction = primaryOrder.find((family) => primaryDetected.includes(family))
      || primaryOrder.find((family) => actions.includes(family))
      || "static";
    const region = regionForCharacter(shot, characterId, index, count, interaction);
    const anchorX = clamp((region.xStart + region.xEnd) / 2, count === 2 ? 0.2 : 0.16, count === 2 ? 0.8 : 0.84);
    const resolvedInteractionGazeTargets = characterInteractions.map((relation) => ({ relation, gazeTarget: gazeTargetForInteraction(relation) }));
    const explicitlyStructuredGaze = resolvedInteractionGazeTargets.find(({ relation, gazeTarget }) => Boolean(relation.gazeTarget) && Boolean(gazeTarget.point))?.gazeTarget;
    const gazeTarget = explicitlyStructuredGaze
      || resolvedInteractionGazeTargets.find(({ gazeTarget: candidate }) => Boolean(candidate.point))?.gazeTarget
      || resolvedInteractionGazeTargets[0]?.gazeTarget
      || independentGazeTarget("scene_plan.no_structured_gaze_target");
    const target = interaction?.required ? { x: clamp(interaction.objectCenter.x, 0.1, 0.9), y: clamp(interaction.objectCenter.y, 0.2, 0.85) } : null;
    const supportRelation = supportForCharacter(shot, characterId, basePose, region);
    const gazePoint = gazeTarget.point;
    const facing: PoseFacing = gazePoint ? (gazePoint.x < anchorX ? "left" : gazePoint.x > anchorX ? "right" : "front") : count === 2 ? (index === 0 ? "right" : "left") : "front";
    const headDirection = headDirectionFor({ x: anchorX, y: .16 }, gazePoint);
    const personSeed = hashText(`${variantSeed}:${characterId}:${text}`);
    const variantId = (Math.abs(shot.id) + index) % 3;
    const phase = derivePhase(text);
    const intensity = deriveIntensity(text);
    const locomotion = primaryAction === "locomotion"
      ? deriveLocomotionPlan(text, phase, intensity, variantId, framingMode)
      : null;
    const relationTargets = resolvedInteractionGazeTargets.filter(({ relation }) => relation.required).map(({ relation, gazeTarget: relationGazeTarget }) => ({ actionPlan:relation.actionPlan, expectedCount:relation.expectedCount, relationId: relation.relationId, object: relation.object, purpose: relation.purpose, target: { x: clamp(relation.objectCenter.x, 0.1, 0.9), y: clamp(relation.objectCenter.y, 0.2, 0.85) }, gazeTarget: relationGazeTarget, handMode: relation.handMode, activeHand: relation.activeHand || (relation.handMode === "two" ? "both" : "right"), objectInstanceId: relation.objectInstanceId, contactAnchors: relation.contactAnchors?.map((anchor) => ({ hand: anchor.hand, x: clamp(anchor.x, .05, .95), y: clamp(anchor.y, .1, .9) })) }));
    return {
      characterId,
      actions,
      basePose,
      primaryAction,
      templateId: primaryAction === "locomotion" && locomotion?.mode === "run" ? "single_run_v2" : templateForFamily(primaryAction),
      variantId,
      phase,
      intensity,
      handedness: /left hand|左手/i.test(text)
        ? "left" as const
        : /both hands|two hands|双手/i.test(text)
          ? "both" as const
          : actions.includes("operate_environment")
            ? "left" as const
            : "right" as const,
      handMode: characterInteractions.some((relation) => relation.handMode === "two") ? "two" : interaction?.handMode || (/both hands|two hands|双手/i.test(text) ? "two" : "one"),
      activeHand: (characterInteractions.some((relation) => relation.handMode === "two") ? "both" : (/left hand|左手/i.test(text) ? "left" : "right")) as PosePersonPlanV2["activeHand"],
      facing,
      anchor: { x: anchorX, y: 0.5 },
      scale: framingMode === "full_body" ? 1 : 0.94,
      target,
      gazeTarget,
      relationTargets,
      supportRelation,
      headDirection,
      locomotion,
      mirror: false,
      sourceText: text,
    };
  });
  const relationConflicts = people.flatMap((person) => (["left", "right"] as const).flatMap((hand) => {
    const relationIds = person.relationTargets.filter((relation) => relation.handMode === "one" && relation.activeHand === hand).map((relation) => relation.relationId).filter((value): value is string => Boolean(value));
    return relationIds.length > 1 ? [{ characterId: person.characterId, hand, relationIds, resolution: "explicit_overlap_requires_review" as const }] : [];
  }));
  const sharedText = clean(people.map((person) => person.sourceText).join("; "));
  const interactionKind = count === 2 ? detectInteractionKind(sharedText) : null;
  const interactionTarget = count === 2
    ? { x: (people[0].anchor.x + people[1].anchor.x) / 2, y: interactionKind === "handshake_highfive" && /high.?five|击掌/i.test(sharedText) ? 0.34 : 0.5 }
    : null;
  const meaningful = count === 2 || framingMode === "full_body" || interactions.some((item) => item.required) || people.some((person) => person.primaryAction !== "static");
  if (!meaningful) return null;
  const confidence: PoseConfidence = source === "visual_interaction" ? "high" : people.some((person) => person.primaryAction !== "static") ? "medium" : "low";
  const warnings = [
    ...(confidence === "low" ? ["姿势意图置信度较低，已使用安全基础姿势，生成前需要人工复核"] : []),
    ...relationConflicts.map((conflict) => `同一人物 ${conflict.hand} 手被多个关系 ${conflict.relationIds.join(", ")} 明确占用，需要人工仲裁`),
  ];
  const controlProfile = profileForPlan(count, framingMode, people);
  return {
    schemaVersion: "2.0", shotId: shot.id, peopleCount: count, framingMode, framingGeometry, people,
    interactionKind, interactionTarget, supportRelations: people.map((person) => person.supportRelation), overrideConflicts: [], visualSpecConfirmed: Boolean(shot.visualSpecConfirmed), relationConflicts, selectorSource: source,
    selectorReason: count === 2
      ? `two-character ${interactionKind} interaction requires coordinated skeletons`
      : `${people[0].actions.join(" + ")} action plan requires parameterized joint geometry`,
    confidence, variantSeed, controlProfile, warnings,
  };
}

const facePoints = (nose: PosePoint, direction: { dx?: number; dy?: number } = {}) => {
  const dx = clamp(direction.dx || 0, -.4, .4);
  const dy = clamp(direction.dy || 0, -.5, .5);
  const lateral = dx * .06;
  const tilt = dy * .025;
  return [
    { x: nose.x - 0.025 + lateral * .35, y: nose.y - 0.01 + tilt }, { x: nose.x + 0.025 + lateral * 1.2, y: nose.y - 0.01 + tilt * .8 },
    { x: nose.x - 0.045 + lateral * .1, y: nose.y + tilt * .2 }, { x: nose.x + 0.045 + lateral * 1.35, y: nose.y - tilt * .1 },
  ];
};

const intensityFactor = (value: PoseIntensity) => value === "dynamic" ? 1.18 : value === "calm" ? 0.86 : 1;
const phaseFactor = (value: PosePhase) => value === "anticipation" ? 0.76 : value === "follow_through" ? 1.08 : 1;

function buildSinglePerson(plan: PosePersonPlanV2, unbounded = false): PosePoint[] {
  const cx = plan.anchor.x;
  const variantShift = (plan.variantId - 1) * 0.012;
  const reachFactor = intensityFactor(plan.intensity) * phaseFactor(plan.phase);
  let nose: PosePoint = { x: cx + variantShift, y: 0.16 };
  let neck: PosePoint = { x: cx, y: 0.27 };
  let points: PosePoint[] = [
    nose, neck,
    { x: cx - 0.09, y: 0.29 }, { x: cx - 0.13, y: 0.42 }, { x: cx - 0.15, y: 0.56 },
    { x: cx + 0.09, y: 0.29 }, { x: cx + 0.13, y: 0.42 }, { x: cx + 0.15, y: 0.56 },
    { x: cx - 0.055, y: 0.52 }, { x: cx - 0.075, y: 0.7 }, { x: cx - 0.085, y: 0.9 },
    { x: cx + 0.055, y: 0.52 }, { x: cx + 0.075, y: 0.7 }, { x: cx + 0.085, y: 0.9 },
    ...facePoints(nose, plan.headDirection),
  ];
  const basePose = plan.basePose || (plan.primaryAction === "seated" ? "seated" : "standing");
  if (basePose === "seated") {
    points[8] = { x: cx - 0.055, y: 0.54 }; points[9] = { x: cx - 0.18, y: 0.59 }; points[10] = { x: cx - 0.18, y: 0.84 };
    points[11] = { x: cx + 0.055, y: 0.54 }; points[12] = { x: cx + 0.18, y: 0.59 }; points[13] = { x: cx + 0.18, y: 0.84 };
  } else if (basePose === "crouch_kneel") {
    points[8] = { x: cx - 0.06, y: 0.5 }; points[9] = { x: cx - 0.17, y: 0.65 }; points[10] = { x: cx - 0.03, y: 0.78 };
    points[11] = { x: cx + 0.06, y: 0.5 }; points[12] = { x: cx + 0.13, y: 0.7 }; points[13] = { x: cx + 0.25, y: 0.73 };
  } else if (basePose === "standing" && plan.primaryAction === "locomotion") {
    const gait = plan.locomotion || deriveLocomotionPlan(plan.sourceText, plan.phase, plan.intensity, plan.variantId, "full_body");
    const rightLeads = gait.leadSide === "right";
    const directionX = plan.facing === "left" ? -1 : plan.facing === "right" ? 1 : 0;
    const leadSign = rightLeads ? -1 : 1;
    const rearSign = -leadSign;
    const leadHip = rightLeads ? 8 : 11;
    const leadKnee = rightLeads ? 9 : 12;
    const leadAnkle = rightLeads ? 10 : 13;
    const rearHip = rightLeads ? 11 : 8;
    const rearKnee = rightLeads ? 12 : 9;
    const rearAnkle = rightLeads ? 13 : 10;
    const forwardArm = rightLeads ? { shoulder: 5, elbow: 6, wrist: 7, sign: 1 } : { shoulder: 2, elbow: 3, wrist: 4, sign: -1 };
    const rearArm = rightLeads ? { shoulder: 2, elbow: 3, wrist: 4, sign: -1 } : { shoulder: 5, elbow: 6, wrist: 7, sign: 1 };
    const runLift = gait.mode === "run" ? .07 : 0;
    const phaseLift = gait.gaitPhase === "toe_off" ? .055 : gait.gaitPhase === "mid_stance" ? .025 : 0;

    points[0] = { x: points[0].x + directionX * gait.torsoLean, y: points[0].y + runLift * .08 };
    points[1] = { x: points[1].x + directionX * gait.torsoLean * .75, y: points[1].y + runLift * .12 };
    points[2] = { x: points[2].x + directionX * gait.torsoLean * .45, y: points[2].y - leadSign * .012 };
    points[5] = { x: points[5].x + directionX * gait.torsoLean * .45, y: points[5].y + leadSign * .012 };
    points[forwardArm.elbow] = { x: cx + forwardArm.sign * gait.armSwing * .62, y: gait.mode === "run" ? .37 : .4 };
    points[forwardArm.wrist] = { x: cx + forwardArm.sign * gait.armSwing, y: gait.mode === "run" ? .31 : .35 };
    points[rearArm.elbow] = { x: cx + rearArm.sign * gait.armSwing * .7, y: gait.mode === "run" ? .39 : .43 };
    points[rearArm.wrist] = { x: cx + rearArm.sign * gait.armSwing * 1.12, y: gait.mode === "run" ? .52 : .5 };

    points[leadHip] = { x: cx + leadSign * .065, y: .52 - runLift * .2 };
    points[rearHip] = { x: cx + rearSign * .045, y: .53 + runLift * .15 };
    points[leadKnee] = { x: cx + leadSign * gait.stride * .58, y: gait.gaitPhase === "mid_stance" ? .69 : .66 };
    points[leadAnkle] = { x: cx + leadSign * gait.stride, y: gait.mode === "run" && gait.gaitPhase === "toe_off" ? .82 : .9 };
    points[rearKnee] = { x: cx + rearSign * gait.stride * .48, y: gait.mode === "run" ? .64 : .7 };
    points[rearAnkle] = { x: cx + rearSign * gait.stride * .78, y: .89 - runLift - phaseLift };
  } else if (basePose === "lie") {
    nose = { x: cx - 0.26, y: 0.45 }; neck = { x: cx - 0.17, y: 0.48 };
    points = [nose, neck, { x: cx - 0.17, y: 0.41 }, { x: cx - 0.06, y: 0.39 }, { x: cx + 0.03, y: 0.4 }, { x: cx - 0.16, y: 0.55 }, { x: cx - 0.04, y: 0.58 }, { x: cx + 0.06, y: 0.58 }, { x: cx + 0.07, y: 0.45 }, { x: cx + 0.22, y: 0.43 }, { x: cx + 0.34, y: 0.46 }, { x: cx + 0.08, y: 0.56 }, { x: cx + 0.23, y: 0.6 }, { x: cx + 0.36, y: 0.58 }, ...facePoints(nose)];
  } else if (basePose === "recline") {
    nose = { x: cx - 0.12, y: 0.21 }; neck = { x: cx - 0.07, y: 0.31 };
    points = [nose, neck, { x: cx - 0.14, y: 0.32 }, { x: cx - 0.16, y: 0.44 }, { x: cx - 0.1, y: 0.54 }, { x: cx + 0.01, y: 0.31 }, { x: cx + 0.08, y: 0.43 }, { x: cx + 0.13, y: 0.54 }, { x: cx - 0.01, y: 0.56 }, { x: cx - 0.1, y: 0.72 }, { x: cx - 0.19, y: 0.86 }, { x: cx + 0.09, y: 0.58 }, { x: cx + 0.19, y: 0.72 }, { x: cx + 0.27, y: 0.85 }, ...facePoints(nose)];
  }
  if (plan.actions.includes("bend")) {
    points[0] = { x: points[0].x + 0.08, y: points[0].y + 0.1 };
    points[1] = { x: points[1].x + 0.02, y: points[1].y + 0.07 };
    points[2] = { x: points[2].x + 0.03, y: points[2].y + 0.03 };
    points[5] = { x: points[5].x + 0.05, y: points[5].y + 0.08 };
  }
  if (plan.actions.includes("turn")) {
    points[0] = { x: points[0].x + (plan.facing === "left" ? -0.055 : 0.055), y: points[0].y };
    points[2] = { x: points[2].x - 0.03, y: points[2].y + 0.02 };
    points[5] = { x: points[5].x - 0.03, y: points[5].y - 0.02 };
  }
  const target = plan.target || { x: plan.facing === "left" ? cx - 0.28 : cx + 0.28, y: 0.48 };
  if (plan.target && plan.primaryAction !== "static") {
    const dx = clamp(target.x - points[0].x, -0.2, 0.2);
    const dy = clamp(target.y - points[0].y, -0.16, 0.24);
    points[0] = { x: points[0].x + dx * 0.42, y: points[0].y + dy * 0.42 };
    points[1] = { x: points[1].x + dx * 0.2, y: points[1].y + dy * 0.2 };
  }
  const activeRight = plan.handedness === "right" || plan.handedness === "both";
  const activeWrist = activeRight ? 4 : 7;
  const activeElbow = activeRight ? 3 : 6;
  const supportWrist = activeRight ? 7 : 4;
  const supportElbow = activeRight ? 6 : 3;
  const shoulder = activeRight ? points[2] : points[5];
  const moveWrist = (point: PosePoint, factor = 1) => ({
    x: shoulder.x + (point.x - shoulder.x) * reachFactor * factor,
    y: shoulder.y + (point.y - shoulder.y) * reachFactor * factor,
  });
  if (plan.actions.includes("self_touch")) {
    points[activeElbow] = { x: cx + (activeRight ? -0.11 : 0.11), y: 0.24 };
    points[activeWrist] = { x: points[0].x + (activeRight ? -0.025 : 0.025), y: points[0].y - 0.005 };
  } else if (plan.actions.includes("drink_eat")) {
    points[activeElbow] = { x: (shoulder.x + points[0].x) / 2, y: 0.31 };
    points[activeWrist] = { x: points[0].x + (activeRight ? -0.02 : 0.02), y: points[0].y + 0.035 };
  } else if (plan.actions.includes("point")) {
    points[activeElbow] = moveWrist({ x: (shoulder.x + target.x) / 2, y: target.y - 0.03 }, 0.95);
    points[activeWrist] = moveWrist(target, 1.12);
  } else if (plan.actions.some((action) => ["operate_environment", "pick_place", "open_close", "reach", "push_pull"].includes(action))) {
    points[activeElbow] = moveWrist({ x: (shoulder.x + target.x) / 2, y: (shoulder.y + target.y) / 2 }, 0.92);
    points[activeWrist] = moveWrist(target);
    if (plan.actions.includes("push_pull") || plan.handedness === "both") {
      const supportShoulder = activeRight ? points[5] : points[2];
      points[supportElbow] = { x: (supportShoulder.x + target.x) / 2, y: (supportShoulder.y + target.y + 0.04) / 2 };
      points[supportWrist] = { x: target.x + (activeRight ? 0.045 : -0.045), y: target.y + 0.04 };
    }
  } else if (plan.actions.some((action) => ["read_phone", "hold_carry", "write_tool"].includes(action))) {
    const relationTargets: PosePersonPlanV2["relationTargets"] = plan.relationTargets.length ? plan.relationTargets : [{
      target,
      purpose: "inspect",
      gazeTarget: gazeTargetForPersonPlan(plan),
      handMode: plan.handMode,
      activeHand: plan.activeHand,
      relationId: undefined,
      object: "primary",
      contactAnchors: [],
    }];
    const reservedWristJoints = new Set<number>();
    [...relationTargets].sort((a, b) => (a.handMode === "two" ? 0 : 1) - (b.handMode === "two" ? 0 : 1)).forEach((relation, relationIndex) => {
      const relationTarget = relation.target || target;
      const objectY = plan.actions.includes("write_tool") ? relationTarget.y : clamp(relationTarget.y, 0.42, 0.68);
      const requestedHands = relation.handMode === "two" ? ["left", "right"] as const : [relation.activeHand === "left" ? "left" : "right"] as const;
      const requestedJoints = requestedHands.map((hand) => hand === "left" ? { hand, joint: 7, elbow: 6 } : { hand, joint: 4, elbow: 3 });
      const available = requestedJoints.filter((item) => !reservedWristJoints.has(item.joint));
      const anchors = relation.contactAnchors || [];
      relation.wristAssignments = available.map((item) => {
        const anchor = anchors.find((candidate) => candidate.hand === item.hand);
        const offset = relation.handMode === "two" ? (item.hand === "right" ? -.045 : .045) : 0;
        return { hand: item.hand, joint: item.joint, x: anchor?.x ?? relationTarget.x + offset, y: anchor?.y ?? objectY };
      });
      if (available.length < requestedJoints.length) relation.conflict = "wrist_already_reserved";
      available.forEach((item) => reservedWristJoints.add(item.joint));
      if (relation.handMode === "one") {
        const item = available[0];
        if (item) {
          points[item.joint] = { x: relationTarget.x, y: objectY };
          points[item.elbow] = { x: (points[item.elbow === 6 ? 5 : 2].x + relationTarget.x) / 2, y: objectY - .04 };
        }
      } else {
        const offset = relationTargets.length > 1 ? (relationIndex === 0 ? -.05 : .05) : .045;
        available.forEach((item) => {
          points[item.joint] = { x: relationTarget.x + (item.hand === "right" ? -offset : offset), y: objectY + (item.hand === "left" && plan.actions.includes("write_tool") ? 0.025 : 0) };
        });
      }
    });
    points[3] = { x: (points[2].x + points[4].x) / 2, y: (points[2].y + points[4].y) / 2 };
    points[6] = { x: (points[5].x + points[7].x) / 2, y: (points[5].y + points[7].y) / 2 };
  }
  if (plan.actions.includes("head_gesture")) {
    const targetDeltaY = target.y - points[0].y;
    const gestureDelta = clamp(targetDeltaY * .18, -.035, .06) + (plan.phase === "follow_through" ? .015 : 0);
    points[0] = { x: points[0].x, y: points[0].y + gestureDelta };
  }
  const finalHeadDirection = headDirectionFor(points[0], gazeTargetForPersonPlan(plan).point);
  points.splice(14, 4, ...facePoints(points[0], finalHeadDirection));
  if (plan.mirror) {
    const center = plan.anchor.x;
    points = points.map((point) => ({ ...point, x: center - (point.x - center) }));
  }
  return unbounded ? points : points.map((point) => ({ x: clamp(point.x, 0.03, 0.97), y: point.y }));
}

function buildDoublePeople(plan: PoseScenePlanV2, unbounded = false): PosePoint[][] {
  const people = plan.people.map((person) => buildSinglePerson({ ...person, actions: person.actions.includes("locomotion") ? person.actions : ["static"], primaryAction: person.actions.includes("locomotion") ? "locomotion" : "static", mirror: false }, unbounded));
  const [left, right] = people;
  const target = plan.interactionTarget || { x: 0.5, y: 0.5 };
  const setArm = (person: PosePoint[], side: "inner" | "outer", elbow: PosePoint, wrist: PosePoint, personIndex: number) => {
    const useRightArm = side === "inner" ? personIndex === 0 : personIndex !== 0;
    const elbowIndex = useRightArm ? 7 : 4;
    const forearmIndex = useRightArm ? 6 : 3;
    person[forearmIndex] = elbow;
    person[elbowIndex] = wrist;
  };
  switch (plan.interactionKind) {
    case "handover":
      setArm(left, "inner", { x: target.x - 0.1, y: target.y - 0.07 }, { x: target.x - 0.025, y: target.y }, 0);
      setArm(right, "inner", { x: target.x + 0.1, y: target.y - 0.06 }, { x: target.x + 0.025, y: target.y }, 1);
      break;
    case "shared_prop":
      setArm(left, "inner", { x: target.x - 0.13, y: target.y - 0.05 }, { x: target.x - 0.035, y: target.y }, 0);
      setArm(right, "inner", { x: target.x + 0.13, y: target.y - 0.05 }, { x: target.x + 0.035, y: target.y }, 1);
      left[0] = { x: left[0].x + 0.035, y: left[0].y + 0.02 }; right[0] = { x: right[0].x - 0.035, y: right[0].y + 0.02 };
      break;
    case "handshake_highfive":
      setArm(left, "inner", { x: target.x - 0.11, y: target.y + 0.02 }, target, 0);
      setArm(right, "inner", { x: target.x + 0.11, y: target.y + 0.02 }, target, 1);
      break;
    case "embrace_support":
      left[7] = { x: right[1].x - 0.03, y: right[1].y + 0.14 }; left[6] = { x: target.x - 0.08, y: 0.36 };
      right[4] = { x: left[1].x + 0.03, y: left[1].y + 0.16 }; right[3] = { x: target.x + 0.08, y: 0.38 };
      left[0] = { x: left[0].x + 0.045, y: left[0].y }; right[0] = { x: right[0].x - 0.045, y: right[0].y };
      break;
    case "guide_pull":
      setArm(left, "inner", { x: target.x - 0.13, y: 0.43 }, { x: target.x - 0.015, y: 0.5 }, 0);
      setArm(right, "inner", { x: target.x + 0.13, y: 0.43 }, { x: target.x + 0.015, y: 0.5 }, 1);
      break;
    case "walk_together":
      left[10] = { x: left[10].x - 0.12, y: left[10].y }; left[13] = { x: left[13].x + 0.12, y: left[13].y };
      right[10] = { x: right[10].x + 0.12, y: right[10].y }; right[13] = { x: right[13].x - 0.12, y: right[13].y };
      break;
    case "confrontation":
      setArm(left, "inner", { x: target.x - 0.13, y: 0.34 }, { x: target.x + 0.04, y: 0.31 }, 0);
      right[4] = { x: right[1].x - 0.03, y: 0.4 };
      break;
    case "reaction":
      left[7] = { x: left[0].x + 0.04, y: left[0].y + 0.06 };
      setArm(right, "inner", { x: target.x + 0.12, y: 0.4 }, { x: target.x + 0.02, y: 0.43 }, 1);
      break;
    default:
      setArm(left, "inner", { x: target.x - 0.14, y: 0.39 }, { x: target.x - 0.06, y: 0.42 }, 0);
      setArm(right, "inner", { x: target.x + 0.14, y: 0.42 }, { x: target.x + 0.08, y: 0.47 }, 1);
      break;
  }
  for (const person of people) {
    person.splice(14, 4, ...facePoints(person[0]));
    if (!unbounded) person.forEach((point) => { point.x = clamp(point.x, 0.03, 0.97); });
  }
  return people;
}

const applyFraming = (people: PosePoint[][], framingGeometry: PoseFramingGeometry, interactionKind?: PoseInteractionKindV2 | null) => {
  if (framingGeometry.mode !== "upper_body") return people;
  // Close and medium-close images must not expose lower-body joints. The base
  // stage pairs this upper-body skeleton with the character's portrait identity
  // reference; a later local pass owns the small prop geometry. Keeping hips
  // visible here makes ControlNet expand a chest-up request into kneeling or
  // full-body staging.
  const hiddenY: Record<number, number> = { 8: 1.08, 9: 1.24, 10: 1.42, 11: 1.08, 12: 1.24, 13: 1.42 };
  const visibleIndices = [...Array.from({ length: 8 }, (_, index) => index), 14, 15, 16, 17];
  const verticalFramingIndices = [0, 1, 2, 3, 4, 5, 6, 7, 14, 15, 16, 17];
  const framed = people.map((person) => {
    const nose = person[0] || { x: .5, y: .16 };
    // A close-shot crop grows upward from the torso boundary.  Scaling around
    // the nose pushes the neck, shoulders and hip down while leaving the head
    // fixed, which produces a small floating subject and invites a full-body
    // completion.  Pivoting on the mid-hip keeps the lower crop boundary
    // stable and expands the readable face/arms toward the frame edges.
    const framingPivot = person[8] || nose;
    const scaled = person.map((point, index) => hiddenY[index] == null
      ? { x: clamp(framingPivot.x + (point.x - framingPivot.x) * framingGeometry.scale, .02, .98), y: clamp(framingPivot.y + (point.y - framingPivot.y) * framingGeometry.scale, .02, .98) }
      : { x: point.x, y: hiddenY[index] });
    let visible = visibleIndices.map((index) => scaled[index]).filter(Boolean);
    let minX = Math.min(...visible.map((point) => point.x));
    let maxX = Math.max(...visible.map((point) => point.x));
    let minY = Math.min(...visible.map((point) => point.y));
    let maxY = Math.max(...visible.map((point) => point.y));
    const target = framingGeometry.visibleBoundsTarget;
    // A framing target is also a minimum subject occupancy contract. Merely
    // keeping a small skeleton inside a large target box allows the diffusion
    // model to complete unseen legs and silently turn a close shot into a full
    // body. For a single upper-body subject, grow the visible skeleton around
    // its lower boundary until it occupies most of the requested crop.
    if (people.length === 1) {
      const verticalPoints = verticalFramingIndices.map((index) => scaled[index]).filter(Boolean);
      const verticalMinY = Math.min(...verticalPoints.map((point) => point.y));
      const verticalMaxY = Math.max(...verticalPoints.map((point) => point.y));
      const currentHeight = Math.max(.01, verticalMaxY - verticalMinY);
      const desiredHeight = target.height;
      const occupancyScale = Math.min(2, Math.max(1, desiredHeight / currentHeight));
      if (occupancyScale > 1.01) {
        scaled.forEach((point, index) => {
          if (hiddenY[index] == null) point.y = verticalMaxY + (point.y - verticalMaxY) * occupancyScale;
        });
        visible = visibleIndices.map((index) => scaled[index]).filter(Boolean);
        minX = Math.min(...visible.map((point) => point.x));
        maxX = Math.max(...visible.map((point) => point.x));
        minY = Math.min(...visible.map((point) => point.y));
        maxY = Math.max(...visible.map((point) => point.y));
      }
    }
    const shiftX = (minX < target.x ? target.x - minX : 0) + (maxX > target.x + target.width ? target.x + target.width - maxX : 0);
    const shiftY = (minY < target.y ? target.y - minY : 0) + (maxY > target.y + target.height ? target.y + target.height - maxY : 0);
    return scaled.map((point, index) => hiddenY[index] == null ? { x: clamp(point.x + shiftX, .02, .98), y: clamp(point.y + shiftY, .02, .98) } : point);
  });
  // Paired interactions have a shared physical contact. Keep the generated
  // wrist pair at its pre-framing coordinates instead of scaling each person
  // around a different nose and silently opening the contact.
  if (framed.length === 2 && ["handover", "shared_prop", "handshake_highfive", "guide_pull"].includes(interactionKind || "")) {
    const contactJoints: Array<[number, number]> = [[0, 7], [1, 4]];
    contactJoints.forEach(([personIndex, joint]) => {
      if (people[personIndex]?.[joint]) framed[personIndex][joint] = { ...people[personIndex][joint] };
    });
  }
  return framed;
};

const enforceHeadNeckGeometry = (person: PosePoint[], plan: PosePersonPlanV2) => {
  const nose = person[0], neck = person[1];
  if (!nose || !neck) return;
  const previousNose = { ...nose };
  const gazePoint = gazeTargetForPersonPlan(plan).point;
  // Encode target-facing head pitch/yaw in the COCO face geometry while keeping
  // the head attached above the neck. A text-only gaze instruction is too weak
  // for target-directed story actions such as reading, tool work or dialogue.
  if (!["lie", "recline"].includes(plan.basePose)) {
    const direction = headDirectionFor(nose, gazePoint);
    nose.x = clamp(neck.x + clamp(direction.dx, -.4, .4) * .18, neck.x - .09, neck.x + .09);
    const neutralNeckOffset = .105;
    const pitchedNeckOffset = clamp(neutralNeckOffset - clamp(direction.dy, -.45, .45) * .09, .065, .145);
    nose.y = neck.y - pitchedNeckOffset;
  }
  const encodedDirection = headDirectionFor(nose, gazePoint);
  plan.headDirection = encodedDirection;
  person.splice(14, 4, ...facePoints(nose, encodedDirection));
  // Automatic self-touch was solved against the old face. Head-direction
  // correction must carry its wrist contact along, unless an explicit prop
  // assignment owns that hand. User-edited joints are applied after this step.
  if (plan.actions.includes("self_touch")) {
    const wristIndex = plan.handedness === "left" ? 7 : 4;
    const assignedToProp = plan.relationTargets.some(relation => relation.wristAssignments?.some(assignment => assignment.joint === wristIndex));
    if (!assignedToProp && person[wristIndex]) {
      person[wristIndex] = { x: person[wristIndex].x + nose.x - previousNose.x, y: person[wristIndex].y + nose.y - previousNose.y };
    }
  }
};

const enforceUprightShoulderGeometry = (person: PosePoint[], plan: PosePersonPlanV2) => {
  const neck = person[1];
  if (!neck || ["lie", "recline"].includes(plan.basePose)) return;
  // Framing may enlarge a close shot around its lower boundary.  Never allow
  // that transform to leave either shoulder above the neck: ControlNet reads
  // such a skeleton as a person leaning onto their hands, even when the text
  // explicitly describes seated prop use.  Keep the original horizontal
  // placement and restore only the anatomical vertical ordering.
  for (const shoulderJoint of [2, 5]) {
    const shoulder = person[shoulderJoint];
    if (!shoulder) continue;
    shoulder.y = clamp(shoulder.y, neck.y + .025, neck.y + .095);
  }
};

export function validatePosePeople(people: PosePoint[][], plan?: PoseScenePlanV2 | null): PoseSafetyResult {
  const errors: string[] = [], warnings: string[] = [];
  if (plan?.overrideConflicts?.length) errors.push(...plan.overrideConflicts.map((conflict) => `P0 姿态覆盖冲突：${conflict}`));
  if (!people.length || people.length > 2) errors.push("OpenPose v2 只接受一至两个人物骨架");
  people.forEach((person, personIndex) => {
    if (person.length !== 18) errors.push(`人物 ${personIndex + 1} 必须包含 18 个 COCO 关节点`);
    person.forEach((point, pointIndex) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) errors.push(`人物 ${personIndex + 1} 关节 ${pointIndex} 坐标无效`);
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1.5) errors.push(`人物 ${personIndex + 1} 关节 ${pointIndex} 超出允许范围`);
    });
    if (person[1] && person[8] && person[11]) {
      const hip = { x: (person[8].x + person[11].x) / 2, y: (person[8].y + person[11].y) / 2 };
      const torso = Math.hypot(hip.x - person[1].x, hip.y - person[1].y);
      if (torso < 0.08 || torso > 0.75) warnings.push(`人物 ${personIndex + 1} 躯干比例需要人工复核`);
    }
    if (person[1] && !["lie", "recline"].includes(plan?.people?.[personIndex]?.basePose || "")) {
      for (const shoulderJoint of [2, 5]) {
        if (person[shoulderJoint] && person[shoulderJoint].y <= person[1].y)
          errors.push(`人物 ${personIndex + 1} 肩关节 ${shoulderJoint} 不得位于颈部上方`);
      }
    }
  });
  let contactError: number | null = null;
  if (people.length === 2 && plan?.interactionKind && ["handover", "handshake_highfive", "guide_pull"].includes(plan.interactionKind)) {
    const leftWrist = people[0]?.[7], rightWrist = people[1]?.[4];
    if (leftWrist && rightWrist) {
      contactError = Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y);
      if (contactError > 0.08) errors.push("双人接触点未闭合");
    }
  }
  return { valid: errors.length === 0, errors, warnings, contactError };
}

const kindForSingle = (person: PosePersonPlanV2, framingMode: PoseFramingModeV2) => {
  if (person.primaryAction === "static" && framingMode === "full_body") return "single_full_body_v1";
  if (person.basePose === "seated") return "single_action_seated_v1";
  if (person.primaryAction === "locomotion") return person.locomotion?.mode === "run" ? "single_action_run_v2" : "single_action_walk_v2";
  return ({
    seated: "single_action_seated_v1", point: "single_action_point_v1",
    self_touch: "single_action_self_touch_v1", operate_environment: "single_action_operate_environment_v1",
    reach: "single_action_reach_v1", lie: "single_action_lie_v1", recline: "single_action_recline_v1",
    turn: "single_action_turn_v1", bend: "single_action_bend_v1", head_gesture: "single_action_head_gesture_v1",
  } as Partial<Record<PoseActionFamilyV2, string>>)[person.primaryAction] || `single_action_${person.primaryAction}_v2`;
};

const kindForDouble = (plan: PoseScenePlanV2) => /umbrella|伞/i.test(plan.people.map((person) => person.sourceText).join(" ")) && plan.interactionKind === "handover"
  ? "umbrella_handover_v1"
  : `double_action_${plan.interactionKind || "conversation"}_v2`;

export function buildPoseControlFromPlan(plan: PoseScenePlanV2, width = 512, height = 512, unbounded = false): PoseControlV2 {
  const rawPeople = plan.peopleCount === 2 ? buildDoublePeople(plan, unbounded) : [buildSinglePerson(plan.people[0], unbounded)];
  const runtimeConflicts = plan.people.flatMap((person) => person.relationTargets.filter((relation) => relation.conflict && relation.relationId).map((relation) => ({ characterId: person.characterId, hand: relation.activeHand === "left" ? "left" as const : "right" as const, relationIds: [relation.relationId as string], resolution: "explicit_overlap_requires_review" as const })));
  plan.relationConflicts.push(...runtimeConflicts.filter((conflict) => !plan.relationConflicts.some((existing) => existing.characterId === conflict.characterId && existing.relationIds.includes(conflict.relationIds[0]))));
  if (runtimeConflicts.length) plan.warnings.push("多个关系竞争同一 OpenPose 腕点，已保留显式冲突并停止静默覆盖");
  const framingGeometry = plan.framingGeometry || { mode: plan.framingMode, scale: 1, visibleBoundsTarget: { x: .08, y: .08, width: .84, height: .84 }, source: "default" as const };
  const people = applyFraming(rawPeople, framingGeometry, plan.interactionKind);
  people.forEach((person, index) => enforceUprightShoulderGeometry(person, plan.people[index]));
  if (plan.framingMode === "upper_body" && plan.peopleCount === 1) {
    // Explicit prop contracts own the final wrist contact points. Framing is
    // computed from the head/shoulder/hip axis, then the hands are reattached
    // to those shared contact anchors so pose and prop controls cannot diverge.
    plan.people[0].relationTargets.forEach((relation) => relation.wristAssignments?.forEach((assignment) => {
      if (!people[0]?.[assignment.joint]) return;
      people[0][assignment.joint] = { x: assignment.x, y: assignment.y };
      const elbowJoint = assignment.hand === "left" ? 6 : 3;
      const shoulderJoint = assignment.hand === "left" ? 5 : 2;
      const shoulder = people[0][shoulderJoint];
      if (shoulder && people[0][elbowJoint]) {
        const raisedPortableContact = relation.handMode === "two" && !["operate", "place"].includes(relation.purpose);
        people[0][elbowJoint] = {
          x: clamp((shoulder.x + assignment.x) / 2 + (assignment.hand === "left" ? .04 : -.04), .03, .97),
          // A portable two-hand contact in an upper-body frame is cradled from
          // below: elbows sit lower in the image than the wrists and the
          // forearms rise inward. The old midpoint placed elbows above wrists,
          // which OpenPose reads as both hands pressing down on a lap/surface.
          // Tool work keeps the midpoint because its work point may be below or
          // lateral to the actor rather than held at the chest.
          y: raisedPortableContact
            ? clamp(assignment.y + .055, .08, .92)
            : clamp((shoulder.y + assignment.y) / 2 + .045, .08, .92),
        };
      }
    }));
  }
  people.forEach((person, index) => enforceHeadNeckGeometry(person, plan.people[index]));
  if (plan.framingMode === "upper_body") {
    plan.people.forEach((personPlan, personIndex) => {
      const rightHip = people[personIndex]?.[8];
      const leftHip = people[personIndex]?.[11];
      if (!rightHip || !leftHip) return;
      const pelvisAnchor = { x: (rightHip.x + leftHip.x) / 2, y: (rightHip.y + leftHip.y) / 2 };
      const contactPlaneY = clamp(pelvisAnchor.y + .06, .2, .97);
      const support = personPlan.supportRelation;
      personPlan.supportRelation = {
        ...support,
        pelvisAnchor,
        torsoAnchor: { x: people[personIndex][1]?.x ?? pelvisAnchor.x, y: people[personIndex][1]?.y ?? Math.max(.08, pelvisAnchor.y - .45) },
        contactPlaneY,
        visibleEdge: { ...support.visibleEdge, y: contactPlaneY },
        region: { ...support.region, yStart: Math.max(0, contactPlaneY - .18), yEnd: Math.min(1, contactPlaneY + .03) },
      };
    });
    plan.supportRelations = plan.people.map((person) => person.supportRelation);
  }
  const safety = validatePosePeople(people, plan);
  const single = plan.peopleCount === 1;
  const presetId = single ? plan.people[0].templateId : `double_${plan.interactionKind || "conversation"}_v2`;
  const hasLocomotion = plan.people.some((person) => person.primaryAction === "locomotion");
  const lowerBodyControl = plan.framingMode === "upper_body" ? "hidden_by_framing" as const : "full" as const;
  const framingWarnings = lowerBodyControl === "hidden_by_framing"
    ? ["当前为上身景别：OpenPose 通过躯干倾斜和反向摆臂表达移动，下肢髋膝踝未进入控制图，若画面出现腿部必须人工复核"]
    : plan.framingMode === "upper_body" ? ["当前为上身景别：髋膝踝由景别裁切隐藏；若成图出现下肢必须 P0 人工复核"] : [];
  return {
    kind: single ? kindForSingle(plan.people[0], plan.framingMode) : kindForDouble(plan),
    posePlanVersion: "2.0", framingMode: plan.framingMode,
    hiddenJointIndices: plan.framingMode === "upper_body" ? [8, 9, 10, 11, 12, 13] : [],
    source: single ? "automatic_action_plan" : "automatic_interaction_plan",
    selectorReason: plan.selectorReason, actionFamily: single ? plan.people[0].actions.join("+") : plan.interactionKind || "conversation",
    presetId, variantId: single ? plan.people[0].variantId : Math.abs(plan.shotId) % 3, scenePlan: plan, controlProfile: plan.controlProfile,
    override: null, safety, lowerBodyControl, framingWarnings, width, height, people, svg: renderOpenPoseSvgV2(people, width, height),
  };
}

export function buildPoseControlV2(shot: Shot, interactions: PoseInteractionInput[] = [], width = 512, height = 512) {
  const plan = derivePoseScenePlanV2(shot, interactions);
  return plan ? buildPoseControlFromPlan(plan, width, height) : null;
}

const isPhase = (value: unknown): value is PosePhase => ["anticipation", "contact", "follow_through"].includes(String(value));
const isIntensity = (value: unknown): value is PoseIntensity => ["calm", "normal", "dynamic"].includes(String(value));
const isHandedness = (value: unknown): value is PoseHandedness => ["left", "right", "both"].includes(String(value));

export function parsePoseControlOverride(value: unknown): PoseControlOverrideV1 | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const people = Array.isArray(raw.people)
    ? raw.people.map((person) => Array.isArray(person) ? person.map((point) => ({ x: Number((point as PosePoint)?.x), y: Number((point as PosePoint)?.y) })) : [])
    : undefined;
  const parsed: PoseControlOverrideV1 = {
    schemaVersion: "pose-override-v1",
    ...(typeof raw.templateId === "string" ? { templateId: raw.templateId } : {}),
    ...(raw.actionGeometry && typeof raw.actionGeometry==="object"?{actionGeometry:raw.actionGeometry as PoseControlOverrideV1["actionGeometry"]}:{}),
    ...(raw.conditioning && typeof raw.conditioning==="object"?{conditioning:{...raw.conditioning as PoseControlOverrideV1["conditioning"]}}:{}),
    ...(isPhase(raw.phase) ? { phase: raw.phase } : {}),
    ...(isIntensity(raw.intensity) ? { intensity: raw.intensity } : {}),
    ...(isHandedness(raw.handedness) ? { handedness: raw.handedness } : {}),
    ...(["left", "center", "right", "up", "down"].includes(String(raw.targetDirection)) ? { targetDirection: raw.targetDirection as PoseControlOverrideV1["targetDirection"] } : {}),
    ...(typeof raw.mirror === "boolean" ? { mirror: raw.mirror } : {}),
    ...(["stand","sit","crouch","kneel_single","kneel_double","recline","lie_supine","lie_side","lie_prone"].includes(String(raw.bodyTemplateId))?{bodyTemplateId:raw.bodyTemplateId as PoseControlOverrideV1["bodyTemplateId"]}:{}),
    ...(["none","hold_one","hold_two","phone_one","phone_two"].includes(String(raw.armTemplateId))?{armTemplateId:raw.armTemplateId as PoseControlOverrideV1["armTemplateId"]}:{}),
    ...(["front","three_quarter","left_profile","right_profile"].includes(String(raw.bodyView)) ? {bodyView:raw.bodyView as PoseControlOverrideV1["bodyView"]} : {}),
    ...(["natural","together","apart"].includes(String(raw.kneeSpacing)) ? {kneeSpacing:raw.kneeSpacing as PoseControlOverrideV1["kneeSpacing"]} : {}),
    ...(["close", "normal", "wide"].includes(String(raw.spacing)) ? { spacing: raw.spacing as PoseControlOverrideV1["spacing"] } : {}),
    ...(typeof raw.swapRoles === "boolean" ? { swapRoles: raw.swapRoles } : {}),
    ...(typeof raw.confirmPoseContract === "boolean" ? { confirmPoseContract: raw.confirmPoseContract } : {}),
    ...(people ? { people } : {}),
    ...(["preset", "parameter_edit", "joint_edit"].includes(String(raw.editMode)) ? { editMode: raw.editMode as PoseControlOverrideV1["editMode"] } : {}),
    ...(["projected_canvas", "full_pose"].includes(String(raw.coordinateSpace)) ? { coordinateSpace: raw.coordinateSpace as PoseControlOverrideV1["coordinateSpace"] } : {}),
    ...(["lock_current", "recompute"].includes(String(raw.projectionIntent)) ? { projectionIntent: raw.projectionIntent as PoseControlOverrideV1["projectionIntent"] } : {}),
  };
  if (parsed.people && !validatePosePeople(parsed.people).valid) return null;
  return parsed;
}

export function applyPoseControlOverride(base: PoseControlV2 | PoseControlV3, value: unknown, unbounded = false): PoseControlV2 | PoseControlV3 {
  // V3 overrides belong to the V3 projection editor. Never report a legacy
  // edit as applied when reading a mixed historical recipe.
  if (base.posePlanVersion !== "2.0") return base;
  const override = parsePoseControlOverride(value);
  if (!override) return base;
  const plan: PoseScenePlanV2 = JSON.parse(JSON.stringify(base.scenePlan));
  const previousBasePoses = plan.people.map((person) => person.basePose);
  if (override.templateId) {
    if (plan.peopleCount === 1) {
      const family = familyFromTemplate(override.templateId);
      if (family) {
        plan.people[0].primaryAction = family;
        plan.people[0].actions = [family];
        plan.people[0].templateId = override.templateId;
        plan.people[0].basePose = basePoseForFamily(family);
        plan.people[0].locomotion = family === "locomotion"
          ? deriveLocomotionPlan(
            plan.people[0].sourceText,
            override.phase || plan.people[0].phase,
            override.intensity || plan.people[0].intensity,
            plan.people[0].variantId,
            plan.framingMode,
            locomotionModeFromTemplate(override.templateId),
          )
          : null;
      }
    } else {
      const interactionKind = interactionFromTemplate(override.templateId);
      if (interactionKind) plan.interactionKind = interactionKind;
    }
  }
  const targetOffset: Record<NonNullable<PoseControlOverrideV1["targetDirection"]>, PosePoint> = {
    left: { x: -0.26, y: 0 }, center: { x: 0, y: 0.04 }, right: { x: 0.26, y: 0 }, up: { x: 0.12, y: -0.2 }, down: { x: 0.12, y: 0.2 },
  };
  plan.people.forEach((person) => {
    if (override.phase) person.phase = override.phase;
    if (override.intensity) person.intensity = override.intensity;
    if (override.handedness) person.handedness = override.handedness;
    if (typeof override.mirror === "boolean") person.mirror = override.mirror;
    if (override.targetDirection) {
      const offset = targetOffset[override.targetDirection];
      person.target = { x: clamp(person.anchor.x + offset.x, 0.08, 0.92), y: clamp(0.48 + offset.y, 0.2, 0.8) };
      person.gazeTarget = { kind: "target", point: { ...person.target }, targetId: null, source: "pose_override.target_direction" };
      person.facing = person.target.x < person.anchor.x ? "left" : person.target.x > person.anchor.x ? "right" : "front";
    }
    if (person.primaryAction === "locomotion") {
      const forcedMode = override.templateId ? locomotionModeFromTemplate(override.templateId) : person.locomotion?.mode;
      person.locomotion = deriveLocomotionPlan(person.sourceText, person.phase, person.intensity, person.variantId, plan.framingMode, forcedMode);
      person.templateId = person.locomotion.mode === "run" ? "single_run_v2" : "single_walk_v2";
    } else {
      person.locomotion = null;
    }
  });
  if (plan.peopleCount === 2 && override.spacing) {
    const distance = override.spacing === "close" ? 0.22 : override.spacing === "wide" ? 0.58 : 0.42;
    plan.people[0].anchor.x = 0.5 - distance / 2;
    plan.people[1].anchor.x = 0.5 + distance / 2;
    plan.interactionTarget = { x: 0.5, y: plan.interactionTarget?.y || 0.5 };
  }
  if (plan.peopleCount === 2 && override.swapRoles) {
    const first = plan.people[0];
    const second = plan.people[1];
    [first.actions, second.actions] = [second.actions, first.actions];
    [first.primaryAction, second.primaryAction] = [second.primaryAction, first.primaryAction];
    [first.handedness, second.handedness] = [second.handedness, first.handedness];
  }
  const overrideConflicts: string[] = [];
  if (override.templateId && plan.peopleCount === 1) {
    plan.people.forEach((person) => {
      const previousSupport = person.supportRelation;
      const previousKind = previousSupport.supportKind;
      const nextBasePose = person.basePose;
      const previousBasePose = previousBasePoses[plan.people.indexOf(person)];
      const basePoseChanged = previousBasePose !== nextBasePose;
      const incompatiblePreviousSurface = ["sofa", "chair", "bed"].includes(previousKind) && ["standing", "crouch_kneel"].includes(nextBasePose);
      const explicitPoseContract = plan.visualSpecConfirmed && /seated|sitting|sofa|couch|recline|reclining|lie|lying|bed|kneel|kneeling|stand|standing|walk|walking|坐|沙发|斜靠|躺|床|跪|站|走/i.test(person.sourceText);
      if (basePoseChanged && explicitPoseContract && !override.confirmPoseContract) {
        overrideConflicts.push(`${person.characterId}:人工模板将明确的 ${previousBasePose} 基础姿态改为 ${nextBasePose}，当前支持面为 ${previousKind}；必须重新确认剧情姿态后生成`);
      } else if (incompatiblePreviousSurface && !override.confirmPoseContract) {
        overrideConflicts.push(`${person.characterId}:人工模板将 ${previousKind} 支持姿态改为 ${nextBasePose}，原支持面与新基础姿态互斥；必须重新确认剧情姿态后生成`);
      }
      if (basePoseChanged && override.confirmPoseContract) plan.warnings.push(`${person.characterId}:用户已确认覆盖原剧情基础姿态，已按新模板重建支持面与姿态审计`);
      person.supportRelation = retargetSupportForOverride(person, previousSupport, nextBasePose);
    });
    plan.supportRelations = plan.people.map((person) => person.supportRelation);
    plan.overrideConflicts = overrideConflicts;
    if (overrideConflicts.length) plan.warnings.push(...overrideConflicts);
  }
  if (override.templateId) {
    const normalizedTemplateId = override.templateId === "single_walk_run_v2" ? "single_walk_v2" : override.templateId;
    const selected = posePresetCatalog.find((preset) => preset.id === normalizedTemplateId);
    plan.selectorReason = `user selected ${selected?.label || override.templateId} template; geometry, framing and control profile rebuilt from the override`;
    plan.confidence = "high";
  }
  plan.controlProfile = poseConditioningPolicy(profileForPlan(plan.peopleCount, plan.framingMode, plan.people),plan.people,override.conditioning);
  const rebuilt = buildPoseControlFromPlan(plan, base.width, base.height, unbounded);
  const people = override.people || rebuilt.people;
  people.forEach((points, index) => {
    const personPlan = plan.people[index];
    if (!personPlan || !points[0]) return;
    personPlan.headDirection = headDirectionFor(points[0], gazeTargetForPersonPlan(personPlan).point);
  });
  const safety = validatePosePeople(people, plan);
  if (!unbounded && !safety.valid && !plan.overrideConflicts.length) return base;
  return {
    ...rebuilt,
    source: "user_override",
    presetId: override.templateId === "single_walk_run_v2" ? "single_walk_v2" : override.templateId || rebuilt.presetId,
    override,
    safety,
    people,
    svg: renderOpenPoseSvgV2(people, base.width, base.height),
  };
}

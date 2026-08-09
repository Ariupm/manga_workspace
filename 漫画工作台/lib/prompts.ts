import type {
  Asset,
  Character,
  CharacterLook,
  EnvironmentConfig,
  Shot,
} from "./types";
import {
  buildPoseControlV2,
  derivePoseFramingModeV2,
  renderOpenPoseSvgV2,
  type PoseInteractionInput,
  type PosePoint as PosePointV2,
} from "./pose-v2";

const placeholders = [
  "natural storytelling action",
  "coherent story environment",
  "clear storytelling composition",
  "natural expressive emotion",
  "gentle, natural expression",
];
const clean = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const isPlaceholder = (value: string) =>
  !clean(value) ||
  placeholders.includes(clean(value).toLowerCase()) ||
  /^(standing in a relaxed three-quarter pose, shoulders level(?:, hands out of frame)?|looking toward the story focus|hands out of frame)$/i.test(
    clean(value),
  ) ||
  /^gentle, natural expression(?:, smile)?$/i.test(clean(value));
const has = (value: string, pattern: RegExp) =>
  pattern.test(value.toLowerCase());
const inferGazeFromAction = (action: string) => {
  const source=clean(action).toLowerCase();
  if(/phone|smartphone|screen|texting|message/.test(source))return "head tilted slightly down, eyes focused on the smartphone screen, pupils directed downward, no eye contact with camera";
  if(/book|page|reading|document|letter/.test(source))return "eyes focused on the book or document, pupils directed toward the page, no eye contact with camera";
  if(/offer|hand(?:ing)?|receive|accept|reach/.test(source))return "eyes focused on the shared prop and the other person's hands, no eye contact with camera";
  if(/walk|run|move|leave|enter/.test(source))return "looking toward the direction of movement, no eye contact with camera";
  return "eyes focused on the current action target, no eye contact with camera";
};
export const expressionPrompt = (value: string, fallback = "readable story-appropriate expression") => {
  const source = clean(value);
  if (/happy|joy|excited|delighted|期待|开心|高兴|惊喜/i.test(source))
    return "genuine happy anticipation, warm open smile, raised cheeks, bright engaged eyes, clearly readable joyful expression";
  if (/surpris|惊讶|震惊/i.test(source))
    return "clearly readable surprised expression, raised brows, widened eyes, slightly parted lips";
  if (/worried|concern|anxious|担心|焦虑/i.test(source))
    return "clearly readable worried expression, gently knitted brows, tense attentive eyes";
  if (/sad|悲伤|难过/i.test(source))
    return "clearly readable sad expression, softened eyes, downturned mouth, restrained emotion";
  if (/angry|怒|生气/i.test(source))
    return "clearly readable angry expression, knitted brows, focused intense eyes";
  return source ? `${source}, clearly readable facial expression` : fallback;
};
const explicitlyAllowsCameraGaze=(value:string)=>!/(?:no|without|avoid) eye contact with (?:the )?camera/i.test(value)&&/(?:looking|gazing) (?:at|toward) (?:the )?(?:viewer|camera)|eye contact with (?:the )?camera/i.test(value);

export type InteractionContract = {
  relationId: string;
  required: boolean;
  characterId: string;
  object: string;
  affordance: string;
  region: {xStart:number;xEnd:number};
  objectCenter: {x:number;y:number};
  gaze: string;
  shape: "portrait_rect"|"landscape_rect"|"cylinder"|"umbrella"|"bag"|"dish"|"elongated";
  handMode: "one"|"two";
  purpose: "inspect"|"read"|"watch"|"capture"|"scan"|"call"|"drink"|"carry"|"operate"|"offer"|"place";
  orientation: "portrait"|"landscape"|"upright"|"contextual"|"not_applicable";
  viewerSurface: "back"|"screen"|"side"|"contextual";
  gazeMode: "object"|"work_point"|"target"|"independent";
  positive: string[];
  negative: string[];
};

export type ShotRiskProfile = {
  poseRequired: boolean;
  identityRepairRequired: boolean;
  propRepairRequired: boolean;
  gazeRepairRequired: boolean;
  depthGuideRequired: boolean;
  reasons: string[];
  actionPlan: PoseActionPlan;
};

export type PoseActionFamily =
  | "locomotion"
  | "point"
  | "self_touch"
  | "operate_environment"
  | "reach"
  | "seated"
  | "recline"
  | "lie"
  | "turn"
  | "bend"
  | "head_gesture"
  | "full_body"
  | "static";

export type PoseActionPlan = {
  family: PoseActionFamily;
  required: boolean;
  source: "visual_interaction" | "visual_character" | "shot_action" | "camera" | "none";
  reason: string;
  sourceText: string;
};

export type PoseFramingMode = "upper_body" | "natural_body" | "full_body";

export function derivePoseFramingMode(shot: Shot): PoseFramingMode {
  return derivePoseFramingModeV2(shot);
}

export function derivePoseActionPlan(shot: Shot, characterId = shot.characterIds[0] || ""): PoseActionPlan {
  const plannedCharacter = shot.visualSpecConfirmed
    ? shot.visualSpec?.characters.find((item) => item.characterId === characterId)
    : undefined;
  const plannedRelations = shot.visualSpecConfirmed
    ? (shot.visualSpec?.interactions || []).filter((item) => item.actorCharacterId === characterId)
    : [];
  const look = shot.characterLooks?.[characterId];
  const primaryParts = [
    ...plannedRelations.flatMap((item) => [item.type, item.action, item.phase, item.propId, item.gazeTarget, ...item.contactPoints]),
    plannedCharacter?.action || "",
    plannedCharacter?.actionTarget || "",
    plannedCharacter?.gazeTarget || "",
    plannedCharacter?.hands || "",
    look?.actionEn || "",
    look?.gazeEn || "",
    look?.handsEn || "",
    shot.actionEn,
  ].filter(Boolean);
  const contextParts = [
    shot.description,
    ...(shot.visualSpecConfirmed ? shot.visualSpec?.visibleFacts || [] : []),
  ].filter(Boolean);
  const sourceParts = [...primaryParts, ...contextParts];
  const primaryText = clean(primaryParts.join("; "));
  const sourceText = clean(sourceParts.join("; "));
  const source = plannedRelations.length
    ? "visual_interaction" as const
    : plannedCharacter
      ? "visual_character" as const
      : clean(`${look?.actionEn || ""} ${shot.actionEn} ${shot.description}`)
        ? "shot_action" as const
        : "none" as const;
  const rules: Array<[PoseActionFamily, RegExp, string]> = [
    ["lie", /\b(?:lie|lies|lying|lay)\b|lie down|躺|卧倒|平卧/i, "lying body requires a near-horizontal torso"],
    ["recline", /reclin|lean(?:ing|s)? back|斜靠|倚靠|半躺/i, "reclining body requires a diagonal supported torso"],
    ["self_touch", /rub(?:bing|s)? (?:her |his |the )?(?:eye|eyes|face)|touch(?:ing|es)? (?:her |his |the )?(?:eye|eyes|face|forehead)|cover(?:ing|s)? (?:her |his )?(?:face|eyes)|揉眼|揉脸|摸脸|捂脸|扶额/i, "self-touch requires a wrist-to-face joint target"],
    ["point", /\bpoint(?:ing|s|ed)?\b|gesture(?:s|d|ing)? toward|指向|指着|指给/i, "pointing requires an extended arm toward the story target"],
    ["operate_environment", /turn(?:ing|s|ed)? (?:off|on)|switch(?:ing|es|ed)?|press(?:ing|es|ed)? (?:the )?(?:switch|button)|open(?:ing|s|ed)? (?:the )?(?:door|window|curtain)|clos(?:ing|es|ed) (?:the )?(?:door|window|curtain)|关灯|开灯|开关|按(?:下)?按钮|开门|关门|拉窗帘/i, "environment operation requires hand contact at the fixture"],
    ["locomotion", /\b(?:walk|walking|walks|walked|run|running|runs|ran|stride|striding|step|stepping|enter|entering|exit|exiting|leave|leaving|approach|approaching)\b|走|跑|迈步|进入|离开|出门|走向/i, "locomotion requires opposing limb phases"],
    ["reach", /\breach(?:ing|es|ed)?\b|extend(?:ing|s|ed)? (?:an? )?(?:arm|hand)|伸手|探手|够向/i, "reaching requires a visible extended arm"],
    ["seated", /\b(?:sit|sits|sitting|seated)\b|sofa|couch|chair|坐|沙发|椅子/i, "seated action requires bent hips and knees"],
    ["bend", /\b(?:bend|bends|bending|stoop|stooping)\b|lean(?:ing|s)? forward|俯身|弯腰/i, "bending requires a forward-angled torso"],
    ["turn", /turn(?:ing|s|ed)? (?:around|back|head|body)|look(?:ing|s)? back|回头|转身|扭头/i, "turning requires asymmetric shoulders and head direction"],
    ["head_gesture", /\b(?:nod|nods|nodding)\b|look(?:ing|s)? up|raise(?:s|d|ing)? (?:her |his |the )?head|点头|摇头|抬头|仰头/i, "head gesture requires an explicit head-to-neck angle"],
  ];
  const matched = rules.find(([, pattern]) => pattern.test(primaryText)) || rules.find(([, pattern]) => pattern.test(sourceText));
  if (matched) return { family: matched[0], required: true, source, reason: matched[2], sourceText };
  if (/wide shot|full shot|long shot|远景|全景/i.test(`${shot.cameraEn} ${shot.camera} ${shot.compositionEn}`))
    return { family: "full_body", required: true, source: "camera", reason: "wide/full framing requires a complete body pose", sourceText };
  return { family: "static", required: false, source: "none", reason: "no pose-sensitive action detected", sourceText };
}

export function deriveShotRiskProfile(shot: Shot): ShotRiskProfile {
  const source = `${shot.actionEn} ${shot.description} ${shot.compositionEn} ${shot.cameraEn}`.toLowerCase();
  const planned = shot.visualSpecConfirmed ? shot.visualSpec : null;
  const relations = planned?.interactions || [];
  const actionPlan = derivePoseActionPlan(shot);
  const multi = shot.characterIds.length > 1;
  const prop = shot.characterIds.some((id) => deriveInteractionContract(shot, id).required) || relations.some((item) => Boolean(item.propId));
  const gaze = multi || relations.some((item) => item.gazeTarget.trim().length > 0) || /look|gaze|对视|看向|注视/i.test(source);
  const contact = relations.some((item) => item.contactPoints.length > 0) || /hand|hold|reach|drink|read|point|rub|switch|turn off|lie|recline|递|拿|喝|接触|操作|指|揉|关灯|躺/i.test(source);
  const fullBody = actionPlan.family === "full_body" || /jump|跳/i.test(source);
  const reasons: string[] = [];
  if (multi) reasons.push("multiple characters");
  if (contact) reasons.push("limb or contact action");
  if (fullBody) reasons.push("full-body or wide framing");
  if (prop) reasons.push("prop interaction");
  if (gaze) reasons.push("independent gaze targets");
  if (actionPlan.required) reasons.push(`action plan: ${actionPlan.family} (${actionPlan.reason})`);
  return { poseRequired: multi || actionPlan.required || contact || fullBody || prop, identityRepairRequired: true, propRepairRequired: prop, gazeRepairRequired: gaze, depthGuideRequired: multi || contact || prop || actionPlan.required, reasons, actionPlan };
}

const interactionObjects: Array<{pattern:RegExp; object:string; affordance:string;y:number;shape:InteractionContract["shape"];handMode:InteractionContract["handMode"]}> = [
  {pattern:/smartphone|cell ?phone|mobile phone|phone screen|texting|phone|手机|移动电话|设备|device/i,object:"smartphone",affordance:"held securely with readable hand-object contact",y:.58,shape:"portrait_rect",handMode:"two"},
  {pattern:/book|novel|magazine|document|letter|page|reading/i,object:"book or document",affordance:"supported by visible hands at a readable angle",y:.6,shape:"landscape_rect",handMode:"two"},
  {pattern:/cup|mug|glass|bottle|drink|coffee|tea/i,object:"drink container",affordance:"securely held by at least one visible hand",y:.5,shape:"cylinder",handMode:"one"},
  {pattern:/package|parcel|box|delivery/i,object:"package",affordance:"supported by visible hands and clearly separated from the body",y:.62,shape:"landscape_rect",handMode:"two"},
  {pattern:/umbrella|parasol/i,object:"umbrella",affordance:"connected to a clearly visible handle held by a visible hand",y:.53,shape:"umbrella",handMode:"one"},
  {pattern:/bag|handbag|purse|backpack/i,object:"bag",affordance:"visibly carried by its handle or strap",y:.65,shape:"bag",handMode:"one"},
  {pattern:/food|meal|bowl|plate/i,object:"food container",affordance:"placed visibly near the acting hands",y:.64,shape:"dish",handMode:"two"},
  {pattern:/tool|hammer|screwdriver|wrench|spanner|pliers|scissors|pen|pencil|brush|knife|工具|螺丝刀|扳手|剪刀|画笔/i,object:"handheld tool",affordance:"gripped by a visible hand at its handle with the working end clearly separated from the fingers",y:.55,shape:"elongated",handMode:"one"},
];

export function deriveInteractionContract(shot: Shot, characterId?: string): InteractionContract {
  const planned=shot.visualSpecConfirmed?shot.visualSpec?.characters.find((item)=>!characterId||item.characterId===characterId):undefined;
  const plannedInteraction = shot.visualSpecConfirmed
    ? (shot.visualSpec?.interactions || []).find((item) => item.actorCharacterId === (characterId || shot.characterIds[0]) && item.propId)
      || (shot.visualSpec?.interaction?.actorCharacterId === (characterId || shot.characterIds[0]) ? shot.visualSpec.interaction : null)
    : null;
  const look=characterId?shot.characterLooks?.[characterId]:undefined;
  const source=unique([
    plannedInteraction?.propId || "",
    look?.actionEn||"", look?.gazeEn||"", look?.handsEn||"", planned?.action||"", planned?.actionTarget||"",
    planned?.gazeTarget||"", planned?.hands||"", shot.actionEn, shot.description,
    ...(shot.visualSpecConfirmed?shot.visualSpec?.visibleFacts||[]:[]),
  ]).join("; ");
  const structuredProp = plannedInteraction?.propId
    || shot.visualSpec?.interaction?.propId
    || "";
  const match=structuredProp
    ? interactionObjects.find((entry)=>entry.pattern.test(structuredProp))
    : interactionObjects.find((entry)=>entry.pattern.test(source));
  const index=Math.max(0,shot.characterIds.indexOf(characterId||shot.characterIds[0]));
  const region=planned?.region||{xStart:index/Math.max(1,shot.characterIds.length),xEnd:(index+1)/Math.max(1,shot.characterIds.length)};
  const lookPosition=shot.visualSpecConfirmed
    ? planned?.position || ""
    : shot.characterLooks?.[characterId || shot.characterIds[0]]?.positionEn || "";
  const positionCenter=/left|左/i.test(lookPosition) ? .38 : /right|右/i.test(lookPosition) ? .62 : (region.xStart+region.xEnd)/2;
  if(!match) {
    if (structuredProp) {
      return {relationId:`legacy:${characterId||""}:${structuredProp}`,required:true,characterId:characterId||"",object:structuredProp,affordance:"clearly visible and physically connected to the acting hands",region,objectCenter:{x:positionCenter,y:.58},gaze:planned?.gazeTarget || "head and eyes focused on the interaction target, no eye contact with camera",shape:"landscape_rect",handMode:"two",purpose:"inspect",orientation:"contextual",viewerSurface:"contextual",gazeMode:"object",positive:[`(required story prop clearly visible: ${structuredProp}:1.38)`,`(hands physically contact and operate the ${structuredProp}:1.3)`],negative:[`missing ${structuredProp}`,`hidden ${structuredProp}`,"empty hands","folded hands"]};
    }
    return {relationId:`none:${characterId||""}`,required:false,characterId:characterId||"",object:"",affordance:"",region,objectCenter:{x:positionCenter,y:.58},gaze:"",shape:"landscape_rect",handMode:"two",purpose:"inspect",orientation:"contextual",viewerSurface:"contextual",gazeMode:"independent",positive:[],negative:[]};
  }
  let purpose:InteractionContract["purpose"]="inspect",orientation:InteractionContract["orientation"]="contextual",viewerSurface:InteractionContract["viewerSurface"]="contextual",gazeMode:InteractionContract["gazeMode"]="object";
  let handMode=match.handMode,shape=match.shape,y=match.y,affordance=match.affordance;
  const phone=/smartphone/.test(match.object);
  const phoneReadEvidence=/\b(?:read(?:ing)?|message|notification|texting)\b|(?:eyes?|gaze|pupils?)\s+(?:focused|directed|looking)?[^;,.]*\b(?:phone|smartphone)?\s*screen\b|\b(?:phone|smartphone)\s+screen\b/i.test(source);
  const twoHandFrontEvidence=/\b(?:both|two)\s+(?:visible\s+)?hands?\b[^;,.]*\b(?:hold(?:ing|s)?|operate|use|support)/i.test(source)&&/\b(?:in front of (?:the )?(?:chest|torso)|at (?:the )?(?:chest|torso)|screen)\b/i.test(source);
  const explicitPhoneCall=/\b(?:phone|telephone)?\s*call(?:ing)?\b|\b(?:making|taking|answering|on)\s+(?:a\s+)?(?:phone\s+)?call\b|\b(?:phone|smartphone|device)\b[^;,.]*\b(?:beside|against|to|at)\s+(?:her|his|their|the)?\s*ear\b|\b(?:listening|talking|speaking)\b[^;,.]*\b(?:phone|smartphone)\b/i.test(source);
  const screenEvidence=/phone screen (?:shows|displays)|notification (?:card|banner) visible|capture both face and phone screen|screen readable to (?:the )?viewer/i.test(source);
  if(phone&&(phoneReadEvidence||twoHandFrontEvidence)){purpose=phoneReadEvidence?"read":"inspect";orientation="portrait";viewerSurface=screenEvidence?"screen":"back";gazeMode="object";handMode="two";shape="portrait_rect";affordance=screenEvidence?"held vertically with both hands at a three-quarter angle, the character can read the screen while a parcel notification card and icon remain visible to the viewer, no legible text":"held vertically in portrait orientation in front of the torso with both hands, screen facing the character and back casing facing the viewer, device body hiding most fingers while thumbs and outer finger silhouettes remain readable";}
  else if(phone&&explicitPhoneCall){purpose="call";orientation="portrait";viewerSurface="side";gazeMode="independent";handMode="one";y=.34;affordance="held beside one ear by one hand, with the device side edge readable and the other hand free";}
  else if(phone&&/watch(?:ing)? (?:a )?video|video playback|movie|landscape mode/i.test(source)){purpose="watch";orientation="landscape";viewerSurface="back";gazeMode="object";handMode="two";shape="landscape_rect";affordance="held horizontally in landscape orientation with both hands, screen facing the character and back casing facing the viewer";}
  else if(phone&&/photo|photograph|camera|record(?:ing)?|film(?:ing)?|selfie/i.test(source)){purpose="capture";orientation="contextual";viewerSurface="screen";gazeMode="object";handMode=/both hands|two hands/i.test(source)?"two":"one";y=.46;affordance="raised toward the intended subject, camera side facing the subject and screen side facing the character";}
  else if(phone&&/scan|qr|barcode/i.test(source)){purpose="scan";orientation="portrait";viewerSurface="side";gazeMode="target";handMode="one";y=.5;affordance="held in one hand and aimed toward the code or document being scanned";}
  else if(phone){purpose=/read|message|notification|texting/i.test(source)?"read":"inspect";orientation="portrait";viewerSurface=screenEvidence?"screen":"back";gazeMode="object";shape="portrait_rect";affordance=screenEvidence?"held vertically at a three-quarter angle so the character can read the notification while the parcel icon remains visible to the viewer, no legible text":"held vertically in portrait orientation in front of the torso, screen facing the character and back casing facing the viewer, device body hiding most fingers while thumbs and outer finger silhouettes remain readable";}
  else if(/drink|sip|喝/i.test(source)&&/drink container/.test(match.object)){purpose="drink";orientation="upright";viewerSurface="side";gazeMode="independent";handMode="one";y=.4;affordance="held upright by one hand with its rim approaching the mouth";}
  else if(/carry|carrying|hold against|抱|提着/i.test(source)){purpose="carry";orientation="contextual";viewerSurface="contextual";gazeMode="independent";}
  else if(/\b(?:hand over|handing over|give|giving|pass|passing|offer|offering)\b|递|交给/i.test(source)){purpose="offer";orientation="contextual";viewerSurface="contextual";gazeMode="target";}
  else if(/place|put|set down|放/i.test(source)){purpose="place";orientation="contextual";viewerSurface="contextual";gazeMode="object";}
  else if(/handheld tool/.test(match.object)){purpose="operate";orientation="contextual";viewerSurface="side";gazeMode="work_point";affordance="gripped at the handle by one visible hand, working end contacting the intended work point and clearly separated from the fingers";}
  else if(/book|document/.test(match.object)){purpose="read";orientation="landscape";viewerSurface="contextual";gazeMode="object";}
  const savedGaze=englishVisual(look?.gazeEn||planned?.gazeTarget);
  const inferredGaze=gazeMode==="independent"?"natural gaze follows the surrounding story action, no forced eye contact with camera":gazeMode==="work_point"?"head and eyes focused on the precise point where the tool contacts its target, no eye contact with camera":gazeMode==="target"?"head and eyes focused on the interaction target, no eye contact with camera":inferGazeFromAction(source);
  const gaze=!savedGaze||/current (?:story focus|action target)|looking forward/i.test(savedGaze)||((gazeMode==="object"||gazeMode==="work_point")&&!/head|pupil|downward|contact point/i.test(savedGaze))?inferredGaze:savedGaze;
  const orientationText=`${orientation} orientation determined by the current action`;
  const surfaceText=viewerSurface==="contextual"?"visible surface follows camera and action geometry":`${viewerSurface} surface is the side readable to the viewer`;
  return {
    relationId:`prop:${characterId||""}:${structuredProp || match.object}:${purpose}`,required:true,characterId:characterId||"",object:structuredProp || match.object,affordance,region,
    objectCenter:{x:Math.max(.15,Math.min(.85,positionCenter)),y},gaze,shape,handMode,purpose,orientation,viewerSurface,gazeMode,
    positive:[
      `(required story prop clearly visible: ${match.object}:1.38)`,
      `(interaction purpose ${purpose}; ${affordance}:1.32)`,orientationText,surfaceText,
      `(hands physically contact and operate the ${match.object}; wrists and the object-hand contact are clearly readable:1.3)`,
      gazeMode!=="independent"?`(${gaze}:1.35)`:gaze,
    ],
    negative:[`missing ${structuredProp || match.object}`,`hidden ${structuredProp || match.object}`,"empty hands","folded hands","clasped hands","hands resting together in lap","hands unrelated to the story prop",orientation==="portrait"?"landscape orientation":orientation==="landscape"?"portrait orientation":"",viewerSurface==="back"?"front or screen surface facing viewer":""].filter(Boolean),
  };
}
const unique = (values: string[]) => [
  ...new Set(values.map(clean).filter(Boolean)),
];
const englishVisual = (value: string | undefined, fallback = "") => {
  const normalized = clean(value || "");
  return normalized && !containsCjk(normalized) ? normalized : fallback;
};

export type PromptQuality = {
  valid: boolean;
  errors: string[];
  blockingErrors: string[];
  warnings: string[];
  characterCount: number;
  countRule: string;
  action: string;
  expression: string;
  gaze: string;
  hands: string;
  camera: string;
  environmentScore: number;
  environmentChecks: string[];
};

export type FinalPromptValidation = {
  valid: boolean;
  errors: string[];
};

export type PromptReconciliation = {
  prompt: string;
  changed: boolean;
  repairs: string[];
  validation: FinalPromptValidation;
};

type InteractionPromptPolicy = {
  matches: (interaction: InteractionContract) => boolean;
  canonical: string;
  rewrites: Array<{ pattern: RegExp; replacement: string; label: string }>;
};

// Keep action-specific repair rules in one registry so new prop/action
// contracts can be added without spreading special cases through API routes.
const phoneCallPattern = /\b(?:(?:phone|smartphone|device)\s+)?call(?:ing)?\b|\b(?:making|taking|answering|on)\s+(?:a\s+)?(?:phone\s+)?call\b|\b(?:phone|smartphone|device)\b[^;,.]*\b(?:beside|against|to|at)\s+(?:her|his|their|the)?\s*ear\b/gi;
const interactionPromptPolicies: InteractionPromptPolicy[] = [{
  matches: (interaction) => interaction.object === "smartphone" && interaction.purpose === "read",
  canonical: "required smartphone clearly visible, held in portrait orientation with both visible hands in front of the torso, both hands physically contacting and supporting the smartphone, reading the notification on the smartphone screen",
  rewrites: [
    { pattern: phoneCallPattern, replacement: "reading a smartphone notification", label: "call → read" },
    { pattern: /\b(?:held\s+)?(?:beside|against|to|at)\s+(?:the\s+)?(?:her|his|their)?\s*ear\b|\bphone\s+to\s+(?:the\s+)?ear\b/gi, replacement: "held in front of the torso", label: "ear pose → front-of-torso pose" },
    { pattern: /\b(?:one|single)\s+hand(?:ed)?\b/gi, replacement: "both hands", label: "one hand → both hands" },
    { pattern: /\bthe other hand (?:is )?free\b/gi, replacement: "both hands support the smartphone", label: "free hand → supporting hand" },
  ],
}];

/** Reconcile editable/legacy prompt text with the authoritative action contract. */
export function reconcileFinalPrompt(prompt: string, interaction?: InteractionContract | null): PromptReconciliation {
  const policy = interaction ? interactionPromptPolicies.find((item) => item.matches(interaction)) : undefined;
  if (!policy) return { prompt: clean(prompt), changed: false, repairs: [], validation: validateFinalPrompt(prompt, interaction) };
  let repaired = clean(prompt);
  const repairs: string[] = [];
  for (const rewrite of policy.rewrites) {
    if (rewrite.pattern.test(repaired)) {
      rewrite.pattern.lastIndex = 0;
      repaired = repaired.replace(rewrite.pattern, rewrite.replacement);
      repairs.push(rewrite.label);
    }
    rewrite.pattern.lastIndex = 0;
  }
  if (!repaired.toLowerCase().includes(policy.canonical.toLowerCase())) {
    repaired = `${repaired.replace(/[\s,]+$/, "")}, ${policy.canonical}`;
    repairs.push("append canonical action contract");
  }
  repaired = repaired.replace(/\s+/g, " ").replace(/,\s*,+/g, ",").trim();
  return { prompt: repaired, changed: repairs.length > 0, repairs, validation: validateFinalPrompt(repaired, interaction) };
}

/** Validate the prompt that will actually be sent to the image backend. */
export function validateFinalPrompt(prompt: string, interaction?: InteractionContract | null): FinalPromptValidation {
  const value = clean(prompt).toLowerCase();
  const errors: string[] = [];
  if (interaction?.object === "smartphone" && interaction.purpose === "read") {
    if (phoneCallPattern.test(value)) {
      phoneCallPattern.lastIndex = 0;
      errors.push("read 场景最终 prompt 不得包含 call");
    }
    phoneCallPattern.lastIndex = 0;
    if (/(?:beside|against|to|at)\s+(?:the\s+)?(?:her|his|their)?\s*ear|phone\s+to\s+ear/.test(value))
      errors.push("read 场景最终 prompt 不得包含 beside ear");
    if (/(?:one|single)\s+hand|one-handed|one hand/.test(value))
      errors.push("read 场景最终 prompt 不得包含 one hand");
    if (!/(?:both|two)\s+(?:visible\s+)?hands?/.test(value))
      errors.push("read 场景最终 prompt 必须明确 both hands");
    if (!/smartphone|mobile phone|cell phone/.test(value))
      errors.push("read 场景最终 prompt 必须明确 smartphone");
  }
  return { valid: errors.length === 0, errors };
}

export function deriveInteractionContracts(shot: Shot, characterId?: string): InteractionContract[] {
  const id = characterId || shot.characterIds[0] || "";
  const planned = shot.visualSpecConfirmed ? (shot.visualSpec?.interactions || []).filter((item) => item.actorCharacterId === id && item.propId) : [];
  if (!planned.length) return [deriveInteractionContract(shot, characterId)];
  return planned.map((relation, index) => ({ ...deriveInteractionContract({ ...shot, visualSpec: { ...shot.visualSpec!, interactions: [relation], interaction: null } }, id), relationId: `${relation.actorCharacterId}:${relation.propId || relation.targetCharacterId || "target"}:${index + 1}` }));
}

export type CanonicalPromptPlan = {
  prompt: string;
  overrideApplied: boolean;
  repairs: string[];
  validation: FinalPromptValidation;
};

function framingKind(shot: Shot) {
  const camera = resolveCameraPrompt(shot);
  if (/wide shot|full shot|long shot/i.test(camera)) return "wide" as const;
  if (/close-up|medium close-up|chest-up|head-and-shoulders|waist-up|medium shot/i.test(camera)) return "close_or_medium" as const;
  return "other" as const;
}

function stripConflictingFraming(value: string, shot: Shot) {
  const kind = framingKind(shot);
  const conflicts = kind === "wide"
    ? /\b(?:strict\s+)?(?:waist-up|chest-up|head-and-shoulders)\s+framing\b|\bno legs? or full bod(?:y|ies)\b|\bno\s+(?:waist|legs?|feet|full bod(?:y|ies))\s+(?:is\s+)?visible\b|\bstrict crop at the waist\b/gi
    : kind === "close_or_medium"
      ? /\bfull[- ]?(?:body|length)(?:\s+(?:figure|portrait))?\b|\bhead\s+to\s+(?:toe|feet)\b|\b(?:both\s+)?feet\s+(?:fully\s+)?visible\b|\bcomplete (?:body|figure|limbs)\b|\bvisible legs\b/gi
      : null;
  if (!conflicts) return { value: clean(value), changed: false };
  const repaired = clean(value.replace(conflicts, ""));
  return { value: repaired, changed: repaired !== clean(value) };
}

/**
 * The regional compiler is the authoritative contract layer for every shot.
 * Editable prompts are appended as a non-contract layer after contradictory
 * framing phrases have been removed, so single and multi-character requests
 * use the same camera/count/action/interaction representation.
 */
export function buildCanonicalGenerationPrompt(
  shot: Shot,
  contractPrompt: string,
  editablePrompt = "",
  characterCount = shot.characterIds.length,
): CanonicalPromptPlan {
  const contract = stripConflictingFraming(sanitizeEnglishPrompt(contractPrompt), shot);
  const override = stripConflictingFraming(sanitizeEnglishPrompt(editablePrompt), shot);
  const repairs = [
    ...(contract.changed ? ["removed framing clauses that conflict inside the regional contract prompt"] : []),
    ...(override.changed ? ["removed framing clauses that conflict with the structured camera contract"] : []),
  ];
  const contractTerms = new Set(splitPromptTerms(contract.value).map((term) => promptFingerprint(term)));
  const editorialTerms = splitPromptTerms(override.value).filter((term) => !contractTerms.has(promptFingerprint(term)));
  const editorial = override.value && override.value !== contract.value
    ? editorialTerms.join(", ")
    : "";
  const kind = framingKind(shot);
  const camera = resolveCameraPrompt(shot);
  const framingInvariant = kind === "close_or_medium"
    ? `${camera}, strict crop at the waist, no legs or full bodies`
    : camera;
  const countInvariant = characterCount === 1
    ? "exactly one foreground adult woman, 1girl, solo"
    : `exactly ${characterCount} clearly distinct foreground adult women`;
  const prompt = [contract.value, framingInvariant, countInvariant, editorial ? `editorial visual details, ${editorial}` : ""].filter(Boolean).join(", ");
  const value = prompt.toLowerCase();
  const errors: string[] = [];
  if (!value.includes(camera.toLowerCase().split(",")[0])) errors.push("最终 prompt 缺少结构化 camera 契约");
  if (kind === "close_or_medium" && !/strict crop at the waist|no waist or legs visible|do not show legs or the full body/.test(value))
    errors.push("近景/中景最终 prompt 缺少正向裁切契约");
  if (kind === "wide" && !/complete (?:figures|bodies) visible|complete bodies visible from head to feet/.test(value))
    errors.push("远景/全景最终 prompt 缺少完整人物景别契约");
  if (characterCount === 1 && !/\b1girl\b|\bone adult woman\b|\bsolo\b/.test(value))
    errors.push("单人最终 prompt 缺少人物数量契约");
  if (characterCount > 1 && !new RegExp(`exactly ${characterCount}\\b|${characterCount}girls\\b`).test(value))
    errors.push("多人最终 prompt 缺少人物数量契约");
  if (kind === "close_or_medium" && /\bfull body portrait\b|\bfull-length figure\b|\bhead to (?:toe|feet)\b|\bboth feet (?:fully )?visible\b|\bcomplete (?:body|figure|limbs)\b|\bvisible legs\b/.test(value))
    errors.push("近景/中景最终 prompt 仍包含冲突的全身景别词");
  if (kind === "wide" && /\bstrict crop at the waist\b|\b(?:waist-up|chest-up|head-and-shoulders) framing\b|\bno waist or legs visible\b|\bno legs? or full bod(?:y|ies)\b|\bdo not show legs\b/.test(value))
    errors.push("远景/全景最终 prompt 仍包含冲突的近景裁切词");
  return { prompt, overrideApplied: Boolean(editorial), repairs, validation: { valid: errors.length === 0, errors } };
}

export function buildCanonicalNegativePrompt(shot: Shot, contractNegative: string, editableNegative = "") {
  const framing = framingKind(shot) === "wide"
    ? "cropped feet, missing legs, floating limbs, incomplete full body"
    : framingKind(shot) === "close_or_medium"
      ? "full body, full-length figure, visible legs, visible shoes, standing portrait"
      : "";
  const contract = sanitizeEnglishPrompt(contractNegative);
  const editorial = extractPromptEditorialDiff(contractNegative, editableNegative);
  const contractLayer = compactPrompt([contract, framing].filter(Boolean).join(", "), 72);
  return [contractLayer, editorial].filter(Boolean).join(", ");
}

/** Return only terms added by an edited prompt relative to its structured baseline. */
export function extractPromptEditorialDiff(base = "", edited = "") {
  const baseTerms = new Set(splitPromptTerms(sanitizeEnglishPrompt(base)).map((term) => promptFingerprint(term)));
  return splitPromptTerms(sanitizeEnglishPrompt(edited))
    .filter((term) => {
      const fingerprint = promptFingerprint(term);
      return fingerprint && !baseTerms.has(fingerprint);
    })
    .join(", ");
}

function canonicalActionForInteraction(action: string, interaction: InteractionContract) {
  return reconcileFinalPrompt(action, interaction).prompt;
}

const splitPromptTerms = (value: string) => {
  const terms: string[] = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      if (clean(current)) terms.push(clean(current));
      current = "";
    } else current += character;
  }
  if (clean(current)) terms.push(clean(current));
  return terms;
};

export const sanitizeEnglishPrompt = (value: string) =>
  splitPromptTerms(value)
    .filter((term) => !containsCjk(term))
    .join(", ");

const dedupePrompt = (value: string) => {
  const seen = new Set<string>();
  return splitPromptTerms(value)
    .filter((term) => {
      const key = term.toLowerCase().replace(/[()]/g, "").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
};

const promptFingerprint = (term: string) => clean(term).toLowerCase().replace(/:\d+(?:\.\d+)?/g," ").replace(/[()]/g," ").replace(/\b(the|a|an|exact|exactly|consistent|canonical|coherent|natural|clear)\b/g," ").replace(/\s+/g," ").trim();
export const compactPrompt = (value: string, maxTerms = 75) => {
  const accepted:string[]=[];const fingerprints:string[]=[];
  for(const term of splitPromptTerms(dedupePrompt(value))) {
    const fingerprint=promptFingerprint(term);if(!fingerprint)continue;
    if(fingerprints.some((known)=>known===fingerprint||(known.length>18&&fingerprint.length>18&&(known.includes(fingerprint)||fingerprint.includes(known)))))continue;
    accepted.push(term);fingerprints.push(fingerprint);if(accepted.length>=maxTerms)break;
  }
  return accepted.join(", ");
};

const timeVisual = (value: string) => {
  const source = clean(value).toLowerCase();
  if (!source) return "unknown time of day, lighting must be confirmed";
  if (/夜|night|evening/.test(source))
    return "nighttime, deep blue ambient sky, illuminated windows and practical lights, balanced cool ambient light and warm artificial light";
  if (/黄昏|傍晚|sunset|dusk/.test(source))
    return "late dusk, fading warm sunset, cool blue shadows, first practical lights turning on";
  if (/清晨|黎明|dawn|morning/.test(source))
    return "early morning, low soft sunlight, long gentle shadows, fresh cool ambient light";
  if (/午后|afternoon/.test(source))
    return "afternoon daylight, readable directional shadows, warm natural bounce light";
  return "daytime, clear natural daylight, readable shadows and balanced ambient light";
};

export function suggestEnvironment(shot: Shot): EnvironmentConfig {
  const source = `${shot.scene} ${shot.description}`.toLowerCase();
  const base: EnvironmentConfig = {
    locationType: "everyday narrative setting",
    location: "specific everyday location",
    foreground: "subtle foreground object framing the scene",
    midground: "story-relevant furniture and props",
    background: "architectural details continuing behind the character",
    depth: "clear foreground, midground and background separation",
    weather: "calm weather",
    timeVisual: timeVisual(shot.timeOfDay),
    keyLight: "motivated directional key light",
    ambientLight: "soft environment bounce light",
    colorTemperature: "natural balanced color temperature",
    atmosphere: "lived-in narrative atmosphere",
    emphasis: "balanced",
  };
  if (/office|公司|办公|下班/.test(source))
    Object.assign(base, {
      locationType: "modern workplace interior",
      location: "modern office lobby near the exit",
      foreground: "glass door edge and umbrella stand",
      midground: "reception counter, indoor plants and floor reflections",
      background: "office corridor, elevator doors and illuminated signage",
    });
  else if (/rain|雨/.test(source))
    Object.assign(base, {
      locationType: "urban exterior in rainy weather",
      location: "rainy city street beside an office building",
      foreground: "wet pavement and nearby umbrella edge",
      midground:
        "crosswalk, puddle reflections and pedestrians in the distance",
      background: "storefronts, office windows and receding street lights",
      weather: "steady rain with visible droplets and wet reflective surfaces",
      atmosphere: "quiet cinematic rainy-day atmosphere",
    });
  else if (/street|街|路|通勤/.test(source))
    Object.assign(base, {
      locationType: "urban exterior",
      location: "everyday city street",
      foreground: "curb edge and nearby street fixture",
      midground: "sidewalk, storefronts and street furniture",
      background: "receding buildings and layered city traffic",
    });
  else if (/厨房|kitchen/.test(source))
    Object.assign(base, {
      locationType: "residential interior",
      location: "lived-in modern home kitchen",
      foreground: "counter edge and a few cooking utensils",
      midground: "worktop, sink and organized ingredients",
      background: "cabinets, tiled wall and a window",
    });
  else if (/客厅|living/.test(source))
    Object.assign(base, {
      locationType: "residential interior",
      location: "cozy modern living room",
      foreground: "small table edge and soft furnishing",
      midground: "sofa, rug and story-relevant personal objects",
      background: "window, shelving and doorway to another room",
    });
  else if (/车站|地铁|公交|station|train/.test(source))
    Object.assign(base, {
      locationType: "public transit interior",
      location: "urban transit station",
      foreground: "platform marking and nearby railing",
      midground: "waiting area, signs and a few separated commuters",
      background: "receding platform architecture and transit lights",
    });
  if (
    /rain|雨/.test(source) &&
    /street|街|路|通勤|回家|下班|office exit/.test(source)
  )
    Object.assign(base, {
      locationType: "urban exterior in rainy weather",
      location: "rainy city street beside an office building",
      foreground: "wet pavement, active raindrop splashes and a nearby umbrella edge",
      midground:
        "puddle ripples, sparse distant pedestrians and reflected street lights",
      background:
        "rain-veiled storefronts, office windows and receding street architecture",
      weather:
        "steady visible rain with dense fine streaks, umbrella droplets and wet reflective surfaces",
      atmosphere: "humid cinematic rainy-day atmosphere with visible rainfall",
    });
  for (const [key, value] of Object.entries(shot.environment || {}))
    if (clean(String(value || "")))
      (base as unknown as Record<string, string>)[key] = String(value);
  if (shot.visualSpecConfirmed && shot.visualSpec) {
    const spec = shot.visualSpec.scene;
    if (clean(spec.location) && spec.location !== "unknown") base.location = spec.location;
    if (spec.anchors?.length) {
      base.midground = spec.anchors.slice(0, 2).join(", ");
      base.background = spec.anchors.slice(2).join(", ") || base.background;
    }
    if (clean(spec.weather) && spec.weather !== "unknown") base.weather = spec.weather;
    if (clean(spec.timeOfDay) && spec.timeOfDay !== "unknown") base.timeVisual = timeVisual(spec.timeOfDay);
    if (clean(spec.lighting) && spec.lighting !== "unknown") base.keyLight = spec.lighting;
  }
  return base;
}

function defaultLook(
  shot: Shot,
  character: Character,
  index: number,
  assets: Asset[] = [],
): CharacterLook {
  const saved =
    shot.characterLooks?.[character.id] || ({} as Partial<CharacterLook>);
  const planned = shot.visualSpecConfirmed
    ? shot.visualSpec?.characters.find((item) => item.characterId === character.id)
    : undefined;
  const baseOutfit = assets.find(
    (asset) =>
      asset.characterId === character.id &&
      asset.type === "outfit" &&
      asset.confirmed &&
      (/base[_-]?outfit/i.test(asset.id) || /基础服装|基本服装/.test(asset.name)),
  );
  const baseShoes = assets.find(
    (asset) =>
      asset.characterId === character.id &&
      asset.type === "shoes" &&
      asset.confirmed &&
      (/base[_-]?shoes?/i.test(asset.id) || /基础鞋履|基本鞋履/.test(asset.name)),
  );
  const savedOutfitId =
    saved.outfitId &&
    (!assets.length ||
      assets.some(
        (asset) =>
          asset.id === saved.outfitId && asset.characterId === character.id,
      ))
      ? saved.outfitId
      : "";
  const savedShoeId =
    saved.shoeId &&
    (!assets.length ||
      assets.some(
        (asset) =>
          asset.id === saved.shoeId && asset.characterId === character.id,
      ))
      ? saved.shoeId
      : "";
  const legacyOutfitId =
    index === 0 &&
    assets.some(
      (asset) =>
        asset.id === shot.outfitId && asset.characterId === character.id,
    )
      ? shot.outfitId
      : "";
  const legacyShoeId =
    index === 0 &&
    assets.some(
      (asset) =>
        asset.id === shot.shoeId && asset.characterId === character.id,
    )
      ? shot.shoeId
      : "";
  return {
    outfitId:
      savedOutfitId ||
      legacyOutfitId ||
      baseOutfit?.id ||
      "",
    shoeId:
      savedShoeId ||
      legacyShoeId ||
      baseShoes?.id ||
      "",
    hairColorEn: saved.hairColorEn || character.visualTraits?.hairColorEn || "",
    hairStyleEn: saved.hairStyleEn || character.visualTraits?.hairStyleEn || "",
    eyeColorEn: saved.eyeColorEn || character.visualTraits?.eyeColorEn || "",
    positionEn:
      saved.positionEn || planned?.position ||
      (shot.characterIds.length === 1
        ? "centered in the frame"
        : index === 0
          ? "on the left side"
          : "on the right side"),
    actionEn: saved.actionEn || planned?.action || shot.actionEn,
    expressionEn: saved.expressionEn || planned?.expression || shot.expressionEn,
    gazeEn: saved.gazeEn || planned?.gazeTarget || inferGazeFromAction(saved.actionEn || planned?.action || shot.actionEn),
    handsEn:
      saved.handsEn || planned?.hands ||
      (/hands out of frame/i.test(shot.actionEn)
        ? "hands out of frame"
        : /hand|holding|arms?/i.test(shot.actionEn)
          ? "hands follow the described action"
          : "hands out of frame"),
  };
}

const cameraFromChinese: Record<string, string> = {
  远景: "wide shot",
  全景: "full shot",
  中景: "medium shot",
  近景: "medium close-up",
  特写: "close-up",
};

export function resolveCameraPrompt(shot: Shot) {
  const selected = clean(cameraFromChinese[clean(shot.camera)] || shot.cameraEn || "medium shot");
  if (/extreme close-?up/i.test(selected))
    return "extreme close-up, face-dominant framing, only head and partial shoulders visible";
  if (/medium close-?up|close shot/i.test(selected))
    return "medium close-up, chest-up framing, frame from chest to head";
  if (/close-?up/i.test(selected))
    return "close-up, head-and-shoulders framing, no waist or legs visible";
  if (/wide shot|long shot/i.test(selected))
    return "wide shot, complete figures visible with clear margin below both feet, both hands separated from the torso, readable environment";
  if (/full shot/i.test(selected))
    return "full shot, complete bodies visible from head to feet, generous margin below the shoes, both hands and all limbs fully inside the frame";
  return "medium shot, strict waist-up framing, frame from waist to head, avoid tight portrait framing, do not show legs or the full body";
}

export function analyzeGenerationPrompt(
  shot: Shot,
  characters: Character[] = [],
  assets: Asset[] = [],
): PromptQuality {
  const errors: string[] = [];
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const count = Math.max(1, shot.characterIds.length);
  const storyText = clean(
    `${shot.title} ${shot.description} ${shot.dialogue} ${shot.scene}`,
  ).toLowerCase();
  if (shot.visualSpecConfirmed && shot.visualSpec) {
    if (!shot.visualSpec.visibleFacts.length) errors.push("已确认镜头规格缺少可见剧情事实");
    const unknownScene = (["location","timeOfDay","weather","lighting"] as const).filter((key)=>!clean(shot.visualSpec!.scene[key])||shot.visualSpec!.scene[key]==="unknown");
    if (unknownScene.length) errors.push(`已确认镜头规格仍有未知环境字段：${unknownScene.join("、")}`);
    for(const character of shot.visualSpec.characters) {
      if(!clean(character.action)||character.action==="unknown")errors.push(`${character.characterId} 缺少具体可见动作`);
      if(!clean(character.expression)||character.expression==="unknown")errors.push(`${character.characterId} 缺少可见表情`);
    }
  }
  const mentionedCharacters = characters.filter(
    (character) =>
      clean(character.name) && storyText.includes(clean(character.name).toLowerCase()),
  );
  const missingMentioned = mentionedCharacters.filter(
    (character) => !shot.characterIds.includes(character.id),
  );
  const hasMultiPersonStory =
    /两个人|两人|二人|她们|他们|双方|一起并肩|陌生女孩|two (?:women|girls|characters|people)|both women|another woman/i.test(
      storyText,
    );
  if (missingMentioned.length) {
    blockingErrors.push(
      `剧情出现${missingMentioned.map((item) => `“${item.name}”`).join("、")}，但分格尚未绑定对应人物`,
    );
  }
  if (hasMultiPersonStory && count < 2) {
    blockingErrors.push("剧情明确是多人场景，但分格只绑定了 1 个人物");
  }
  errors.push(...blockingErrors);
  const env = suggestEnvironment(shot);
  const anchors = [env.foreground, env.midground, env.background].filter(
    (value) => clean(value),
  );
  const environmentChecks = [
    clean(env.location) ? "地点" : "缺少地点",
    anchors.length >= 2 ? "环境锚点" : "环境锚点不足",
    clean(env.depth) ? "空间层次" : "缺少空间层次",
    clean(env.timeVisual) ? "时间" : "缺少时间",
    clean(env.keyLight) && clean(env.ambientLight) ? "光线" : "光线不足",
  ];
  if (!clean(env.location)) errors.push("请填写具体地点");
  if (anchors.length < 2) errors.push("中远景至少需要两个环境锚点");
  if (!clean(env.depth)) errors.push("请填写前中后景或空间纵深");
  const looks = shot.characterIds.map((id, index) => {
    const character = characters.find((item) => item.id === id);
    return character ? defaultLook(shot, character, index, assets) : null;
  });
  for (const [index, look] of looks.entries()) {
    if (!look) {
      errors.push(`第 ${index + 1} 个人物不存在`);
      continue;
    }
    if (isPlaceholder(look.actionEn))
      errors.push(`第 ${index + 1} 个人物缺少具体动作`);
    if (isPlaceholder(look.expressionEn))
      errors.push(`第 ${index + 1} 个人物缺少明确表情`);
    if (!clean(look.hairStyleEn))
      warnings.push(`第 ${index + 1} 个人物缺少结构化发型`);
    if (!clean(look.eyeColorEn))
      warnings.push(`第 ${index + 1} 个人物缺少结构化瞳色`);
    if (!clean(look.outfitId)) warnings.push(`第 ${index + 1} 个人物缺少服装`);
  }
  const camera = resolveCameraPrompt(shot);
  if (
    has(camera, /close-?up/) &&
    has(`${shot.actionEn} ${shot.compositionEn}`, /full body|head to toe/)
  )
    errors.push("特写镜头不能同时要求全身入镜");
  if (
    count === 1 &&
    has(
      `${shot.actionEn} ${shot.compositionEn}`,
      /\b2girls\b|two women|two characters/,
    )
  )
    errors.push("单人分格包含多人描述");
  if (count > 1)
    warnings.push("多人 SD1.5 直接生成仍有串脸风险，请重点检查草稿");
  if (
    count > 1 &&
    has(shot.compositionEn, /one woman|single woman|solo|1girl/)
  )
    errors.push("多人分格仍包含单人构图描述");
  const first = looks[0];
  return {
    valid: errors.length === 0,
    errors,
    blockingErrors,
    warnings,
    characterCount: count,
    countRule:
      count === 1
        ? "1girl, solo, single person, one adult woman"
        : `${count}girls, exactly ${count} distinct adult women`,
    action: clean(first?.actionEn || shot.actionEn),
    expression: clean(first?.expressionEn || shot.expressionEn),
    gaze: clean(first?.gazeEn || "") ? "已明确" : "未明确",
    hands: clean(first?.handsEn || "") ? "已明确" : "未明确",
    camera,
    environmentScore:
      environmentChecks.filter(
        (value) => !value.startsWith("缺少") && !value.endsWith("不足"),
      ).length * 20,
    environmentChecks,
  };
}

export function suggestPromptFixes(
  shot: Shot,
  characters: Character[] = [],
): Partial<Shot> {
  const environment = suggestEnvironment(shot);
  const characterLooks = { ...(shot.characterLooks || {}) };
  shot.characterIds.forEach((id, index) => {
    const character = characters.find((item) => item.id === id);
    if (!character) return;
    const current = defaultLook(shot, character, index);
    const story = `${shot.title} ${shot.description} ${shot.scene}`;
    const umbrellaExchange = /递.*伞|伞.*递|offer(?:ing|s)?.*umbrella|hand(?:ing|s)?.*umbrella/i.test(story);
    const isReceiver = umbrellaExchange && index === 0;
    const isGiver = umbrellaExchange && index === 1;
    characterLooks[id] = {
      ...current,
      actionEn: isPlaceholder(current.actionEn)
        ? isReceiver
          ? "turning toward the woman on the right and reaching to accept the offered umbrella"
          : isGiver
            ? "leaning slightly toward the woman on the left and offering her an open umbrella"
        : has(shot.cameraEn, /close-?up/)
          ? "upper body turned slightly three-quarter toward camera, shoulders relaxed"
          : "standing upright in three-quarter view with shoulders relaxed"
        : current.actionEn,
      expressionEn: isPlaceholder(current.expressionEn)
        ? isReceiver
          ? "surprised and grateful expression"
          : isGiver
            ? "kind reassuring expression"
            : "calm closed-mouth expression"
        : current.expressionEn,
      gazeEn: isPlaceholder(current.gazeEn)
        ? isReceiver
          ? "looking at the woman offering the umbrella"
          : isGiver
            ? "looking at the woman receiving the umbrella"
            : inferGazeFromAction(current.actionEn)
        : current.gazeEn,
      handsEn: isPlaceholder(current.handsEn)
        ? isReceiver
          ? "one hand reaching toward the umbrella handle"
          : isGiver
            ? "one hand visibly extending the umbrella handle"
            : "hands out of frame"
        : current.handsEn,
    };
  });
  return {
    environment,
    characterLooks,
    actionEn: isPlaceholder(shot.actionEn || "")
      ? "standing upright in three-quarter view with shoulders relaxed"
      : shot.actionEn,
    expressionEn: isPlaceholder(shot.expressionEn || "")
      ? "calm closed-mouth expression"
      : shot.expressionEn,
    sceneEn: isPlaceholder(shot.sceneEn || "")
      ? environment.location
      : shot.sceneEn,
    compositionEn:
      shot.characterIds.length > 1 &&
      has(shot.compositionEn, /one woman|single woman|solo|1girl/)
        ? `${shot.characterIds.length} distinct women separated in the frame with readable space between them`
        : isPlaceholder(shot.compositionEn || "")
      ? shot.characterIds.length > 1
        ? `${shot.characterIds.length} distinct women separated in the frame with readable space between them`
        : "balanced storytelling composition with readable spatial depth"
      : shot.compositionEn,
    cameraEn: cameraFromChinese[clean(shot.camera)] || clean(shot.cameraEn) || "medium shot",
  };
}

const stripTraits = (appearance: string) =>
  unique(
    appearance.split(",").filter((part) => !/(hair|eyes?)/i.test(part)),
  ).join(", ");

export const resolveCharacterAssetDescription = (
  asset: Asset | undefined,
  profileFallback = "",
) => {
  const description = clean(asset?.visualDescriptionEn || "");
  return !description || /^character-specific\b/i.test(description)
    ? clean(profileFallback) || description
    : description;
};

const umbrellaStory = (shot: Shot) =>
  /递.*伞|伞.*递|offer(?:ing|s)?.*umbrella|hand(?:ing|s)?.*umbrella/i.test(
    `${shot.title} ${shot.description} ${shot.scene}`,
  );

const openPoseColors = [
  "#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00",
  "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff",
  "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa",
];
const openPoseLimbs = [
  [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9],
  [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16],
  [0, 15], [15, 17],
];

export type PosePoint = PosePointV2;

export function renderOpenPoseSvg(
  people: PosePoint[][],
  width = 512,
  height = 512,
) {
  return renderOpenPoseSvgV2(people, width, height);
}

export type RegionalCharacterRegion = {
  characterId: string;
  characterName: string;
  side: "left" | "right" | "center";
  region: { xStart: number; xEnd: number };
  prompt: string;
  assetWarnings: string[];
  assetBindings: Array<{
    characterId: string;
    role: "identity" | "outfit" | "shoes";
    assetId: string;
    path: string;
    source: "selected_asset" | "profile_text" | "generic_fallback";
  }>;
};

export function buildUmbrellaHandoverPoseSvg(width = 512, height = 512) {
  const receiver: PosePoint[] = [
    { x: .31, y: .20 }, { x: .31, y: .29 }, { x: .24, y: .31 }, { x: .21, y: .43 },
    { x: .23, y: .55 }, { x: .38, y: .31 }, { x: .42, y: .42 }, { x: .475, y: .505 },
    { x: .27, y: .54 }, { x: .26, y: .72 }, { x: .25, y: .91 }, { x: .35, y: .54 },
    { x: .36, y: .72 }, { x: .37, y: .91 }, { x: .29, y: .19 }, { x: .33, y: .19 },
    { x: .27, y: .20 }, { x: .35, y: .20 },
  ];
  const giver: PosePoint[] = [
    { x: .69, y: .20 }, { x: .69, y: .29 }, { x: .62, y: .31 }, { x: .58, y: .41 },
    { x: .525, y: .49 }, { x: .76, y: .31 }, { x: .79, y: .43 }, { x: .77, y: .56 },
    { x: .65, y: .54 }, { x: .64, y: .72 }, { x: .63, y: .91 }, { x: .73, y: .54 },
    { x: .74, y: .72 }, { x: .75, y: .91 }, { x: .67, y: .19 }, { x: .71, y: .19 },
    { x: .65, y: .20 }, { x: .73, y: .20 },
  ];
  const people = [receiver, giver];
  return {
    kind: "umbrella_handover_v1",
    framingMode: "full_body" as const,
    hiddenJointIndices: [] as number[],
    source: "automatic_interaction_plan",
    selectorReason: "structured umbrella handover requires two coordinated skeletons",
    actionFamily: "object_transfer",
    width,
    height,
    people,
    svg: renderOpenPoseSvg(people, width, height),
  };
}

export function buildSingleFullBodyPoseSvg(width = 512, height = 768) {
  const person: PosePoint[] = [
    { x: .50, y: .14 }, { x: .50, y: .23 }, { x: .42, y: .25 }, { x: .38, y: .39 },
    { x: .36, y: .53 }, { x: .58, y: .25 }, { x: .62, y: .39 }, { x: .64, y: .53 },
    { x: .45, y: .50 }, { x: .44, y: .68 }, { x: .42, y: .90 }, { x: .55, y: .50 },
    { x: .57, y: .69 }, { x: .60, y: .90 }, { x: .47, y: .13 }, { x: .53, y: .13 },
    { x: .45, y: .14 }, { x: .55, y: .14 },
  ];
  return {kind:"single_full_body_v1",framingMode:"full_body" as const,hiddenJointIndices:[] as number[],source:"automatic_action_plan",selectorReason:"wide/full framing requires a complete body pose",actionFamily:"full_body" as const,width,height,people:[person],svg:renderOpenPoseSvg([person],width,height)};
}

function buildSingleActionPoseSvgLegacy(shot:Shot,interaction:InteractionContract,width=512,height=512) {
  const actionPlan=derivePoseActionPlan(shot,interaction.characterId);
  const family:PoseActionFamily=actionPlan.required ? actionPlan.family : interaction.required ? "reach" : "static";
  const framingMode=derivePoseFramingMode(shot);
  const position=shot.visualSpecConfirmed
    ? shot.visualSpec?.characters.find((item)=>item.characterId===interaction.characterId)?.position || ""
    : shot.characterLooks?.[interaction.characterId]?.positionEn || "";
  const positionX=/left|左/i.test(position) ? .38 : /right|右/i.test(position) ? .62 : .5;
  const cx=Math.max(.2,Math.min(.8,/left|左|right|右/i.test(position) ? positionX : (interaction.region.xStart+interaction.region.xEnd)/2));
  const ox=Math.max(.15,Math.min(.85,interaction.objectCenter.x)),oy=Math.max(.4,Math.min(.72,interaction.objectCenter.y));
  const face=(nose:{x:number;y:number},neck:{x:number;y:number})=>[
    nose,neck,
  ] as PosePoint[];
  const facial=(nose:{x:number;y:number})=>[
    {x:nose.x-.025,y:nose.y-.01},{x:nose.x+.025,y:nose.y-.01},{x:nose.x-.045,y:nose.y},{x:nose.x+.045,y:nose.y},
  ] as PosePoint[];
  const uprightLegs=(legFamily:PoseActionFamily)=>{
    if(legFamily==="seated") return [
      {x:cx-.055,y:.54},{x:cx-.18,y:.59},{x:cx-.18,y:.84},
      {x:cx+.055,y:.54},{x:cx+.18,y:.59},{x:cx+.18,y:.84},
    ] as PosePoint[];
    if(legFamily==="locomotion") return [
      {x:cx-.055,y:.51},{x:cx-.14,y:.68},{x:cx-.23,y:.88},
      {x:cx+.055,y:.51},{x:cx+.16,y:.68},{x:cx+.25,y:.86},
    ] as PosePoint[];
    if(legFamily==="bend") return [
      {x:cx-.045,y:.57},{x:cx-.13,y:.72},{x:cx-.16,y:.9},
      {x:cx+.065,y:.55},{x:cx+.14,y:.7},{x:cx+.18,y:.88},
    ] as PosePoint[];
    return [
      {x:cx-.055,y:.52},{x:cx-.075,y:.7},{x:cx-.085,y:.9},
      {x:cx+.055,y:.52},{x:cx+.075,y:.7},{x:cx+.085,y:.9},
    ] as PosePoint[];
  };
  const applyFraming=(points:PosePoint[])=>{
    if(framingMode!=="upper_body") return points;
    const hiddenY:Record<number,number>={8:1.06,9:1.24,10:1.42,11:1.06,12:1.24,13:1.42};
    return points.map((point,index)=>hiddenY[index] == null ? point : {...point,y:hiddenY[index]});
  };
  let person:PosePoint[];
  let kind="single_action_standing_v1";
  if(family==="lie") {
    const nose={x:cx-.26,y:.45},neck={x:cx-.17,y:.48};
    person=[...face(nose,neck),{x:cx-.17,y:.41},{x:cx-.06,y:.39},{x:cx+.03,y:.4},{x:cx-.16,y:.55},{x:cx-.04,y:.58},{x:cx+.06,y:.58},{x:cx+.07,y:.45},{x:cx+.22,y:.43},{x:cx+.34,y:.46},{x:cx+.08,y:.56},{x:cx+.23,y:.6},{x:cx+.36,y:.58},...facial(nose)];
    kind="single_action_lie_v1";
  } else if(family==="recline") {
    const nose={x:cx-.12,y:.21},neck={x:cx-.07,y:.31};
    person=[...face(nose,neck),{x:cx-.14,y:.32},{x:cx-.16,y:.44},{x:cx-.1,y:.54},{x:cx+.01,y:.31},{x:cx+.08,y:.43},{x:cx+.13,y:.54},{x:cx-.01,y:.56},{x:cx-.1,y:.72},{x:cx-.19,y:.86},{x:cx+.09,y:.58},{x:cx+.19,y:.72},{x:cx+.27,y:.85},...facial(nose)];
    kind="single_action_recline_v1";
  } else {
    let nose={x:cx,y:.16},neck={x:cx,y:.27};
    let rightShoulder={x:cx-.09,y:.29},leftShoulder={x:cx+.09,y:.29};
    let rightElbow={x:cx-.13,y:.42},rightWrist={x:cx-.15,y:.56};
    let leftElbow={x:cx+.13,y:.42},leftWrist={x:cx+.15,y:.56};
    if(family==="self_touch") {
      rightElbow={x:cx-.11,y:.24}; rightWrist={x:cx-.025,y:.155};
      kind="single_action_self_touch_v1";
    } else if(family==="point") {
      const direction=ox<cx?-1:1;
      const targetX=Math.max(.12,Math.min(.88,Math.abs(ox-cx)>.08?ox:cx+direction*.3));
      if(direction>0){leftElbow={x:cx+.18,y:.31};leftWrist={x:targetX,y:Math.max(.24,oy-.12)};}
      else {rightElbow={x:cx-.18,y:.31};rightWrist={x:targetX,y:Math.max(.24,oy-.12)};}
      kind="single_action_point_v1";
    } else if(family==="operate_environment") {
      const targetX=Math.abs(ox-cx)>.08?ox:Math.min(.88,cx+.28);
      leftElbow={x:(cx+.09+targetX)/2,y:.31};leftWrist={x:targetX,y:Math.max(.26,Math.min(.5,oy-.1))};
      kind="single_action_operate_environment_v1";
    } else if(family==="reach") {
      const targetX=Math.abs(ox-cx)>.08?ox:Math.min(.88,cx+.26);
      leftElbow={x:(cx+.09+targetX)/2,y:.38};leftWrist={x:targetX,y:Math.max(.34,oy)};
      kind="single_action_reach_v1";
    } else if(family==="locomotion") {
      rightElbow={x:cx-.15,y:.39};rightWrist={x:cx-.2,y:.49};leftElbow={x:cx+.14,y:.37};leftWrist={x:cx+.2,y:.31};
      kind="single_action_moving_v1";
    } else if(family==="seated") {
      if(interaction.required){rightWrist={x:ox-.045,y:oy};leftWrist=interaction.handMode==="two"?{x:ox+.045,y:oy}:leftWrist;}
      kind="single_action_seated_v1";
    } else if(family==="bend") {
      nose={x:cx+.08,y:.27};neck={x:cx+.02,y:.34};rightShoulder={x:cx-.06,y:.32};leftShoulder={x:cx+.1,y:.38};
      kind="single_action_bend_v1";
    } else if(family==="turn") {
      nose={x:cx+.055,y:.16};rightShoulder={x:cx-.12,y:.31};leftShoulder={x:cx+.06,y:.27};
      kind="single_action_turn_v1";
    } else if(family==="head_gesture") {
      nose={x:cx,y:.12};neck={x:cx,y:.27};
      kind="single_action_head_gesture_v1";
    } else if(interaction.required) {
      rightWrist={x:ox-.045,y:oy};leftWrist=interaction.handMode==="two"?{x:ox+.045,y:oy}:leftWrist;
    }
    const legs=uprightLegs(family);
    person=[...face(nose,neck),rightShoulder,rightElbow,rightWrist,leftShoulder,leftElbow,leftWrist,...legs,...facial(nose)];
  }
  const framedPerson=applyFraming(person);
  const hiddenJointIndices=framingMode==="upper_body"?[8,9,10,11,12,13]:[];
  return {
    kind,
    source:"automatic_action_plan",
    selectorReason:actionPlan.required?actionPlan.reason:"recognized prop interaction requires visible arm geometry",
    actionFamily:family,
    framingMode,
    hiddenJointIndices,
    width,
    height,
    people:[framedPerson],
    svg:renderOpenPoseSvg([framedPerson],width,height),
  };
}

const poseInteractionInput = (interaction: InteractionContract): PoseInteractionInput => ({
  relationId: interaction.relationId,
  characterId: interaction.characterId,
  required: interaction.required,
  object: interaction.object,
  purpose: interaction.purpose,
  handMode: interaction.handMode,
  objectCenter: interaction.objectCenter,
  region: interaction.region,
  gazeMode: interaction.gazeMode,
});

export function buildSingleActionPoseSvg(shot:Shot,interaction:InteractionContract,width=512,height=512) {
  return buildPoseControlV2(shot, [poseInteractionInput(interaction)], width, height)
    || buildSingleActionPoseSvgLegacy(shot, interaction, width, height);
}

export function buildGenerationPrompt(
  shot: Shot,
  assets: Asset[],
  characters: Character[] = [],
) {
  const quality = analyzeGenerationPrompt(shot, characters, assets);
  const env = suggestEnvironment(shot);
  const cameraPrompt = resolveCameraPrompt(shot);
  const close = has(cameraPrompt, /close-?up|medium close/);
  const wide = has(cameraPrompt, /full shot|wide shot|long shot/);
  const framing = close
    ? "upper body framing, recognizable environmental context in soft depth"
    : wide
      ? "full body, complete limbs, both feet visible, strong environmental storytelling"
      : "natural torso framing, character clearly situated inside the environment";
  const sceneLead = unique([
    env.locationType,
    env.location,
    env.weather,
    env.timeVisual,
  ]);
  const sceneDetails = unique([
    env.foreground,
    env.midground,
    env.background,
    env.depth,
    env.keyLight,
    env.ambientLight,
    env.colorTemperature,
    env.atmosphere,
    shot.sceneEn,
  ]);
  const chosenWeight =
    env.emphasis === "high" ? 1.22 : env.emphasis === "low" ? 1.05 : 1.12;
  const sceneLeadBlock = wide
    ? `(narrative environment:${Math.max(1.15, chosenWeight)}), ${sceneLead.join(", ")}`
    : close
      ? `recognizable environment context, ${unique([env.location, env.timeVisual]).join(", ")}`
      : `(story environment:${Math.min(1.12, chosenWeight)}), ${sceneLead.join(", ")}`;
  const sceneDetailBlock = close
    ? unique([env.background, env.keyLight]).join(", ")
    : sceneDetails.join(", ");
  const interactionContracts=shot.characterIds.map((id)=>deriveInteractionContract(shot,id));
  const allInteractionContracts=shot.characterIds.flatMap((id)=>deriveInteractionContracts(shot,id));
  const characterBlocks = shot.characterIds.map((id, index) => {
    const character = characters.find((item) => item.id === id);
    if (!character) return "";
    const look = defaultLook(shot, character, index, assets);
    const outfit = assets.find(
      (asset) => asset.id === look.outfitId && asset.characterId === character.id,
    );
    const shoes = assets.find(
      (asset) => asset.id === look.shoeId && asset.characterId === character.id,
    );
    const hair =
      look.hairColorEn && look.hairStyleEn
        ? `(${clean(
            `${look.hairStyleEn.replace(/\bhair\b/gi, "")} ${look.hairColorEn.replace(/\bhair\b/gi, "")} hair`,
          )}:1.2)`
        : clean(`${look.hairStyleEn} ${look.hairColorEn}`);
    const interactionsForCharacter = allInteractionContracts.filter((item) => item.characterId === id);
    const interaction=interactionsForCharacter[0] || deriveInteractionContract(shot,id);
    return unique([
      look.positionEn,
      `(${stripTraits(character.appearanceEn)}:1.12)`,
      character.invariantsEn?.join(", ") || "",
      character.profile?.agePresentationEn || "",
      character.profile?.faceShapeEn || "",
      character.profile?.skinToneEn || "",
      character.profile?.bodyTypeEn || "",
      character.profile?.distinguishingFeaturesEn || "",
      hair,
      look.eyeColorEn ? `(${look.eyeColorEn}:1.15)` : "",
      resolveCharacterAssetDescription(outfit, character.profile?.baseOutfitEn)
        ? `(wearing exactly this selected outfit with the same garment type, cut, colors and layers: ${resolveCharacterAssetDescription(outfit, character.profile?.baseOutfitEn)}:1.25)`
        : "coherent adult outfit",
      resolveCharacterAssetDescription(shoes, character.profile?.baseShoesEn) ||
        "matching practical footwear",
      interactionsForCharacter.map((item) => canonicalActionForInteraction(look.actionEn, item)).join(", "),
      expressionPrompt(look.expressionEn),
      `(${look.gazeEn}, head and pupils aligned toward the action target:1.28)`,
      look.handsEn,
      ...interactionsForCharacter.flatMap((item) => item.positive),
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.hair || "" : "",
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.bag || "" : "",
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.accessories.join(", ") || "" : "",
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.glasses || "" : "",
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.outerwearState || "" : "",
      shot.visualSpecConfirmed ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.condition.join(", ") || "" : "",
    ]).join(", ");
  });
  const prompt = compactPrompt(unique([
    "(masterpiece, best quality:1.2)",
    "anime illustration, clean line art, soft cel shading",
    quality.countRule,
    cameraPrompt,
    framing,
    sceneLeadBlock,
    shot.visualSpecConfirmed ? shot.visualSpec?.visibleFacts.join(", ") || "" : "",
    ...characterBlocks,
    shot.visualSpecConfirmed && shot.visualSpec?.interactions?.length
      ? shot.visualSpec.interactions.map((item) => `${item.type}, ${item.actorCharacterId} ${item.action} toward ${item.targetCharacterId || item.propId}, ${item.contactPoints.join(" and ")}, ${item.phase}`).join(", ") : "",
    sceneDetailBlock,
    quality.characterCount > 1 &&
    has(shot.compositionEn, /one woman|single woman|solo|1girl/)
      ? `${quality.characterCount} distinct women separated in the frame with readable space between them`
      : shot.compositionEn,
    "natural adult anatomy, coherent pose, no text, no speech bubbles, no captions",
  ]).join(", "), close ? 58 : wide ? 82 : 72);
  const countNegative =
    quality.characterCount === 1
      ? "2girls, multiple girls, extra person, duplicate, clone, twins, split screen, collage, diptych, character sheet, turnaround sheet"
      : "extra person, duplicate character, cloned character, merged bodies, fused faces, swapped clothes";
  const gazeNegative = shot.characterIds.some((id,index)=>{const character=characters.find((item)=>item.id===id);return character?!explicitlyAllowsCameraGaze(defaultLook(shot,character,index,assets).gazeEn):false;})
    ? "looking at viewer, eye contact with camera, front-facing portrait gaze, pupils aimed at camera"
    : "";
  const environmentNegative = close
    ? "studio portrait backdrop"
    : "plain background, empty background, studio backdrop, gradient background, featureless background, excessive background blur";
  const earNegative = characters
    .filter((character) => shot.characterIds.includes(character.id))
    .every((character) => ![...(character.invariantsEn || []), character.appearanceEn || ""].some((value) => /elf|animal ear|兽耳|精灵耳/i.test(value)))
    ? "pointed ears, elf ears, animal ears"
    : "";
  const negativePrompt = compactPrompt(unique([
    "(low quality, worst quality:1.4), (blurry:1.2), bad anatomy, bad hands, extra fingers, missing fingers",
    "ugly, deformed, crossed eyes, asymmetrical eyes, distorted face, unnatural expression, identity drift, inconsistent face, wrong hair color, wrong eye color, wrong garment category, wrong garment length, wrong clothing colors",
    earNegative,
    countNegative,
    gazeNegative,
    ...interactionContracts.flatMap((item)=>item.negative),
    environmentNegative,
    "blown highlights, overexposed face, clipped white clothing, unreadable facial expression",
    close ? "full body, full-length figure, visible legs, visible shoes, standing portrait" : "",
    wide ? "cropped feet, missing legs, floating limbs, unbalanced stance" : "",
    "child, chibi, nsfw, 3d, realistic, monochrome, grayscale, text, letters, watermark, logo",
    shot.negativePromptEn,
    ...characters
      .filter((character) => shot.characterIds.includes(character.id))
      .map((character) => character.profile?.outfitNegativeEn || ""),
  ]).join(", "), 58);
  const compiledLooks: Record<string, CharacterLook> = {};
  shot.characterIds.forEach((id, index) => {
    const character = characters.find((item) => item.id === id);
    if (character) compiledLooks[id] = defaultLook(shot, character, index, assets);
  });
  return {
    prompt,
    negativePrompt,
    quality,
    environment: env,
    characterLooks: compiledLooks,
  };
}

export function buildRegionalPrompt(
  shot: Shot,
  assets: Asset[],
  characters: Character[] = [],
) {
  const quality = analyzeGenerationPrompt(shot, characters, assets);
  const risk = deriveShotRiskProfile(shot);
  const env = suggestEnvironment(shot);
  const resolvedCamera = resolveCameraPrompt(shot);
  const isMulti=quality.characterCount>1;
  const camera = `${resolvedCamera}, ${isMulti?"multi-character narrative composition":"single-character narrative composition"}`;
  const mediumOrClose = /waist-up|chest-up|head-and-shoulders|close-up/i.test(resolvedCamera);
  const plannedInteractions = shot.visualSpecConfirmed
    ? (shot.visualSpec?.interactions?.length
        ? shot.visualSpec.interactions
        : shot.visualSpec?.interaction
          ? [{...shot.visualSpec.interaction,action:"perform the described interaction",contactPoints:[shot.visualSpec.interaction.contactPoint],gazeTarget:"the interaction target",ownershipBefore:null,ownershipAfter:null}]
          : [])
    : [];
  const plannedInteractionText = plannedInteractions.map((item) => [item.type,item.propId,item.actorCharacterId,item.targetCharacterId,item.action,item.phase,...item.contactPoints,item.gazeTarget].join(" ")).join("; ");
  const usePlannedInteraction = Boolean(plannedInteractions.length && !containsCjk(plannedInteractionText));
  const hasObjectTransfer = plannedInteractions.some((item)=>item.type === "object_transfer") || umbrellaStory(shot);
  const hasUmbrellaHandover = hasObjectTransfer && (!plannedInteractions.some((item)=>item.propId) || plannedInteractions.some((item)=>/umbrella|伞/i.test(item.propId)));
  const sharedInteraction = usePlannedInteraction
    ? plannedInteractions.map((item)=>`${item.type} involving ${item.propId || "a character target"}, actor ${item.actorCharacterId}, target ${item.targetCharacterId || item.propId}, action ${item.action}, contact at ${item.contactPoints.join(" and ")}, gaze toward ${item.gazeTarget}, action phase ${item.phase}`).join("; ")
    : hasUmbrellaHandover
    ? "clear umbrella handover at the center of the frame, the woman on the right still holds the umbrella and visibly extends its handle toward the woman on the left, the woman on the left visibly reaches to accept it, their open hands approach the same handle without touching each other, both women look at each other, narrative instant before the receiver takes possession, the giver remains the sole holder of the umbrella"
    : "both people visibly performing the same shared story event, clear cause-and-response body language";
  const rainDetails = /雨|rain/i.test(`${shot.scene} ${shot.description} ${env.weather}`)
    ? "active rain visibly falling, wet reflective pavement, umbrella droplets, puddle ripples"
    : env.weather;
  const principalCount = quality.characterCount > 1
    ? `exactly ${quality.characterCount} clearly rendered foreground principal adult women, sparse tiny blurred anonymous pedestrian silhouettes only in the far background`
    : quality.countRule;
  const basePrompt = sanitizeEnglishPrompt(compactPrompt(unique([
    "(masterpiece, best quality:1.2)",
    "anime illustration, clean line art, soft cel shading",
    principalCount,
    `${camera}, ${isMulti?"all faces clearly readable, complete interacting arms visible":"face and acting hands clearly readable"}${mediumOrClose ? ", strict crop at the waist, no legs or full bodies" : ""}${hasObjectTransfer?", the handover centered between them":""}`,
    env.locationType,
    env.location,
    env.foreground,
    env.midground,
    env.background,
    env.depth,
    rainDetails,
    env.timeVisual,
    env.keyLight,
    env.ambientLight,
    isMulti?`(shared character interaction:1.3), ${sharedInteraction}`:"",
    isMulti?"single continuous narrative scene, strong subject separation, all people sharing the same environment, no split screen":"single continuous narrative scene, the character performs the story action instead of posing",
    hasUmbrellaHandover?"soft frontal fill light on both faces, both eyes fully visible, no deep umbrella shadow across the eyes, umbrella edges remain above and behind the heads":"readable motivated light on the face, hands, and story prop",
  ]).join(", "), 72));
  const characterRegions: RegionalCharacterRegion[] = shot.characterIds.map((id, index) => {
    const character = characters.find((item) => item.id === id);
    if (!character)
      return { characterId: id, characterName: "unknown", side: "center", region: {xStart:0,xEnd:1}, prompt: "", assetWarnings: ["人物不存在"], assetBindings: [] };
    const look = defaultLook(shot, character, index, assets);
    const interaction=deriveInteractionContract(shot,id);
    const outfit = assets.find(
      (asset) => asset.id === look.outfitId && asset.characterId === character.id,
    );
    const shoes = assets.find(
      (asset) => asset.id === look.shoeId && asset.characterId === character.id,
    );
    const face = character.references.find((reference) => reference.type === "face" && reference.confirmed);
    const assetWarnings = [
      !outfit ? `${character.name}未选择已确认服装资产，使用人物档案文字兜底` : "",
      !shoes ? `${character.name}未选择已确认鞋履资产，使用人物档案文字兜底` : "",
    ].filter(Boolean);
    const prompt = sanitizeEnglishPrompt(compactPrompt(unique([
      "one adult woman",
      englishVisual(look.positionEn, index === 0 ? "on the left" : "on the right"),
      englishVisual(stripTraits(character.appearanceEn)) ? `(${englishVisual(stripTraits(character.appearanceEn))}:1.2)` : "",
      englishVisual(character.profile?.faceShapeEn) ? `(${englishVisual(character.profile?.faceShapeEn)}:1.22)` : "",
      englishVisual(character.profile?.skinToneEn) ? `(${englishVisual(character.profile?.skinToneEn)}, clean consistent natural skin:1.15)` : "",
      englishVisual(character.profile?.bodyTypeEn) ? `(${englishVisual(character.profile?.bodyTypeEn)}:1.1)` : "",
      englishVisual(character.profile?.distinguishingFeaturesEn) ? `(${englishVisual(character.profile?.distinguishingFeaturesEn)}:1.18)` : "",
      character.invariantsEn?.length ? `(${englishVisual(character.invariantsEn.join(", "), "canonical character invariants")}:1.28)` : "",
      `(exact canonical hair color and hairstyle, ${englishVisual(clean(`${look.hairStyleEn} ${look.hairColorEn}`), "hair matching the identity reference")}:1.45)`,
      englishVisual(look.eyeColorEn) ? `(${englishVisual(look.eyeColorEn)}:1.25)` : "",
      resolveCharacterAssetDescription(outfit, character.profile?.baseOutfitEn)
        ? `(wearing exactly the selected outfit, preserve its garment category, cut, layers and colors, ${resolveCharacterAssetDescription(outfit, character.profile?.baseOutfitEn)}:1.35)`
        : "coherent adult outfit",
      resolveCharacterAssetDescription(shoes, character.profile?.baseShoesEn),
      englishVisual(canonicalActionForInteraction(look.actionEn, interaction), "performing the current story action"),
      englishVisual(expressionPrompt(look.expressionEn), "readable story-appropriate expression"),
      `(${englishVisual(look.gazeEn, inferGazeFromAction(look.actionEn))}, head and pupils aligned toward the action target:1.3)`,
      englishVisual(look.handsEn, "hands following the described action"),
      ...interaction.positive,
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.hair) : "",
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.bag) : "",
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.accessories.join(", ")) : "",
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.glasses) : "",
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.outerwearState) : "",
      shot.visualSpecConfirmed ? englishVisual(shot.visualSpec?.characters.find((item)=>item.characterId===id)?.appearanceState.condition.join(", ")) : "",
      isMulti?"interacting with the other people rather than posing for a portrait":"performing the specified action rather than posing for a portrait",
      "same established facial identity, readable symmetrical eyes, defined facial features",
    ]).join(", "), 42));
    return {
      characterId: id,
      characterName: character.name,
      side: shot.characterIds.length === 1 ? "center" : index === 0 ? "left" : "right",
      region: shot.visualSpecConfirmed
        ? shot.visualSpec?.characters.find((item)=>item.characterId===id)?.region || {xStart:index/shot.characterIds.length,xEnd:(index+1)/shot.characterIds.length}
        : {xStart:index/shot.characterIds.length,xEnd:(index+1)/shot.characterIds.length},
      prompt,
      assetWarnings,
      assetBindings: [
        face ? { characterId: id, role: "identity" as const, assetId: character.id, path: face.path, source: "selected_asset" as const } : null,
        outfit ? { characterId: id, role: "outfit" as const, assetId: outfit.id, path: outfit.path, source: "selected_asset" as const } : { characterId: id, role: "outfit" as const, assetId: look.outfitId || "profile", path: "", source: character.profile?.baseOutfitEn ? "profile_text" as const : "generic_fallback" as const },
        shoes ? { characterId: id, role: "shoes" as const, assetId: shoes.id, path: shoes.path, source: "selected_asset" as const } : { characterId: id, role: "shoes" as const, assetId: look.shoeId || "profile", path: "", source: character.profile?.baseShoesEn ? "profile_text" as const : "generic_fallback" as const },
      ].filter(Boolean) as RegionalCharacterRegion["assetBindings"],
    };
  });
  const negativeBlocks = {
    quality: "(low quality, worst quality:1.4), blurry face, featureless face, muddy details",
    identity: "identity drift, wrong face shape, wrong hair or eye color, swapped identities, merged faces, swapped clothes, wrong garment category, wrong garment length, wrong clothing colors, pointed ears, elf ears, animal ears",
    anatomy: "deformed limbs, extra or missing limbs, fused hands, malformed wrists, extra or missing fingers",
    interaction: hasObjectTransfer ? "holding hands, linked arms, posing for camera, both people incorrectly owning the same prop, disconnected prop, unclear transfer" : "static portrait pose, unrelated actions",
    weather: (hasUmbrellaHandover || /雨|rain/i.test(`${shot.scene} ${shot.description}`)) ? "dry pavement, no falling rain, sunny weather, umbrella edge crossing a face, deep shadow across eyes" : "",
    composition: quality.characterCount > 1 ? "extra foreground principal person, third detailed foreground character, crowded foreground, duplicated woman, clone, twins, split screen, collage, character sheet" : "extra person, duplicate",
    text: "child, chibi, nsfw, 3d, photorealistic, monochrome, grayscale, text, letters, watermark, logo, speech bubbles, captions",
  };
  if(characterRegions.some((region)=>!explicitlyAllowsCameraGaze(region.prompt)))negativeBlocks.composition += ", looking at viewer, eye contact with camera, front-facing portrait gaze";
  const interactionContracts=shot.characterIds.map((id)=>deriveInteractionContract(shot,id));
  const allInteractionContracts=shot.characterIds.flatMap((id)=>deriveInteractionContracts(shot,id));
  negativeBlocks.interaction=[negativeBlocks.interaction,...allInteractionContracts.flatMap((item)=>item.negative)].filter(Boolean).join(", ");
  const outfitNegatives = characters
    .filter((character) => shot.characterIds.includes(character.id))
    .map((character) => character.profile?.outfitNegativeEn || "")
    .filter(Boolean)
    .join(", ");
  negativeBlocks.identity = [negativeBlocks.identity, outfitNegatives].filter(Boolean).join(", ");
  const negativePrompt = sanitizeEnglishPrompt(compactPrompt(Object.values(negativeBlocks).filter(Boolean).join(", "),60)) + ", deep shadow across eyes";
  const regionPrompts = characterRegions.map((region) => region.prompt);
  const characterInteractionContracts = shot.characterIds.flatMap((id) => deriveInteractionContracts(shot, id));
  const poseControl = risk.poseRequired
    ? buildPoseControlV2(
        shot,
        characterInteractionContracts.map(poseInteractionInput),
        512,
        /wide shot|full shot/i.test(resolvedCamera) ? 768 : 512,
      )
    : null;
  return {
    commonPrompt: basePrompt,
    basePrompt,
    regionPrompts,
    prompt: [basePrompt, ...regionPrompts].join(" BREAK "),
    characterRegions,
    negativeBlocks,
    negativePrompt,
    assetBindings: characterRegions.flatMap((region) => region.assetBindings),
    assetWarnings: characterRegions.flatMap((region) => region.assetWarnings),
    poseControl,
    repairPasses: {
      identity:risk.identityRepairRequired,
      handoff:hasUmbrellaHandover,
      handoffPrompt:hasUmbrellaHandover?sharedInteraction:"",
      propInteraction: risk.propRepairRequired ? allInteractionContracts.find((item)=>item.required) || null : null,
      propInteractions: risk.propRepairRequired ? allInteractionContracts.filter((item)=>item.required) : [],
      risk,
      gaze: risk.gazeRepairRequired,
      depth: risk.depthGuideRequired,
    },
  };
}

export function containsCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

export function classifyOutfitConditioning(camera: string, isolated: boolean, adapterAvailable: boolean) {
  const wide = /远景|全景|wide shot|full shot/i.test(camera);
  const applied = wide && isolated && adapterAvailable;
  return {
    status: applied ? "control_applied" as const : "text_only" as const,
    safety: applied ? "wide_or_full_isolated_only" as const : wide ? "text_only_reference_or_adapter_unavailable" as const : "text_only_close_or_medium" as const,
    controlApplied: applied,
  };
}

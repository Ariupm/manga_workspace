import { createHash } from "node:crypto";
import type { Asset, ChapterVisualPlan, Character, Shot, ShotVisualSpec, VisualValidationResult } from "./types";

export const VISUAL_SCHEMA_VERSION = "1.0" as const;
export const dependencyHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = "unknown") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const meaningful = (value: unknown) => typeof value === "string" && Boolean(value.trim()) && !/^(unknown|specific story location|coherent everyday environment|cozy home interior|calm dry weather|daytime|motivated soft (?:directional|key) light(?: with readable ambient fill)?|natural storytelling action|gentle, natural expression|looking toward the story focus|hands out of frame|clear storytelling composition)$/i.test(value.trim());
const resolved = (value: unknown, fallback: string) => meaningful(value) ? String(value).trim() : fallback;
const englishTime = (value: string) => /夜|晚/.test(value) ? "evening" : /晨|早/.test(value) ? "morning" : /午/.test(value) ? "afternoon" : "daytime";
const inferredWeather = (shot: Shot) => /雨|伞|rain/i.test(`${shot.scene} ${shot.description}`) ? "visible steady rain" : "calm dry weather";
const genericInteractionTarget = /^(?:the )?(?:current )?(?:story|interaction|action) (?:focus|target)|^(?:the )?current story focus$/i;
const propSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "");
const inferInteractionProp = (target: string, source: string, targetIsCharacter: boolean) => {
  const known: Array<[RegExp,string]> = [
    [/smartphone|phone screen|mobile phone|cell phone|手机/i,"smartphone"],
    [/umbrella|parasol|雨伞/i,"umbrella"],
    [/book|document|letter|page|magazine/i,"book_or_document"],
    [/package|parcel|delivery box/i,"package"],
    [/screwdriver|hammer|wrench|pliers|scissors|handheld tool/i,"handheld_tool"],
    [/cup|mug|glass|bottle/i,"drink_container"],
    [/handbag|backpack|purse|\bbag\b/i,"bag"],
  ];
  const knownMatch=known.find(([pattern])=>pattern.test(`${target} ${source}`));
  if(knownMatch)return knownMatch[1];
  if(target&&!genericInteractionTarget.test(target)&&!targetIsCharacter)return propSlug(target);
  const described=source.match(/\b(?:hold(?:ing)?|read(?:ing)?|us(?:e|ing)|operat(?:e|ing)|inspect(?:ing)?|carry(?:ing)?|open(?:ing)?)\s+(?:a|an|the)?\s*([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})/i)?.[1]||"";
  return described&&!genericInteractionTarget.test(described)?propSlug(described):"";
};
const boundedRegion = (value: any, index: number, count: number) => {
  const fallbackStart = index / Math.max(1, count);
  const fallbackEnd = (index + 1) / Math.max(1, count);
  const xStart = Math.max(0, Math.min(0.95, Number(value?.xStart ?? fallbackStart)));
  const xEnd = Math.max(xStart + 0.05, Math.min(1, Number(value?.xEnd ?? fallbackEnd)));
  return { xStart, xEnd };
};

export function assertVisualShape(kind: "chapter" | "shot", raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("视觉规划不是 JSON 对象。");
  const required = kind === "chapter"
    ? ["scenes", "timeline", "warnings"]
    : ["visibleFacts", "scene", "characters", "camera", "stateChanges", "warnings"];
  for (const key of required) if (!(key in raw)) throw new Error(`视觉规划缺少字段：${key}`);
  const arrays = kind === "chapter" ? ["scenes", "timeline", "warnings"] : ["visibleFacts", "characters", "stateChanges", "warnings"];
  for (const key of arrays) if (!Array.isArray(raw[key])) throw new Error(`视觉规划字段 ${key} 必须是数组。`);
  if (kind === "shot" && (typeof raw.scene !== "object" || typeof raw.camera !== "object")) throw new Error("镜头场景或相机字段无效。");
  if (kind === "shot" && !("interactions" in raw) && !("interaction" in raw)) throw new Error("视觉规划缺少字段：interactions");
  if (kind === "shot" && "interactions" in raw && !Array.isArray(raw.interactions)) throw new Error("视觉规划字段 interactions 必须是数组。");
}

export function normalizeChapterPlan(raw: any): ChapterVisualPlan {
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    scenes: array(raw?.scenes).map((item: any, index) => ({
      id: text(item?.id, `scene_${index + 1}`), location: resolved(item?.location, `specific story location ${index + 1}`),
      timeOfDay: resolved(item?.timeOfDay, "daytime"), weather: resolved(item?.weather, "calm dry weather"),
      anchors: array(item?.anchors).map((x) => text(x)).filter((x) => x !== "unknown"),
      lighting: resolved(item?.lighting, "motivated soft directional light with readable ambient fill"),
    })),
    timeline: array(raw?.timeline).map((item: any, index) => ({
      order: Number(item?.order) || index + 1, sceneId: text(item?.sceneId), summary: text(item?.summary),
      characterStates: array(item?.characterStates).map((state: any) => ({
        characterId: text(state?.characterId, ""), hair: resolved(state?.hair,"hair unchanged from the identity reference"), outfitId: text(state?.outfitId, ""),
        shoeId: text(state?.shoeId, ""), bag: resolved(state?.bag,"no visible bag"), accessories: array(state?.accessories).map((x) => text(x)).filter(meaningful),
        glasses: resolved(state?.glasses,"no glasses"), outerwearState: resolved(state?.outerwearState,"no visible outerwear change"), condition: array(state?.condition).map((x) => text(x)).filter(meaningful),
        position: resolved(state?.position,"position consistent with the previous panel"), lastAction: resolved(state?.lastAction,"continuing the visible story action"),
      })),
      propStates: array(item?.propStates).map((state: any) => ({ id: text(state?.id, ""), name: text(state?.name),
        ownerCharacterId: typeof state?.ownerCharacterId === "string" ? state.ownerCharacterId : null,
        location: resolved(state?.location,"near the acting character"), state: resolved(state?.state,"stable and clearly visible") })),
      continuityNotes: array(item?.continuityNotes).map((x) => text(x)),
    })),
    warnings: array(raw?.warnings).map((x) => text(x)),
  };
}

export function normalizeShotSpec(raw: any, shot: Shot): ShotVisualSpec {
  const rawCharacters = array(raw?.characters);
  const normalizedCharacters = shot.characterIds.map((characterId, index) => {
    const item: any = rawCharacters.find((x: any) => x?.characterId === characterId) || {};
    const look = shot.characterLooks?.[characterId];
    return { characterId, outfitId: text(item.outfitId, "") || look?.outfitId || shot.outfitId, shoeId: text(item.shoeId, "") || look?.shoeId || shot.shoeId,
      position: meaningful(look?.positionEn) ? look!.positionEn : resolved(item.position,index===0?"left side of the frame":"right side of the frame"), region: boundedRegion(item.region, index, shot.characterIds.length),
      action: meaningful(look?.actionEn) ? look!.actionEn : meaningful(shot.actionEn) ? shot.actionEn : resolved(item.action,"performing the current story action"), actionTarget: resolved(item.actionTarget,"the current story focus"),
      expression: meaningful(look?.expressionEn) ? look!.expressionEn : meaningful(shot.expressionEn) ? shot.expressionEn : resolved(item.expression,"readable attentive expression"), expressionReason: resolved(item.expressionReason,"responding to the visible event"),
      gazeTarget: meaningful(look?.gazeEn) ? look!.gazeEn : resolved(item.gazeTarget,"looking toward the current story focus"), hands: meaningful(look?.handsEn) ? look!.handsEn : resolved(item.hands,"both visible hands follow the described action"), occlusion: resolved(item.occlusion,"face and action remain unobstructed"),
      appearanceState:{hair:resolved(item?.appearanceState?.hair,"hair unchanged from the identity reference"),bag:resolved(item?.appearanceState?.bag,"no visible bag"),accessories:array(item?.appearanceState?.accessories).map((x)=>text(x)).filter(meaningful),glasses:resolved(item?.appearanceState?.glasses,"no glasses"),outerwearState:resolved(item?.appearanceState?.outerwearState,"no visible outerwear change"),condition:array(item?.appearanceState?.condition).map((x)=>text(x)).filter(meaningful)} };
  });
  const normalizeInteraction = (item: any) => ({
    type: text(item?.type), actorCharacterId: text(item?.actorCharacterId, ""), targetCharacterId: text(item?.targetCharacterId, ""),
    propId: text(item?.propId, ""), action: text(item?.action, "perform the described interaction"), phase: text(item?.phase, "in progress"),
    contactPoints: array(item?.contactPoints || (item?.contactPoint ? [item.contactPoint] : [])).map((x) => text(x)).filter(meaningful),
    gazeTarget: text(item?.gazeTarget, ""), ownershipBefore: typeof item?.ownershipBefore === "string" ? item.ownershipBefore : null,
    ownershipAfter: typeof item?.ownershipAfter === "string" ? item.ownershipAfter : null,
  });
  const suppliedInteractions = array(raw?.interactions || (raw?.interaction ? [raw.interaction] : [])).map(normalizeInteraction);
  const facts = array(raw?.visibleFacts).map((x) => text(x)).join(" ");
  const inferredInteractions = suppliedInteractions.length ? [] : normalizedCharacters.flatMap((character) => {
    const source = `${character.action} ${character.actionTarget} ${character.hands} ${character.gazeTarget} ${facts}`;
    const actionable = /\b(?:hold|holding|held|read|reading|use|using|operate|operating|pass|passing|hand|handing|give|giving|receive|receiving|take|taking|reach|reaching|touch|touching|carry|carrying|open|opening|write|writing|pour|pouring|show|showing|inspect|inspecting)\b|拿|持|读|看手机|使用|操作|递|交接|接过|触碰|打开|书写/i.test(source);
    const handsParticipate = meaningful(character.hands) && !/hands? out of frame|no visible hands?/i.test(character.hands);
    const target = meaningful(character.actionTarget) ? character.actionTarget.trim() : "";
    if (!actionable || !handsParticipate) return [];
    const targetCharacterId = shot.characterIds.find((id) => id !== character.characterId && new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(source)) || "";
    const targetIsCharacter = targetCharacterId && new RegExp(`\\b${targetCharacterId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(target);
    const propId = inferInteractionProp(target,source,Boolean(targetIsCharacter));
    return [{
      type: /\b(?:pass|hand|give|receive|take)\b|递|交接|接过/i.test(character.action) ? "object_transfer" : "prop_interaction",
      actorCharacterId: character.characterId,
      targetCharacterId,
      propId,
      action: character.action,
      phase: "in progress",
      contactPoints: [character.hands],
      gazeTarget: character.gazeTarget,
      ownershipBefore: null,
      ownershipAfter: null,
    }];
  });
  const interactions = suppliedInteractions.length ? suppliedInteractions : inferredInteractions;
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    visibleFacts: array(raw?.visibleFacts).map((x) => text(x)).filter(meaningful).length ? array(raw?.visibleFacts).map((x) => text(x)).filter(meaningful) : [resolved(shot.actionEn,"the character performs the current story action")],
    scene: { sceneId: resolved(raw?.scene?.sceneId,"current_scene"), location: resolved(raw?.scene?.location,resolved(shot.sceneEn,"specific story location")), timeOfDay: resolved(raw?.scene?.timeOfDay,englishTime(shot.timeOfDay)),
      weather: resolved(raw?.scene?.weather,inferredWeather(shot)), anchors: array(raw?.scene?.anchors).map((x) => text(x)).filter(meaningful), lighting: resolved(raw?.scene?.lighting,resolved(shot.lightingEn,"motivated soft key light with readable ambient fill")) },
    characters: normalizedCharacters,
    interaction: raw?.interaction ? { type: text(raw.interaction.type), propId: text(raw.interaction.propId, ""),
      actorCharacterId: text(raw.interaction.actorCharacterId, ""), targetCharacterId: text(raw.interaction.targetCharacterId, ""),
      contactPoint: text(raw.interaction.contactPoint), phase: text(raw.interaction.phase) } : null,
    interactions,
    camera: { shotSize: resolved(shot.cameraEn,resolved(raw?.camera?.shotSize,"medium shot")), angle: resolved(raw?.camera?.angle,"eye-level angle"), axis: resolved(raw?.camera?.axis,"consistent screen direction"),
      focus: resolved(raw?.camera?.focus,"focus on the acting character and story prop"), composition: resolved(shot.compositionEn,resolved(raw?.camera?.composition,"balanced narrative composition with readable action")) },
    stateChanges: array(raw?.stateChanges).map((x) => typeof x === "string" ? ({note: text(x)}) : ({
      characterId: typeof x?.characterId === "string" ? x.characterId : undefined, propId: typeof x?.propId === "string" ? x.propId : undefined,
      ownerCharacterId: typeof x?.ownerCharacterId === "string" ? x.ownerCharacterId : null, position: typeof x?.position === "string" ? x.position : undefined,
      direction: typeof x?.direction === "string" ? x.direction : undefined, actionPhase: typeof x?.actionPhase === "string" ? x.actionPhase : undefined,
      outfitId: typeof x?.outfitId === "string" ? x.outfitId : undefined, note: text(x?.note),
    })), warnings: array(raw?.warnings).map((x) => text(x)).filter(meaningful), conflicts: [],
  };
}

export function inheritShotContinuity(spec:ShotVisualSpec,previous:ShotVisualSpec|null,plan:ChapterVisualPlan|null) {
  const inherited:ShotVisualSpec=JSON.parse(JSON.stringify(spec));
  const planScene=plan?.scenes.find((x)=>x.id===inherited.scene.sceneId);
  for(const key of ["location","timeOfDay","weather","lighting"] as const) {
    if(!meaningful(inherited.scene[key])) inherited.scene[key]=meaningful(previous?.scene[key])?previous!.scene[key]:meaningful(planScene?.[key])?String(planScene![key]):key==="weather"?"calm dry weather":key==="lighting"?"motivated soft directional light":key==="timeOfDay"?"daytime":"specific story location";
  }
  if(!inherited.scene.anchors.length) inherited.scene.anchors=previous?.scene.anchors.length?[...previous.scene.anchors]:planScene?.anchors?[...planScene.anchors]:[];
  for(const character of inherited.characters) {
    const before=previous?.characters.find((x)=>x.characterId===character.characterId);
    if(!meaningful(character.position)&&before)character.position=before.position;
    if(!character.outfitId&&before)character.outfitId=before.outfitId;
    if(!character.shoeId&&before)character.shoeId=before.shoeId;
    if(before){for(const key of ["hair","bag","glasses","outerwearState"] as const)if(!meaningful(character.appearanceState[key]))character.appearanceState[key]=before.appearanceState[key];if(!character.appearanceState.accessories.length)character.appearanceState.accessories=[...before.appearanceState.accessories];if(!character.appearanceState.condition.length)character.appearanceState.condition=[...before.appearanceState.condition];}
  }
  return inherited;
}

export function validateVisualIds(value: ChapterVisualPlan | ShotVisualSpec, characters: Character[], assets: Asset[]): VisualValidationResult {
  const characterIds = new Set(characters.map((x) => x.id));
  const assetIds = new Set(assets.map((x) => x.id));
  const byAssetId = new Map(assets.map((x)=>[x.id,x]));
  const errors: string[] = [], warnings: string[] = [], conflicts: string[] = [];
  const states = "timeline" in value ? value.timeline.flatMap((x) => x.characterStates) : value.characters;
  for (const state of states) {
    if (!characterIds.has(state.characterId)) errors.push(`未知角色 ID：${state.characterId}`);
    if (state.outfitId && !assetIds.has(state.outfitId)) errors.push(`未知服装 ID：${state.outfitId}`);
    if (state.shoeId && !assetIds.has(state.shoeId)) errors.push(`未知鞋履 ID：${state.shoeId}`);
    const outfit=state.outfitId?byAssetId.get(state.outfitId):undefined;
    const shoes=state.shoeId?byAssetId.get(state.shoeId):undefined;
    if(outfit&&outfit.characterId!==state.characterId)errors.push(`服装 ${outfit.id} 不属于角色 ${state.characterId}`);
    if(shoes&&shoes.characterId!==state.characterId)errors.push(`鞋履 ${shoes.id} 不属于角色 ${state.characterId}`);
    if(outfit&&outfit.type!=="outfit")errors.push(`${outfit.id} 不是服装资产`);
    if(shoes&&shoes.type!=="shoes")errors.push(`${shoes.id} 不是鞋履资产`);
  }
  const props = "timeline" in value ? value.timeline.flatMap((x) => x.propStates) : [];
  for (const prop of props) if (prop.ownerCharacterId && !characterIds.has(prop.ownerCharacterId)) errors.push(`道具 ${prop.id} 指向未知角色`);
  const failures: NonNullable<VisualValidationResult["failures"]> = [];
  if ("characters" in value) {
    if (value.characters.length === 0) failures.push({ code: "count_failed", severity: "P0", message: "镜头没有可见人物。" });
    if (value.characters.some((x) => x.region.xEnd <= x.region.xStart || x.region.xStart < 0 || x.region.xEnd > 1)) {
      failures.push({ code: "anatomy_failed", severity: "P0", message: "人物区域必须是 0–1 范围内的有效区间。" });
    }
    const ids = value.characters.map((x) => x.characterId);
    if (new Set(ids).size !== ids.length) failures.push({ code: "count_failed", severity: "P0", message: "镜头包含重复角色 ID。" });
    for (const character of value.characters) {
      if (!character.action?.trim() || !character.actionTarget?.trim() || !character.hands?.trim()) failures.push({ code: "interaction_failed", severity: "P0", message: `角色 ${character.characterId} 缺少动作、动作目标或手部说明。` });
      if (!character.gazeTarget?.trim()) failures.push({ code: "gaze_failed", severity: "P0", message: `角色 ${character.characterId} 缺少视线目标。` });
    }
    for (const relation of value.interactions || []) {
      if (!relation.actorCharacterId || (!relation.targetCharacterId && !relation.propId) || !relation.action?.trim() || !relation.phase?.trim() || !relation.contactPoints?.length) failures.push({ code: "interaction_failed", severity: "P0", message: "交互关系缺少参与者、目标、动作阶段或接触点。" });
      if (!relation.gazeTarget?.trim()) failures.push({ code: "gaze_failed", severity: "P0", message: "交互关系缺少必要视线目标。" });
      if (relation.actorCharacterId && !characterIds.has(relation.actorCharacterId)) failures.push({ code: "interaction_failed", severity: "P0", message: `交互指向未知角色：${relation.actorCharacterId}` });
      if (relation.targetCharacterId && !characterIds.has(relation.targetCharacterId)) failures.push({ code: "interaction_failed", severity: "P0", message: `交互目标指向未知角色：${relation.targetCharacterId}` });
    }
  }
  if (errors.length) failures.push(...errors.map((message) => ({ code: message.includes("角色") ? "identity_failed" as const : "interaction_failed" as const, severity: "P0" as const, message })));
  const blocked = failures.some((failure) => failure.severity === "P0");
  return { valid: errors.length === 0 && !blocked, errors, warnings, conflicts, failures, blocked };
}

export const chapterSystemPrompt = `You are a visual continuity director for serialized anime comics. Output JSON only. Use only supplied character and asset IDs. Every descriptive value, warning and note must be English; IDs must remain unchanged. Describe visible facts, persistent states, locations, weather, lighting, props and continuity. When a harmless visual detail is missing, infer one plausible production-ready choice from the story, character profile, adjacent shots and genre. Never write "unknown", never invent an ID, and never add a new plot event.`;
export const shotSystemPrompt = `You are a storyboard visual director for Stable Diffusion. Output JSON only. Every descriptive value, warning and note must be English; supplied IDs must remain unchanged. Convert narrative meaning into directly visible facts and precise subject-action-target relationships. Always output an interactions array. It may be empty only for a genuinely static shot with no person-person or person-prop action. Every explicit prop operation, hand contact, handoff, or multi-subject action must have one complete interactions entry with type, actorCharacterId, targetCharacterId or propId, action, phase, contactPoints, gazeTarget, ownershipBefore, and ownershipAfter; emit multiple entries when the shot contains multiple relations. For every character describe position, normalized xStart/xEnd region, concrete action, actionTarget, facial expression, expressionReason, gazeTarget, visible hands, occlusion, outfitId, shoeId, and appearanceState containing hair, bag, accessories, glasses, outerwearState and visible condition. Describe a physically specific location, time, weather, architectural or furniture anchors, motivated lighting, camera size, angle, axis, focus and composition. Preserve explicit manual camera, character, outfit and shoe selections. Infer plausible non-plot-changing visual details from character assets, adjacent shots and scene context instead of writing "unknown". Never invent a character or asset ID or invisible psychology.`;

import { englishTime } from "./story-time";
import { createHash } from "node:crypto";
import type { Asset, ChapterVisualPlan, Character, Shot, ShotVisualSpec, VisualValidationResult } from "./types";
import { rankInteractionPropCandidates } from "./interaction-prop";
import { resolveActionDescription } from "./action-description";
import { normalizeInteractionFacts, reconcileInteractionAction, inferExplicitWorkTarget } from "./interaction-facts";
import {actionStageState} from '../scripts/action-stage-policy.mjs';
export { rankInteractionPropCandidates };

export const VISUAL_SCHEMA_VERSION = "1.0" as const;
export const dependencyHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const array = (value: unknown) => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = "unknown") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const meaningful = (value: unknown) => typeof value === "string" && Boolean(value.trim()) && !/^(unknown|specific story location|coherent everyday environment|cozy home interior|calm dry weather|daytime|motivated soft (?:directional|key) light(?: with readable ambient fill)?|natural storytelling action|gentle, natural expression|looking toward the story focus|hands out of frame|hands naturally positioned for the described action and framing|eyes focused on the current action target, no eye contact with camera|clear storytelling composition)$/i.test(value.trim());
const resolved = (value: unknown, fallback: string) => meaningful(value) ? String(value).trim() : fallback;
const inferredWeather = (shot: Shot) => /雨|伞|rain/i.test(`${shot.scene} ${shot.description}`) ? "visible steady rain" : "calm dry weather";
type EnvironmentKey = "location" | "timeOfDay" | "weather" | "lighting";
const hasEnvironmentValue = (value: unknown) => typeof value === "string" && !!value.trim() && value.trim().toLowerCase() !== "unknown";
const explicitEnvironment = (scene: ShotVisualSpec["scene"] | undefined, key: EnvironmentKey) => scene &&
  (scene.fallbackValues ? hasEnvironmentValue(scene[key]) && scene.fallbackValues[key] !== scene[key] : meaningful(scene[key]));

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
      ...(Number.isInteger(item?.shotId) ? { shotId: item.shotId } : {}),
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

export function normalizeShotSpec(raw: any, shot: Shot, options: { manualEnvironment?: boolean; manualAppearance?: boolean; interactionSource?: 'manual' | 'model' | 'preserve'; requireInteractionFacts?: boolean } = {}): ShotVisualSpec {
  const useSceneFallback = shot.characterIds.length <= 1;
  const rawCharacters = array(raw?.characters);
  const normalizedCharacters = shot.characterIds.map((characterId, index) => {
    const item: any = rawCharacters.find((x: any) => x?.characterId === characterId) || {};
    const look = shot.characterLooks?.[characterId];
    const region = boundedRegion(item.region, index, shot.characterIds.length);
    const regionCenter = (region.xStart + region.xEnd) / 2;
    const defaultPosition = regionCenter < .5 ? "left side of the frame" : regionCenter > .5 ? "right side of the frame" : "center of the frame";
    const appearanceDefaults = {hair:"hair unchanged from the identity reference",bag:"no visible bag",glasses:"no glasses",outerwearState:"no visible outerwear change"};
    const appearance = {...appearanceDefaults};
    const appearanceFallbacks: Partial<typeof appearanceDefaults> = {};
    for (const key of Object.keys(appearanceDefaults) as Array<keyof typeof appearanceDefaults>) {
      if (meaningful(item?.appearanceState?.[key])) {
        appearance[key] = item.appearanceState[key].trim();
        if (!options.manualAppearance && item.appearanceState.fallbackValues?.[key] === appearance[key]) appearanceFallbacks[key] = appearance[key];
      } else appearanceFallbacks[key] = appearance[key];
    }
    const missingArrays = (["accessories", "condition"] as const).filter(key =>
      !Array.isArray(item?.appearanceState?.[key]) || (!options.manualAppearance && !item.appearanceState[key].length && item.appearanceState.missingArrays?.includes(key)));
    return { characterId, outfitId: look?.outfitId || text(item.outfitId, "") || (index === 0 ? shot.outfitId : ""), shoeId: look?.shoeId || text(item.shoeId, "") || (index === 0 ? shot.shoeId : ""),
      ...(meaningful(item.bodyPose)?{bodyPose:item.bodyPose.trim()}:{}), ...(meaningful(item.bodySupport)?{bodySupport:item.bodySupport.trim()}:{}),
      position: meaningful(look?.positionEn) ? look!.positionEn : resolved(item.position, defaultPosition), region,
      action: resolveActionDescription(meaningful(look?.actionEn) ? look!.actionEn : "", meaningful(item.action) ? item.action : "", useSceneFallback && meaningful(shot.actionEn) ? shot.actionEn : "") || "performing the current story action", actionTarget: resolved(item.actionTarget,"the current story focus"),
      expression: meaningful(look?.expressionEn) ? look!.expressionEn : resolved(item.expression, resolved(useSceneFallback ? shot.expressionEn : "","readable attentive expression")), expressionReason: resolved(item.expressionReason,"responding to the visible event"),
      gazeTarget: meaningful(look?.gazeEn) ? look!.gazeEn : resolved(item.gazeTarget,"looking toward the current story focus"), hands: meaningful(look?.handsEn) ? look!.handsEn : resolved(item.hands,"both visible hands follow the described action"), occlusion: resolved(item.occlusion,"face and action remain unobstructed"),
      appearanceState:{...appearance,fallbackValues:appearanceFallbacks,missingArrays,accessories:array(item?.appearanceState?.accessories).map((x)=>text(x)).filter(meaningful),condition:array(item?.appearanceState?.condition).map((x)=>text(x)).filter(meaningful)} };
  });
  const normalizeInteraction = (item: any) => ({
    visualFacts: normalizeInteractionFacts(reconcileInteractionAction(item?.visualFacts, text(item?.action), options.interactionSource || (options.manualAppearance ? 'manual' : 'preserve')), options.interactionSource || (options.manualAppearance ? 'manual' : 'preserve')),
    type: text(item?.type), actorCharacterId: text(item?.actorCharacterId, ""), targetCharacterId: text(item?.targetCharacterId, ""),
    propId: text(item?.propId, text(item?.visualFacts?.object?.instanceId, "")), action: text(item?.action, "perform the described interaction"), phase: text(item?.phase, "in progress"),
    contactPoints: array(item?.contactPoints || (item?.contactPoint ? [item.contactPoint] : [])).map((x) => text(x)).filter(meaningful),
    gazeTarget: text(item?.gazeTarget, ""), ownershipBefore: typeof item?.ownershipBefore === "string" ? item.ownershipBefore : null,
    ownershipAfter: typeof item?.ownershipAfter === "string" ? item.ownershipAfter : null,
  });
  const suppliedInteractions = array(raw?.interactions || (raw?.interaction ? [raw.interaction] : [])).map(normalizeInteraction);
  const facts = useSceneFallback ? array(raw?.visibleFacts).map((x) => text(x)).join(" ") : "";
  const inferredInteractions = suppliedInteractions.length ? [] : normalizedCharacters.flatMap((character) => {
    const source = `${character.action} ${character.actionTarget} ${character.hands} ${character.gazeTarget} ${facts}`;
    const actionable = /\b(?:hold|holding|held|read|reading|use|using|operate|operating|pass|passing|hand|handing|give|giving|receive|receiving|take|taking|reach|reaching|touch|touching|carry|carrying|open|opening|write|writing|pour|pouring|show|showing|inspect|inspecting)\b|拿|持|读|看手机|使用|操作|递|交接|接过|触碰|打开|书写/i.test(source);
    const handsParticipate = meaningful(character.hands) && !/hands? out of frame|no visible hands?/i.test(character.hands);
    const target = meaningful(character.actionTarget) ? character.actionTarget.trim() : "";
    if (!actionable || !handsParticipate) return [];
    const targetCharacterId = shot.characterIds.find((id) => id !== character.characterId && new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(source)) || "";
    const targetIsCharacter = targetCharacterId && new RegExp(`\\b${targetCharacterId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(target);
    const rankedProps = rankInteractionPropCandidates({
      target,
      action: character.action,
      contact: character.hands,
      gaze: character.gazeTarget,
      facts,
      context: useSceneFallback ? shot.description : "",
      targetIsCharacter: Boolean(targetIsCharacter),
    });
    // When separate hand clauses name separate props, they are separate
    // physical relations and must survive normalization. Otherwise emit the
    // highest-ranked active relation instead of manufacturing relations from
    // incidental nouns in scene context.
    const contactedProps = rankedProps.filter((candidate) => candidate.contactPoints.length > 0);
    const selectedProps = contactedProps.length > 1 ? contactedProps : rankedProps.slice(0, 1);
    return selectedProps.map((candidate) => ({
      type: /\b(?:pass|hand|give|receive|take)\b|递|交接|接过/i.test(character.action) ? "object_transfer" : "prop_interaction",
      actorCharacterId: character.characterId,
      targetCharacterId,
      propId: candidate.propId,
      action: character.action,
      phase: "in progress",
      contactPoints: candidate.contactPoints.length ? candidate.contactPoints : [character.hands],
      gazeTarget: character.gazeTarget,
      ownershipBefore: null,
      ownershipAfter: null,
    }));
  });
  const interactions = suppliedInteractions.length ? suppliedInteractions : inferredInteractions;
  for(const relation of interactions){
    const facts='visualFacts' in relation?relation.visualFacts:undefined;
    if(!facts||facts.workTarget)continue;
    const peers=interactions.filter(r=>r.actorCharacterId===relation.actorCharacterId&&'visualFacts' in r&&r.visualFacts).map(r=>('visualFacts' in r?r.visualFacts:undefined)!);
    const work=inferExplicitWorkTarget(facts,relation.action,peers);
    if(work){facts.workTarget=work;facts.provenance.workTarget={source:'legacy_default',evidence:'Unique explicit work target in action: '+relation.action};}
  }
  if(options.requireInteractionFacts && interactions.some(item=>item.propId&&(!('visualFacts' in item)||!item.visualFacts)))throw new Error('新视觉规划必须提供完整visualFacts，不能退回文本数量推断');
  if(options.requireInteractionFacts)for(const relation of interactions){
    const f='visualFacts' in relation?relation.visualFacts:undefined;
    if(f&&['tool','write'].includes(f.actionId)&&!f.workTarget&&interactions.some(r=>r!==relation&&r.actorCharacterId===relation.actorCharacterId))throw new Error('工具操作缺少明确工作目标，请在workTarget中绑定物体实例和作用表面');
  }
  const defaults = { location: resolved(shot.sceneEn,"specific story location"), timeOfDay: englishTime(shot.timeOfDay), weather: inferredWeather(shot), lighting: resolved(shot.lightingEn,"motivated soft key light with readable ambient fill") };
  const fallbackValues: NonNullable<ShotVisualSpec["scene"]["fallbackValues"]> = {};
  const environment = { ...defaults };
  for (const key of Object.keys(defaults) as EnvironmentKey[]) {
    if (hasEnvironmentValue(raw?.scene?.[key])) {
      environment[key] = raw.scene[key].trim();
      if (!options.manualEnvironment && raw.scene.fallbackValues?.[key] === environment[key]) fallbackValues[key] = environment[key];
    } else fallbackValues[key] = environment[key];
  }
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    visibleFacts: array(raw?.visibleFacts).map((x) => text(x)).filter(meaningful).length ? array(raw?.visibleFacts).map((x) => text(x)).filter(meaningful) : [resolved(shot.actionEn,"the character performs the current story action")],
    scene: { sceneId: resolved(raw?.scene?.sceneId,"current_scene"), ...environment, fallbackValues,
      anchors: array(raw?.scene?.anchors).map((x) => text(x)).filter(meaningful) },
    characters: normalizedCharacters,
    interaction: raw?.interaction ? { type: text(raw.interaction.type), propId: text(raw.interaction.propId, ""),
      actorCharacterId: text(raw.interaction.actorCharacterId, ""), targetCharacterId: text(raw.interaction.targetCharacterId, ""),
      contactPoint: text(raw.interaction.contactPoint), phase: text(raw.interaction.phase) } : null,
    interactions,
    camera: { shotSize: resolved(raw?.camera?.shotSize,resolved(shot.cameraEn, meaningful(shot.camera) ? shot.camera : "medium shot")), angle: resolved(raw?.camera?.angle,"eye-level angle"), axis: resolved(raw?.camera?.axis,"consistent screen direction"),
      focus: resolved(raw?.camera?.focus,"focus on the acting character and story prop"), composition: resolved(shot.compositionEn,resolved(raw?.camera?.composition,"balanced narrative composition with readable action")) },
    stateChanges: array(raw?.stateChanges).map((x) => typeof x === "string" ? ({note: text(x)}) : ({
      characterId: typeof x?.characterId === "string" ? x.characterId : undefined, propId: typeof x?.propId === "string" ? x.propId : undefined,
      ownerCharacterId: typeof x?.ownerCharacterId === "string" ? x.ownerCharacterId : null, position: typeof x?.position === "string" ? x.position : undefined,
      direction: typeof x?.direction === "string" ? x.direction : undefined, actionPhase: typeof x?.actionPhase === "string" ? x.actionPhase : undefined,
      outfitId: typeof x?.outfitId === "string" ? x.outfitId : undefined, note: text(x?.note),
    })), warnings: array(raw?.warnings).map((x) => text(x)).filter(meaningful), conflicts: [],
  };
}

export function characterContinuityMemory(shots: Shot[], currentIndex: number, allowPending = false) {
  const wanted = new Set(shots[currentIndex]?.characterIds || []);
  const latest = new Map<string, { shotId: number; confirmed: boolean; character: ShotVisualSpec["characters"][number] }>();
  for (const shot of shots.slice(0, currentIndex)) {
    if (!shot.visualSpec || (!shot.visualSpecConfirmed && !allowPending)) continue;
    for (const character of shot.visualSpec.characters) if (wanted.has(character.characterId)) {
      latest.set(character.characterId, { shotId: shot.id, confirmed: shot.visualSpecConfirmed, character: JSON.parse(JSON.stringify(character)) });
    }
  }
  return [...latest.values()];
}

export function inheritShotContinuity(spec:ShotVisualSpec,previous:ShotVisualSpec|null,plan:ChapterVisualPlan|null, history: ShotVisualSpec["characters"] = []) {
  const inherited:ShotVisualSpec=JSON.parse(JSON.stringify(spec));
  const planScene=plan?.scenes.find((x)=>x.id===inherited.scene.sceneId);
  const sceneKey = (value: string | undefined) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const hasSceneId = (value: string | undefined) => Boolean(sceneKey(value)) && !/^(?:unknown|current_scene)$/.test(sceneKey(value));
  // Adjacent panels can change locations. A legacy placeholder ID is not scene identity.
  const sameScene = previous && (hasSceneId(inherited.scene.sceneId) && hasSceneId(previous.scene.sceneId)
    ? inherited.scene.sceneId === previous.scene.sceneId
    : meaningful(inherited.scene.location) && meaningful(previous.scene.location) && sceneKey(inherited.scene.location) === sceneKey(previous.scene.location));
  const previousScene = sameScene ? previous!.scene : undefined;
  // A location may persist while its visible environment changes. Anchors can
  // contain state (lit lamps, wet roads), so do not copy them across a declared
  // state change, even when an old chapter plan reused the same scene ID.
  const compatibleState = (candidate: typeof previousScene) => candidate &&
    (["timeOfDay", "weather", "lighting"] as const).every(key =>
      !explicitEnvironment(spec.scene,key) || !explicitEnvironment(candidate,key) || sceneKey(spec.scene[key]) === sceneKey(candidate[key]));
  const previousEnvironment = compatibleState(previousScene) ? previousScene : undefined;
  const plannedEnvironment = compatibleState(planScene && { ...planScene, sceneId: planScene.id, fallbackValues: {} }) ? planScene : undefined;
  for(const key of ["location","timeOfDay","weather","lighting"] as const) {
    const before = key === "location" ? previousScene : previousEnvironment;
    const planned = key === "location" ? planScene : plannedEnvironment;
    if(!explicitEnvironment(inherited.scene,key)) {
      const source = explicitEnvironment(before,key) ? before : planned && hasEnvironmentValue(planned[key]) ? planned : undefined;
      if (source) {
        inherited.scene[key] = source[key];
        if (inherited.scene.fallbackValues) delete inherited.scene.fallbackValues[key];
      }
    }
  }
  if(!inherited.scene.anchors.length) inherited.scene.anchors=previousEnvironment?.anchors.length?[...previousEnvironment.anchors]:plannedEnvironment?.anchors?[...plannedEnvironment.anchors]:[];
  for(const character of inherited.characters) {
    const before=previous?.characters.find((x)=>x.characterId===character.characterId) || history.find(x=>x.characterId===character.characterId);
    if(!meaningful(character.position)&&before)character.position=before.position;
    if(!character.outfitId&&before)character.outfitId=before.outfitId;
    if(!character.shoeId&&before)character.shoeId=before.shoeId;
    if(before){for(const key of ["hair","bag","glasses","outerwearState"] as const)if(!meaningful(character.appearanceState[key]) || character.appearanceState.fallbackValues?.[key] === character.appearanceState[key]) {
      character.appearanceState[key]=key==='hair'?before.appearanceState[key].replace(/,\s*(?:slightly )?(?:lifted|flowing|swaying)[^,]*(?:walking|running)[^,]*/gi,''):before.appearanceState[key];
      character.appearanceState.fallbackValues ||= {};
      if (before.appearanceState.fallbackValues?.[key] === before.appearanceState[key]) character.appearanceState.fallbackValues[key]=before.appearanceState[key];
      else delete character.appearanceState.fallbackValues[key];
    }for(const key of character.appearanceState.missingArrays || []) if(!character.appearanceState[key].length)character.appearanceState[key]=[...before.appearanceState[key]];character.appearanceState.missingArrays=(character.appearanceState.missingArrays || []).filter(key=>!character.appearanceState[key].length && before.appearanceState.missingArrays?.includes(key));}
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
      const position = String(character.position || "").toLowerCase();
      const center = (character.region.xStart + character.region.xEnd) / 2;
      const positionSide = /left|左/.test(position) ? "left" : /right|右/.test(position) ? "right" : /center|middle|中/.test(position) ? "center" : null;
      if (positionSide && ((positionSide === "left" && center >= .5) || (positionSide === "right" && center <= .5) || (positionSide === "center" && (center < .3 || center > .7)))) {
        conflicts.push(`角色 ${character.characterId} 的 position=${character.position} 与 region=${character.region.xStart}-${character.region.xEnd} 冲突`);
        failures.push({ code: "position_region_conflict", severity: "P0", message: conflicts[conflicts.length - 1] });
      }
      if (!character.action?.trim() || !character.actionTarget?.trim() || !character.hands?.trim()) failures.push({ code: "interaction_failed", severity: "P0", message: `角色 ${character.characterId} 缺少动作、动作目标或手部说明。` });
      if (!character.gazeTarget?.trim()) failures.push({ code: "gaze_failed", severity: "P0", message: `角色 ${character.characterId} 缺少视线目标。` });
    }
    const validStructured:typeof value.interactions=[];
    for (const relation of value.interactions || []) {
      if(relation.visualFacts) {
        try { normalizeInteractionFacts(relation.visualFacts);validStructured.push(relation); }
        catch(error) { failures.push({code:'interaction_failed',severity:'P0',message:error instanceof Error?error.message:'交互事实无效'});continue; }
        if(relation.visualFacts.gaze.kind==='character'&&!ids.includes(relation.visualFacts.gaze.targetId)) failures.push({code:'gaze_failed',severity:'P0',message:'结构化视线目标不在当前镜头中'});
        const facts=relation.visualFacts,state=actionStageState(facts.actionId,facts.phase);
        if(state.contactState!==facts.contact.state||['on_support','held'].includes(state.objectState)&&facts.support.state!=='unspecified'&&state.objectState!==facts.support.state)failures.push({code:'interaction_failed',severity:'P0',message:'结构化动作阶段、接触或支持状态冲突'});
      } else warnings.push(`交互 ${relation.actorCharacterId}/${relation.propId} 使用旧文本推断，数量和目标未经结构化明确`);
      if (!relation.actorCharacterId || (!relation.targetCharacterId && !relation.propId) || !relation.action?.trim() || !relation.phase?.trim() || !relation.contactPoints?.length) failures.push({ code: "interaction_failed", severity: "P0", message: "交互关系缺少参与者、目标、动作阶段或接触点。" });
      if (!relation.gazeTarget?.trim()) failures.push({ code: "gaze_failed", severity: "P0", message: "交互关系缺少必要视线目标。" });
      if (relation.actorCharacterId && !characterIds.has(relation.actorCharacterId)) failures.push({ code: "interaction_failed", severity: "P0", message: `交互指向未知角色：${relation.actorCharacterId}` });
      if (relation.targetCharacterId && !characterIds.has(relation.targetCharacterId)) failures.push({ code: "interaction_failed", severity: "P0", message: `交互目标指向未知角色：${relation.targetCharacterId}` });
      if(relation.actorCharacterId&&!ids.includes(relation.actorCharacterId)||relation.targetCharacterId&&!ids.includes(relation.targetCharacterId)) failures.push({code:'interaction_failed',severity:'P0',message:'交互参与者必须属于当前镜头'});
    }
    const groups=new Map<string,typeof value.interactions>();
    for(const relation of validStructured){const key=relation.visualFacts!.object.instanceId;groups.set(key,[...(groups.get(key)||[]),relation]);}
    for(const relation of validStructured){const work=relation.visualFacts?.workTarget;if(work){
      const targets=groups.get(work.instanceId)||[];
      if(!targets.length||!targets.some(t=>t.actorCharacterId===relation.actorCharacterId))failures.push({code:'interaction_failed',severity:'P0',message:'工作目标必须是当前人物已声明的物体实例'});
    }}
    for(const [id,relations] of groups){
      if(relations.some(r=>r.visualFacts!.object.count!==relations[0].visualFacts!.object.count||r.visualFacts!.object.label!==relations[0].visualFacts!.object.label))failures.push({code:'interaction_failed',severity:'P0',message:`共享实例 ${id} 的对象或数量冲突`});
      const supports=relations.map(r=>r.visualFacts!.support).filter(s=>s.state!=='unspecified');
      if(new Set(supports.map(s=>JSON.stringify(s))).size>1)failures.push({code:'interaction_failed',severity:'P0',message:`共享实例 ${id} 的支持状态冲突`});
    }
    for(const relation of validStructured)if(relation.visualFacts?.gaze.kind==='object'&&!groups.has(relation.visualFacts.gaze.targetId))failures.push({code:'gaze_failed',severity:'P0',message:'结构化视线目标物体未在当前镜头中声明'});
    for(const id of ids){
      const gazes=validStructured.filter(r=>r.actorCharacterId===id).map(r=>r.visualFacts!.gaze);
      const targets=gazes.map(g=>JSON.stringify([g.kind,g.targetId,g.kind==='independent'?g.description:'']));
      const surfaces=gazes.filter(g=>g.surface).map(g=>g.surface);
      if(new Set(targets).size>1||new Set(surfaces).size>1)failures.push({code:'gaze_failed',severity:'P0',message:`角色 ${id} 在同一镜头中具有互相矛盾的结构化视线目标`});
    }
  }
  if (errors.length) failures.push(...errors.map((message) => ({ code: message.includes("角色") ? "identity_failed" as const : "interaction_failed" as const, severity: "P0" as const, message })));
  const blocked = failures.some((failure) => failure.severity === "P0");
  return { valid: errors.length === 0 && !blocked, errors, warnings, conflicts, failures, blocked };
}

export const chapterSystemPrompt = `You are a visual continuity director for serialized anime comics. Output JSON only. Use only supplied character and asset IDs. Every descriptive value, warning and note must be English; supplied IDs must remain unchanged. Create stable English IDs for story scenes and prop instances, keeping them across panels; these are not character or asset IDs. Describe visible facts, persistent states, locations, weather, lighting, props and continuity. When a harmless visual detail is missing, infer one plausible production-ready choice from the story, character profile, adjacent shots and genre. Never write "unknown", never invent a character or asset ID, and never add a new plot event.`;
export const shotSystemPrompt = `You are a storyboard visual director for Stable Diffusion. Output JSON only. Every descriptive value, warning and note must be English; supplied IDs must remain unchanged. Convert narrative meaning into directly visible facts and precise subject-action-target relationships. Select exactly one visible instant per panel: preparation, contact, or completion. Describe the actor, active hand, tool, target object and target surface as one coherent operation; a stabilizing hand is an assisting contact, not a second simultaneous opening action. Use camera.focus for the visible story focal point and camera.composition to state which hands, objects and contact surfaces must be in frame, consistent with the chosen shot size and occlusion. Keep gaze targets and object states consistent across all relations for each character. Leave unspecified joint angles and nonessential pose details to the image model. Always output an interactions array. It may be empty only for a genuinely static shot with no person-person or person-prop action. Every explicit prop operation, hand contact, handoff, or multi-subject action must have one complete interactions entry with type, actorCharacterId, targetCharacterId or propId, action, phase, contactPoints, gazeTarget, ownershipBefore, and ownershipAfter; emit multiple entries when the shot contains multiple relations. For every character include bodyPose (sitting/standing/crouching/etc) and bodySupport (chair/sofa/bed/floor or empty). Do not inherit motion-dependent hair or pose from earlier panels. For every character describe position, normalized xStart/xEnd region, concrete action, actionTarget, facial expression, expressionReason, gazeTarget, visible hands, occlusion, outfitId, shoeId, and appearanceState containing hair, bag, accessories, glasses, outerwearState and visible condition. Describe a physically specific location, time, weather, architectural or furniture anchors, motivated lighting, camera size, angle, axis, focus and composition. Preserve explicit manual camera, character, outfit and shoe selections. Infer plausible non-plot-changing visual details from character assets, adjacent shots and scene context instead of writing "unknown". Never invent a character or asset ID or invisible psychology.`;

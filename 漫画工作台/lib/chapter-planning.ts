import { assertVisualShape, chapterSystemPrompt, normalizeChapterPlan, validateVisualIds } from "./visual-planning";
import type { Asset, Character, ChapterVisualPlan, Shot } from "./types";

type PlanningShot = Pick<Shot, "id" | "title" | "description" | "scene" | "timeOfDay" | "characterIds"> & Partial<Pick<Shot, "characterLooks" | "outfitId" | "shoeId">> & { confirmedVisualSpec?: Shot["visualSpec"] };
export type ChapterPlanningInput = {
  schemaVersion: string; story: string; script: unknown; shots: PlanningShot[];
  characters: Array<{ id: string; name: string; invariants: string[] }>;
  assets: Array<{ id: string; type: string; characterId: string; description: string }>; seriesMemory: string;
};
type Result = { data: unknown; model: string; usage: unknown; latencyMs?: number };
type Invoke = (system: string, user: string, options: { timeoutMs: number; maxTokens: number; thinking: "disabled" }) => Promise<Result>;

/** Bound response size, keep cross-batch state, and only return a complete chapter. */
export async function planChapterInBatches(input: ChapterPlanningInput, invoke: Invoke, batchSize = 4) {
  if (!input.shots.length) throw new Error("章节没有分格，无法规划");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 8) throw new Error("无效规划批次大小");
  const usedCharacters = new Set(input.shots.flatMap(shot => shot.characterIds));
  const characters = input.characters.filter(character => usedCharacters.has(character.id));
  const assets = input.assets.filter(asset => usedCharacters.has(asset.characterId));
  const source = { ...input, characters, assets };
  const calls: Array<{ stage: string; model: string; usage: unknown; latencyMs?: number }> = [];
  async function request(stage: string, task: string, data: unknown, validate: (data: any) => void) {
    let failure = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await invoke(`${chapterSystemPrompt} ${task} Be concise.`, `${JSON.stringify(data)}${failure ? `\nPrevious response was invalid: ${failure}. Return the complete corrected JSON.` : ""}`, { timeoutMs: 90_000, maxTokens: 4_500, thinking: "disabled" });
        calls.push({ stage, model: result.model, usage: result.usage, latencyMs: result.latencyMs });
        const nonEnglish = JSON.stringify(result.data).match(/"[^"\n]*[\u3400-\u9fff][^"\n]*"/);
        if (nonEnglish) throw new Error(`视觉规划包含中文描述：${nonEnglish[0].slice(0, 180)}`);
        validate(result.data);
        return result.data as any;
      } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    }
    throw new Error(`${stage}失败：${failure}`);
  }
  const scaffold = await request("场景规划", "Plan scene definitions only. Return {schemaVersion,scenes:[{id,location,timeOfDay,weather,anchors,lighting}],timeline:[],warnings:[]}. Create stable English scene IDs. Reuse a scene ID only for the same physical setting and light state. Separate interior rooms from exterior doorways, porches and roads even at the same address. Separate different rooms when visible anchors differ. Assign distinct IDs when time or lighting changes materially, including switching the light off; scenes after switch-off must not retain an illuminated desk lamp. Cover every supplied shot location without adding events or travel panels. Do not write the per-panel timeline yet.", source, raw => {
    assertVisualShape("chapter", raw);
    if (!raw.scenes.length || raw.timeline.length) throw new Error("场景阶段应提供场景定义和空timeline");
    const ids = raw.scenes.map((scene: any) => scene.id);
    if (ids.some((id: unknown) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) throw new Error("场景ID缺失或重复");
  });
  const sceneIds = new Set(scaffold.scenes.map((scene: any) => scene.id));
  const timeline: ChapterVisualPlan["timeline"] = [];
  const warnings: string[] = [...scaffold.warnings];
  const knownCharacters = new Map<string, ChapterVisualPlan["timeline"][number]["characterStates"][number]>();
  const knownProps = new Map<string, ChapterVisualPlan["timeline"][number]["propStates"][number]>();
  for (let offset = 0; offset < input.shots.length; offset += batchSize) {
    const shots = input.shots.slice(offset, offset + batchSize);
    const task = "Return {timeline:[{shotId,order,sceneId,summary,characterStates:[{characterId,hair,outfitId,shoeId,bag,accessories,glasses,outerwearState,condition,position,lastAction}],propStates:[{id,name,ownerCharacterId,location,state}],continuityNotes:[]}],warnings:[]}. Exactly one timeline entry per supplied shot, in the supplied order, using the exact shotId and order. Use only supplied scene IDs and asset IDs. Include every bound character, no additional characters. Carry clothing, prop ownership and screen direction from previousState unless the story changes them. Owners must be a supplied character ID or null; store shelves/rooms in location. Never invent a new outfit ID for a costume change: use a supplied suitable asset or empty ID and explain missing assets in warnings. This is the state visible in this panel, not a summary of all future actions.";
    const result = await request(`分格${offset + 1}-${offset + shots.length}`, task, {
      story: input.story, scenes: scaffold.scenes, characters, assets, previousState: timeline.at(-1) || null,
      continuityMemory: { characters: [...knownCharacters.values()], props: [...knownProps.values()], instruction: "Last known states persist when temporarily off screen. Absence is not removal. ConfirmedVisualSpec is authoritative. Other stored outfit/shoe selections have unknown provenance and may be automatically prefilled: use them as initial wardrobe or an explicit changed selection, NOT an instruction to reset after a story costume change. A repeated original outfit ID on every panel must not undo a change into sleepwear on the next panel without a new story change. Flag unresolved selection conflicts in warnings. Only the first character may use legacy shot-level choices. Use story changes to update state, never apply a future change early." },
      shots: shots.map((shot, index) => ({ ...shot, order: offset + index + 1 })), nextShot: input.shots[offset + shots.length] || null,
    }, raw => {
      if (!Array.isArray(raw?.timeline) || raw.timeline.length !== shots.length || !Array.isArray(raw.warnings)) throw new Error("timeline必须完整覆盖当前批次");
      for (let index = 0; index < shots.length; index++) {
        const state = raw.timeline[index];
        if (state.shotId !== shots[index].id || state.order !== offset + index + 1 || !sceneIds.has(state.sceneId)) throw new Error("分格ID、顺序或场景归属错误");
        const ids = Array.isArray(state.characterStates) ? state.characterStates.map((character: any) => character.characterId) : [];
        if (ids.length !== shots[index].characterIds.length || new Set(ids).size !== ids.length || shots[index].characterIds.some(id => !ids.includes(id))) throw new Error("分格人物状态缺失、重复或归属错误");
        for (const confirmed of shots[index].confirmedVisualSpec?.characters || []) {
          const current = state.characterStates.find((character: any) => character.characterId === confirmed.characterId);
          if (current && ((confirmed.outfitId && current.outfitId !== confirmed.outfitId) || (confirmed.shoeId && current.shoeId !== confirmed.shoeId))) throw new Error("章节规划覆盖已确认镜头服装或鞋履");
        }
      }
      const normalized = normalizeChapterPlan({ ...scaffold, timeline: raw.timeline, warnings: raw.warnings });
      const validation = validateVisualIds(normalized, characters as unknown as Character[], assets as unknown as Asset[]);
      if (!validation.valid) throw new Error(validation.errors.join("；"));
    });
    const batch = normalizeChapterPlan({ ...scaffold, timeline: result.timeline }).timeline;
    timeline.push(...batch);
    for (const state of batch) {
      for (const character of state.characterStates) knownCharacters.set(character.characterId, character);
      for (const prop of state.propStates) if (prop.id) knownProps.set(prop.id, prop);
    }
    warnings.push(...result.warnings);
  }
  return { plan: normalizeChapterPlan({ ...scaffold, timeline, warnings: [...new Set(warnings)] }), calls };
}

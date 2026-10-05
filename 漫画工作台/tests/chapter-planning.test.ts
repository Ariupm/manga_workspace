import assert from "node:assert/strict";
import test from "node:test";
import { planChapterInBatches, type ChapterPlanningInput } from "../lib/chapter-planning";

const input: ChapterPlanningInput = {
  schemaVersion: "1.0", story: "Walk outside, collect a book, read at home", script: [], seriesMemory: "",
  shots: Array.from({ length: 9 }, (_, index) => ({ id: 30 + index, title: "Panel", description: "Continue the story", scene: "street", timeOfDay: "day", characterIds: ["a"] })),
  characters: [{ id: "a", name: "A", invariants: [] }, { id: "unrelated", name: "B", invariants: [] }],
  assets: [{ id: "shirt", characterId: "a", type: "outfit", description: "blue shirt" }, { id: "foreign", characterId: "unrelated", type: "outfit", description: "red shirt" }],
};
const scene = { id: "street", location: "street", timeOfDay: "daytime", weather: "clear", anchors: ["sidewalk"], lighting: "sunlight" };
const timelineFor = (shots: any[]) => shots.map(shot => ({ shotId: shot.id, order: shot.order, sceneId: "street", summary: "walking", characterStates: [{ characterId: "a", outfitId: "shirt", shoeId: "", hair: "brown", bag: "book bag", accessories: [], glasses: "none", outerwearState: "none", condition: [], position: "left", lastAction: "walking" }], propStates: [], continuityNotes: [] }));

test("章节分批覆盖每一格、保留跨批状态并过滤无关人物资产", async () => {
  const seen: any[] = [];
  const result = await planChapterInBatches(input, async (_system, user, options) => {
    const request = JSON.parse(user); seen.push(request);
    assert.equal(options.maxTokens, 4500);
    assert.deepEqual(request.characters.map((c: any) => c.id), ["a"]);
    assert.deepEqual(request.assets.map((a: any) => a.id), ["shirt"]);
    return { data: seen.length === 1 ? { schemaVersion: "1.0", scenes: [scene], timeline: [], warnings: [] } : { timeline: timelineFor(request.shots), warnings: [] }, model: "test", usage: {} };
  });
  assert.equal(seen.length, 4);
  assert.deepEqual(seen.slice(1).map(request => request.shots.length), [4, 4, 1]);
  assert.equal(seen[2].previousState.shotId, 33);
  assert.equal(seen[3].previousState.characterStates[0].outfitId, "shirt");
  assert.deepEqual(result.plan.timeline.map(state => state.shotId), input.shots.map(shot => shot.id));
});

test("缺格、错序、错场景和外人衣物不能作为完整章节返回", async () => {
  for (const corrupt of [
    (states: any[]) => states.slice(1),
    (states: any[]) => states.reverse(),
    (states: any[]) => { states[0].sceneId = "invented"; return states; },
    (states: any[]) => { states[0].characterStates[0].outfitId = "foreign"; return states; },
  ]) {
    let calls = 0;
    await assert.rejects(planChapterInBatches(input, async (_system, user) => {
      calls++;
      const request = JSON.parse(user.split("\nPrevious response")[0]);
      return { data: calls === 1 ? { scenes: [scene], timeline: [], warnings: [] } : { timeline: corrupt(timelineFor(request.shots)), warnings: [] }, model: "test", usage: {} };
    }), /分格1-4失败/);
    assert.equal(calls, 3, "only retry the failed batch once");
  }
});

test("后续批次失败不返回前面几格冒充完整规划", async () => {
  let calls = 0;
  await assert.rejects(planChapterInBatches(input, async (_system, user) => {
    calls++;
    if (calls >= 3) throw new Error("timeout");
    const request = JSON.parse(user);
    return { data: calls === 1 ? { scenes: [scene], timeline: [], warnings: [] } : { timeline: timelineFor(request.shots), warnings: [] }, model: "test", usage: {} };
  }), /分格5-8失败：timeout/);
  assert.equal(calls, 4);
});

test("章节模型不能覆盖已确认镜头的衣物选择", async()=>{
  const source: ChapterPlanningInput={...input,shots:[{...input.shots[0],confirmedVisualSpec:{characters:[{characterId:'a',outfitId:'shirt',shoeId:''}]} as any}]};
  let calls=0;
  await assert.rejects(planChapterInBatches(source,async(_system,user)=>{
    calls++;const request=JSON.parse(user.split('\nPrevious response')[0]);
    const timeline=timelineFor(request.shots||[]);if(timeline[0])timeline[0].characterStates[0].outfitId='';
    return {data:calls===1?{scenes:[scene],timeline:[],warnings:[]}:{timeline,warnings:[]},model:'test',usage:{}};
  }),/覆盖已确认镜头/);
});

test("暂时离场的人物和道具在再次入场时仍有最后状态，人工选择送入规划", async () => {
  const source: ChapterPlanningInput = { ...input, shots: input.shots.slice(0, 3).map((shot, index) => ({ ...shot, characterIds: index === 1 ? [] : ["a"], characterLooks: { a: { outfitId: "shirt" } } as any })) };
  let calls = 0;
  await planChapterInBatches(source, async (_system, user) => {
    const request = JSON.parse(user); calls++;
    if (calls === 1) return { data: { scenes: [scene], timeline: [], warnings: [] }, model: "test", usage: {} };
    if (calls === 4) {
      assert.deepEqual(request.previousState.characterStates, []);
      assert.equal(request.continuityMemory.characters[0].outfitId, "shirt");
      assert.equal(request.continuityMemory.props[0].ownerCharacterId, "a");
      assert.equal(request.shots[0].characterLooks.a.outfitId, "shirt");
    }
    const timeline: any[] = timelineFor(request.shots);
    if (calls === 2) timeline[0].propStates = [{ id: "book", name: "book", ownerCharacterId: "a", location: "in bag", state: "closed" }];
    if (calls === 3) timeline[0].characterStates = [];
    return { data: { timeline, warnings: [] }, model: "test", usage: {} };
  }, 1);
});

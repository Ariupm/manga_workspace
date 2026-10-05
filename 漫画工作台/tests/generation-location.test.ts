import test from "node:test";
import assert from "node:assert/strict";
import { prepareGenerationLocation } from "../lib/generation-location";
import { buildGenerationPrompt, buildRegionalPrompt } from "../lib/prompts";
import type { Shot } from "../lib/types";

const base = { id: 1, title: "观测", scene: "山间观测台", sceneEn: "coherent everyday environment", description: "从公司来到山间观测台", timeOfDay: "白天", actionEn: "standing calmly", expressionEn: "calm", compositionEn: "", negativePromptEn: "", environment: {}, characterIds: [], characterLooks: {}, camera: "中景", cameraEn: "medium shot" } as unknown as Shot;
const data = { location: "mountain observation platform", foreground: "platform railing", midground: "observation deck", background: "mountain ridges" };
test("unknown Chinese place is automatically compiled before both prompt paths, across framing and cast", async () => {
  for (const cameraEn of ["close-up", "medium shot", "wide shot"]) for (const characterIds of [[], ["a"], ["a", "b"]]) {
    const original = { ...base, cameraEn, characterIds };
    const result = await prepareGenerationLocation(original, async (_, input) => {
      assert.equal(JSON.parse(input).currentLocation, base.scene);
      assert.doesNotMatch(input, /公司/);
      return { data, model: "test" };
    });
    assert.equal(result.trace?.source, base.scene);
    assert.match(buildGenerationPrompt(result.shot, [], []).prompt, /mountain observation platform/);
    assert.match(buildRegionalPrompt(result.shot, [], []).commonPrompt, /mountain observation platform/);
    assert.deepEqual(original.environment, {});
  }
});
test("concrete manual or confirmed environment skips model; Chinese override takes precedence", async () => {
  const manual = { ...base, environment: { location: "custom lunar station" } } as Shot;
  assert.equal((await prepareGenerationLocation(manual, async () => { throw new Error("unexpected model call"); })).shot, manual);
  const chinese = { ...base, environment: { location: "海边灯塔", foreground: "stone steps" } } as Shot;
  const result = await prepareGenerationLocation(chinese, async (_, input) => {
    assert.equal(JSON.parse(input).currentLocation, "海边灯塔");
    return { data: { ...data, location: "coastal lighthouse" }, model: "test" };
  });
  assert.equal(result.shot.environment.foreground, "stone steps");
});
test("confirmed missing scene is repaired in request without changing confirmation or other decisions", async () => {
  const shot = { ...base, visualSpecConfirmed: true, visualSpec: { scene: { location: "unknown", anchors: ["manual railing"], lighting: "moonlight" }, characters: [], camera: { shotSize: "medium" } } } as unknown as Shot;
  const result = await prepareGenerationLocation(shot, async () => ({ data, model: "test" }));
  assert.equal(result.shot.visualSpec?.scene.location, data.location);
  assert.deepEqual(result.shot.visualSpec?.scene.anchors, ["manual railing"]);
  assert.equal(result.shot.visualSpec?.scene.lighting, "moonlight");
  assert.equal(shot.visualSpec?.scene.location, "unknown");
  assert.equal(result.shot.visualSpecConfirmed, true);
});
test("empty, invalid translation and model failures never create a usable generation request", async () => {
  await assert.rejects(prepareGenerationLocation({ ...base, scene: "" }, async () => ({ data, model: "test" })), /尚未指定地点/);
  for (const bad of [{ ...data, location: "unknown" }, { ...data, location: "中文地点" }, {}])
    await assert.rejects(prepareGenerationLocation(base, async () => ({ data: bad, model: "test" })), /有效英文/);
  await assert.rejects(prepareGenerationLocation(base, async () => { throw new Error("offline"); }), /offline/);
});

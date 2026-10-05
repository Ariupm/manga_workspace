import assert from "node:assert/strict";
import test from "node:test";
import { resolveStoryLocation, isGenericLocation } from "../lib/story-location";
import { suggestEnvironment, buildGenerationPrompt, buildRegionalPrompt, analyzeGenerationPrompt } from "../lib/prompts";
import type { Shot, Character } from "../lib/types";

const character = { id: "actor", name: "Actor", appearanceEn: "adult person", visualTraits: { hairStyleEn: "short hair", eyeColorEn: "brown eyes" }, invariantsEn: [], references: [] } as unknown as Character;
const shot = { id: 1, title: "取件", description: "从公司来到快递站，抱着包裹", scene: "快递站", sceneEn: "coherent everyday environment", timeOfDay: "白天", camera: "特写", cameraEn: "close-up", characterIds: ["actor"], characterLooks: {}, environment: {}, actionEn: "Holding a package", expressionEn: "delighted", compositionEn: "", negativePromptEn: "" } as unknown as Shot;

test("explicit location survives legacy placeholders and unrelated places in story text", () => {
  for (const name of ["快递站", "取件点", "parcel pickup station", "delivery station"]) {
    const input = { ...shot, scene: name };
    const env = suggestEnvironment(input);
    assert.match(env.location, /parcel pickup/);
    assert.match(env.background, /parcel storage shelves/);
    assert.doesNotMatch(env.location, /office|transit/);
    const normal = buildGenerationPrompt(input, [], [character]);
    const regional = buildRegionalPrompt(input, [], [character]);
    assert.match(normal.prompt, /parcel pickup station/);
    assert.match(regional.commonPrompt, /parcel pickup station/);
    assert.ok(regional.commonPrompt.indexOf("close-up") < regional.commonPrompt.indexOf("parcel pickup station"), "camera then concrete environment follow the shared block order");
    assert.match(regional.negativePrompt, /studio portrait backdrop/);
    assert.doesNotMatch(regional.commonPrompt, /specific everyday location/);
  }
});

test("location fallback is general and preserves explicit overrides", () => {
  for (const [scene, expected] of [["书房", /study/], ["卧室", /bedroom/], ["厨房", /kitchen/], ["地铁站", /transit/], ["街道", /street/]] as const)
    assert.match(suggestEnvironment({ ...shot, scene }).location, expected);
  assert.equal(resolveStoryLocation("快递站", "a blue parcel locker outside a bakery")?.location, "a blue parcel locker outside a bakery");
  assert.equal(suggestEnvironment({ ...shot, environment: { location: "manual warehouse" } as Shot["environment"] }).location, "manual warehouse");
  const planned = { ...shot, visualSpecConfirmed: true, visualSpec: { scene: { location: "planned moonlit library", anchors: ["oak shelves"], timeOfDay: "night", weather: "dry", lighting: "moonlight" } } } as unknown as Shot;
  assert.equal(suggestEnvironment(planned).location, "planned moonlit library");
  assert.doesNotMatch(JSON.stringify(suggestEnvironment(planned)), /parcel|office/);
});

test("unknown locations are not reported as concrete scenes", () => {
  const input = { ...shot, scene: "某个未识别的特殊场所" };
  assert.equal(resolveStoryLocation(input.scene), null);
  assert.ok(isGenericLocation(suggestEnvironment(input).location));
  assert.ok(analyzeGenerationPrompt(input, [character]).errors.some(error => error.includes("具体英文场景")));
  assert.ok(isGenericLocation("specific everyday location"));
});

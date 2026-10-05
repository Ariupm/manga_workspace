import assert from "node:assert/strict";
import test from "node:test";
import { storyGazeFallback } from "../lib/story-gaze";
import { buildGenerationPrompt, buildRegionalPrompt, deriveInteractionContract } from "../lib/prompts";
import type { Character, Shot } from "../lib/types";
const character = { id: "actor", name: "Actor", appearanceEn: "adult person", visualTraits: {}, invariantsEn: [], references: [] } as unknown as Character;
const base = { id: 2, characterIds: ["actor"], title: "包裹", description: "小粉抱着快递包裹，低头看着包裹，笑容满面。", scene: "快递站", sceneEn: "", timeOfDay: "白天", actionEn: "Holding the package", expressionEn: "delighted", camera: "特写", cameraEn: "close-up", compositionEn: "", characterLooks: {}, environment: {} } as unknown as Shot;

test("explicit prose gaze reaches ordinary, Regional and prop contracts without losing the object target", () => {
  for (const [noun, english] of [["包裹", /parcel/], ["手机", /smartphone screen/], ["书", /book/], ["水杯", /cup/], ["剪刀", /scissors/]] as const) {
    const shot = { ...base, description: `她低头看着${noun}` };
    const gaze = storyGazeFallback(shot, "actor");
    assert.match(gaze, /head tilted down/);
    assert.match(gaze, english);
  }
  const compiled = buildGenerationPrompt(base, [], [character]);
  const regional = buildRegionalPrompt(base, [], [character], { posePlannerVersion: "3.0" });
  assert.match(compiled.characterLooks.actor.gazeEn, /head tilted down.*parcel/);
  assert.match(regional.regionPrompts[0], /head tilted down.*parcel/);
  const relation = deriveInteractionContract(base, "actor");
  assert.match(relation.gaze, /head tilted down.*parcel/);
  assert.equal(relation.gazeMode, "object");
  assert.equal(relation.gazeTarget.kind, "object");
  assert.equal(regional.poseControl?.scenePlan?.people[0].gazeTarget.kind, "object");
});

test("fallback never replaces explicit actor choices or guesses ownership and negation", () => {
  assert.equal(storyGazeFallback({ ...base, characterIds: ["actor", "other"] }, "actor"), "");
  assert.equal(storyGazeFallback({ ...base, visualSpecConfirmed: true }, "actor"), "");
  for (const description of ["她没有低头看包裹", "她低头看包裹，然后看向手机", "她抱着包裹", "她看着包裹和手机"])
    assert.equal(storyGazeFallback({ ...base, description }, "actor"), "");
  const shot = { ...base, characterLooks: { actor: { gazeEn: "looking toward the road, no eye contact with camera" } } } as unknown as Shot;
  assert.equal(storyGazeFallback(shot, "actor"), "");
  assert.equal(deriveInteractionContract(shot, "actor").gazeMode, "independent");
  assert.match(buildGenerationPrompt(shot, [], [character]).characterLooks.actor.gazeEn, /road/);
  const parcel = { ...base, characterLooks: { actor: { gazeEn: "eyes focused on the package, no eye contact with camera" } } } as unknown as Shot;
  assert.equal(deriveInteractionContract(parcel, "actor").gazeMode, "object");
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildRenderPlan } from "../lib/render-plan";
import type { Asset, Character, Shot } from "../lib/types";

const character: Character = {
  id: "hero", name: "Hero", descriptionCn: "", appearanceEn: "adult woman with pink hair", invariantsEn: ["adult woman", "pink hair", "brown eyes"], status: "ready",
  visualTraits: { hairColorEn: "pink", hairStyleEn: "long", eyeColorEn: "brown" }, profileVersion: 3, identityMasterReferenceId: 7,
  references: [
    { id: 7, type: "face", path: "face.png", confirmed: true },
    { id: 8, type: "turnaround", path: "turnaround.png", confirmed: true },
  ],
};
const assets: Asset[] = [
  { id: "outfit-1", type: "outfit", name: "outfit", path: "outfit.png", tags: [], characterId: "hero", visualDescriptionEn: "cream top and pink skirt", defaultShoeId: "shoe-1", confirmed: true, qualityStatus: "complete_outfit" },
  { id: "shoe-1", type: "shoes", name: "shoes", path: "shoes.png", tags: [], characterId: "hero", visualDescriptionEn: "pink shoes", defaultShoeId: "", confirmed: true, qualityStatus: "partial_footwear" },
];
const shot = {
  id: 1, characterIds: ["hero"], camera: "近景", cameraEn: "medium close-up", compositionEn: "", outfitId: "outfit-1", shoeId: "shoe-1", characterLooks: {}, generationWidth: 512, generationHeight: 512,
  visualSpec: {
    camera: { shotSize: "medium close-up", angle: "eye level", axis: "", focus: "hands and phone", composition: "upper body" },
    characters: [{ characterId: "hero", outfitId: "outfit-1", shoeId: "shoe-1", position: "center", region: { xStart: 0, xEnd: 1 }, action: "reads a smartphone", actionTarget: "smartphone", expression: "happy", expressionReason: "message", gazeTarget: "smartphone screen", hands: "both hands holding the phone", occlusion: "none", appearanceState: { hair: "", bag: "", accessories: [], glasses: "", outerwearState: "", condition: [] } }],
    interactions: [{ type: "prop_interaction", actorCharacterId: "hero", targetCharacterId: "", propId: "smartphone", action: "reads", phase: "active", contactPoints: ["left hand", "right hand"], gazeTarget: "screen", ownershipBefore: "hero", ownershipAfter: "hero" }],
  },
} as unknown as Shot;

test("render plan routes only framing-relevant character assets", () => {
  const plan = buildRenderPlan(shot, assets, [character]);
  assert.equal(plan.candidateCount, 2);
  assert.equal(plan.camera.cropMode, "upper_body");
  assert.ok(plan.references.some((item) => item.role === "identity_face"));
  assert.ok(plan.references.some((item) => item.role === "turnaround"));
  assert.ok(plan.references.some((item) => item.role === "outfit"));
  assert.equal(plan.references.some((item) => item.role === "shoes"), false);
  assert.match(plan.hardRequirements.join(" "), /both hands holding the phone/);
  assert.equal(plan.controlBoard.interactions[0]?.propId, "smartphone");
});

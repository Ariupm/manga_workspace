import test from "node:test";
import assert from "node:assert/strict";
import { validateCharacterProfileDraft } from "../lib/character-profile-draft";

test("profile draft rejects missing or malformed visual fields before UI consumption", () => {
  const valid = {descriptionCn:"成年人物", appearanceEn:"adult woman", hairColorEn:"pink", hairStyleEn:"long", eyeColorEn:"brown", invariantsEn:["pink hair","brown eyes","adult"],profile:Object.fromEntries(["agePresentationEn","faceShapeEn","bodyTypeEn","skinToneEn","distinguishingFeaturesEn","temperamentEn","baseOutfitEn","baseShoesEn"].map(key=>[key,"specified"]))};
  assert.equal(validateCharacterProfileDraft(valid),valid);
  for (const bad of [null, {}, {...valid,invariantsEn:"pink hair"}, {...valid,hairStyleEn:"长发"}, {...valid,profile:{}}]) assert.throws(()=>validateCharacterProfileDraft(bad));
});

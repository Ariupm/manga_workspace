import type { Asset, Character, Shot } from "./types";

export type AssetReferenceRole = "identity_face" | "turnaround" | "expression" | "outfit" | "shoes";

export type RenderReference = {
  characterId: string;
  characterName: string;
  role: AssetReferenceRole;
  assetId: string;
  path: string;
  description: string;
  priority: number;
  region?: { xStart: number; xEnd: number };
};

export type CharacterAssetBundle = {
  characterId: string;
  characterName: string;
  version: string;
  invariants: string[];
  references: RenderReference[];
  warnings: string[];
};

export type RenderPlan = {
  version: "render-plan-v1";
  shotId: number;
  camera: { shotSize: string; composition: string; cropMode: "face" | "upper_body" | "full_body" };
  hardRequirements: string[];
  characterBundles: CharacterAssetBundle[];
  references: RenderReference[];
  controlBoard: {
    width: number;
    height: number;
    characters: Array<{
      characterId: string;
      name: string;
      region: { xStart: number; xEnd: number };
      action: string;
      hands: string;
      gazeTarget: string;
    }>;
    interactions: Array<{
      type: string;
      propId: string;
      actorCharacterId: string;
      contactPoints: string[];
      gazeTarget: string;
      center: { x: number; y: number };
    }>;
  };
  candidateCount: 2;
  maxRepairAttempts: 1;
};

const cropMode = (shotSize: string): RenderPlan["camera"]["cropMode"] =>
  /medium|近景|中景/i.test(shotSize) ? "upper_body" : /close|特写/i.test(shotSize) ? "face" : "full_body";

const roleForReferenceType = (type: string): AssetReferenceRole | null => {
  if (type === "face") return "identity_face";
  if (type === "turnaround") return "turnaround";
  if (type === "expressions") return "expression";
  if (type === "outfit") return "outfit";
  if (type === "shoes") return "shoes";
  return null;
};

export function buildCharacterAssetBundle(
  character: Character,
  assets: Asset[],
  shot: Shot,
): CharacterAssetBundle {
  const specCharacter = shot.visualSpec?.characters.find((item) => item.characterId === character.id);
  const region = specCharacter?.region;
  const selectedOutfitId = specCharacter?.outfitId || shot.characterLooks?.[character.id]?.outfitId || shot.outfitId;
  const selectedShoeId = specCharacter?.shoeId || shot.characterLooks?.[character.id]?.shoeId || shot.shoeId;
  const mode = cropMode(shot.visualSpec?.camera?.shotSize || shot.cameraEn || shot.camera);
  const references: RenderReference[] = [];
  const push = (reference: RenderReference) => {
    if (shot.referenceImagesEnabled !== false && reference.path && !references.some((item) => item.role === reference.role && item.path === reference.path)) references.push(reference);
  };
  for (const reference of character.references.filter((item) => item.confirmed)) {
    const role = roleForReferenceType(reference.type);
    if (!role || (role === "shoes" && mode !== "full_body") || (role === "turnaround" && mode === "face")) continue;
    push({ characterId: character.id, characterName: character.name, role, assetId: `character-reference:${reference.id}`, path: reference.path, description: `${character.name} confirmed ${reference.type} reference`, priority: role === "identity_face" ? 100 : role === "outfit" ? 85 : 70, region });
  }
  const identityAssets = assets.filter((asset) => asset.confirmed && asset.characterId === character.id && asset.type === "character");
  for (const asset of identityAssets) {
    push({ characterId: character.id, characterName: character.name, role: references.some((item) => item.role === "identity_face") ? "turnaround" : "identity_face", assetId: asset.id, path: asset.path, description: asset.visualDescriptionEn || asset.name, priority: 90, region });
  }
  const outfit = assets.find((asset) => asset.confirmed && asset.characterId === character.id && asset.id === selectedOutfitId);
  if (outfit) push({ characterId: character.id, characterName: character.name, role: "outfit", assetId: outfit.id, path: outfit.path, description: outfit.visualDescriptionEn || outfit.name, priority: 85, region });
  const shoes = mode === "full_body" ? assets.find((asset) => asset.confirmed && asset.characterId === character.id && asset.id === selectedShoeId) : null;
  if (shoes) push({ characterId: character.id, characterName: character.name, role: "shoes", assetId: shoes.id, path: shoes.path, description: shoes.visualDescriptionEn || shoes.name, priority: 50, region });
  const warnings = [
    references.some((item) => item.role === "identity_face") ? "" : `${character.name} lacks a confirmed identity reference`,
    outfit || mode === "face" ? "" : `${character.name} selected outfit has no confirmed image asset`,
  ].filter(Boolean);
  return {
    characterId: character.id,
    characterName: character.name,
    version: `${character.profileVersion || 1}:${character.identityMasterReferenceId || "legacy"}:${selectedOutfitId || "profile"}`,
    invariants: character.invariantsEn || [],
    references: references.sort((a, b) => b.priority - a.priority),
    warnings: shot.referenceImagesEnabled === false ? [] : warnings,
  };
}

export function buildRenderPlan(shot: Shot, assets: Asset[], characters: Character[]): RenderPlan {
  const shotSize = shot.visualSpec?.camera?.shotSize || shot.cameraEn || shot.camera;
  const bundles = shot.characterIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character))
    .map((character) => buildCharacterAssetBundle(character, assets, shot));
  const specCharacters = shot.visualSpec?.characters || [];
  const interactions = shot.visualSpec?.interactions || [];
  const hardRequirements = [
    `exactly ${shot.characterIds.length} principal character${shot.characterIds.length === 1 ? "" : "s"}`,
    `camera framing: ${shotSize}`,
    ...specCharacters.flatMap((item) => [`${item.characterId} action: ${item.action}`, `${item.characterId} hands: ${item.hands}`, `${item.characterId} gaze: ${item.gazeTarget}`]),
    ...interactions.map((item) => `${item.actorCharacterId} ${item.action} ${item.propId}; contacts ${item.contactPoints.join(" and ")}; gaze ${item.gazeTarget}`),
  ];
  return {
    version: "render-plan-v1",
    shotId: shot.id,
    camera: { shotSize, composition: shot.visualSpec?.camera?.composition || shot.compositionEn || "", cropMode: cropMode(shotSize) },
    hardRequirements,
    characterBundles: bundles,
    references: bundles.flatMap((bundle) => bundle.references),
    controlBoard: {
      width: shot.generationWidth || 512,
      height: shot.generationHeight || 512,
      characters: specCharacters.map((item, index) => ({ characterId: item.characterId, name: bundles.find((bundle) => bundle.characterId === item.characterId)?.characterName || item.characterId, region: item.region || { xStart: index / Math.max(1, specCharacters.length), xEnd: (index + 1) / Math.max(1, specCharacters.length) }, action: item.action, hands: item.hands, gazeTarget: item.gazeTarget })),
      interactions: interactions.map((item) => {
        const actor = specCharacters.find((character) => character.characterId === item.actorCharacterId);
        const centerX = actor ? (actor.region.xStart + actor.region.xEnd) / 2 : .5;
        return { type: item.type, propId: item.propId, actorCharacterId: item.actorCharacterId, contactPoints: item.contactPoints, gazeTarget: item.gazeTarget, center: { x: centerX, y: .58 } };
      }),
    },
    candidateCount: 2,
    maxRepairAttempts: 1,
  };
}

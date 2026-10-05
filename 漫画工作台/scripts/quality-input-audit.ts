import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deriveInteractionContracts, validateShotHandVisibility, validateShotActionSpecificity } from "../lib/prompts";
import { normalizeShotSpec, validateVisualIds } from "../lib/visual-planning";
import { resolveActionDescription } from "../lib/action-description";
import type { Asset, Character, Shot } from "../lib/types";

// Read the existing database without importing db.ts (which runs migrations).
const dbPath = path.resolve(process.argv[2] || "data/studio.db");
const out = path.resolve(process.argv[3] || `workspace/quality-audits/${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const episodeId = process.argv[4] === undefined ? null : Number(process.argv[4]);
if (episodeId !== null && (!Number.isInteger(episodeId) || episodeId <= 0)) throw new Error("Episode ID must be a positive integer");
if (fs.existsSync(out)) throw new Error("Refusing to overwrite an existing audit");
const db = new DatabaseSync(dbPath, { readOnly: true });
const parse = (value: unknown, fallback: unknown) => value ? JSON.parse(String(value)) : fallback;
const rows = db.prepare("SELECT s.*, p.episode_id, p.number page_number, e.project_id FROM shots s JOIN pages p ON p.id=s.page_id JOIN episodes e ON e.id=p.episode_id WHERE (? IS NULL OR p.episode_id=?) ORDER BY e.id,p.number,s.position").all(episodeId, episodeId);
if (episodeId !== null && !rows.length) throw new Error("Episode contains no shots");
const characters = db.prepare("SELECT id FROM characters").all() as unknown as Character[];
const assets = db.prepare("SELECT id,type,character_id characterId FROM assets").all() as unknown as Asset[];
const results = rows.map((row) => {
  const shot = {
    id: row.id, pageId: row.page_id, title: row.title, description: row.description,
    camera: row.camera, cameraEn: row.camera_en, characterIds: parse(row.character_ids, []),
    scene: row.scene, actionEn: row.action_en || "natural storytelling action", expressionEn: row.expression_en,
    sceneEn: row.scene_en, compositionEn: row.composition_en, outfitId: row.outfit_id, shoeId: row.shoe_id,
    characterLooks: parse(row.character_looks_json, {}), visualSpec: parse(row.visual_spec_json, null),
    visualSpecConfirmed: Boolean(row.visual_spec_confirmed), timeOfDay: row.time_of_day, lightingEn: row.lighting_en,
  } as Shot;
  try {
    const normalized = shot.visualSpecConfirmed && shot.visualSpec ? normalizeShotSpec(shot.visualSpec, shot) : null;
    const effective = normalized ? { ...shot, visualSpec: normalized } : shot;
    return {
      shotId: shot.id, projectId: row.project_id, episodeId: row.episode_id, page: row.page_number, position: row.position,
      title: shot.title, description: shot.description, confirmed: shot.visualSpecConfirmed, hasVisualSpec: Boolean(shot.visualSpec),
      scene: normalized?.scene || null, camera: normalized?.camera || null,
      visualValidation: normalized ? validateVisualIds(normalized, characters, assets) : null,
      characterCount: shot.characterIds.length,
      handConflicts: validateShotHandVisibility(effective),
      actionConflicts: validateShotActionSpecificity(effective),
      characters: shot.characterIds.map(id => ({
        id, action: resolveActionDescription(shot.characterLooks?.[id]?.actionEn, normalized?.characters.find(c => c.characterId === id)?.action, shot.actionEn),
        outfitId: shot.characterLooks?.[id]?.outfitId || normalized?.characters.find(c => c.characterId === id)?.outfitId || (id === shot.characterIds[0] ? shot.outfitId : ""),
        shoeId: shot.characterLooks?.[id]?.shoeId || normalized?.characters.find(c => c.characterId === id)?.shoeId || (id === shot.characterIds[0] ? shot.shoeId : ""),
        gaze: shot.characterLooks?.[id]?.gazeEn || normalized?.characters.find(c => c.characterId === id)?.gazeTarget || "",
        hands: shot.characterLooks?.[id]?.handsEn || normalized?.characters.find(c => c.characterId === id)?.hands || "",
        interactions: deriveInteractionContracts(effective, id).filter(c => c.required).map(c => ({ object: c.object, purpose: c.purpose, handMode: c.handMode })),
      })),
    };
  } catch (error) { return { shotId: shot.id, episodeId: row.episode_id, error: String(error) }; }
});
db.close();
const summary = { total: results.length, errors: results.filter(r => "error" in r).length,
  confirmedSpecs: results.filter(r => "confirmed" in r && r.confirmed).length,
  missingSpecs: results.filter(r => "hasVisualSpec" in r && !r.hasVisualSpec).length,
  invalidConfirmedSpecs: results.filter(r => "visualValidation" in r && r.visualValidation && !r.visualValidation.valid).map(r => r.shotId),
  handConflicts: results.filter(r => "handConflicts" in r && r.handConflicts?.length).map(r => r.shotId),
  actionConflicts: results.filter(r => "actionConflicts" in r && r.actionConflicts?.length).length,
  multiCharacter: results.filter(r => "characterCount" in r && Number(r.characterCount) > 1).length };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), dbPath, episodeId, scope: "input contracts only; no SD requests or database writes", summary, results }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ out, ...summary }));

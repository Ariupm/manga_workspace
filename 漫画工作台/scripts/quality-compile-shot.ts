import fs from "node:fs";
import { buildGenerationPrompt, buildRegionalPrompt } from "../lib/prompts";
import { preparePoseExecutionV3 } from "./pose-execution-v3.mjs";
import type { Shot, Asset, Character } from "../lib/types";

async function main() {
  const [projectId, episodeId, shotId] = process.argv.slice(2, 5).map(Number);
  const output = process.argv[5];
  if (![projectId, episodeId, shotId].every(x => Number.isInteger(x) && x > 0) || !output) throw new Error("Usage: project episode shot output.json");
  const response = await fetch(`http://127.0.0.1:3000/api/studio?projectId=${projectId}&episodeId=${episodeId}`);
  if (!response.ok) throw new Error(`Studio HTTP ${response.status}`);
  const data = await response.json() as { episode: { pages: Array<{ shots: Shot[] }> }; assets: Asset[]; characters: Character[] };
  const shot = data.episode.pages.flatMap(page => page.shots).find(shot => shot.id === shotId);
  if (!shot) throw new Error("Shot not found");
  const normal = buildGenerationPrompt(shot, data.assets, data.characters);
  const regional = buildRegionalPrompt(shot, data.assets, data.characters, { posePlannerVersion: "3.0" });
  const recipe = { poseControl: regional.poseControl, generationSpec: { repairPasses: regional.repairPasses, characterRegions: regional.characterRegions }, references: [] };
  preparePoseExecutionV3(recipe);
  fs.writeFileSync(output, JSON.stringify({ shot, normal, regional, recipe }, null, 2), { flag: "wx" });
  const plan = regional.poseControl?.scenePlan;
  console.log(JSON.stringify({ output, quality: normal.quality, gaze: normal.characterLooks, projection: plan && "projection" in plan ? plan.projection : null, safety: regional.poseControl?.safety }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import { getStudioData } from "../lib/db";
import { buildRegionalPrompt } from "../lib/prompts";

const projectId = Number(process.argv[2]);
const episodeId = Number(process.argv[3]);
if (!Number.isInteger(projectId) || !Number.isInteger(episodeId)) {
  console.error("Usage: tsx scripts/audit-pose-coverage.ts <projectId> <episodeId>");
  process.exit(2);
}

const data = getStudioData(projectId, episodeId);
const shots = data.episode.pages.flatMap((page) => page.shots);
const rows = shots.map((shot) => {
  const compiled = buildRegionalPrompt(shot, data.assets, data.characters);
  return {
    id: shot.id,
    characters: shot.characterIds.length,
    action: shot.actionEn,
    poseRequired: compiled.repairPasses.risk.poseRequired,
    family: compiled.repairPasses.risk.actionPlan?.family || "none",
    kind: compiled.poseControl?.kind || "none",
    selectorReason: compiled.poseControl?.selectorReason || "",
  };
});
const counts = Object.fromEntries(
  [...new Set(rows.map((row) => row.kind))].map((kind) => [kind, rows.filter((row) => row.kind === kind).length]),
);
const missingRequiredSinglePose = rows.filter((row) => row.characters === 1 && row.poseRequired && row.kind === "none");
console.log(JSON.stringify({ projectId, episodeId, shots: rows.length, counts, missingRequiredSinglePose, rows }, null, 2));
if (missingRequiredSinglePose.length) process.exitCode = 1;

// Explicit local diagnostic fixture builder. Reads a completed recipe, never
// changes production records or sends a generation request itself.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import assert from "node:assert/strict";
import { identityReferenceMaskPlan } from "./sd-worker-logic.mjs";

const jobId = Number(process.argv[2]);
const label = process.argv[3];
if (!Number.isInteger(jobId) || !/^[a-z0-9-]+$/.test(label || "")) throw new Error("Usage: jobId diagnostic-label [prompt-file]");
const db = new DatabaseSync("data/studio.db", { readOnly: true });
const row = db.prepare("SELECT payload,status FROM jobs WHERE id=?").get(jobId);
db.close();
if (!row || /running|queued/.test(row.status)) throw new Error("Source job must have finished");
const r = JSON.parse(row.payload).recipe;
const trace = r.requestTrace;
if (!trace || trace.regionalPrompterEnabled || !trace.controlUnits?.length) throw new Error("Only traced non-Regional base requests supported");
const encoded = file => fs.readFileSync(path.resolve(file)).toString("base64");
const stageImage = (stage, relationId) => {
  const entries = r.stageOutputs.filter(x => x.stage === stage && (!relationId || x.relationId === relationId));
  if (entries.length !== 1) throw new Error(`Ambiguous or missing ${stage}`);
  return encoded(entries[0].output.path);
};
const units = [];
for (const unit of trace.controlUnits) {
  const common = { enabled: true, module: unit.module, model: unit.model, weight: unit.weight, control_mode: unit.control_mode, low_vram: true, processor_res: 512 };
  if (unit.stage === "identity_reference") {
    const reference = r.references.find(x => x.role === "identity" && x.characterId === unit.characterId);
    const index = r.generationSpec.characterRegions.findIndex(x => x.characterId === unit.characterId);
    const plan = identityReferenceMaskPlan({ width: r.width, height: r.height, poseNose: r.poseControl.people[index][0], region: reference.region || r.generationSpec.characterRegions[index].region, shotSize: `${r.generationSpec.visualSpec?.camera?.shotSize || ""} ${r.prompt}` });
    assert.deepEqual(plan.bounds, unit.effectiveRegionMaskBounds, "Current mask planner differs from the saved request");
    const g = plan.pixelGeometry;
    const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}"><rect width="100%" height="100%" fill="black"/><ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="white"/></svg>`)).png().toBuffer();
    units.push({ ...common, image: encoded(reference.path), effective_region_mask: mask.toString("base64"), resize_mode: "Crop and Resize", threshold_a: .5, threshold_b: .5, guidance_start: 0, guidance_end: 1, pixel_perfect: true });
  } else if (unit.stage === "pose") {
    units.push({ ...common, image: stageImage("control_pose"), resize_mode: "Just Resize", guidance_start: r.poseControl.guidanceStart ?? 0, guidance_end: r.poseControl.guidanceEnd ?? .82, pixel_perfect: false });
  } else if (unit.stage === "initial_prop_structure") {
    units.push({ ...common, image: stageImage("control_prop", unit.relationId), resize_mode: "Just Resize", threshold_a: 64, threshold_b: 128, guidance_start: 0, guidance_end: .78, pixel_perfect: false });
  } else throw new Error(`Unsupported control stage: ${unit.stage}`);
}
const prompt = process.argv[4] ? fs.readFileSync(process.argv[4], "utf8").trim() : trace.prompt;
const fixture = {
  id: label, expectedCheckpoint: r.model.split(".safetensors")[0],
  purpose: "Base-stage diagnostic replay using saved production control images and reconstructed scalar settings. Optional prompt is the only fixture variant. No production jobs, approvals or candidates are written.",
  sourceJobId: jobId, sourceStatus: row.status, promptChanged: prompt !== trace.prompt,
  reconstruction: "identity mask uses the production planner; Pose/prop images use saved stage files; scalar settings match the production worker. This is a reconstructed request, not a captured raw payload.",
  payload: { prompt, negative_prompt: trace.negativePrompt, width: r.width, height: r.height, steps: r.steps, cfg_scale: r.cfgScale, seed: r.actualSeed ?? r.seed, sampler_name: r.sampler, scheduler: r.scheduler, batch_size: 1, n_iter: 1, send_images: true, save_images: false, alwayson_scripts: { ControlNet: { args: units } } },
};
const out = path.join("workspace/quality-fixtures", label);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "fixture.json"), JSON.stringify(fixture, null, 2), { flag: "wx" });
console.log(JSON.stringify({ out, sourceJobId: jobId, promptChanged: fixture.promptChanged, controlStages: trace.controlUnits.map(x => x.stage) }));

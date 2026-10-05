import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { compilePoseExecutionV3 } from "./pose-execution-v3.mjs";
import { outfitMaskPlan } from "./outfit-mask-plan.mjs";
import { propBodySizePlan } from "./sd-worker-logic.mjs";

const sourceDirectory = path.resolve(process.argv[2]);
const poseDirectory = path.resolve(process.argv[3]);
const out = path.resolve("workspace/quality-fixtures", process.argv[4]);
if (fs.existsSync(out)) throw new Error("Use a new diagnostic label");
const source = fs.readFileSync(path.join(sourceDirectory, "image.png"));
const { width, height } = await sharp(source).metadata();
const control = JSON.parse(fs.readFileSync(path.join(poseDirectory, "pose-plan.json"), "utf8"));
const execution = compilePoseExecutionV3(control, { propInteractions: control.scenePlan.relations });
const propBounds = execution.repairPasses.propInteractions.map(relation => {
  const anchors = relation.contactAnchors;
  const envelope = propBodySizePlan({ shape: "portrait_rect", orientation: "portrait", contactSpan: Math.max(...anchors.map(p => p.x)) - Math.min(...anchors.map(p => p.x)), hasPoseContact: true }).envelope;
  return { x: relation.objectCenter.x - envelope.width / 2, y: relation.objectCenter.y - envelope.height / 2, ...envelope };
});
const maskPlan = outfitMaskPlan({ width, height, person: control.people[0], people: control.people, region: { xStart: 0, xEnd: 1 }, zone: "upper", propBounds });
const mask = await sharp(Buffer.from(maskPlan.svg)).png().toBuffer();
if (maskPlan.empty || (await sharp(mask).stats()).channels[0].max === 0) throw new Error("No editable garment pixels");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "mask.png"), mask);
fs.writeFileSync(path.join(out, "mask-plan.json"), JSON.stringify(maskPlan, null, 2));
const fixture = { id: path.basename(out), endpoint: "/sdapi/v1/img2img", expectedCheckpoint: "DreamShaper_8_pruned",
  purpose: "隔离服装能力诊断：复用生产几何保护函数，对已知手机图做文字上衣重绘；无隔离服装参考，不等同生产通过隔离资产门禁的服装 pass。",
  sourceDirectory, poseDirectory,
  payload: { init_images: [source.toString("base64")], mask: mask.toString("base64"),
    prompt: "anime illustration, (cream yellow blouse:1.9), short sleeves, yellow fabric, preserve established body pose, face, hair, hands, smartphone and pink skirt",
    negative_prompt: "white blouse, white shirt, wrong garment color, extra coat, changed face, changed hair, changed pose, text, watermark",
    width, height, steps: 18, cfg_scale: 6.8, denoising_strength: .48, sampler_name: "DPM++ 2M", scheduler: "Karras", seed: 13579246,
    mask_blur: 8, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 40,
    batch_size: 1, n_iter: 1, send_images: true, save_images: false,
  },
};
fs.writeFileSync(path.join(out, "fixture.json"), JSON.stringify(fixture, null, 2));
console.log(JSON.stringify({ out, bounds: maskPlan.bounds, protectedRegions: maskPlan.protectedRegions }));

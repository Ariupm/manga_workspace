import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const input = path.resolve("workspace/generated/stages/sd-stage-job-450-outfit_refinement-character_xiaofen-ecbe8f78-8acf-44cf-935f-648b7a68505d.png");
const pose = path.resolve("workspace/generated/stages/sd-stage-job-450-control_pose-scene-d0f8c71a-e45a-4dec-abb6-eae8b92a85c5.png");
const guide = path.resolve("workspace/generated/stages/sd-stage-job-450-control_prop-character_xiaofen_smartphone_1-dd2cc369-4f43-4417-aafc-861bdb60e60f.png");
const width = 512, height = 512;
const maskSvg = Buffer.from(`<svg width="512" height="512"><rect width="512" height="512" fill="black"/><rect x="31" y="192" width="271" height="210" rx="16" fill="white"/><circle cx="166" cy="297" r="28" fill="white"/><circle cx="223" cy="297" r="28" fill="white"/></svg>`);
const mask = await sharp(maskSvg).png().toBuffer();
const body = {
  prompt: "masterpiece, best quality, anime illustration, one coherent modern slab smartphone centered between both hands at the declared action point, portrait orientation, thin black glass touchscreen, exactly one smartphone, both hands physically contact opposite side edges, five natural fingers per visible hand, preserve seated body pose and established character",
  negative_prompt: "missing smartphone, duplicate smartphone, phone at image edge, oversized smartphone, wallet, book, malformed hands, missing hand, one-hand grip, fused fingers, detached hands, changed face, changed hair, changed body pose",
  init_images: [fs.readFileSync(input).toString("base64")], mask: mask.toString("base64"), width, height,
  steps: 12, cfg_scale: 6.5, denoising_strength: .72, sampler_name: "DPM++ 2M", scheduler: "Karras",
  batch_size: 1, n_iter: 1, mask_blur: 8, inpainting_fill: 2, inpaint_full_res: false, inpaint_full_res_padding: 0, send_images: true,
  alwayson_scripts: { ControlNet: { args: [
    { enabled: true, module: "none", model: "control_v11p_sd15_openpose [cab727d4]", weight: 1, image: fs.readFileSync(pose).toString("base64"), effective_region_mask: mask.toString("base64"), resize_mode: "Just Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .9, control_mode: "ControlNet is more important", pixel_perfect: false },
    { enabled: true, module: "none", model: "control_sd15_canny [fef5e48e]", weight: 1.05, image: fs.readFileSync(guide).toString("base64"), resize_mode: "Just Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .9, control_mode: "ControlNet is more important", pixel_perfect: false },
  ] } },
};
const response = await fetch("http://127.0.0.1:7860/sdapi/v1/img2img", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const text = await response.text();
if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 500)}`);
const output = path.resolve("workspace/generated/prop-rebuild-whole-coordinate-test.png");
fs.writeFileSync(output, Buffer.from(JSON.parse(text).images[0], "base64"));
console.log(output);

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = path.resolve("workspace/generated/stages/sd-stage-job-448-outfit_refinement-character_xiaofen-8f40a110-48e8-4d7c-95e8-48a0203beb7e.png");
const { width, height } = await sharp(src).metadata();
const segmented = await sharp("workspace/generated/segmentation-detect-test.png").raw().toBuffer({ resolveWithObject: true });
const maskPixels = Buffer.alloc(width * height, 0);
for (let y = 285; y < height; y += 1) for (let x = 100; x < 440; x += 1) {
  const offset = (y * width + x) * segmented.info.channels;
  if (segmented.data[offset] === 150 && segmented.data[offset + 1] === 5 && segmented.data[offset + 2] === 61) maskPixels[y * width + x] = 255;
}
const mask = await sharp(maskPixels, { raw: { width, height, channels: 1 } }).blur(2).png().toBuffer();
const outfitPath = path.resolve("workspace/assets/xiaofen/XF-CASUAL-01.png");
const outfitMeta = await sharp(outfitPath).metadata();
const lowerReference = await sharp(outfitPath).extract({
  left: 0,
  top: Math.round(outfitMeta.height * .32),
  width: Math.round(outfitMeta.width * .72),
  height: Math.round(outfitMeta.height * .55),
}).png().toBuffer();
const response = await fetch("http://127.0.0.1:7860/sdapi/v1/img2img", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "masterpiece, best quality, anime illustration, (soft pink midi skirt:2.0), exact soft pink fabric color, lower-body skirt only, preserve upper-body clothing face hair hands pose and composition unchanged",
    negative_prompt: "yellow skirt, cream skirt, wrong garment color, changed face, changed hair, changed hands, changed pose",
    init_images: [fs.readFileSync(src).toString("base64")], mask: mask.toString("base64"), width, height,
    steps: 10, cfg_scale: 7, denoising_strength: .5, sampler_name: "DPM++ 2M", scheduler: "Karras",
    batch_size: 1, n_iter: 1, mask_blur: 8, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 32, send_images: true,
    alwayson_scripts: { ControlNet: { args: [{ enabled: true, module: "ip-adapter_clip_h", model: "ip-adapter-plus_sd15 [836b5c2e]", weight: .52, image: lowerReference.toString("base64"), effective_region_mask: mask.toString("base64"), resize_mode: "Crop and Resize", low_vram: true, processor_res: 512, guidance_start: 0, guidance_end: .85, control_mode: "Balanced", pixel_perfect: true }] } },
  }),
});
const text = await response.text();
if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
const output = path.resolve("workspace/generated/outfit-lower-segmented-reference-test.png");
fs.writeFileSync(output, Buffer.from(JSON.parse(text).images[0], "base64"));
console.log(output);

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourceDirectory = path.resolve(process.argv[2]);
const label = process.argv[3] || "seated-phone-gaze-inpaint";
const source = fs.readFileSync(path.join(sourceDirectory, "image.png"));
const metadata = await sharp(source).metadata();
if (metadata.width !== 512 || metadata.height !== 512) throw new Error("This diagnostic fixture expects the 512px comparison input");
const out = path.resolve("workspace/quality-fixtures", label);
if (fs.existsSync(out)) throw new Error("Fixture already exists; use a new label");
fs.mkdirSync(out, { recursive: true });
// Deliberately isolate head direction; preserve hands, phone and clothing pixels.
// Bounds are explicit experiment inputs, not production character-specific rules.
const maskSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/><ellipse cx="252" cy="111" rx="72" ry="104" fill="white"/></svg>';
const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
fs.writeFileSync(path.join(out, "mask.png"), mask);
const fixture = {
  id: label, endpoint: "/sdapi/v1/img2img", expectedCheckpoint: "DreamShaper_8_pruned",
  purpose: "隔离视线实验：沿用双手持手机输出，只重绘脸部；不等同于生产 gaze pass，可能改变身份，必须独立检查。",
  sourceDirectory,
  payload: {
    init_images: [source.toString("base64")], mask: mask.toString("base64"),
    prompt: "(looking down at the smartphone in her hands:1.5), (head bowed, chin lowered:1.35), eyes directed downward, reading the phone screen, adult woman, long pastel pink hair, pink-brown eyes, soft expression, anime illustration, soft daylight",
    negative_prompt: "looking at viewer, eye contact, looking up, front-facing portrait, closed eyes, different hair color, short hair, deformed face, blurry, text, watermark",
    width: 512, height: 512, steps: 18, cfg_scale: 6, sampler_name: "DPM++ 2M", scheduler: "Karras", seed: 13579246,
    denoising_strength: .55, mask_blur: 8, inpainting_fill: 1, inpaint_full_res: true, inpaint_full_res_padding: 96,
    inpainting_mask_invert: 0, batch_size: 1, n_iter: 1, send_images: true, save_images: false,
  },
};
fs.writeFileSync(path.join(out, "fixture.json"), JSON.stringify(fixture, null, 2));
console.log(JSON.stringify({ out, sourceDirectory }));

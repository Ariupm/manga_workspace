import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { compositeMaskedOutput } from "./masked-composite.mjs";

const out = path.resolve(process.argv[2]);
const request = JSON.parse(fs.readFileSync(path.join(out, "request.json"), "utf8"));
const label = process.argv[3] || "composited";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid composite label");
const output = path.join(out, `${label}.png`);
if (fs.existsSync(output)) throw new Error("Diagnostic composite already exists");
const base = request.payload.init_images[0], mask = request.payload.mask;
const generated = fs.readFileSync(path.join(out, "image.png")).toString("base64");
const result = Buffer.from(await compositeMaskedOutput(base, generated, mask), "base64");
const a = await sharp(Buffer.from(base, "base64")).removeAlpha().raw().toBuffer();
const b = await sharp(result).removeAlpha().raw().toBuffer();
const m = await sharp(Buffer.from(mask, "base64")).removeAlpha().greyscale().raw().toBuffer();
let protectedPixels = 0, changedProtectedPixels = 0;
for (let i = 0; i < m.length; i++) if (m[i] === 0) {
  protectedPixels++;
  if ([0, 1, 2].some(channel => a[3 * i + channel] !== b[3 * i + channel])) changedProtectedPixels++;
}
fs.writeFileSync(output, result);
const evidence = { output, protectedPixels, changedProtectedPixels, method: "production compositeMaskedOutput; RGB comparison wherever original mask equals zero" };
fs.writeFileSync(path.join(out, `${label}-review.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));

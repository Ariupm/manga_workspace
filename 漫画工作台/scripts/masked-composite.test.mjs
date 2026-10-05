import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { compositeMaskedOutput } from "./masked-composite.mjs";

test("RGB and RGBA masks use their luminance as one alpha channel", async () => {
  const base = await sharp({ create: { width: 3, height: 1, channels: 3, background: { r: 20, g: 40, b: 60 } } }).png().toBuffer();
  const generated = await sharp({ create: { width: 3, height: 1, channels: 3, background: { r: 220, g: 140, b: 100 } } }).png().toBuffer();
  for (const channels of [1, 3, 4]) {
    const pixels = Buffer.from([0, 128, 255].flatMap(value => channels === 1 ? [value] : channels === 3 ? [value, value, value] : [value, value, value, 255]));
    const mask = await sharp(pixels, { raw: { width: 3, height: 1, channels } }).png().toBuffer();
    const result = await compositeMaskedOutput(base.toString("base64"), generated.toString("base64"), mask.toString("base64"));
    const rgb = await sharp(Buffer.from(result, "base64")).removeAlpha().raw().toBuffer();
    assert.deepEqual([...rgb.subarray(0, 3)], [20, 40, 60], `black mask (${channels} channels) must preserve source exactly`);
    assert.deepEqual([...rgb.subarray(6, 9)], [220, 140, 100], "white mask must apply generated pixels");
    for (const [index, expected] of [120, 90, 80].entries()) assert.ok(Math.abs(rgb[3 + index] - expected) <= 1, "gray mask must blend");
  }
});

test("dimension mismatch rejects rather than resizing a protection mask", async () => {
  const img = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const mask = await sharp({ create: { width: 3, height: 3, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(compositeMaskedOutput(img.toString("base64"), img.toString("base64"), mask.toString("base64")));
  await assert.rejects(compositeMaskedOutput(mask.toString("base64"), img.toString("base64"), img.toString("base64")), /Source image/);
});

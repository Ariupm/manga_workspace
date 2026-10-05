import sharp from "sharp";

// Shared by production local passes and diagnostic replay. Black mask pixels
// must preserve the prior image exactly, even if the backend blurs its mask.
export async function compositeMaskedOutput(base64, generatedBase64, maskBase64) {
  const base = Buffer.from(base64, "base64");
  const baseInfo = await sharp(base).metadata();
  // Encoded PNG output can expand grayscale back to RGBA. Passing that PNG
  // into joinChannel appends multiple channels instead of a single alpha mask.
  const { data: alpha, info } = await sharp(Buffer.from(maskBase64, "base64"))
    .removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  // Sharp schedules removeAlpha after channel joining, regardless of call
  // order. Finish RGB decoding first so it cannot strip the newly added mask.
  const { data: rgb, info: generatedInfo } = await sharp(Buffer.from(generatedBase64, "base64"))
    .removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (generatedInfo.width !== info.width || generatedInfo.height !== info.height) throw new Error("Local output and mask dimensions differ");
  if (baseInfo.width !== info.width || baseInfo.height !== info.height) throw new Error("Source image and mask dimensions differ");
  const overlay = await sharp(rgb, { raw: { width: generatedInfo.width, height: generatedInfo.height, channels: generatedInfo.channels } })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
  return (await sharp(base)
    .composite([{ input: overlay, blend: "over" }]).png().toBuffer()).toString("base64");
}

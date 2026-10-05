import http from "node:http";
import https from "node:https";
import sharp from "sharp";

export function characterAssetSdPayload(job, { masterImage, models = [], modules = [] } = {}) {
  const needsIdentity = job.asset_type !== "face";
  const model = models.find(value => value.startsWith("ip-adapter-plus-face_sd15"));
  const module = modules.find(value => ["ip-adapter_clip_h", "ip-adapter_clip_sd15"].includes(value));
  if (needsIdentity && (!masterImage || !model || !module)) throw new Error("SD 人物资产缺少已确认身份母版或 IP-Adapter 身份控制，未使用无身份约束降级");
  return {
    prompt: job.prompt, negative_prompt: job.negative_prompt,
    width: job.asset_type === "turnaround" ? 640 : 512,
    height: job.asset_type === "outfit" ? 640 : 512,
    steps: 16, cfg_scale: 6.5, sampler_name: "DPM++ 2M", scheduler: "Karras",
    seed: -1, batch_size: 1, n_iter: 1, send_images: true,
    ...(needsIdentity ? { alwayson_scripts: { ControlNet: { args: [{
      enabled: true, module, model, image: masterImage, weight: .8,
      resize_mode: "Crop and Resize", low_vram: true, processor_res: 512,
      guidance_start: 0, guidance_end: .85, control_mode: "Balanced", pixel_perfect: false,
    }] } } } : {}),
  };
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const client = new URL(url).protocol === "https:" ? https : http;
    const request = client.request(url, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`SD 人物资产请求失败：HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("SD 返回无效JSON")); }
      });
    });
    request.setTimeout(4 * 60 * 60 * 1000, () => request.destroy(new Error("SD 人物资产生成超时")));
    request.on("error", reject); request.end(body);
  });
}

export async function generateCharacterAssetSd(base, payload) {
  const result = await post(`${base}/sdapi/v1/txt2img`, payload);
  if (typeof result.images?.[0] !== "string") throw new Error("SD 未返回人物资产图片");
  const source = Buffer.from(result.images[0].replace(/^data:image\/[^;]+;base64,/, ""), "base64");
  const image = await sharp(source).png().toBuffer();
  const metadata = await sharp(image).metadata();
  if (metadata.width !== payload.width || metadata.height !== payload.height) throw new Error("SD 人物资产尺寸与请求不一致");
  return { image, info: result.info || null };
}

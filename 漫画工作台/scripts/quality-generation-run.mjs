import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Explicit diagnostic requests only; never writes production jobs or candidates.
const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const endpoint = fixture.endpoint || "/sdapi/v1/txt2img";
if (!["/sdapi/v1/txt2img", "/sdapi/v1/img2img"].includes(endpoint)) throw new Error("Unsupported diagnostic endpoint");
const base = "http://127.0.0.1:7860";
const get = async (route) => {
  const r = await fetch(base + route, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`${route}: HTTP ${r.status}`);
  return r.json();
};
const options = await get("/sdapi/v1/options");
const progress = await get("/sdapi/v1/progress?skip_current_image=true");
if (progress.state?.job_count > 0 || progress.state?.job) throw new Error("SD is busy; diagnostic request not submitted");
if (!String(options.sd_model_checkpoint).startsWith(fixture.expectedCheckpoint)) throw new Error("Unexpected loaded checkpoint");
const out = path.resolve("workspace/quality-runs", new Date().toISOString().replace(/[:.]/g, "-") + "-" + fixture.id);
fs.mkdirSync(out, { recursive: true });
const started = Date.now();
const status = { id: fixture.id, pid: process.pid, state: "submitted", startedAt: new Date(started).toISOString(), outputDirectory: out };
const saveStatus = () => fs.writeFileSync(path.join(out, "status.json"), JSON.stringify(status, null, 2));
fs.writeFileSync(path.join(out, "request.json"), JSON.stringify({ ...fixture, runtime: { model: options.sd_model_checkpoint, vae: options.sd_vae, clipSkip: options.CLIP_stop_at_last_layers } }, null, 2));
saveStatus();
console.log(JSON.stringify(status));
const timer = setInterval(async () => {
  try { const p = await get("/sdapi/v1/progress?skip_current_image=true"); status.progress = p.progress; status.samplingStep = p.state?.sampling_step; status.heartbeatAt = new Date().toISOString(); saveStatus(); console.log(JSON.stringify({ progress: p.progress, step: status.samplingStep })); }
  catch (e) { console.log("Progress observation failed: " + e.message); }
}, 30000);
try {
  const data = JSON.stringify(fixture.payload);
  const result = await new Promise((resolve, reject) => {
    const req = http.request(base + endpoint, { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("error", reject);
      res.on("end", () => { try { const body = Buffer.concat(chunks).toString(); if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`); resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on("error", reject); req.end(data);
  });
  if (!result.images?.length) throw new Error("No image returned");
  const bytes = Buffer.from(result.images[0], "base64");
  const metadata = await sharp(bytes).metadata();
  await sharp(bytes).raw().toBuffer();
  fs.writeFileSync(path.join(out, "image.png"), bytes);
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ info: result.info, width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(bytes).digest("hex"), elapsedSeconds: (Date.now() - started) / 1000, visualVerdict: "pending" }, null, 2));
  const finalProgress = await get("/sdapi/v1/progress?skip_current_image=true");
  status.interrupted = finalProgress.state?.interrupted === true;
  status.state = status.interrupted ? "interrupted_output_not_valid_for_comparison" : "generated_pending_visual_review";
} catch (error) { status.state = "failed"; status.error = error.message; process.exitCode = 1; }
finally { clearInterval(timer); status.finishedAt = new Date().toISOString(); saveStatus(); console.log(JSON.stringify(status)); }

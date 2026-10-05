import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { evaluateCaptionForRequiredProps, automaticVisualGateDisposition } from "./sd-worker-logic.mjs";

const source = path.resolve(process.argv[2]);
const out = path.resolve("workspace/quality-runs", process.argv[3]);
if (fs.existsSync(out)) throw new Error("Use a new diagnostic label");
const progress = await (await fetch("http://127.0.0.1:7860/sdapi/v1/progress?skip_current_image=true")).json();
if (progress.state?.job_count > 0 || progress.state?.job) throw new Error("SD is busy; do not overlap detection and generation");
fs.mkdirSync(out, { recursive: true });
const bytes = fs.readFileSync(source);
const status = { state: "running", pid: process.pid, startedAt: new Date().toISOString(), source, sha256: createHash("sha256").update(bytes).digest("hex"), outputDirectory: out };
const save = () => fs.writeFileSync(path.join(out, "status.json"), JSON.stringify(status, null, 2));
save(); console.log(JSON.stringify(status));
const heartbeat = setInterval(() => console.log(JSON.stringify({ state: "waiting_for_interrogate_response", pid: process.pid })), 30000);
try {
  const body = JSON.stringify({ image: bytes.toString("base64"), model: "clip" });
  const response = await new Promise((resolve, reject) => {
    const req = http.request("http://127.0.0.1:7860/sdapi/v1/interrogate", { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("error", reject);
      res.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString();
          if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`);
          resolve(JSON.parse(text));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject); req.end(body);
  });
  const evaluated = evaluateCaptionForRequiredProps(String(response.caption || ""), [{ object: "smartphone", required: true }]);
  const result = { status: evaluated.missing.length ? "blocked" : "passed", ...evaluated };
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ response, result, disposition: automaticVisualGateDisposition({ enabled: true }, result, 2) }, null, 2));
  status.state = "completed";
} catch (e) { status.state = "failed"; status.error = e.message; process.exitCode = 1; }
finally { clearInterval(heartbeat); status.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify(status)); }

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const jobId = Number(process.argv[2]);
const db = new DatabaseSync(path.join(root, "data", "studio.db"));
db.exec("PRAGMA busy_timeout=5000");
const one = (sql, ...args) => db.prepare(sql).get(...args);
const row = one("SELECT * FROM character_asset_jobs WHERE id=?", jobId);
if (!row || row.status !== "queued") process.exit(0);

const codexJs = path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || "", ".codex");
const generatedDir = path.join(codexHome, "generated_images");
const jobDir = path.join(root, "workspace", "character-jobs");
const outputDir = path.join(root, "workspace", "assets", "characters", row.character_id, "candidates");
const lockPath = path.join(root, "workspace", "character-jobs", "imagegen.lock");
fs.mkdirSync(jobDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

function update(status, stage, error = "") {
  db.prepare("UPDATE character_asset_jobs SET status=?,stage=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, stage, error, jobId);
}
function listPngs(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [], pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) found.push(file);
    }
  }
  return found;
}
function validPng(file) {
  try {
    if (fs.statSync(file).size < 1024) return false;
    const header = Buffer.alloc(8), handle = fs.openSync(file, "r");
    fs.readSync(handle, header, 0, 8, 0); fs.closeSync(handle);
    return header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  } catch { return false; }
}
function run(args, logPath) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(logPath, { flags: "a" });
    const child = spawn(process.execPath, [codexJs, ...args], { cwd: jobDir, windowsHide: true, env: process.env });
    child.stdin.end(); child.stdout.pipe(log); child.stderr.pipe(log);
    child.on("error", reject); child.on("close", (code) => { log.end(); resolve(code); });
  });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function acquireGlobalLock() {
  for (;;) {
    try {
      const handle = fs.openSync(lockPath, "wx");
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, jobId, createdAt: new Date().toISOString() }));
      fs.closeSync(handle);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 30 * 60 * 1000) {
          fs.rmSync(lockPath, { force: true });
          continue;
        }
      } catch {}
      update("queued", "其他人物资产正在生成，正在排队");
      await delay(3000);
    }
  }
}

try {
  if (!fs.existsSync(codexJs)) throw new Error("未找到 Codex CLI，角色资产任务已保留，可稍后重试或手工上传");
  await acquireGlobalLock();
  update("running", "正在调用 Codex imagegen");
  const master = row.master_reference_id ? one("SELECT path FROM character_references WHERE id=? AND confirmed=1", row.master_reference_id) : null;
  if (row.asset_type !== "face" && !master) throw new Error("已确认的身份母版不存在，请重新生成标准正脸");
  const count = row.asset_type === "face" ? 3 : 2;
  for (let index = 1; index <= count; index++) {
    update("running", `正在生成候选 ${index}/${count}`);
    const before = new Set(listPngs(generatedDir));
    const started = Date.now();
    const resultPath = path.join(jobDir, `asset-job-${jobId}-${index}.json`);
    const logPath = path.join(jobDir, `asset-job-${jobId}.jsonl`);
    const prompt = [
      "$imagegen", "Generate exactly one polished, text-free character asset image.",
      `Asset specification: ${row.prompt}`, `Negative constraints: ${row.negative_prompt}`,
      master ? "Use the attached confirmed face image as the strict identity master. Preserve face, hair, eye color, age and body identity." : "Create a distinctive canonical identity that can be reused as a strict reference.",
      `This is candidate ${index}; vary only minor presentation details, never the identity.`,
      "Use the built-in image generation tool. Do not edit source code or copy files. Return JSON matching the requested schema."
    ].join("\n");
    const references = master ? [path.resolve(root, master.path)] : [];
    const args = ["exec", "--json", "--skip-git-repo-check", "--output-schema", path.join(root, "scripts", "codex-result.schema.json"), "-o", resultPath, "--sandbox", "danger-full-access", ...references.flatMap((file) => ["-i", file]), "--", prompt];
    const code = await run(args, logPath);
    if (code !== 0) throw new Error(`Codex imagegen 退出码 ${code}，详见 workspace/character-jobs/asset-job-${jobId}.jsonl`);
    const report = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    const reported = (report.imagePaths || []).map((file) => path.resolve(file)).filter(validPng);
    const discovered = listPngs(generatedDir).filter((file) => !before.has(file) && fs.statSync(file).mtimeMs >= started - 2000 && validPng(file)).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
    // Prefer the path explicitly returned by this Codex invocation. Directory
    // discovery is only a fallback for older Codex outputs that return an
    // unusable placeholder path.
    const source = reported.at(-1) || discovered.at(-1);
    if (!source) throw new Error("Codex 已结束，但没有发现新的有效 PNG");
    const destination = path.join(outputDir, `${row.asset_type}-job-${jobId}-${index}.png`);
    fs.copyFileSync(source, destination);
    if (!validPng(destination)) throw new Error("角色候选图校验失败");
    db.prepare("INSERT INTO character_asset_candidates(job_id,character_id,asset_type,path) VALUES(?,?,?,?)").run(jobId, row.character_id, row.asset_type, path.relative(root, destination).replaceAll("\\", "/"));
  }
  update("completed", "候选已生成，等待确认");
} catch (error) {
  update("failed", "生成失败", error instanceof Error ? error.message : String(error));
} finally {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (lock.pid === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {}
}

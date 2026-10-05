import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const memoryPath = path.join(root, "PROJECT_MEMORY.md");
const pendingPath = path.join(root, "PROJECT_MEMORY.pending.md");
const apply = process.argv.includes("--apply");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) return `无法执行 ${command}: ${result.error.message}`;
  return (result.stdout || result.stderr || "").trim();
}

function redact(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]");
}

function changedFiles() {
  const status = run("git", ["status", "--short"]);
  if (!status || status.startsWith("无法执行")) return [status || "工作区无 Git 变更或无法读取 Git 状态"];
  const files = status
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[ MADRCU?!]+/, "").trim())
    .filter((file) => file && !/(^|[\\/])\.env(?:\.|$)|(?:^|[\\/])data[\\/]studio\.db(?:-|$)|(?:^|[\\/])workspace[\\/]/i.test(file));
  return files.length ? files : ["仅检测到被忽略的运行数据变更，未写入敏感或生成产物路径"];
}

function testSummary() {
  const result = spawnSync("pnpm", ["test"], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.error) return `测试未执行：${result.error.message}`;
  const output = redact(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
  const lines = output.split(/\r?\n/).filter(Boolean);
  return lines.slice(-8).join("\n") || `测试退出码：${result.status ?? "unknown"}`;
}

const now = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replace(/\//g, "-");
const files = changedFiles();
const tests = testSummary();
const section = [
  `\n## 自动同步草稿（${now}）`,
  "",
  "> 本节由 `pnpm memory:sync` 生成，写入正式项目记忆前必须人工确认。",
  "",
  "### 检测到的代码变更",
  ...files.map((file) => `- ${file}`),
  "",
  "### 最近一次测试摘要",
  "```text",
  tests,
  "```",
  "",
  "### 人工确认项",
  "- [ ] 确认这些变更确实影响项目架构、运行方式、生成参数或已知缺陷。",
  "- [ ] 将必要的长期事实整理到对应章节，并删除临时信息。",
  "- [ ] 确认未包含密钥、个人路径、运行产物或未经验证的推断。",
].join("\n");

fs.writeFileSync(pendingPath, `${section}\n`, "utf8");
if (apply) {
  const current = fs.readFileSync(memoryPath, "utf8");
  const withoutOldPending = current.replace(/\n## 自动同步草稿（[\s\S]*$/m, "\n");
  fs.writeFileSync(memoryPath, `${withoutOldPending.trimEnd()}\n${section}\n`, "utf8");
  fs.unlinkSync(pendingPath);
  console.log(`已确认并写入 ${path.basename(memoryPath)}`);
} else {
  console.log(`已生成待确认草稿：${path.basename(pendingPath)}`);
  console.log("检查内容后运行 pnpm memory:sync:apply 才会写入 PROJECT_MEMORY.md。");
}

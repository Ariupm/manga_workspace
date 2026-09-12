import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VALID_STATUSES = new Set([
  "open", "in_progress", "fixed_pending_review", "verified",
  "partially_fixed", "rejected", "blocked", "regression",
]);

export const SOLVER_ACTIONABLE_STATUSES = new Set([
  "open", "in_progress", "partially_fixed", "regression",
]);

export const REQUIRED_FIELDS = [
  "优先级", "状态", "用户报告", "已确认事实", "高概率原因", "未验证假设",
  "反证或冲突", "复现步骤", "涉及文件", "影响范围", "建议方案", "验收标准",
  "解决 Agent 修改", "解决 Agent 测试", "残余风险", "诊断 Agent 复核证据",
  "诊断 Agent 复核结论", "后续处理",
];

export const ACTIVE_ISSUE_PATH = "PROJECT_ACTIVE_ISSUE.md";

export function parseLedger(markdown) {
  const matches = [...markdown.matchAll(/^## (ISSUE-[A-Z0-9-]+) (.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end);
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const field = line.match(/^- ([^：]+)：(.*)$/);
      if (field) fields[field[1].trim()] = field[2].trim();
    }
    return { id: match[1], title: match[2].trim(), fields, block };
  });
}

const isPending = (value = "") => !value || /^(待填写|待补充|无)$/i.test(value.trim());

export function validateLedger(markdown) {
  const issues = parseLedger(markdown);
  const errors = [];
  const seen = new Set();
  for (const issue of issues) {
    if (seen.has(issue.id)) errors.push(`${issue.id} 重复`);
    seen.add(issue.id);
    for (const field of REQUIRED_FIELDS)
      if (!(field in issue.fields)) errors.push(`${issue.id} 缺少字段：${field}`);
    if (!VALID_STATUSES.has(issue.fields.状态))
      errors.push(`${issue.id} 状态无效：${issue.fields.状态 || "空"}`);
  }
  if (!issues.length) errors.push("未找到任何 ISSUE 记录");
  return { issues, errors };
}

export function prepareHandoff(issue) {
  if (issue.fields.状态 !== "fixed_pending_review")
    throw new Error(`${issue.id} 当前状态为 ${issue.fields.状态}，必须先由解决 Agent 标记为 fixed_pending_review`);
  const missing = ["解决 Agent 修改", "解决 Agent 测试", "残余风险"]
    .filter((field) => isPending(issue.fields[field]));
  if (missing.length) throw new Error(`${issue.id} 交接证据不完整：${missing.join("、")}`);
  return [
    `# ${issue.id} 诊断复核清单`, "",
    `- 问题：${issue.title}`,
    `- 原始复现：${issue.fields.复现步骤}`,
    `- 原始验收：${issue.fields.验收标准}`,
    `- 解决修改：${issue.fields["解决 Agent 修改"]}`,
    `- 解决测试：${issue.fields["解决 Agent 测试"]}`,
    `- 残余风险：${issue.fields.残余风险}`, "",
    "## 解决 Agent 全链路冲突复核", "",
    "- [ ] 已核对视觉规格到 prompt、recipe 和实际 payload 的事实一致性。",
    "- [ ] 已核对 Regional/ControlNet 与身份、服装、Pose、道具、视线 pass 的控制不冲突。",
    "- [ ] 已核对单人/多人、近中远景、不同区域及非目标镜头不会误用本次修复。",
    "- [ ] 已核对降级、失败、人工审批和正式候选回写状态闭合且不虚报已应用。",
    "- [ ] 已将发现的独立新风险写入问题台账，未把局部修复直接等同于完整图片链可用。", "",
    "## 诊断 Agent 必查", "",
    "- [ ] 重新执行原始复现步骤。",
    "- [ ] 核对代码是否修复根因，而非仅增加提示词。",
    "- [ ] 核对任务 recipe、实际 payload、worker 日志和 postprocessWarnings。",
    "- [ ] 不启动 SD 或生成测试图；从代码路径检查图片生成逻辑。",
    "- [ ] 检查不同人物、区域、动作、道具和景别的通用性与回归风险。",
    "- [ ] 复核局部修改放回完整出图业务链后没有产生跨阶段控制冲突。",
    "- [ ] 核对结论注明：程序逻辑验收通过，未进行图片生成或视觉效果验收。",
    "- [ ] 将状态更新为 verified、partially_fixed、open、regression 或 rejected。",
  ].join("\n");
}

function usage() {
  console.error("用法：node scripts/issue-ledger.mjs <check|queue|activate|handoff|review> [ISSUE-ID]");
}

export function runCli(argv, root = process.cwd()) {
  const [command, issueId] = argv;
  const ledgerPath = path.join(root, "PROJECT_ISSUES.md");
  const markdown = fs.readFileSync(ledgerPath, "utf8");
  const { issues, errors } = validateLedger(markdown);
  if (errors.length) throw new Error(`问题台账校验失败：\n- ${errors.join("\n- ")}`);
  if (command === "check") {
    console.log(`问题台账有效：${issues.length} 个问题`);
    return;
  }
  if (command === "queue") {
    const actionable = issues.filter((issue) => SOLVER_ACTIONABLE_STATUSES.has(issue.fields.状态));
    if (!actionable.length) {
      console.log("解决队列为空；fixed_pending_review 问题应交给诊断 Agent 复核。");
      return;
    }
    console.log(actionable.map((issue) => `${issue.id}\t${issue.fields.优先级}\t${issue.fields.状态}\t${issue.title}`).join("\n"));
    process.exitCode = 2;
    return;
  }
  if (command === "activate" && issueId?.toLowerCase() === "all") {
    const active = [
      "# 当前活动问题", "",
      "> 解决 Agent 新开对话时读取本文件，自动确定本次任务。",
      "> 默认处理全部 open/in_progress/partially_fixed/regression 问题；指定单项运行：pnpm issue:activate -- ISSUE-ID。", "",
      "- 当前问题 ID：ALL_OPEN_ISSUES",
      "- 当前角色：解决 Agent",
      "- 当前状态：active",
      "- 任务说明：按 P0 → P1 → P2 及台账顺序逐项处理全部 open/in_progress/partially_fixed/regression 问题；每项独立测试并标记 fixed_pending_review，不得标记 verified。结束前必须运行 pnpm issue:queue，只有队列为空才能结束。",
      `- 激活时间：${new Date().toISOString().slice(0, 10)}`,
      "- 激活者：用户", "",
    ].join("\n");
    fs.writeFileSync(path.join(root, ACTIVE_ISSUE_PATH), active, "utf8");
    console.log("已激活全部未解决问题模式");
    return;
  }
  if (!issueId) { usage(); throw new Error("缺少 ISSUE-ID"); }
  const issue = issues.find((item) => item.id === issueId);
  if (!issue) throw new Error(`未找到问题：${issueId}`);
  if (command === "activate") {
    const active = [
      "# 当前活动问题", "",
      "> 解决 Agent 新开对话时读取本文件，自动确定本次任务。",
      "> 修改当前任务请运行：pnpm issue:activate -- ISSUE-ID。", "",
      `- 当前问题 ID：${issue.id}`,
      "- 当前角色：解决 Agent",
      `- 当前状态：${issue.fields.状态}`,
      `- 任务说明：处理“${issue.title}”；先读取 PROJECT_ISSUES.md 中对应记录，确认诊断证据仍有效，再实施最小范围修复。`,
      `- 激活时间：${new Date().toISOString().slice(0, 10)}`,
      "- 激活者：用户", "",
    ].join("\n");
    fs.writeFileSync(path.join(root, ACTIVE_ISSUE_PATH), active, "utf8");
    console.log(`已激活 ${issue.id}：${issue.title}`);
    return;
  }
  if (command === "handoff") {
    console.log(prepareHandoff(issue));
    return;
  }
  if (command === "review") {
    console.log(issue.block.trim());
    console.log("\n---\n诊断 Agent 必须独立复现并更新台账；本命令不会自动标记 verified。");
    return;
  }
  usage();
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}


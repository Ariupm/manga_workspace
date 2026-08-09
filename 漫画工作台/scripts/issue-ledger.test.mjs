import assert from "node:assert/strict";
import test from "node:test";
import { parseLedger, prepareHandoff, validateLedger } from "./issue-ledger.mjs";

const fields = (status = "open") => [
  "优先级：P0", `状态：${status}`, "用户报告：x", "已确认事实：x", "高概率原因：x",
  "未验证假设：x", "反证或冲突：x", "复现步骤：x", "涉及文件：x", "影响范围：x",
  "建议方案：x", "验收标准：x", "解决 Agent 修改：修改 a", "解决 Agent 测试：测试 b",
  "残余风险：风险 c", "诊断 Agent 复核证据：待填写", "诊断 Agent 复核结论：待填写", "后续处理：x",
].map((line) => `- ${line}`).join("\n");

test("解析问题和字段", () => {
  const issues = parseLedger(`## ISSUE-GAZE-001 标题\n\n${fields()}`);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].fields.状态, "open");
});

test("拒绝非法状态和重复 ID", () => {
  const source = `## ISSUE-X-001 A\n${fields("done")}\n## ISSUE-X-001 B\n${fields()}`;
  const result = validateLedger(source);
  assert.ok(result.errors.some((x) => x.includes("状态无效")));
  assert.ok(result.errors.some((x) => x.includes("重复")));
});

test("只有待复核且证据完整的问题可交接", () => {
  const open = parseLedger(`## ISSUE-X-001 A\n${fields()}`)[0];
  assert.throws(() => prepareHandoff(open), /fixed_pending_review/);
  const ready = parseLedger(`## ISSUE-X-001 A\n${fields("fixed_pending_review")}`)[0];
  assert.match(prepareHandoff(ready), /诊断复核清单/);
});


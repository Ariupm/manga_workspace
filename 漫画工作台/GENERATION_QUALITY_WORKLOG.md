# 漫画生图质量修复记录

## 本轮目标与验收（2026-09-19）

用户要求：人物身份、服装、四肢、动作、视线、道具以及道路/场景符合剧情；记录每次改动、目的和验证效果。用户本轮明确允许 Stable Diffusion 生图，此授权优先于既有“不运行 SD”的局部验收限制。仍保留草稿整体确认与成品自动门禁，不代替用户批准正式候选。

目标仍在进行中。程序检查和实际视觉结果分别记录，不把测试通过、HTTP 成功或单张偶然合格当成整体画质保证。

## 基线

- Git 基线：f532795a。
- 数据库最新任务：511 draft_blocked，510 completed，509 awaiting_draft_approval。507/510/511 recipe.model 均为 meinaunreal_v5；不能作为 DreamShaper 8 的验证样本。
- 511 仍因手检测没有有效轮廓被阻断。其实际 prompt 同时出现 hands out of frame、hands physically contact、另一人的手和单人要求，需要追溯编译来源；暂不把全部视觉失败归因于底模。
- 当前 V3 投影候选打分计入可见关节数；景别、完整骨架和关系坐标如何统一仍待复现审计。

## 变更 01：结构化视线正确编译（ISSUE-PROMPT-004）

- 目的：阻止 gazeTarget 对象隐式转换成 `[object Object]`，保留真实的物体、工作点或独立视线语义。
- 证据：507/510/511 实际 requestTrace.prompt 含该无效字符串；sd-worker-logic.mjs 对 item.gazeTarget 直接模板插值。
- 修改：新增 baseInteractionGazePrompt，按结构化 kind 编译；保留旧字符串目标与已有可读 gaze 文本；independent 优先于旧 gazeMode；不把内部 ID 或坐标当自然语言目标。
- 程序验证：32/32 worker 逻辑测试通过。新增 5 类道具 × 单双手 × 4 类视线目标组合，断言没有对象字符串泄漏、不改变输入关系、不丢人物和另一只手动作。
- 视觉验证：未生成修复后的对照图，不能声称视线像素已修好。

## 变更 02：核实并纠正运行时 checkpoint

- 目的：让后续实际请求使用用户指定的 DreamShaper 8。
- 证据：7860 options API 可访问且返回 meinaunreal_v5；progress 返回 job 为空、job_count=0。此前端口枚举无输出不能证明 SD 未运行。
- 修改：刷新 checkpoint 列表，确认 DreamShaper_8_pruned.safetensors 被识别；通过 options API 请求加载新 checkpoint。未改历史任务配方。
- 验证：options 已返回 DreamShaper_8_pruned.safetensors [879db523c3]；VAE 仍为 vaeFinalPruneVAE_v10.pt、Clip skip 1。生成响应的模型 hash 待本次测试完成后核对。

## 实验 01：短提示词、无控制的底模基础能力

- 输入：scripts/quality-fixtures/seated-phone-baseline.json；成人女性、粉色长发、奶黄色上衣/粉色裙子、坐沙发、双手在胸前拿手机并低头阅读。
- 目的：先观察底模能否独立表达这些属性；之后再与长提示词、Pose/道具控制及局部 pass 对照。此实验不验证跨格身份一致性，也不改变生产质量门。
- 参数：DreamShaper 8；512×512；12 步；CFG 5.5；DPM++ 2M/Karras；seed 13579246。沿用当前步数便于建立起点，不预先宣称它是最佳参数。
- 执行工具：scripts/quality-generation-run.mjs 保存请求、运行时模型/VAE、每 30 秒进度、输出哈希、SD info 与耗时。HTTP 长任务不因常规 fetch 头部超时重发；失败单独记录。结果只放测试目录，不写正式 jobs/candidates。
- 状态：2026-09-19T10:49:31Z 已提交；PID 22628，exec session 32513。首个进度观察为 step=1，progress=0.0933；进程仍运行，不能重复发同一请求。
- 输出目录：workspace/quality-runs/2026-09-19T10-49-31-246Z-seated-phone-compact-no-control。继续时先检查 status.json、进程与 API progress；完成后查看 image.png 与 result.json，填写视觉结论。
- 历史图观察：510 的正式图手机呈包状且服装偏离；511 草稿未表现取包裹，不能因人物粉发或图片解码通过就判剧情通过。
- 完成结果：2026-09-19T10:51:55Z 返回，耗时 144.266 秒，响应确认 DreamShaper_8_pruned/879db523c3。session 32513 已正常退出，无待运行请求。
- 视觉结论：失败。单人、粉色长发、坐沙发成立；上衣变白色无袖、裙子非粉色，手机在腿前而非胸前，人物看向观众、未低头阅读，景别露出腿部。手指接触细节无法明确通过。本次没有身份参考，不能评估具体角色脸部一致性。
- 证据：image.png、result.json、visual-review.json。换底模加短提示词对该 seed 仍未建立剧情动作，不能宣称短 prompt 或 DreamShaper 已解决问题。下一步应在同样 seed/模型/参数下加入正确几何控制，逐项比较；仍需评估当前 VAE 和步数，不能由单样本判断因果比例。

## 下一步及未完成项

1. 读取运行时新模型确认值，保存现有 510/511 基础与后处理图作为对照。
2. 复现并修正 prompt、V3 景别、骨架与道具/接触坐标冲突；不对某一个 job 硬编码。
3. 核实身份参考与服装控制覆盖范围，避免基础错误靠小脸 mask 弥补。
4. 在可追溯测试目录保存同 seed 的基础与各 pass 对照；覆盖单人持物、行走/道路、双人交互及不同景别。
5. 检查失败阻断与候选回写、无自动检测时的真实能力边界。最终效果仍未达标，目标保持 active。

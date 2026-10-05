# 项目协作入口

开始处理本项目之前，必须按以下顺序阅读：

1. `PROJECT_CONTEXT.md`
2. `PROJECT_GOTCHAS.md`
3. `PROJECT_DECISIONS.md`
4. `PROJECT_ISSUES.md`
5. `PROJECT_ACTIVE_ISSUE.md`

只有需要追溯历史时才完整阅读 `PROJECT_MEMORY.md`。

- 三份短记忆文件用于快速恢复项目；`PROJECT_MEMORY.md` 是历史交接档案。
- 代码、当前数据库、任务 recipe 和运行日志优先于任何记忆文件。
- 问题排查与修复必须绑定 `PROJECT_ISSUES.md` 中的稳定 ISSUE ID。诊断 Agent 负责创建问题和最终复核；解决 Agent 只能把问题推进到 `fixed_pending_review`，不得自行标记 `verified`。
- 新开解决 Agent 对话时读取 `PROJECT_ACTIVE_ISSUE.md`。默认值 `ALL_OPEN_ISSUES` 表示按 P0 → P1 → P2 及台账顺序处理全部 `open`、`in_progress`、`partially_fixed`、`regression` 问题；只有用户明确指定 ISSUE ID 或活动文件进入单问题模式时才只处理一项。单项受阻时记录 `blocked` 并继续其他问题。最终答复前必须运行 `pnpm issue:queue`，只要队列非空就不得停止。
- 运行 `pnpm issue:check` 校验台账；运行 `pnpm issue:queue` 检查解决队列；切换当前任务运行 `pnpm issue:activate -- ISSUE-ID`；解决 Agent 完成后运行 `pnpm issue:handoff -- ISSUE-ID`；诊断 Agent 运行 `pnpm issue:review -- ISSUE-ID`。
- 诊断 Agent 对每个 `fixed_pending_review` 问题必须写回复核证据并明确改为 `verified`、`partially_fixed`、`open`、`regression` 或 `rejected`，不得保持待复核状态后直接结束。
- 诊断中发现可复现的新缺陷时，必须在 `PROJECT_ISSUES.md` 新建唯一 ISSUE ID、标记 `open` 并记录来源问题；仅有可能性但尚未复现的内容写入残余风险或未验证假设。
- 诊断结束前必须运行 `pnpm issue:check` 与 `pnpm issue:queue`。解决 Agent 以队列结果为任务来源：跳过 `verified`/`rejected`/`fixed_pending_review`，处理 `open`/`in_progress`/`partially_fixed`/`regression`。
- 图片生成类问题统一采用程序逻辑验收。解决 Agent 和诊断 Agent 不启动 SD、不生成测试图、不等待真实图片，也不以视觉效果作为关闭条件。解决 Agent 只验证代码修改、数据流、提示词编译、recipe/payload、mask/坐标、ControlNet 参数、状态机和失败分支；诊断 Agent 从不同人物、区域、动作、道具和景别的通用性角度复核。程序证据充分即可标记 `verified`，结论注明“程序逻辑验收通过，未进行图片生成或视觉效果验收”。
- 自动化测试不是强制关闭条件；没有新增测试、逻辑内嵌在 worker 或没有真实图，均不能单独作为 `partially_fixed` 理由。诊断 Agent 必须指出仍存在的具体代码缺陷或错误路径才能判定未通过。问题条目中的旧成图、视觉检测、同 seed 或强制自动测试标准与本规则冲突时，应先改写为程序逻辑验收标准。
- 解决 Agent 每修完一个 ISSUE，必须沿完整出图链执行程序级冲突复核：视觉规格 → 提示词/交互契约 → recipe/payload → Regional/ControlNet → 基础生成与各局部 pass → 质量门/审批 → 正式候选回写。检查人数、景别、身份、服装、动作、视线、手部、道具、Pose、遮挡和环境约束是否互相覆盖，检查不同人物/区域/动作/景别的通用性，以及降级与失败状态是否真实可追溯。结论写入 ISSUE 的解决测试或残余风险；未完成该复核不得标记 `fixed_pending_review`。
- 图片生成审批流程固定为：草稿生成后由用户做一次整体确认；确认后生成成品，成品通过像素解码、后处理及已配置自动门禁后自动加入候选。UI 不得要求逐项语义勾选，也不得要求成品二次人工复核。逐项语义契约仅保留作诊断与审计；整体确认和自动入候选必须如实记录，不得伪造成逐项人工通过。
- 不要删除或覆盖 `data/studio.db`、`workspace/`、角色资产或用户已有候选图。
- 不要展示假任务、假进度或把旧项目图片自动复用到新项目。
- 完成影响架构、运行方式、生成参数或已知缺陷的修改后，先运行 `pnpm memory:sync` 生成待确认草稿，再把长期事实归入对应短记忆文件。
- 可运行 `pnpm memory:sync` 生成 `PROJECT_MEMORY.pending.md` 草稿；人工确认后运行 `pnpm memory:sync:apply` 写入 `PROJECT_MEMORY.md`。同步器会排除密钥、数据库和 workspace 运行产物，但不替代人工判断。
- `.env.local` 可能包含本机配置；交接文档只记录变量名和示例，不记录密钥。

## Git 提交仓库

- 用户指定的本项目唯一提交仓库：`https://github.com/Ariupm/manga_workspace.git`。
- 后续项目更新提交并推送到该仓库；默认使用 `origin` 和当前已配置的跟踪分支。未经用户要求，不切换到其他仓库。
- 提交前检查变更；不要提交本机密钥、依赖缓存、数据库或运行临时产物。

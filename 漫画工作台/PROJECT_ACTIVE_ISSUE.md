# 当前活动问题

> 解决 Agent 新开对话时读取本文件，自动确定本次任务。  
> 默认处理台账中全部 `open`、`in_progress`、`partially_fixed`、`regression` 问题；指定单项时运行：`pnpm issue:activate -- ISSUE-ID`。  
> 恢复全部问题模式运行：`pnpm issue:activate -- all`。

- 当前问题 ID：ALL_OPEN_ISSUES
- 当前角色：解决 Agent
- 当前状态：active
- 任务说明：除非用户明确指定 ISSUE ID，否则按 P0 → P1 → P2 及文件顺序，逐项处理全部 `open`、`in_progress`、`partially_fixed`、`regression` 问题。每项独立修改、测试并标记为 `fixed_pending_review`，不得标记 `verified`。结束前必须运行 `pnpm issue:queue`，只有解决队列为空才能结束。
- 激活时间：2026-08-09
- 激活者：用户

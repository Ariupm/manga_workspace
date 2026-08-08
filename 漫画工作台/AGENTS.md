# 项目协作入口

开始处理本项目之前，必须按以下顺序阅读：

1. `PROJECT_CONTEXT.md`
2. `PROJECT_GOTCHAS.md`
3. `PROJECT_DECISIONS.md`

只有需要追溯历史时才完整阅读 `PROJECT_MEMORY.md`。

- 三份短记忆文件用于快速恢复项目；`PROJECT_MEMORY.md` 是历史交接档案。
- 代码、当前数据库、任务 recipe 和运行日志优先于任何记忆文件。
- 不要删除或覆盖 `data/studio.db`、`workspace/`、角色资产或用户已有候选图。
- 不要展示假任务、假进度或把旧项目图片自动复用到新项目。
- 完成影响架构、运行方式、生成参数或已知缺陷的修改后，先运行 `pnpm memory:sync` 生成待确认草稿，再把长期事实归入对应短记忆文件。
- 可运行 `pnpm memory:sync` 生成 `PROJECT_MEMORY.pending.md` 草稿；人工确认后运行 `pnpm memory:sync:apply` 写入 `PROJECT_MEMORY.md`。同步器会排除密钥、数据库和 workspace 运行产物，但不替代人工判断。
- `.env.local` 可能包含本机配置；交接文档只记录变量名和示例，不记录密钥。

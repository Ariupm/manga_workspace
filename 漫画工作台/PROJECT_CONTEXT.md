# 项目上下文

> 新对话默认先读本文件，再按需读取 `PROJECT_GOTCHAS.md` 和 `PROJECT_DECISIONS.md`。

## 项目目标

本地优先的 AI 漫画制作工作台：剧情输入 → 视觉规划 → 分镜 → 图片草稿 → 人工确认 → 正式候选 → 质检 → 页面排版与导出。

## 技术栈与目录

- Next.js + TypeScript + SQLite
- 主界面：`app/page.tsx`
- API：`app/api/`
- 数据与迁移：`lib/db.ts`
- 提示词与视觉规划：`lib/prompts.ts`、`lib/visual-planning.ts`
- V3 动作模板：`lib/pose-v3/templates.ts`（注册与语义选择）、`lib/pose-v3/planner.ts`（几何、覆盖与投影）；新增模板流程见 `POSE_TEMPLATE_V3_MIGRATION.md`
- SD 独立任务：`scripts/sd-worker.mjs`
- 数据库：`data/studio.db`
- 生成结果：`workspace/generated/`
- 长期交接历史：`PROJECT_MEMORY.md`

## 常用命令

```powershell
pnpm dev
pnpm test
npx tsc --noEmit
pnpm build
pnpm memory:sync
```

测试必须使用 `STUDIO_DB_PATH=:memory:`，不要让测试修改正式数据库。

## 当前工作原则

- 代码和当前数据库状态优先于记忆文件。
- 生成成功不等于画面合格；P0 质检失败必须阻断。
- 视觉规格、交互、状态变化和生成配方必须可追溯。
- 不删除数据库、workspace、角色资产或已有候选图。
- 不把未经验证的推断写成长期事实。

## 当前重点

完善结构化视觉规划、V3 剧情动作模板与统一投影、候选图质量门、生成后质检和项目记忆的轻量自动同步。

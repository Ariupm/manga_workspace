# 项目上下文

> 新对话默认先读本文件，再按需读取 `PROJECT_GOTCHAS.md` 和 `PROJECT_DECISIONS.md`。

## 项目目标

本地优先的 AI 漫画制作工作台：剧情输入 → 视觉规划 → 分镜 → 图片草稿 → 整体确认 → 展示生成结果/候选 → 用户自行决定采用 → 页面排版与导出。

- 用户最新规则（2026-10-05）：工作台不设置自动语义/视觉质量门，生成结果直接展示；是否采用由用户决定。检测未检出、低置信或不可用不得拦截成品、自动重试或阻止进入候选。此规则覆盖历史“已配置自动质量门必须通过”的约定；技术文件/解码错误仍如实记录，不能伪造视觉合格。

## 技术栈与目录

- 2026-10-05 job545续修：pre-contact优先解析为anticipation；按本人手侧/对象补齐携带位置，已知prop目录键转自然名词但保留实例。新poseUsage冻结authored-region-1，关闭骨架按characterId读取已声明区域并审计mask；不是脸部定位，旧配方不升级。详见JOB545_ACTION_REPAIR_2026-10-05.md，程序验收未生图。

- 2026-10-05：单格新增持久化 `poseControlEnabled`，新 recipe 冻结 `pose-usage-1`。关闭保留骨架资产/参数，停用骨架、关联轮廓、无独立图像定位的局部精修及裁切，身份参考留在人物区域基础请求。仍使用现有 SD WebUI 后端，未接入 FLUX.2 或 Qwen-Image-Edit/ComfyUI。
- 新提示词快照带 `prompt-consistency-1`：公共镜头展示、人物优先顺序、关联工具/目标上下文共用有效事实，实际请求检查明确矛盾与语义漂移。旧快照保持原路径；规则有界，不能保证任意文本或模型视觉执行无误。

- 新任务提示词统一由 `scripts/prompt-compiler.mjs` 编译为公共正向、人物正向、分范围负向和阶段投影；recipe 保存 comic-facts-1 快照，worker 所有图像请求通过共享适配器。详见 `PROMPT_ARCHITECTURE_REPAIR_2026-10-05.md`；历史配方保留旧执行路径，程序验收未包含生图。
- 第二轮以实际两本书输入复核：交互数量/阶段进入控制轮廓，API/UI 共用 buildEffectivePromptPlan；新配方基础延后政策不再追加另一套数量/动作文字。220 项项目测试和 68 项执行逻辑测试通过，未进行视觉验收。

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

2026-09-19 用户明确授权本线程用 SD 生图验证质量；修复和实验续接记录见 `GENERATION_QUALITY_WORKLOG.md`。实际 checkpoint 已通过 options API 切至 DreamShaper 8（879db523c3）；程序通过不代表画质通过，真实实验不代替用户草稿整体确认。


2026-10-04续修：剧情动作增强既有交互契约story-action-1；已知机构/工具、搀扶与推拉支持链已实施，034/040/042/044为fixed_pending_review。提示词、V3及worker轮廓/接触/质量门同源；详见ACTION_TEMPLATE_REPAIR_2026-10-04.md当前结论。

- 2026-10-05上游交互事实：ShotVisualSpec.interactions.visualFacts可保存interaction-facts-1的具体对象/数量/实例、动作阶段、接触/支持、视线绑定与分字段来源。新AI道具规划必须提供；UI可编辑；共享契约和有效Pose将其传入PromptPlan/recipe/基础与局部pass。旧规格保持兼容，不自动改写正式数据。

- 2026-10-05英文规划：DeepSeek单次直接英文输出，少量中文由visual-json-language本地编译；保留ID/数字和转换审计。compile-shot-candidate复用已返回规格，校验后保存待确认；shot1259已编译保存v1，无SD生成。

- 2026-10-05应用链续修：新待确认规格阻止生成入口静默退回旧提示词；便携工具分类/具体动作/支持面与有效Pose各对象动作隔离已修复。shot1259校正为v2待确认，未生图。

- 2026-10-05 job543只读诊断：新规格已进入实际请求，但仍有支持物described→bed误识别、工具目标几何未绑定、纸箱薄片化、自动坐姿漏写和末端视线文字矛盾。PROMPT-011改partially_fixed，新增POSE-051/052与GAZE-009。用户本轮只要求方案，尚未实施；详见JOB543_ROOT_CAUSE_AND_REPAIR_PLAN_2026-10-05.md。


## 2026-10-05：job543根因修复已实施

用户后续已明确授权修复，替代此前“仅出方案”的范围记录。支持物词边界/角色bodySupport、结构化workTarget与共同布局、辅助稳定/物体体积、自动坐姿提示、末端视线统一及关联物体遮罩保护已实施；详情见JOB543_ROOT_CAUSE_AND_REPAIR_PLAN_2026-10-05.md实施记录。234项目测试、69执行层测试通过；程序逻辑验收，未生成图片。shot1259已确认v2未被改写，新任务按新编译器消费；旧job543保持原快照。问题推进fixed_pending_review，交独立诊断复核。

- 2026-10-05 PROMPT-011否定分流续修：独立no名词排除进入原范围negative，not occluded/no significant occlusion改为正向可见性并保留重叠关系。普通环境描述不能误称动作冲突；复杂动作否定和比较仍不可盲目删除。235项程序回归通过，未生图。

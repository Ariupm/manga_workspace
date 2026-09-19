# Pose Template V3 迁移与验收说明

## 已接入路径

- 新生成任务：API 调用 `buildRegionalPrompt(..., { posePlannerVersion: "3.0" })`，默认生成 V3 auto-story 控制。
- V3 人工覆盖：页面沿用原 V2 紧凑控件，模板、阶段、力度、主动手、目标方向、镜像、人物间距、角色交换和关节点编辑由 `applyPoseControlOverrideV3` 重建完整骨架并重新投影。历史 recipe 仍按自身 `posePlanVersion` 读取。
- V3 失败出口：规划失败返回 `needs_pose_edit` / `needs_story_clarification`；构图证据、手部冲突或肢段不可达写入 `safety.errors`，由 API 现有安全门阻止请求。

## V3 数据与制品

`lib/pose-v3/` 包含 schema、templates、planner、projection、validation、render。每个控制对象保存：

- 完整 18 点 `fullPeople` 与投影后的 `people`；
- 唯一 projection、逐关节 visibility、动作证据及候选评分；
- 输入、模板、投影哈希；
- 无标注 OpenPose 控制 SVG、完整骨架预览与构图预览；
- prop/support 独立控制需求清单，避免家具或文字进入 OpenPose 图。

## 当前能力边界

- 自动规划支持一至两名主要人物；三人以上必须人工编辑或上传。
- 首版沿用 V2 的确定性语义识别与基础几何，再通过 V3 注册表拆分走/跑、蹲/跪、推/拉、单双手持物以及握手/击掌、拥抱/搀扶等拓扑契约。
- 手机动作已拆分为 `phone_one`（单手看手机）和 `phone_two`（双手持手机），分别保留空闲手或左右手机边缘接触。
- 眼球、手指、身份、服装和道具外观不由 18 点骨架宣称解决，继续由对应控制、局部 pass 和人工语义门承担。

## 程序验收

- 专项检查：完整下肢数据保留；投影不改变人物数量和关节拓扑；同输入确定性；走/跑模板与几何不同；双手接触点坍缩会阻断。
- 全链检查：剧情/视觉规格进入语义计划；模板与投影写入 recipe；worker 继续消费统一 `poseControl.svg/people`；prop/support 需求独立记录；安全失败不能发送；现有逐项人工审批与正式候选回写门禁未绕过。
- 未启动 SD，未生成漫画测试图。模型随机性和实际视觉服从率仍是产品运行风险。

## 如何添加新的 V3 动作模板

### 1. 注册模板与动作证据

在 `lib/pose-v3/templates.ts` 的 `poseTemplateRegistryV3` 添加唯一模板：

- `id`：稳定英文 ID，写入 recipe 后不得随意改名；
- `label`：下拉框显示名称；
- `family`：动作族；
- `topology`：描述真实几何机制，不能只写同义名称；
- `evidence`：构图必须保留的关节、接触、对象或支持面证据；
- `excludes/allows`：同一只手、支持腿或关系组件的排斥与允许组合。

若剧情应自动命中新模板，同时更新 `templateForV3(family, sourceText)`。识别只负责选择模板；不要在关键词分支直接散落整套坐标。

### 2. 实现完整骨架几何

在 `lib/pose-v3/planner.ts` 中完成以下两层：

1. 在 `v2TemplateForV3` 添加兼容基础模板映射，以复用现有参数化求解入口；
2. 若新模板与基础模板拓扑不同，在 `specializeV3Geometry` 实现差异化关节、接触和重心几何。

几何必须先修改 `fullPeople`，再由 `chooseProjectionV3` 统一投影。禁止直接修改投影后关节来伪造动作，也禁止把隐藏腿写成固定画外坐标。左右镜像必须同步解剖左右、主动手、接触点和目标方向。

道具模板必须明确单手/双手、对象中心或接触带。双手模板的两个腕点不得坍缩到同一点；支持面动作必须保留骨盆/躯干/支持面关系。

### 3. 接入原有 UI 操作

模板注册后会自动进入 `app/page.tsx` 的原动作模板下拉框。不要再创建独立的大型模板图库。

页面提交统一使用 `PoseControlOverrideV1` 形式的编辑参数，V3 由 `applyPoseControlOverrideV3` 消费。新增参数时必须同时更新：

- override schema/type 与解析；
- V3 重建逻辑；
- API recipe 的覆盖记录；
- UI 控件和恢复自动推荐逻辑。

选择模板、修改阶段/力度/主动手/方向、镜像、人物间距、角色交换或关节点后，都必须产生新的模板或投影哈希，旧审批必须失效。

### 4. 添加程序验收

在 `tests/pose-v3.test.ts` 至少覆盖：

- 自动语义能命中模板；
- 与相邻模板的关键关节或接触几何确实不同；
- 左右镜像与主要参数会改变正确关节；
- 完整 18 点骨架仍保留，投影不改变人物数量和关节拓扑；
- 相同输入、版本和 seed 的哈希与控制图一致；
- 不可达接触、多手冲突、缺失关键证据会进入明确失败出口；
- `npx tsc --noEmit` 与 V3 专项测试通过。

图片生成类模板只做程序逻辑验收：不启动 SD，不生成测试漫画图，不把单张视觉结果当作代码关闭条件。

### 5. 全链路复核

提交前沿以下链路核对同一动作事实：剧情/人工选择 → 视觉规格 → prompt/交互契约 → recipe/payload → OpenPose/prop/support 控制 → 基础与局部 pass → 语义审核 → 正式候选回写。

特别确认后序身份、服装、手部、道具和视线 pass 不会破坏模板建立的姿态、接触、构图或人物区域；失败或未应用状态不得记录成完成。

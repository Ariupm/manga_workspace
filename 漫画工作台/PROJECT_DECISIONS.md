# 项目关键决策

## 采用仓库原生轻量记忆

- 决定：使用 `PROJECT_CONTEXT.md`、`PROJECT_GOTCHAS.md`、`PROJECT_DECISIONS.md` 加 `PROJECT_MEMORY.md` 历史归档。
- 原因：新对话只需读取少量稳定信息，不引入向量库、外部服务或 API Key。
- 适用范围：项目上下文、开发坑点、架构决策和交接。
- 禁止回退：不要把完整聊天记录或未经筛选的日志直接注入新对话。

## 长期记忆必须区分事实与判断

- 决定：进度、测试结果和数据库状态可自动采集；根因、质量结论和架构判断必须人工确认。
- 原因：自动摘要可能把假设写成事实。
- 适用范围：项目同步、质量诊断和生成问题分析。
- 禁止回退：不能因为摘要语言确定就跳过代码、recipe 和日志核对。

## P0 质量问题必须阻断

- 决定：人物数量错误、严重肢体问题、未知角色/资产、关键交互缺失不能进入正式候选。
- 原因：生成任务成功不代表画面可交付。
- 适用范围：视觉规划、候选图上传和正式候选选择。
- 禁止回退：不能用 `force` 绕过结构性 P0 阻断。

## 最终生成提示词采用单一结构化契约层

- 决定：单人和多人请求都以 Regional 编译器产生的 common/character prompt 为最终 camera、framing、人数、动作和交互契约；人工或自动编辑只作为可追溯的 editorial layer 合并。
- 原因：避免实际发送的 prompt 与 recipe 中记录的结构化 prompt 分裂。
- 适用范围：structured、manual_override、auto_repaired、regionalPromptOverride 及 Regional Prompter 可用/不可用路径。
- 禁止回退：不得让单人请求绕过 canonical applied prompt，不得让 Regional override 把冲突词带入 contractPrompt，也不得用 negative override 覆盖掉结构化景别负向契约。

## 镜头交互以复数 interactions 为主路径

- 决定：视觉规划新输出必须使用完整 `interactions[]`；旧单数 `interaction` 仅保留为迁移入口，显式手部道具动作缺关系时由规范化层补全或由验证层 P0 阻断。
- 原因：自由文本和全局单关系无法可靠表达未知道具、人物交接和一个镜头多个关系。
- 适用范围：视觉规划 schema、规范化、校验、提示词编译和道具 repair contract。
- 禁止回退：不得仅靠关键词兜底让明确交互在 `interactions=[]` 时静默通过，也不得把 `the current story focus` 等通用占位 actionTarget 固化为结构化 propId。

## 连续面部 pass 必须共享几何并继承身份控制

- 决定：identity 与 gaze pass 共用 OpenPose nose/region 回退的 face geometry；最后修改脸部的 gaze 请求必须携带对应 characterId 的身份 ControlNet，并记录无 base64 的 pass trace。
- 原因：不同 mask 中心和后序无身份条件重绘会确定性破坏前序身份控制的数据流。
- 适用范围：低头、抬头、侧脸、多人区域和所有身份精修后执行视线修复的任务。
- 禁止回退：不得恢复固定 face centerY，也不得让最终 gaze pass 只用文本身份描述。

## 服装引用与状态由同一 conditioning 决策产生

- 决定：只有 wide/full、isolated garment 且 adapter 有效时发送服装引用；references、finalReferences、qualityGate 和 adapterStatus 必须复用同一个决定。
- 原因：避免 recipe 显示已应用但 worker 实际未控制，或 adapter 无效时仍发送 reference_only 服装单元。
- 适用范围：所有 SD 草稿与正式任务的服装资产 conditioning。
- 禁止回退：不得独立按景别筛引用、再用另一套条件记录状态。

## 动作风险与骨骼选择共用结构化动作计划

- 决定：先从视觉交互、人物动作、shot action 与上下文编译 `PoseActionPlan`，再由风险判定、骨骼选择、关节构建、recipe 审计和 UI 展示共同消费；当前结构化动作优先于描述中的后续状态。
- 原因：避免无道具动作在风险层或 selector 层丢失，也避免 kind 名称变化但关节拓扑仍退化为同一站姿。
- 适用范围：locomotion、point、self-touch、environment operation、reach、sit/recline/lie、turn/bend、head gesture、wide/full-body 与后续扩展动作族。
- 禁止回退：不得再次用“是否命中已知道具”作为单人动作进入 OpenPose 的前置条件，也不得只显示人数二分类而隐藏真实 kind/source/reason。

## 动作拓扑与景别裁切必须解耦

- 决定：OpenPose 先依据 `PoseActionPlan` 构建完整动作拓扑，再由统一 framing pass 按镜头景别决定关节和 limb 可见性；上身景别统一隐藏 8-13 号髋、膝、脚控制，wide/full 保留完整下肢。recipe/UI 必须记录 `framingMode` 与 `hiddenJointIndices`。
- 原因：把裁切逻辑散落在 seated、lie、recline 等动作分支中会产生绕过路径，也会让新增动作在近景重新发送全身控制信号；反过来，用裁切模板直接生成骨架又会抹平不同动作的上身几何。
- 适用范围：所有单人动作骨骼、SVG limb 渲染、ControlNet pose 请求、recipe 审计和骨骼卡片展示。
- 禁止回退：不得让任何动作族自行决定是否服从 close/medium 上身裁切，不得用同一静态骨架仅改 kind 名称，也不得在 recipe 中省略最终采用的 framing 信息。

## 人工语义质检采用逐项版本化证据

- 决定：worker 从实际 generationSpec/qualityGate/conditioner 生成带优先级、期望值和来源的 review contract；UI、API、数据库和 final worker 共用逐项 verdict，全部 required items 通过后才能进入正式生成。
- 原因：单一 `visualReviewConfirmed` 布尔值无法证明交互、视线、景别、身份、服装、手部、道具、构图和光照被实际审核。
- 适用范围：所有 awaiting_draft_approval 草稿及其 final 候选写入门禁；旧 labels 仅作为迁移输入。
- 禁止回退：不得把按钮点击等同于全部语义质检通过，不得只保存批准时间而丢失逐项结果、检查项快照和备注。

## OpenPose 采用可审计的参数化场景计划

- 决定：单人和双人 OpenPose 统一由 `PoseScenePlanV2` 驱动，动作模板、复合动作、阶段、力度、主动手、目标、变体、景别裁切、安全检查和 ControlNet 档位共同写入 recipe；人工参数与关节点编辑使用结构化 override，图片上传仅作兼容入口。
- 原因：静态模板和单一动作关键词无法覆盖持物、书写、工具操作、连续动作与通用双人互动，也无法复现人工调整或解释实际控制强度。
- 适用范围：一至两名主要人物的自动 OpenPose、模板浏览器、关节点编辑、ControlNet 请求和质量复核；三人以上明确降级为人工编辑或上传。
- 禁止回退：不得重新为具体道具维护孤立双人骨架，不得让 close/medium 绕过统一下肢裁切，不得只保存覆盖 PNG 而丢失模板和关节点元数据。

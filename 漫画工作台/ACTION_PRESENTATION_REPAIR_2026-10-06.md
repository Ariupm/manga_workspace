# 通用动作事件表达：实施与交接

关联ISSUE-PROMPT-015。用户要求从通用性角度修改提示词；本轮未启动SD或生成新图片，未修改正式数据库、资产和候选。

## 实施

- 新PromptPlan冻结presentationVersion=action-presentation-1；无标记历史快照保持原基础/局部表达。
- relationEventText把原关系数量、支持状态、操作和接触连续表达；阶段来自relationActionState，不猜新方向、手形、物体和完成状态。
- orderedEventRelations按本人及工作目标实例组织主操作/辅助支持，再描述携带持有；不改原关系执行数组或几何。循环引用保留所有事实。
- 人物动作/交互/手部/视线优先于外观；明确注视镜头仍保留。新文本取消外观固定高权重及happy/satisfied等简单表情的展示性扩写，人工词及权重保留。
- composeGenerationPrompt共用于普通预览、有效Pose预览及API。单人镜头/人数/画风之后接完整人物事件再补全部场景和编辑，不无条件插入BREAK；多人仍为公共段和独立Regional人物段。
- 局部阶段共享关系表达及原字段投影，不扩大mask职责；单人合并后的发送守卫仍执行本人一致性检查。

## 完整链路复核

| 节点 | 结果 |
|---|---|
| 剧情/人工选择→视觉规格 | 来源选择、确认事实、数量和明确表情保留；未改数据 |
| 有效Pose→交互契约→prompt | rebind保留版本并重编本人手侧/阶段/实例；旧接触歧义见下节 |
| prompt→recipe→请求 | UI/API共用组合器，新版本受factsHash保护；单人合并仍校验本人事实 |
| Regional/ControlNet | 多人数量、区域、独立视线/负向保留；不改控制图、坐标、参数或开关 |
| 基础→身份/服装/道具/手/视线/交接 | 同一冻结事实/关系实例；不从旧worker文本恢复自动表情扩写；不让局部物体修饰冒充全身姿态修复 |
| 失败/降级 | 编译、指纹、控制守卫保留；拒绝请求不记prepared；held+approach审计不伪报修复 |
| 草稿确认→正式候选 | 原整体确认继承prompt及版本；文件/解码/后处理/候选政策未改，不引入逐项审批、二次确认或视觉重试 |

## 独立接触模型问题：交诊断Agent

静态代码及纯函数推导显示：scripts/action-stage-policy.mjs的actionStageState('place','anticipation')同时返回objectState=held和contactState=approach。lib/pose-v3/action-relations.ts又对anticipation统一将手目标从物体接触点向肩方向偏移。部分工具准备阶段同样允许support=held而contact=approach。

这涉及“手与物体接触”和“物体/工具与目标面接触”的区分，是既有阶段/几何根因。表达层不能暗改这套政策：新事件在此组合下不追加held in [hand]与原接近文字相反，保留事实及原几何，记录held_support_with_approach_requires_contact_model_review。该分支未被认定修好。

按工作区“独立根因新增ISSUE或记录给诊断Agent”的规则，此处和ISSUE-PROMPT-015残余风险保存交接证据。诊断Agent应独立立项，核对上游规范化、共享状态机、V3目标、局部接触资格及历史兼容，不能只改一句提示词或一律强制contact。

## 验证

- 273/273内存库项目测试；新增9项及循环断言覆盖对象、手侧/手数、数量、取物阶段、放置接触/完成、工具目标、多人区域/视线/负向、近中全景、参考/Pose四组合、明确表达/权重、历史快照、草稿确认和失败状态。
- 51/51执行层、动作阶段及台账测试；TypeScript与生产构建通过。
- 已运行memory:sync并保留原有未提交草稿；长期事实写入三份短记忆。

程序逻辑验收通过，未进行图片生成或视觉效果验收。状态仅为fixed_pending_review；模型随机性和实际动作/外观执行率是产品运行风险，不因单张历史侧身对照宣称通用视觉成功。

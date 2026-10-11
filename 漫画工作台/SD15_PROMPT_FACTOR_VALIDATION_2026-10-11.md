# 动作提示词因素拆分续验（2026-10-11）

## 结论

完成七次新txt2img。明确头部方向对有效短文本有帮助，但补到原完整文本中不足以恢复动作；加入外观细节后发生回退，单独调整顺序或移除道具负向词均未恢复。简化外观的第二个预定种子出现低头朝手部/纸箱、长粉发，但工具变成笔、动作像书写，奶黄色上衣没有满足；同提示词首个种子又变成电脑场景。不能把不看镜头等同于注视目标或完成动作，也不能从两个种子推算总体成功率。

本轮进一步支持提示词组合和种子敏感性，未定位出可直接全局修改的单一程序根因。没有一个新样本同时准确满足视线、剪刀剪胶带、身份外观和服装，不能宣称已得到可推广的生产优化。下一步值得比较“基础动作与目标关系优先、实际定位后局部补身份/服装”的分阶段方案；这是待验证方向，上一轮身份精修保住读书低头并不证明本场景或服装阶段也能保持。

## 范围与方法

接续用户“继续”，关联 ISSUE-GAZE-011 的优化实验。用户此前明确授权本线程真实 SD 验证、否定训练；本轮仍是独立实验，不修改生产提示词、控制参数或候选状态，不把单图效果作为程序问题关闭条件。

上轮有效短提示词同时删去大量描述并加入低头方向，不能把改善归因于字数。本轮复用原拆包裹 seed3811602127、512×512、12steps、CFG5.5、DPM++ 2M/Karras，固定无图像控制，分别检查方向、外观、顺序和道具负向词。开始前确认无运行中的工作台 SD 任务，执行器每次请求前再次检查正式任务及 SD progress，不打断用户任务。

原完整基线：workspace/sd15-chain-validation-2026-10-11/scissors-text-only-request.json。有效短文本基线：同目录 scissors-short-front-right-request.json。原完整无控制图为看镜头、缺少剪刀/纸箱；短文本基线为低头朝纸箱，但没有准确剪胶带，且外观漂移。

## 对照设计与结果

| 样本 | 相对基线唯一改动 | 实际观察 |
|---|---|---|
| full-plus-direction | 原完整文本只将注视目标句换为明确低头与向下看目标 | 头部略倾、仍看镜头，未出现剪刀/包裹；只加方向不足 |
| short-target-only | 有效短文本保留看箱子目标，去掉低头和向下方向 | 箱子保留，人物重新看向镜头；这一种子下方向表达有明显影响 |
| short-plus-appearance | 有效短文本恢复原脸型、发长、刘海、眼色和服装描述，位于动作之前 | 再次朝镜头，发长/衣服颜色也未准确实现；恢复外观文本并未同时保住动作与外观 |
| full-without-prop-negatives | 原完整文本仅移除8个包含剪刀/纸箱名称的负向词条 | 仍为看镜头的坐姿肖像，剪刀/纸箱未出现；未支持将这组负向词作为单一主因 |
| appearance-after-action | 将 short-plus-appearance 的完整外观片段移到动作、方向、光照之后 | 仍朝镜头，场景与道具也偏离；单独移到末尾不足以恢复动作 |
| core-appearance-seed-a | 有效短文本只增加“长发、奶黄色上衣”，保留原种子 | 长粉发出现，目光偏向左侧电脑、手在键盘附近；未低头看箱子或剪胶带，上衣为白色印花，不能因未直视镜头就判成功 |
| core-appearance-seed-b | 与上一项相同，仅预先换为seed3811602128 | 头部明显俯下、眼部朝手与纸箱区域、长粉发保留；手持笔状工具在纸面书写，非剪刀剪胶带，上衣仍为白色印花 |

前两组不是完整的统计性2×2实验：长短版本还改变了其他文字；它们用于分别检查“长文本加方向是否足够”和“短文本移除方向后会怎样”。恢复外观也是一组属性束，不足以确定是脸型、发长、眼睛还是衣服单独造成变化。顺序对照验证正向单词多重集合一致、其余请求字段完全一致；文字顺序也会改变编码位置和分块，不能解释为单独某一种注意力机制。

删除的负向词条：missing/hidden/duplicate cardboard delivery package、extra cardboard delivery package outside the story instance，以及对应的四个 scissors 词条。保留全部其他负向，不把“期望物体出现在负向”直接认定为已证实根因。

最后两项是预先声明的两个种子，检查头眼朝箱子、长粉发、奶黄色上衣及剪刀/胶带接触，不因首张结果更换第二个种子。它们只检验简化外观文本的可行性，不把被暂时省略的脸型、刘海和眼色当作已经满足。

## 代码核对与通用边界

- scripts/gaze-expression.mjs 的 gazeInstruction 对目标名生成 eyes focused on …，不会凭目标名发明头部几何。scripts/prompt-compiler.mjs 的 createPromptPlan 在基础阶段消费该表达；结构化 gazeExecutionCues 用于局部阶段。本轮补词为实验变量，尚未接入正式编译器。
- 当前拆包裹冻结 Pose 场景已有 headDirection.mode=down，gazeTarget 为 package_01；基础文字仍主要描述注视目标。字段差异不能直接证明视觉主因，完整文本补词对照仍失败。
- 本机 D:/stable-diffusion-webui-master/modules/sd_hijack_clip.py 的 tokenize_line/forward 将长文本按75个内容 token 分块并处理所有块；不能未经核实声称后面的文字被75-token硬截断。本轮未测量各词实际注意力权重。
- 通用优化必须区分头部意图与眼睛目标，不能把目标在画面下方一律转成低头；也不能通过删去其他人物、服装、数量、接触、空间或人工要求来伪装动作改善。
- 无图像控制实验不代表生产没有控制，不代表多人、其他方向、其他种子或完整后处理链已通过。

## 证据与业务链复核

实验目录：workspace/sd15-prompt-factor-validation-2026-10-11。保留所有PNG、实际request/audit、first-cases.json、followup-cases.json、prompt-edits.json、negative-edits.json、ordering-audit.json和request-invariants.json，无自动换种子重试或筛除失败图。

core-appearance-cases.json、core-appearance-plan.json和core-request-invariants.json保存最后两个预定种子与判读项。experiment-summary.json汇总七次耗时、实际模型及请求/图像哈希。全部实际模型均为DreamShaper_8_pruned [879db523c3]，VAE为vaeFinalPruneVAE_v10.pt [f921fb3f29]，CLIP skip 1；每张约126–132秒。

请求断言确认前五组仅修改正向或负向，原采样、种子、画幅和无控制设置一致；顺序对照的词集合一致。第六组相对有效短基线仅改正向，第七组相对第六组仅改预先声明的种子。本轮没有修改生产代码，不重复运行无关全量测试。

业务链核对范围：剧情/人工选择→视觉规格→提示词/交互契约→recipe/payload→Regional/ControlNet→基础→身份/服装/道具/手部/视线→展示/草稿整体确认→候选。正式链路全部保持原样，仅独立调用基础txt2img。未执行所有局部pass，不自动批准草稿或写入正式候选，不新增语义门禁，也不宣称已修复全部场景。程序问题台账状态不因这些视觉样本改变。

pnpm issue:check、pnpm issue:queue通过。执行pnpm memory:sync后把生成草稿保存至实验目录，原有PROJECT_MEMORY.pending.md按原字节恢复，不覆盖用户待确认内容。

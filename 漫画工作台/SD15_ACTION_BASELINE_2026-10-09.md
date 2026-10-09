# SD1.5 普通动作基线与工作台控制拆分实验

## 结论

共完成六次新 SD 请求。现有 DreamShaper 8 能生成低头看书，不能把此前的直视镜头归结为 SD1.5 不具备这一能力。同一工作台提示词/seed/参数下，无控制、单独人脸参考、单独骨架均低头或眼睛向下；人脸参考与骨架同时启用后重新出现朝镜头的视线。该组单变量添加实验支持控制组合对本样本造成影响，道具轮廓和末端局部修复不是复现它的必要条件。

这不是所有场景的成功率统计，也没有证明人脸参考或骨架单独总是安全。精确到哪段头部几何、mask 对齐或权重导致这种相互影响，尚未分离验证。下一步应优先优化基础生成的身份/姿态控制兼容性，以同设置对照验证，而不是继续添加眼部 pass 或训练模型。本轮没有实施生产修复。

## 范围与方法

用户明确要求不训练模型，先跳脱剧情验证现有 SD1.5 能否生成动作，再区分工作台流程的影响。本轮只运行独立 txt2img 实验，不修改生产流程、不写任务/审批/候选、不覆盖已有图。不使用前一轮眼部重绘或 MediaPipe 控制模型。

实际 checkpoint 为 DreamShaper_8_pruned（879db523c3），属于 SD1.5 系；不是原版 SD1.5 或所有 SD1.5 checkpoint 的综合测试。VAE 为 vaeFinalPruneVAE_v10.pt（f921fb3f29）。CPU、512×512、DPM++ 2M/Karras。

实验执行器：scripts/validate-sd15-baseline.mjs。实际请求、原始返回 PNG 和完整 SD info 位于 workspace/sd15-baseline-validation。脚本显式调用才生成，不导入生产，不训练或下载模型；已有结果拒绝覆盖，后端忙时拒绝竞争请求。

## 普通动作能力

1. plain-reading：粉发成年女性坐桌边、双手持书、低头看书页。短提示词、seed 1935582440、12 steps、CFG 6.5。生成图明确低头朝书，无直视镜头；不能把这张当成所有动作均可稳定完成的证明。
2. plain-reaching：成年男子在厨房抬右手取高处红杯、抬头看杯、侧面。seed 610022、20 steps、CFG 6.5。结果为侧身站立，没有直视镜头，但抬手取杯和明确向上看杯未实现。保留失败结果，不筛掉。

看书短提示词原文：

```text
anime illustration, an adult woman with pink hair sitting at a wooden desk, reading an open book, her head bent down, eyes looking down at the pages, both hands holding the book, three-quarter view, daylight in a quiet room
```

两项普通动作的负向均为：looking at viewer, eye contact, text, watermark, blurry, malformed hands。

## 同设置控制拆分

以下使用 job561 实际基础阶段完整正/负向提示词、seed 1935582440、12 steps、CFG 5.5，保持模型/VAE/采样器/调度器/尺寸一致。原图 PNG metadata 与新返回 infotext 核对记录在 metadata-comparison.json；文字及上述设置一致。普通动作短提示词的 CFG 6.5 与本组不同，不把两者宣称为单变量对照。

控制图片来自 job561 保存的骨架与道具轮廓；人脸参考使用原资产，人脸椭圆 mask 由生产 helper 重建并断言 bounds 与历史 trace 相同。quality-base-replay.mjs 的 fixture 是重建请求，不冒称原始网络抓包。模型返回 info 用来核实实际启用控制。

| 实验 | 启用控制 | 观察 |
|---|---|---|
| workbench-text-only | 无 | 低头朝书页，未直视镜头；指章节细节不完整 |
| workbench-identity-only | 人脸 IP-Adapter .68，结束 1 | 仍低头，不能归因于人脸参考单独作用；增加了类似笔的物体 |
| workbench-pose-only | OpenPose .82，结束 .76 | 低头朝书、手在书旁；未直视镜头 |
| workbench-identity-pose | 人脸 IP-Adapter + OpenPose，参数同上 | 身体构图与单独骨架接近，但眼睛重新朝前/镜头；无道具 Canny、无局部修复 |

后三组与 text-only 的请求 JSON 已用 deepEqual 核对：除 alwayson_scripts.ControlNet 外其他字段相同。identity-pose 相对 pose-only 仅新增相同人脸参考单元；也相对 identity-only 仅新增骨架单元。六项耗时分别约129、218、139、141、191、191秒，仅代表本机本轮测量。

主要图片：

- workspace/sd15-baseline-validation/plain-reading.png：普通短提示词低头读书。
- workspace/sd15-baseline-validation/plain-reaching.png：保留的取杯失败结果。
- workspace/sd15-baseline-validation/workbench-text-only.png：原文字、无控制。
- workspace/sd15-baseline-validation/workbench-identity-only.png：单独人脸参考。
- workspace/sd15-baseline-validation/workbench-pose-only.png：单独骨架。
- workspace/sd15-baseline-validation/workbench-identity-pose.png：两项叠加，视线朝镜头。

观察为人工图像检查，低头图的眼睛有下垂/接近闭合，不把它等同于已验证的精确三维注视；无眼动真值或自动视觉合格结论。

原 job561 initial-base 同时启用上述两项和道具 Canny .84、结束 .78，画面偏直视镜头；该问题在局部 pass 之前已经出现。后续局部 pass 未能纠正，不等于问题一定由末端视线 pass 最初制造。

单项对照不是稳定成功率测试。只凭少量固定种子观察，不能宣称关闭某项控制能解决所有人物、多人、景别和动作，也不能直接把整条生产控制关掉。

## 程序边界与证据

生产链：剧情/人工选择→视觉规格→提示词/交互契约→recipe/payload→Regional/ControlNet→基础生成→身份/服装/道具/手部/视线→展示/草稿整体确认→候选回写，本轮均未改动。实验只有独立 SD 请求及 workspace 文件；没有新增质量门、自动重试或人工逐项审批。

这次是用户明确授权的真实图片诊断，不是 ISSUE-GAZE-011/012 的独立程序验收，不改变它们的 fixed_pending_review 状态。图像观察不能替代对具体代码缺陷、通用修复和回归的证明。模型随机性、动作/视线实际执行率仍属产品运行风险。

脚本语法检查通过，台账 check 通过（173项），解决队列为空。未改生产逻辑，不额外跑全应用回归。memory:sync 草稿保存在实验目录，用户此前的 PROJECT_MEMORY.pending.md 原样恢复。

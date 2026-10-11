# 动作表达、手臂控制与身份精修续验（2026-10-11）

## 结论

本轮完成六次独立SD请求，未训练或更换模型，未修改生产默认值。得到以下有边界的结论：

1. 拆包裹原完整提示词去掉全部图像控制后仍失败，不能把该样本失败完全归因于身份/骨架组合。
2. 只调整双肘的透视缩短能改变姿势，但没有实现剪胶带，暂不能作为通用修复。
3. 简短、明确的动作与低头表达，在侧面和原前右侧取景两种情况下都生成了朝向纸箱的低头人物。精确剪刀/胶带接触仍失败，外观和道具数量也不完全符合原规格。不能把改善仅归因于字数，或把新短文本直接替换完整工作台规格。
4. 改善的读书图经过现有身份精修后仍保持低头；本组不支持“身份精修必然把视线拉回镜头”。但旧计划鼻点遮罩漏掉实际鼻部和一侧眼睛，实际脸部重定位改善覆盖，两种遮罩之外改变像素均为0。

后续优先验证基础请求中明确的头部/视线方向与简洁的动作结构，逐步恢复身份、服装和空间约束；局部身份精修应研究实际脸部定位。精确工具接触与完整后处理链尚未验收，不全局删除头部控制、不设为统一降权默认、不增加图像展示门禁。

## 实验环境与用户任务隔离

DreamShaper_8_pruned（879db523c3，SD1.5系）、vaeFinalPruneVAE_v10.pt（f921fb3f29）、CPU、512×512、DPM++ 2M/Karras。全部使用固定种子，无自动重试或筛除失败图片。

开始时用户的job562正在运行。本轮先做只读代码/控制图检查，直到job562进入awaiting_draft_approval后才发送独立实验；没有打断、批准或改写该任务。其基础与身份阶段图均已有朝前视线，只作为旁证，不计为本轮独立生成。

实验执行器增加只读SD运行任务检查，避免在工作台任务的两个请求间隙插入实验；未认领的历史queued记录不代表后端正在运行。另保留SD progress空闲检查。新增img2img实验模式会保存原始输出，并使用生产compositeMaskedOutput保护mask外像素。所有工具都需显式CLI调用，生产不导入。

## 拆包裹基线与肘部几何

原job555为自动姿态，override=null。右手剪刀grip=(.435,.385)，左手支持包裹=(.58,.415)，已有接触锚点正确保留。overlayAudit两臂均planar，上臂.18、前臂.171的完整长度投到二维平面，手腕距离肩很近，导致右肘x=.264、左肘x=.744大幅外张。它是待改进的深度建模假设，不能单凭姿势观感声称数学求解失败。

prepare-work-contact-experiment.mjs仅对自动、接触阶段、绑定工作对象的tool/support关系测试低外展肘位与透视缩短，保留手腕/肩/头/道具/相机投影。上臂投影约.148，右前臂.089、左前臂.058，均不超过原骨长，记录假设深度；不是实测3D解。冻结SVG先与实际控制PNG逐像素核对，仅改双肘共6个图元，原手腕不移动。无匹配关系或人工覆盖拒绝该实验；无书名、人物名、任务ID特例。

| 样本 | 设置 | 结果 |
|---|---|---|
| scissors-text-only | 原完整正负向；移除身份/Pose；seed3811602127、12steps、CFG5.5 | 坐姿肖像、朝镜头，剪刀与包裹未实现 |
| scissors-projected-arms | 相对前轮scissors-full-pose只修改双肘控制图，保留身份和完整头部 | 姿势变化、手中出现不明确物体，但未形成剪刀剪胶带动作，仍朝前 |
| scissors-short-text | 相对text-only只替换正向为简短动作/低头/侧面描述；负向和采样不变 | 低头、纸箱出现，工具形态及接触不准确，发型服装偏离原规格 |
| scissors-short-front-right | 相对short-text只把侧面措辞改回原前右侧取景意图 | 低头朝箱子；更像扶着已打开纸箱，未准确剪胶带，背景额外箱子且服装变化 |

简短动作正向：anime illustration, side view of an adult woman with pink hair seated at a table, cutting packing tape on a cardboard box with scissors, her right hand holding the scissors against the tape, her left hand steadying the box, her head bent forward, eyes looking down at the box, daylight。

前右侧版本仅把side view of替换为eye-level view, slightly angled from the front-right, of。虽然控制了这一相机措辞变量，短文本仍同时删去了原外观/环境等描述、补了明确头部方向，因此不能归因于“越短越好”。下一步需分别验证方向词和描述取舍。

本组刻意不含道具Canny、支持面和后续修复，与前轮拆分基线一致；不是完整生产job555重放。不能由此声称生产整条链同样缺少全部道具。

## 身份精修接续

输入为前轮identity-body-pose.png改善后的读书图。使用生产faceRefinementPassPlan、identityRefinementPrompts和prepareGenerationPromptRequest，断言编译后的正负向与job561实际identity trace相同。12steps、CFG6、denoise.28、seed610031、身份权重.68/end1、inpaint_full_res及padding48、mask_blur10均相同。

两个实验仅移动mask及对应effective_region_mask中心，半径保留71.5×92px；裁剪上下文随mask按后端规则变化。MediaPipe只作为这一单脸实验的定位工具，不作为精确视线或身份真值，也不是生产检测器接入。

| 样本 | 遮罩覆盖 | 图像观察 |
|---|---|---|
| identity-planned-mask | 中心(.5467,.1127)，实际鼻部、一侧眼睛/虹膜在mask外 | 仍低头，没有变成正面凝视；局部覆盖不完整 |
| identity-detected-mask | 中心(.6799,.1870)，实际鼻部、双眼/虹膜均在mask内 | 仍低头，头部和读书姿态保持；未证明身份相似度更高 |

遮罩内改变像素分别17463、20802，mask纯黑区域改变像素均0。实际脸部bbox约x291/y43/w113/h106，计划鼻点与成图位置存在偏移；不能把请求成功当成对准实际脸部的证明。两图均未破坏低头，不能据这组实验将身份精修定为当前看镜头主因。

## 验证与业务链边界

六次请求及PNG/完整返回记录保存在workspace/sd15-chain-validation-2026-10-11。含projected-arms-audit.json、identity-mask-audit.json、identity-pixel-audit.json、experiment-summary.json及各case/request/audit；img2img另有原始返回-raw.png。请求差分、冻结SVG一致性、骨长上限和mask外零改变已校验。脚本语法、TypeScript及7项现有定位/保护合成测试通过，issue:check和issue:queue通过。

关联ISSUE-GAZE-011的续验及ISSUE-IDENTITY-001的残余视觉风险，不修改原程序验收状态。未发现足以由本轮单变量样本关闭的通用代码问题；模型执行不足与优化假设如实保留，未标verified。

全链核对：剧情/人工选择→视觉规格→提示词/交互契约→recipe/payload→Regional/ControlNet→基础→身份/服装/道具/手/视线→展示/草稿整体确认→候选。生产节点没有改动；实验只测试基础与一段身份接续，尚未完成优化方案的所有局部pass/多人/景别/目标方向验证。用户任务、草稿审批、图片展示和候选均保持原流程；无模型训练、无新增质量门、无自动采用或逐项人工审批。

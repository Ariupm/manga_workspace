# 视线实际生图验证：2026-10-09

## 授权与范围

用户明确要求“你修改完后自己生图验证一下”，覆盖本轮工作区默认不生图规则。实际运行本机SD WebUI，不使用外部图片编辑服务。生产测试通过工作台POST generateDraft创建job561、shot1261、project6；仅忽略可忽略的环境锚点建议，保留真实错误和状态机，不批准草稿、不自动采用或覆盖旧候选。

## 实测结果

1. job561：完整草稿链运行成功，状态awaiting_draft_approval，图片正常展示。脸部定位成功，164×164裁剪放大到512×512，denoise .4、身份参考 .35/结束 .6、OpenPose .62/结束 .72。局部执行applied，但眼睛仍看前方/镜头，视觉目标未通过。
2. 方向修复局部实验：使用同一张contact_completion_right阶段图，经修复后的生产编译器和runLocalGaze生成，方向down、seed610009，其余主要参数同上。仍偏向看镜头，不能认定有效改善。
3. 参数对照：与实验2同图同seed，denoise改.65且仅本次局部请求不携带身份及Pose控制。仍未明确看向书页，脸型有所变化。没有将这些实验参数写入默认配方。

A原任务为随机seed，B/C为固定seed；A/B不是严格同seed实验，不能据此量化方向补全的因果效果。B/C同时改变了重绘幅度和两个控制条件，只用于探索，不能分离各因素贡献。没有用单图推断所有镜头成功率。

## 实测发现并修复的代码遗漏（ISSUE-GAZE-012）

job561的执行审计direction=down，但promptRequestTraces.gaze显示，统一编译器以effective_facts_own_action_and_gaze规则清空了worker details，里面的eyes directed downward未到SD；payload内排除看镜头的词也未进入最终局部negative。实际局部裁剪不含书，只有“看书页”无法替代明确方向。

新增gaze-direction-1配方标记；两个视线入口传入已有canonicalGazeDirection，经共享编译器白名单投影为眼睛/瞳孔方向及本人物负向。保留有效目标，不恢复任意details覆盖，不广播其他人物负向；看镜头、闭眼、明确反向和未知方向不强套。旧配方及job561历史快照不改写。局部trace.controlBindings现在记录实际裁剪请求的权重与截止时点。

## 验证与全链冲突复核

287项目测试、57执行层/局部视线/审批/台账测试、TypeScript与worker语法检查通过。专项测试验证实际transport编译、八方向、另一人物目标、看镜头、闭眼、明确方向冲突、无效方向与旧版本兼容。

剧情/人工选择→视觉规格：原事实不改；prompt/交互契约：注视目标仍来自本人有效事实；recipe/payload：新任务冻结方向版本，草稿确认后沿用，旧任务不升级；Regional/ControlNet：人物区域与控制保留，修正日志为实际局部权重；基础→身份/服装/道具/手部→视线：仅末端视线新增明确眼球方向，不改变动作/尺寸/接触/场景与前序像素；质量策略/草稿整体确认→候选回写：不新增门禁、自动重试或逐项审批，不伪造视觉通过，正式路径代码保持既有自动加入候选。

未发现上述链路新增参数冲突。真实完整运行只验证到草稿，不声称已验证正式成品生成；正式继承/候选为代码审查证据。修复前后像素检查：生产视线pass改动8478像素、方向实验改动8482像素，脸部包围框外改动均为0。

## 证据

- workspace/job561-gaze-verification.json：完整实际recipe与trace。
- workspace/generated/sd-draft-job-561-38a4fe40-7881-4a4d-bb16-3abbbc59e4cf.png：完整生产草稿。
- workspace/gaze561-direction-test/：方向修复后的请求、实际SD info、检测、audit、结果。
- workspace/gaze561-freer-test/：更强重绘/无控制的实验。
- workspace/gaze561-pixel-check.json：脸外保护验证。
- workspace/gaze012-tests.log、gaze012-worker-tests.log、gaze012-tsc.log：程序检查。

## 当前结论与剩余问题

定位/裁剪/回贴通路真实执行，方向丢失的代码缺陷已修复，ISSUE-GAZE-012推进fixed_pending_review。真实视觉目标仍未通过，不能声称视线问题整体已解决。ISSUE-GAZE-011保留待独立程序复核，并补充本次实际效果证据。

当前模型、局部初始图与文字方向的组合仍不足以可靠控制瞳孔；本轮不盲目把更强重绘设默认，不新增展示门禁。显式虹膜/眼部控制仍是未实施后续方案，兼容性、身份保持和效果尚需验证。实验图保留供用户查看，未自动替换候选。

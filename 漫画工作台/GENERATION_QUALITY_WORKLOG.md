# 漫画生图质量修复记录

## 2026-09-27：用户最新图521的剧情评估与修复验证（本轮已结束，视觉未达标）

- 本轮用户明确授权启动生图并要求以实际结果判断效果；该授权适用于本次诊断与对照，优先于此前不生图规则。仍不代用户整体确认草稿或生成正式候选。
- 任务定位：用户附件与job521草稿一致，shot1258“高兴地拿到书”，剧情“小粉抱着快递包裹，低头看着包裹，笑容满面”，地点快递站。数据库只读快照：workspace/quality-audits/2026-09-27-job521-before.json。
- 画面评估：场景不可辨认，灰色背景；人物看观众，没有低头看包裹；只有轻微微笑；手中物体更像小礼盒而非装书的快递包裹；服装出现高领与额外袖层，是否符合具体衣物参考需继续核对。手部有接触但不能由此认定动作和整体剧情通过。基础图已呈灰背景，不能归咎于后序局部pass抹掉场景。
- ISSUE-SCENE-001根因：无确认视觉规格的本地回退把快递站编译成specific everyday location，实际请求丢失具体地点；质量检查把非空占位词当作有效环境；最终Regional负向没有普通路径的背景约束。
- 修改与目的：共享地点解析供新建镜头和环境编译使用；保留具体英文地点、人工环境和确认规格优先级；未知地点明确阻断而非继续发送空泛背景；普通/最终请求的具体地点与背景要求对齐。适用于多类场所，不绑定角色、shot或job ID。
- 程序效果：目前定向地点测试3/3通过；完整检查、全链复核及实际生成对照待补充。不得将此状态写为已修好画面。

### 对照A：原生522，仅场景修复后的结果

- 使用原生generateDraft，project6/shot1258，seed3565735972，cpu_local_complex，DreamShaper8，512方图、12步、CFG5.5；未force、未确认章节规划、未改原剧情和用户资产。来源：2026-09-27-scene-native-request/response.json；完成快照：2026-09-27-job522-after.json。
- 实际请求已含parcel pickup station、货架、柜台及非空背景负向，身份/Pose/道具三项控制与521档位一致。图像证据：workspace/generated/sd-draft-job-522-b5abc435-e818-4f13-b0ff-5a99dd2d3466.png；initial阶段亦保存。
- 实际效果：失败。基础及最终仍为灰背景；人物看观众，未低头看包裹；小盒式道具及高领长袖式衣物偏差仍在，鼻部新增异常亮色条带。最终微笑增强，但不是整体剧情通过。任务进入awaiting_draft_approval只是技术流程状态，不是本轮质量结论；未代用户批准。
- 判断：SCENE-001修复了确证的数据丢失，尚未解决像素背景。不能将文本出现地点等同场景已恢复。

### 同轮追加的程序根因

- GAZE-008：未规划单人剧情“低头看包裹”被简化actionEn吞掉；默认视线仅current action target。新增保守的明确注视回退，普通/Regional/交互契约共享；否定镜头短语先排除，防止no eye contact with camera把物体注视判成independent。多人、人工覆盖、否定和多步骤歧义不猜测。定向2/2通过。
- PROP-007：521的两手接触跨度约0.326，本体却被固定上限与缩小系数压到0.1296。矩形本体和包络现同步随接触跨度放大，V3选景及执行前检查复用，worker范围取对象与接触点并集。普通TS145/145、worker/投影/衣物mask/合成/支持面55/55、资产执行5/5通过；类型检查通过。旧数值测试原要求物体比双手间距更小，改成验证覆盖接触点且保留纵向比例。
- 当前1258重新编译：quality与pose safety通过，视线明确head tilted down看parcel；projection scale从2.9623调整到2.7015以容纳更大的道具包络，仍使用原特写意图，不改数据库。证据：workspace/quality-audits/2026-09-27-shot1258-recompiled.json。
- 以上两项尚未进入522的已冻结配方，不得将522结果当作它们的修复后视觉效果。

### 对照B：简短剧情提示词诊断（进行中）

- scripts/quality-base-replay.mjs只读已完成任务，重用真实Pose/道具控制图，使用生产身份mask规划器重建身份mask和标量参数；拒绝未支持的控制阶段。scripts/quality-generation-run.mjs发送独立诊断请求，不写jobs/candidates。
- 来源522，控制/负向/seed/模型/尺寸/步数保持；正向改成简短场景与明确动作描述，去除大量协议式说明，明确低头看包裹。此实验同时改变了文本组织和视线的明确程度，不能单独归因于长度。请求是按生产规则重建，非拦截的原始HTTP请求，控制图来自真实阶段文件。
- 目录：workspace/quality-runs/2026-09-27T13-06-40-050Z-parcel-scene-compact-20260927；结果待补充。尚未把实验prompt写成生产默认。

### 对照B结果与原生C

- 对照B于13:10:57 UTC完成，未中断，完整visual-review.json已保存。货架、周转包裹与室内空间恢复；手中变为更明确的纸箱，双手位于物体两侧。仍失败：头发变短、衣服变粉色高领、视线看观众，笑容较弱。结论partial_scene_improvement_overall_failed。
- 补充核对521与522实际requestTrace：正向差异仅为具体快递站与家具替换占位环境，负向增加empty background/studio portrait backdrop/featureless background；控制与采样相同。因此522确实证明“补齐场景文字”本身仍不足以恢复背景。
- PROMPT-010修改：在既有Regional→canonical编译器内优先具体地点和背景，保留身份/服装具体内容及权重，精简重复套话；worker不再追加归一化坐标、尺寸数值和内部执行阶段说明，动作目的编译为carrying/reading/examining等可见动作，物体几何继续通过控制图和recipe/trace执行；不再强制上身占满画布。未建立旁路或让手写诊断prompt替代正式编译。
- 原生C已提交job523，仍project6/shot1258、同seed/模型/512尺寸/12步/CFG5.5，包含SCENE-001、GAZE-008、PROP-007、PROMPT-010四项修复。程序检查145/145、生成逻辑55/55和类型检查通过；原生视觉结果待完成后记录。多个修复合并进入C，不能把某一视觉变化独占归因于其中一个修复。
- 服装剩余输入限制已核对：XF-CASUAL-01图实际为奶黄方领短泡泡袖上衣与粉色中长裙，但资产英文描述仅cream-yellow top with a soft pink midi skirt；整张设定图不是隔离衣物参考，生产服装pass如实跳过。没有偷偷改衣物资产、标成隔离图或宣称修复了服装视觉控制。

### PROP-007全链复核追加：对象局部mask保护

- 修正本体跨度后检查下游发现：对象mask的边缘padding会盖住位于本体两侧的计划手腕/接触点，而trace仍称对象-only。这属于本次尺寸修复必须一起处理的下游冲突。
- 新增prop-mask-plan.mjs，对象可编辑区扣除各人物有效手腕和本关系接触点的小圆保护区；不改变控制坐标，不把隐藏/非法点当画内点，记录plannedHandProtection并明确pixelSegmentationVerified=false。后序contact/hand pass仍按原各自职责执行。
- 真实栅格mask检查2/2通过：3个横向区域×2种物体跨度，接触点与另一人物手腕处为黑，物体内部为白，背景为黑；隐藏点不改变mask。此证据证明计划坐标保护，不等同整只真实手部的语义分割。
- 此追加发生在523启动之后，523已加载的worker不包含该mask补充。523只能验证此前冻结的四项主修复；该追加本轮为代码/栅格mask验收，未再以完整SD链复测，不能混称523已验证它。

### 原生C最终结果及本轮结论

- job523已结束，状态draft_blocked，错误为“手部深度修复未应用，已保留道具阶段图片：所有可用手部检测器均未返回可用轮廓”。最终保留图：workspace/generated/sd-draft-job-523-229bfeeb-aa8c-4264-b86a-e7b2cf0ffadd.png；完整数据库快照与视觉评估：workspace/quality-audits/2026-09-27-job523-after.json、2026-09-27-job523-visual-review.json。
- 实际画面：两侧出现货架/箱子，背景比521有局部恢复，但中心仍为大面积灰墙，快递站辨识不足；物体更大但仍为粉色礼盒式盒子；仍直视观众，没有低头看包裹；粉色长发变短，奶黄上衣变成粉色短袖加黑色背心，情绪仍不足。整体剧情表达失败，身份/衣物保持也未通过。不能把这一版当合格漫画图。
- 本轮结果：修复了地点丢失、明确视线丢失、物体尺寸与双手跨度不一致以及提示词中的重复/内部协议文字；程序验收通过，四项为fixed_pending_review，尚未经独立诊断复核。实际生图只有局部改善，产品目标未完成。没有自动批准草稿，没有生成正式候选。
- 验证边界：TS测试145/145，相关worker及资产测试60/60，新增对象mask栅格2/2，类型检查通过。523未包含启动后追加的mask保护，该项只做程序验证。A/B/C及失败输出全部保留；后续应分别验证身份/服装控制、面部视线控制和手检测失败分支，不能通过继续堆叠提示词或绕过门禁宣称成功。

## 2026-09-21 晚间续作：原生规划、原生草稿与新定位

- SD已由用户启动，确认CPU/DreamShaper8/VAE配置；ip-adapter_clip_h是有效别名，不是缺失模块。
- PLANNING-001：有界章节批次、逐格绑定、持久人物/道具状态、英文错误反馈、支持模型非思考JSON与截断拒绝。真实24格成功，未确认；后续核对发现一版重复预填衣物导致换睡衣后恢复便服，已继续调整来源解释并加入已确认衣物硬校验，不能把schema通过当完整语义通过。
- GAZE-006：携带手机不等于读手机，明确道路/窗户/同伴视线与结构化目标一致。POSE-019：复合动作仍恢复本人显式接触，行走头部变化同步眼耳。POSE-020：手机中心在画内而本体越界的真实漏洞修复，统一投影拟合完整道具包络，旧recipe执行前也检查。
- 真实身份全图/头裁剪同seed对照均失败：手机双手有出现但仍看观众、白衣。没有把裁剪当万能修复，视觉review和参数均保留。
- 原生515：约7分钟，手机/手部仍失败，短发、白衣黄裙偏离设定；衣物因未隔离参考明确跳过，手部检测无轮廓，最终draft_blocked，无候选。516用同seed测试头部/包络修复，结束后补充结果。
- 完整交接、证据路径、程序矩阵和不能宣称的结论详见HANDOFF_2026-09-21_CONTINUATION.md。无正式审批，无Git提交，memory仅待确认草稿。

## 本轮目标与验收（2026-09-19）

用户要求：人物身份、服装、四肢、动作、视线、道具以及道路/场景符合剧情；记录每次改动、目的和验证效果。用户本轮明确允许 Stable Diffusion 生图，此授权优先于既有“不运行 SD”的局部验收限制。仍保留草稿整体确认与成品自动门禁，不代替用户批准正式候选。

目标仍在进行中。程序检查和实际视觉结果分别记录，不把测试通过、HTTP 成功或单张偶然合格当成整体画质保证。

## 基线

- Git 基线：f532795a。
- 数据库最新任务：511 draft_blocked，510 completed，509 awaiting_draft_approval。507/510/511 recipe.model 均为 meinaunreal_v5；不能作为 DreamShaper 8 的验证样本。
- 511 仍因手检测没有有效轮廓被阻断。其实际 prompt 同时出现 hands out of frame、hands physically contact、另一人的手和单人要求，需要追溯编译来源；暂不把全部视觉失败归因于底模。
- 当前 V3 投影候选打分计入可见关节数；景别、完整骨架和关系坐标如何统一仍待复现审计。

## 变更 01：结构化视线正确编译（ISSUE-PROMPT-004）

- 目的：阻止 gazeTarget 对象隐式转换成 `[object Object]`，保留真实的物体、工作点或独立视线语义。
- 证据：507/510/511 实际 requestTrace.prompt 含该无效字符串；sd-worker-logic.mjs 对 item.gazeTarget 直接模板插值。
- 修改：新增 baseInteractionGazePrompt，按结构化 kind 编译；保留旧字符串目标与已有可读 gaze 文本；independent 优先于旧 gazeMode；不把内部 ID 或坐标当自然语言目标。
- 程序验证：32/32 worker 逻辑测试通过。新增 5 类道具 × 单双手 × 4 类视线目标组合，断言没有对象字符串泄漏、不改变输入关系、不丢人物和另一只手动作。
- 视觉验证：未生成修复后的对照图，不能声称视线像素已修好。

## 变更 02：核实并纠正运行时 checkpoint

- 目的：让后续实际请求使用用户指定的 DreamShaper 8。
- 证据：7860 options API 可访问且返回 meinaunreal_v5；progress 返回 job 为空、job_count=0。此前端口枚举无输出不能证明 SD 未运行。
- 修改：刷新 checkpoint 列表，确认 DreamShaper_8_pruned.safetensors 被识别；通过 options API 请求加载新 checkpoint。未改历史任务配方。
- 验证：options 已返回 DreamShaper_8_pruned.safetensors [879db523c3]；VAE 仍为 vaeFinalPruneVAE_v10.pt、Clip skip 1。生成响应的模型 hash 待本次测试完成后核对。

## 实验 01：短提示词、无控制的底模基础能力

- 输入：scripts/quality-fixtures/seated-phone-baseline.json；成人女性、粉色长发、奶黄色上衣/粉色裙子、坐沙发、双手在胸前拿手机并低头阅读。
- 目的：先观察底模能否独立表达这些属性；之后再与长提示词、Pose/道具控制及局部 pass 对照。此实验不验证跨格身份一致性，也不改变生产质量门。
- 参数：DreamShaper 8；512×512；12 步；CFG 5.5；DPM++ 2M/Karras；seed 13579246。沿用当前步数便于建立起点，不预先宣称它是最佳参数。
- 执行工具：scripts/quality-generation-run.mjs 保存请求、运行时模型/VAE、每 30 秒进度、输出哈希、SD info 与耗时。HTTP 长任务不因常规 fetch 头部超时重发；失败单独记录。结果只放测试目录，不写正式 jobs/candidates。
- 状态：2026-09-19T10:49:31Z 已提交；PID 22628，exec session 32513。首个进度观察为 step=1，progress=0.0933；进程仍运行，不能重复发同一请求。
- 输出目录：workspace/quality-runs/2026-09-19T10-49-31-246Z-seated-phone-compact-no-control。继续时先检查 status.json、进程与 API progress；完成后查看 image.png 与 result.json，填写视觉结论。
- 历史图观察：510 的正式图手机呈包状且服装偏离；511 草稿未表现取包裹，不能因人物粉发或图片解码通过就判剧情通过。
- 完成结果：2026-09-19T10:51:55Z 返回，耗时 144.266 秒，响应确认 DreamShaper_8_pruned/879db523c3。session 32513 已正常退出，无待运行请求。
- 视觉结论：失败。单人、粉色长发、坐沙发成立；上衣变白色无袖、裙子非粉色，手机在腿前而非胸前，人物看向观众、未低头阅读，景别露出腿部。手指接触细节无法明确通过。本次没有身份参考，不能评估具体角色脸部一致性。
- 证据：image.png、result.json、visual-review.json。换底模加短提示词对该 seed 仍未建立剧情动作，不能宣称短 prompt 或 DreamShaper 已解决问题。下一步应在同样 seed/模型/参数下加入正确几何控制，逐项比较；仍需评估当前 VAE 和步数，不能由单样本判断因果比例。

## 下一步及未完成项

### 2026-09-19 继续：服装权重对照与配置门禁闭合

- 状态复核：上一个修复回合为实质进展（MASK-001及真实合成验证）。最近额度问答未修改项目；本轮重新读取代码、工作日志和SD状态后继续，未重发已完成请求。SD运行时使用Full VAE编解码、img2img_extra_noise=0、img2img_fix_steps=false，未发现这些开关导致输入损坏的证据。
- 实验10：workspace/quality-runs/2026-09-19T13-56-40-339Z-seated-phone-yellow-outfit-weight-11。相对实验09只将服装文字权重1.9降至1.1，99.299秒完成。异常黑色花纹消失、上衣偏浅黄，仍有领口/袖型和发丝问题；partial_outfit_improvement_overall_failed。
- 实验11/12：同一源图、mask、参考与采样参数，改用第二采样seed24681357，对照权重1.9/1.1。目录分别为2026-09-19T13-59-10-113Z-seated-phone-outfit-seed2-weight-19（97.052秒）和2026-09-19T14-10-41-961Z-seated-phone-outfit-seed2-weight-11（97.691秒）。高权重再次出现夸张装饰纹理，低权重纹理消失但变成开领衬衫，仍不符合方领泡泡袖；分别failed_outfit_requirements和partial_outfit_improvement_overall_failed。三张新图的生产合成重放均为154236个保护像素、改变0。
- ISSUE-OUTFIT-004：基于两组匹配对照，把生产服装局部prompt默认强调降至1.1，实际值同时写outfitTrace.promptWeight；不改变视觉参考权重、mask或采样步数。泛化到其他服装及CPU生产8步仍未验证，不以此关闭完整服装质量问题。
- ISSUE-PROMPT-005：两个local gaze prompt原先插入内部targetId、坐标、距离，且用neck/pupils converge表达朝向。改为共享gazeRefinementPrompt，只编译可读目标、八方向、表情与原可读gazeText；内部数据继续用于trace/mask/ControlNet。8方向×3目标类型及旧对象值检查通过；未声称视觉注视效果通过。
- ISSUE-QA-008（P0）：route对必需道具自动enabled，但CPU曾跳过CLIP、异常曾标unverified后继续INSERT候选。现在各profile实际执行已配置检测，enabled必须passed；语义blocked按既有上限换seed，服务/配置/无结果错误直接失败留痕，不耗seed重试，不恢复逐项或成品二次人工审批。
- 本机门禁实测：BLIP权重和ViT-L/14缓存均在本地，SD空闲后对实验04手机图调用/sdapi/v1/interrogate；session54141、PID46708，workspace/quality-runs/seated-phone-caption-service-check。14:16:01.461Z至14:22:40.091Z完成，398.630秒；期间API job=interrogate且CPU累计时间增长，未重发。caption含cell phone，现有手机门禁passed/allow；同时错误描述人物在看屏幕（视觉上看观众），实证不能把字幕当作视线或整体剧情验收。检测附带风格分类，CPU开销明显，后续需评估更聚焦的检测流程。
- 当前程序验证：worker35/35及语法通过，最终类型检查通过，issue:check66项有效，issue:queue为空；新增修复均待独立复核，完整链冲突复核分别记录于上述ISSUE。memory:sync只生成待确认草稿。三次新生图和一次检测均已结束，无本轮待运行请求。所有图像结论仍为失败或局部改善，整体任务尚未完成，代码未提交。

### 2026-09-19 继续：服装区域与前序内容保护

- 上轮分类：有实质进展（脸部遮罩定位修复、两次视线实验完成并保存失败证据）。本轮读取当前代码和目标状态，不重复提交已完成的生图。
- 头部审计：V2/V3 已执行 enforceHeadNeckGeometry，不能把失败归因于“完全没传头部方向”；18点骨架包含鼻/眼/耳而无瞳孔方向。仍需验证眼耳控制是否过度限制当前动作。
- 实验07：workspace/quality-runs/2026-09-19T13-08-08-050Z-seated-phone-pose-without-eye-ear-control；沿用实验04同一源姿态、prompt/seed/采样，只移除眼耳四点与相连线，鼻/颈/身体保持。189秒左右完整返回，头部朝下，但闭眼且手机变翻盖状，衣服仍白。结论 partial_gaze_improvement_overall_failed。不据此全局删除生产面部控制，不声称阅读视线或整体画质通过。
- ISSUE-OUTFIT-002：单件上/下装原本退回 full，袖长/纽扣修饰词会单独生成 full 重绘。改为按服装类别分区、保留描述和复合颜色、附属描述不独立重绘。worker 33/33 检查通过。
- ISSUE-OUTFIT-003：原服装 mask 覆盖胸前手/物，画外髋点 -1 仍参与下装计算。共用投影后的骨架和道具求解范围，保护所有人物的脸、腕部周围及剧情物体，画外或全保护区域跳过，区域状态与实际请求一致。新增3位置×3服装区、双人、SVG像素、画外与非法输入检查，mask 2/2通过；完整链复核见台账。引用非隔离资产仍跳过，未放宽既有门禁。
- 实验08：workspace/quality-runs/2026-09-19T13-14-01-944Z-seated-phone-yellow-outfit-protected，源为实验04，使用生产 outfitMaskPlan，文字要求奶黄色上衣，18步/CFG6.8/denoise .48，无隔离服装图参考。106.777秒完整返回，出现黄色但新增夸张花纹、改变袖型、重画部分发丝和裙子附近纹理，结论 failed_outfit_and_preservation_requirements，已保存 visual-review.json。仅有主手机/手区域保留不能当整体保护成功。
- 已知限制：规划骨架位置与实际图像仍有偏差。样图中裙子和发丝实际出现在规划上衣区域，几何 mask 无法保证语义分割级保护；需观察实验08，不能把黑色规划保护区等同于全部真实手指/道具/衣物像素已保护。
- 资产实查：只读 job511，服装引用 XF-CASUAL-01 为非隔离，故 worker 跳过服装视觉精修；实际服装资产右下有独立奶黄色方领泡泡袖上衣，身份图则为白色上衣。整体服装设定图不能直接标记为隔离资产。已另存诊断 crop 与 provenance（left347/top560/155×132），未改资产库或默认绑定。
- 实验09：workspace/quality-runs/2026-09-19T13-19-20-055Z-seated-phone-yellow-outfit-reference；沿用实验08输入/mask/prompt/采样，只加入上述独立上衣裁片，ip-adapter-plus_sd15 [836b5c2e]、权重.336、结束.82，与生产隔离上衣引用参数一致。118.419秒完整返回，info确认ControlNet加载；仍出现夸张黑色花纹，未还原参考的方领纯色泡泡袖上衣，结论failed_outfit_requirements。后续已重放修复后的生产合成并检查composited-single-alpha.png，保护区像素不变，但白mask内发丝/衣物受损，不能宣称服装或身份通过。
- ISSUE-MASK-001（P0）：为验证实验08保护效果，抽出生产compositeMaskedOutput并重放，发现154236个黑mask像素中26102个被改变（5778个差值>1，最大差值71）。本机Sharp源码证实joinChannel先于removeAlpha执行，旧链式写法移除了刚添加的mask透明度；编码灰度PNG也不是可靠单通道输入。第一次只改raw alpha仍失败，失败产物保留为composited-fixed.png；将RGB解码和添加raw alpha分成两个流水线才修复。
- MASK修复验证：黑/灰/白×1/3/4通道mask、输出和源尺寸异常测试2/2。实验08和09复用最终生产合成器，154236个黑mask像素改变数均0（composited-single-alpha-review.json）；身份精修和伞交接补接同一函数，服装/道具/接触/手/两类gaze自动继承。只证明保护区严格保留，不证明mask白区正确或模型语义符合剧情。
- 当前程序验证：最终类型检查通过；worker33/33、服装mask2/2、合成2/2共37/37，另执行投影3/3，语法通过。新修复为fixed_pending_review，需独立诊断；实验07/08/09均已正常结束，无本轮待运行SD请求。整体质量目标未完成，后续重点为实际服装分割/重绘参数和低头睁眼阅读，不应重复无差别增大prompt或强度。

### 2026-09-19 恢复后：真实姿态对照与继续修复

- 暂停恢复：上一请求 PID 49320/2026-09-19T12-00-10-077Z 已因用户暂停被 interrupt，虽返回 PNG，也不能当完整采样对照；已把 status 标记 interrupted_output_not_valid_for_comparison。恢复时 API 空闲、interrupted=true，确认原任务终止后才重新提交。runner 增加响应后 interrupted 检查，避免把中断图误记为正常完成。
- 实验 02（修复前姿态）：目录 workspace/quality-runs/2026-09-19T12-04-05-719Z-seated-phone-pose-before-focus-fix；DreamShaper 8、seed 13579246、512²、12 步、CFG5.5，与实验01相同 prompt，仅加入 control_v11p_sd15_openpose [cab727d4]，权重1、结束.85。完整运行 204.742 秒，interrupted=false，SD info 确认控制实际加载。
- 实验02视觉：失败。粉色长发与单人坐沙发可见；成图近全身、腿和地面明显，双手放在腿前，手机未正确呈现，仍看向观众。衣着呈浅奶黄/粉色但款式开放且与精确设定不一致；不能以配色相近判服装通过。
- ISSUE-POSE-015：发现旧 waist_up 实际18关节全部在画内，采用固定倍率且偏好被总分覆盖。改为解剖位置裁切、相机偏好、统一可见边界；上身动作仅检查画内头躯干手臂，完整下肢保留并明确记录未在画内检查。不能兼容的中近景阻断，不静默换全景。worker 上身词过滤识别 V3 实际裁切，不做旧二次栅格裁切。
- 实验 03（仅裁切修复）：目录 workspace/quality-runs/2026-09-19T12-07-59-364Z-seated-phone-pose-after-crop-fix-v2；与实验02相同模型/seed/prompt/参数，仅控制图投影变化。204秒左右返回，interrupted=false。
- 实验03视觉：局部改善、整体失败。上身构图成立，未出现腿和地面；粉色长发和单人保持。但双手低到画面底部，手机仍缺失，视线仍向观众，上衣偏白、无法确认预期服装。证明这一个 seed 的裁切有改善，不代表动作或整体质量通过。
- ISSUE-POSE-016：等待实验03期间复核发现 full_body 构建绕过 V2 上身分支的接触回贴与屈肘。新增完整动作空间的通用接触求解，声明腕点精确回贴，双手托持肘点低于腕点；操作/放置保留另一种方向；镜像按实际肩位外展。参数覆盖同步新模板证据、支持面和控制档位，原支持冲突继续阻断。
- 实验 04（追加接触/屈肘修复）：workspace/quality-runs/2026-09-19T12-11-35-083Z-seated-phone-pose-after-contact-fix；198.871 秒完整返回。相同 seed/prompt/采样参数。手机清楚可辨，双手托持与上身构图改善；人物仍看观众，上衣偏白，手指数量和精确身份未验收。结论为 partial_improvement_overall_failed，已保存 visual-review.json。
- ISSUE-POSE-017：对照本机 annotator 发现17色表遗漏左耳颜色，补齐18色并共享。仅程序验证，实验04控制图生成早于此项，不把该图作为颜色修正的视觉验收。
- 程序验证：V3 17/17、投影执行3/3、worker32/32；类型检查通过。新增覆盖上身/全景、平移等变、不可兼容景别阻断、4道具×2镜像×4用途的屈肘矩阵、覆盖后证据同步及18关节色表。完整链路复核分别写入 ISSUE-POSE-015/016/017。
- 实验 05（面部局部重绘）：workspace/quality-runs/2026-09-19T12-15-48-991Z-seated-phone-gaze-inpaint-055；沿用实验04图片，18步、CFG6、denoise .55，头部椭圆 mask，Only masked/padding96，无身份/Pose 控制。126.683 秒完整返回，仍看向观众，结论 failed_gaze_requirement；第260行以下逐通道差异为0，手机和双手区域确实保留。脸部外观改变，不能宣称身份通过。
- 实验 06（全图上下文对照）：workspace/quality-runs/2026-09-19T12-18-52-120Z-seated-phone-gaze-full-context-055；从实验04同一输入出发，参数与实验05相同，仅改 Whole picture 上下文（mask 不变）。约126.7秒完整返回，仍看观众、脸部样貌改变，手机和双手持握保留，结论 failed_gaze_requirement，已保存逐像素保留检查及 visual-review.json。生产 CPU 视线已有全图上下文且有身份/Pose 控制、不同步数/重绘强度，两个隔离实验均不等同生产 pass。不得以此将 .55 强度直接推广至生产或归因底模完全不支持视线。
- ISSUE-GAZE-005：等待实验06期间确认局部面部中心被限制 x=.12–.88/y=.12–.5，导致边缘/低位人物的 mask 错位。保留合法投影鼻点，非法坐标真实回退；同步修正 identity SVG 左上边缘二次位移。worker 33/33、类型和语法检查通过，完整链复核见台账。此缺陷不能解释当前中央人像的全部视线失败。
- 后续重点：视线、精确服装及身份稳定性仍未达到目标。独立短提示词测试未使用完整身份/服装引用和局部 pass，不能作为完整工作台验收；不能由单 seed 推断改善可泛化到所有剧情。
- 本段结束状态：实验05/06均已终止且未中断，无本轮待运行生图。issue:check 60项有效，issue:queue 为空，新增修复均 fixed_pending_review；memory:sync 仅生成待确认草稿。代码尚未提交，整体画质目标尚未完成。

### 2026-09-19 续接：统一生成坐标（ISSUE-POSE-014）

- 目的：消除 OpenPose 已投影但道具、支持面和视线仍用旧坐标的确定性冲突，避免后序局部重绘把对象拉回旧位置。
- 证据：只读 jobs 509–511，projection.scale 均为 1.35；511 骨架右腕 (0.47,0.55058928)，旧道具中心 (0.5,0.62)。worker 的基础道具中心又被单独限制在固定范围，与局部 pass 不同。
- 修改：共享 pose-execution-v3 转换器保留原始编辑计划和源契约，另建 projected_canvas 快照；投影接触点、道具中心、支持面、视线、人物分区和引用区域；API 和 worker 复用，成品重放不二次缩放、不重置成品引用权重或 prompt。V3 基础和局部道具使用同一个中心。必需道具及腕点纳入选景证据，越界执行数据阻断。
- 程序结果：V3 11/11、执行投影 3/3、worker 32/32 测试通过，TypeScript、语法检查通过。矩阵包含 4 道具×3 景别×2 手数，独立用不同 scale 和双人分区验证支持面/视线/接触点及重放。历史 509–511 只在内存重放，未写正式数据库；511 新中心和右手锚点与骨架精确一致，三任务重复转换相同。
- 全链复核：详见 ISSUE；区域与引用遮罩、基础/后续局部 pass、旧 V3 recipe、V2 兼容、失败阻断和候选回写均核对。尚不证明原始动作拓扑或语义正确，也不证明视觉执行率。
- SD 状态核验：本轮查询 API 返回空闲，DreamShaper_8_pruned [879db523c3]、VAE vaeFinalPruneVAE_v10.pt、Clip skip 1；未提交新生图请求。
- 验收边界：程序逻辑验收通过，未进行图片生成或视觉效果验收。整体目标保持未完成。
- 结束检查：issue:check 为 56 项有效，issue:queue 为空（新项待独立复核）；memory:sync 沙箱写入失败后提升权限成功，只生成待确认草稿。新代码和文档尚未提交。

### 2026-09-19 续接：人物动作证据与人工编辑复核

- 上轮进度：已提交现有修改到 032a3f14；本轮未启动 SD。
- 问题与目的：发现 V3 使用“任意人物关节可见”替代指定人物的动作证据，人工编辑又沿用旧通过结果。修复 ISSUE-POSE-013，使被裁掉的动作不能被另一个人物掩盖。
- 修改：证据新增 personIndex；共享当前几何可见性判定；旧无人物绑定证据要求所有人物满足；不存在的人物判失败；人工编辑刷新证据、失败列表、画内状态和审计哈希；校验不信任过期成功缓存。
- 验证：初次 V3 10/10 测试通过，覆盖人物顺序互换、关节组合、缺失人物、旧证据、锁定构图与人工越界。沙箱运行 tsx 时 Windows 用户信息读取失败，提升权限后纯逻辑测试成功，使用内存数据库。最终检查另行追加。
- 全链结果：上游人物顺序绑定证据，下游现有 API 在无效 V3 safety 时返回 422，阻止错误控制进入生成。未修改身份/服装/道具/视线局部 pass、用户草稿整体确认和成品自动门禁流程。
- 效果边界：程序逻辑验收通过，未进行图片生成或视觉效果验收。本次不证明关系接触、景别偏好和道具坐标正确，也不能承诺人物/服装/手指视觉质量；仍须继续核对统一投影与完整生成链。
- 最终检查：全部修改后 V3 10/10 测试再次通过；TypeScript --noEmit --incremental false 返回 0；issue:check 校验 55 项有效，issue:queue 为空（本项 fixed_pending_review）。memory:sync 提升权限后成功生成待确认草稿，未执行 apply。本轮代码尚未提交。

1. 读取运行时新模型确认值，保存现有 510/511 基础与后处理图作为对照。
2. 复现并修正 prompt、V3 景别、骨架与道具/接触坐标冲突；不对某一个 job 硬编码。
3. 核实身份参考与服装控制覆盖范围，避免基础错误靠小脸 mask 弥补。
4. 在可追溯测试目录保存同 seed 的基础与各 pass 对照；覆盖单人持物、行走/道路、双人交互及不同景别。
5. 检查失败阻断与候选回写、无自动检测时的真实能力边界。最终效果仍未达标，目标保持 active。
# 2026-09-19 续修：动作默认值与手部冲突（ISSUE-PROMPT-006）

- 修改：取物与交接的默认视线分离，普通 hands/handbag 不再匹配交接；缺省手部读取人物自己的动作，不再默认藏在画外，也不要求尚在伸手阶段的手提前接触对象。
- 目的：减少在基础生成前就互相矛盾的语言条件。保留用户显式值；新请求中同一人物的画外手部与必需手部交互冲突时返回422，force不能绕过。
- 验证：3项定向测试通过，含真实Regional编译、单人/双人及显式值保留；数据库使用内存，没有更新已有recipe、任务或候选。本轮未生图，程序通过不代表眼神/服装画质通过。
- 未完成：旧任务保存的错误视线、复杂自然语言和任意promptOverride冲突仍须进一步核对；总体画质目标保持进行中。

验收补充：ISSUE-PROMPT-006 相关5项测试与TypeScript检查通过。完整studio测试启动后源码继续更新，运行184秒未结束，已主动停止；不记录为全套通过。

## 2026-09-19 续修：道具归属与缺省位置

- ISSUE-PROP-006：先用三道具双人测试复现旁观者被错误赋予required，再移除未确认/错误actor的legacy道具兜底。多人持物依据来自本人动作或已确认关系；单人保留全局上下文兼容。目的：避免额外道具、错误持物姿势和后序局部重绘。
- ISSUE-VISUALSPEC-004：回归检查复现单人缺省left与region=0-1自相矛盾。缺省位置改由最终region中心推导，明确输入与P0冲突检查保留。
- 最终验收：18项相关测试通过，TypeScript通过。新增单/双/三人区域及左右反排矩阵；既有共享道具、交接和工具多关系检查通过。没有启动SD或生成图片，没有修改历史recipe/候选。两项均fixed_pending_review，未标verified。
- 全链冲突复核与残余风险详见PROJECT_ISSUES.md；这轮程序修复不构成最终画质保证。复杂多人代词、实际人物身份/服装/眼神执行仍需继续验证。

## 2026-09-19 续修：人物动作与整格事件隔离

- ISSUE-VISUALSPEC-005：新增测试先复现递伞者/接伞者均被整格事件覆盖。修正规格优先级为人物人工字段、人物raw字段、仅单人整格兜底；多人推断交互不再使用全局持物事实给旁观者制造关系。
- 目的：在提示词和骨骼之前保留不同人物的动作与表情，避免同一事件错误复制到每个人。
- 验证：18项相关测试及TypeScript通过，覆盖显式人工优先、不同表情、单人兼容、多人缺字段、旁观者、工具多关系与位置阻断。未启动SD或生成图片，未改数据库/历史recipe/候选。完整链路复核和运行风险记录于台账；状态fixed_pending_review。

## 2026-09-19 真实分镜只读审计与规划指令门禁

- 新增scripts/quality-input-audit.ts，以SQLite readOnly打开现有库，不导入有迁移副作用的db.ts、不修改记录、不请求SD。报告按时间戳独立保存。
- 结果：2775个分镜，1395个多人，无解析异常，本项手部冲突0；2592格仍含内置编排指令。证据workspace/quality-audits/2026-09-19T14-48-10-395Z.json。这是输入审计，不是全体分镜或像素质量通过，也不是2592次生成失败。
- ISSUE-PROMPT-007：生成前识别五种内置叙事阶段指令，要求人物具体动作或已确认视觉规格，force不能绕过；不编造替代动作、不覆盖历史数据。3项相关测试和TypeScript通过，另单独复测五种指令均通过。
- 下一步仍是具体视觉规划与全链质量验证，本轮未生图。修复和全链冲突检查已写入台账，fixed_pending_review。

## 2026-09-19 续修：已确认规格P0入口

- ISSUE-QA-009：生成前重新规范化和校验已确认规格时，旧代码只检查errors（资产类错误），忽略conflicts/failures中的P0；例如left位置与0-1区域冲突可在errors为空时继续执行。
- 修改：按validation.valid完整拒绝，错误信息合并资产错误、冲突和failure message。没有改审批次数或恢复逐项勾选。
- 验证：tests/generation-spec-gate.test.ts在独立内存库直接调用POST，generate/generateDraft均force=true，得到422及具体P0原因，fetch调用0。TypeScript检查通过。未访问生产库、未启动SD、未生成图片。全链复核写入台账，fixed_pending_review。

## 2026-09-21 记录核对与身份引用修复

- 用户询问记录是否齐全。已核对已完成各项台账/日志；上一段刚新增的身份缺失回归测试尚未对应实现，本次补齐修复与记录。
- ISSUE-IDENTITY-002：有characterId时只取本人参考，缺失返回null，不按数组索引借用他人；双方均无ID才保留旧索引兼容。先复现错误引用，修复后worker36/36通过。完整链审查写入台账，fixed_pending_review。
- 本轮未生图。身份参考是否引入旧白上衣仍属待验证假设，不能记录成已修复。
- 文档已落盘不等于Git已提交：当前工作树仍含修改与新文件。没有把未复核项标verified，没有把程序测试通过写成最终画质通过。

## 2026-09-21 连续漫画推进：上游恢复、场景与衣物、自动接触

- 依据最新交接与真实最近jobs定位项目6/章35；只读审计24格，其中已确认2、尚无规格21，1255存在明确left与全宽region冲突。原始章节和分格未重写；完整证据见CONTINUOUS_COMIC_AUDIT_2026-09-21.md与章节JSON审计。
- 新修复PROMPT-008：旧人物编排指令不再覆盖具体视觉动作，统一normalize/门禁/prompt/Regional/骨架输入，只有指令仍阻断。CONTINUITY-001：只有明确同场景才继承上格环境。OUTFIT-005：人物人工选择→已确认规格→首人旧选择→本人基础资产，生成/Regional/引用一致，多人不借首人衣物。
- 完整回归发现并修复POSE-018：头部修正会移动鼻点却未迁移自触摸腕点，中景揉眼接触断开；按鼻点位移保持接触，左右手与显式道具保护矩阵通过。TEST-003更新旧引用schema、候选数、固定步幅和景别文案断言，未改变生产候选数或放宽真实接触要求。
- 最终全部TS测试109/109（含84项Studio、17项V3、1项API、7项新矩阵）通过；worker/合成/衣物mask/投影43/43通过；类型检查通过。对应日志在workspace/quality-audits/2026-09-21-regression-verified.log和2026-09-21-worker-regression.log。日志文件名不代表ISSUE已verified，5项均只到fixed_pending_review。
- SD当前配置127.0.0.1:7860连接拒绝，未找到WebUI进程/监听；已询问用户当前地址，未启动SD或发图请求。工作台既有DeepSeek plan-chapter接口对项目6/章35内置两次尝试均超时，最终502，未保存新规划；失败由既有API记录，独立响应保存在2026-09-21-chapter-35-plan-result.json。
- 程序逻辑验收通过，未进行图片生成或视觉效果验收。目标仍未完成，下一步需可用规划/SD服务、完整章节规格和真实连续多格效果证据。草稿整体确认和成品自动候选流程未改；未代用户批准草稿。memory:sync仅生成待确认草稿，未apply，代码尚未提交。

### 晚间结束结果

- 最新规划6场景24格146.2秒，睡衣连续保持，仍未确认；旧预填衣物冲突明确记录，1276关灯场景语义仍待核对。120/120 TS、44/44 worker及类型检查通过。
- 原生516同seed复测结束，几何手机底边从515约516px变为约481px/512，图中仍缺少可用手机/手部，发长和衣物仍错误。手部检测无轮廓，draft_blocked，无候选。515/516两个真实任务和两个身份参考对照均已结束，未通过视觉目标；详细证据在续作交接。
- 台账82项有效，4项新修复fixed_pending_review，解决队列为空；整体可用连续漫画目标未完成，代码与文档未提交Git。

## 2026-09-21 身份预算与独立入口续作

详见HANDOFF_2026-09-21_CONTINUATION.md“再续”部分。新增CONTROL-003、PROMPT-009、INDEPENDENCE-001/002，fixed_pending_review。原生518恢复基础身份控制，画外floor不再消耗名额，移除室外→室内提示冲突；长粉发/门口更明确，但衣物颜色反置、手机/门把动作/道路视线仍失败，draft_blocked，无正式候选。单次短prompt对照颜色较接近但动作和视线仍失败，不推广默认。人物档案真实DeepSeek API200；人物资产默认SD且Codex显式备选，SD资产仅完成隔离HTTP/DB集成，未证明实际资产画质。121/121 TS、50/50 worker组合+1/1独立worker集成、类型检查通过；86项台账有效、解决队列空，不代表总体目标完成。


## 2026-09-27：视线和持物修复收尾（程序验收）

- 目的：消除角色之间的视线策略串用与持物位置反侧/顺序漂移，保持工作台独立SD路径。
- 修改：完善明确直视镜头的识别（directly/towards/viewer）；补齐三种区域双手持物不受单手偏移的回归断言。此前按人物ID的视线策略和共享几何平移一并完成全链复核。
- 效果：studio+pose-v3 104/104，worker逻辑42/42，TypeScript通过；两项ISSUE推进fixed_pending_review，未自行verified。证据为workspace/quality-audits/2026-09-27-contact-tests.log和2026-09-27-gaze-tests.log。
- 运行事实：只读查询job520已failed，错误为SD worker心跳租约过期，没有可审批结果；本轮未重启任务、未生图、未等待真实图片。历史519的画面缺陷仍未证明解决。
- 限制和后续：程序逻辑验收通过，未进行图片生成或视觉效果验收。整体连续漫画目标尚未完成；章节关灯后的光照继承、独立人物资产质量、服装/手物/眼神实际执行率仍需继续审计，不能用测试通过代替整体目标。


## 2026-09-27：同地点环境状态继承修复

- ISSUE-CONTINUITY-002：复现当前仅月光/台灯关闭时仍继承glowing desk lamp。根因是场景ID只代表地点，却同时被用来证明光照状态相同。
- 修改与目的：环境来源增加当前明确时间/天气/光照兼容性判断；旧状态锚点不再被自动复用。同地点名称和人物衣物继承保留，当前显式值不被覆盖，可使用兼容章计划。
- 实际程序效果：失败复现9/10，修改后95/95及TypeScript通过；Regional实际编译prompt不含旧发光台灯。证据workspace/quality-audits/2026-09-27-environment-before.log及environment-after.log。
- 完整链复核与限制已写台账，状态fixed_pending_review。本轮未生成或等待真实图片。该修复不等于章节模型选择场景状态已正确；默认值来源未区分、自然语言等价判断保守、实际画面执行率仍未解决，连续漫画整体目标保持进行中。


## 2026-09-27：明确环境值与自动默认值分离

- ISSUE-CONTINUITY-003：原meaningful会把明确daytime/calm dry weather当缺省，覆盖为旧夜雨。新增scene.fallbackValues记录补全值；显式环境原文保持，再规范化保留来源，继承后清除相应默认标记。数据库现有JSON存储无需迁移。
- 目的与效果：防止剧情明确昼夜/天气变化被继承覆盖，同时让真正缺省继续补全。恢复+studio+章节规划101/101，TypeScript通过，日志workspace/quality-audits/2026-09-27-environment-provenance.log。
- 全链审查已写台账，fixed_pending_review，未自行verified。旧数据来源、章节状态规划、人工JSON同值默认标记仍有边界；本轮未生成图片，不能据此宣布实际连续漫画可用。


## 2026-09-27：环境来源贯通人工保存与章计划

- ISSUE-CONTINUITY-003续修：人工保存并确认时调用manualEnvironment选项，把提交的环境值确认为明确输入，避免旧fallbackValues让同值确认失效；自动细化仍保留来源。章计划的daytime/calm dry weather按明确事实参加环境兼容判断，夜景不再继承白天日照锚点。
- 验证：101/101及TypeScript通过，日志workspace/quality-audits/2026-09-27-manual-environment.log。API人工保存/翻译→规范化→校验→数据库JSON/hash→下游环境prompt链已检查；草稿整体确认、自动门与候选流程不变。
- 未生图，未自行verified。历史规格缺省来源和章节模型的剧情理解仍有限制，整体连续漫画目标尚未完成。


## 2026-09-27：配饰和可见状态移除的连续性

- ISSUE-CONTINUITY-004：原先空数组无条件继承前格，移除围巾或洗净污渍会恢复旧状态。新增appearanceState.missingArrays区分字段遗漏与明确清空，按本人继承，重复规范化保留来源；人工保存接受提交数组。前格仍未知时保留未知来源。
- 效果：恢复+studio97/97、TypeScript通过，日志workspace/quality-audits/2026-09-27-appearance-arrays.log。全链复核写入台账，fixed_pending_review，未自行verified。
- 本轮未生图。旧数据来源、bag/glasses等字符串状态及真实画面执行率仍待审计，目标尚未完成。


## 2026-09-27：包眼镜发型外套的缺省继承

- ISSUE-CONTINUITY-005：缺失字段先变成no visible bag/no glasses等默认语句，再被误认为明确状态，抹掉前格状态。新增外观字符串fallbackValues，缺省按本人继承，显式摘除/改变保留；重复规范化及人工确认保持对应语义。
- 效果：恢复+studio98/98及TypeScript通过；Regional实际人物prompt断言包含继承的马尾、蓝包、眼镜、敞开外套。证据workspace/quality-audits/2026-09-27-appearance-values.log。全链复核在台账，fixed_pending_review。
- 本轮未生图；旧数据来源、模型主动输出错误状态以及实际像素执行率未证明解决。整体目标继续进行。


## 2026-09-27：人物离场再返回的最近状态

- ISSUE-CONTINUITY-006：单格细化只看相邻格，A离场一格再出现会丢失更早状态。新增按人物的此前最近状态与来源；单格仅已确认、批量保留既有未确认上下文能力，来源不伪装确认。模型输入限衣物/外观，不复制旧动作视线环境，纳入依赖hash。
- 效果：104/104及TypeScript通过；未来状态排除、最近状态优先、明确变化不覆盖、深拷贝与人物过滤已验证。日志workspace/quality-audits/2026-09-27-returning-character.log。全链复核在台账，fixed_pending_review。
- 未生图，模型显式写错、历史缺失与实际像素一致性仍未解决，整体目标保持进行中。


## 2026-09-27：独立入口审查与长任务锁

- 审查确认人物档案默认配置文本模型、资产默认SD，Codex仅显式备选；完整TS测试127/127。参考图服装识别仍仅显式Codex备选，不声称独立识图已具备。
- ISSUE-INDEPENDENCE-003：原资产队列30分钟删除锁，但SD请求可执行4小时。改为有效pid必须确认ESRCH才回收，活进程与权限异常不抢占；坏锁保留过期容错。目的为避免慢任务运行时重叠启动资产任务。
- 程序效果：锁、SD payload和隔离worker5/5，worker语法通过；日志workspace/quality-audits/2026-09-27-independent-assets.log及2026-09-27-full-tests.log。未调用真实SD，未启动Codex；全链证据写台账，fixed_pending_review。
- 限制：不提供漫画与人物资产共用的全局SD调度保证；PID复用/跨进程抢锁等边界仍需后续审计。整体连续漫画尚未完成。


## 2026-09-27：资产任务排队后的原子认领

- ISSUE-INDEPENDENCE-004：启动时queued快照在排队后已过期，旧worker仍会生成并可能把completed改failed。取得锁后增加queued条件的原子认领；未认领退出并释放本人锁，排队提示不再覆盖status。
- 效果：隔离子进程等待锁→任务在等待期间完成→放锁，实测无新增HTTP请求、无候选、completed保持、锁释放。资产相关5/5和worker语法通过，证据workspace/quality-audits/2026-09-27-asset-claim.log。全链审查写入台账，fixed_pending_review。
- 本轮使用模拟HTTP与临时数据库，未启动SD或真实生图，不改生产任务。统一SD调度与实际连续漫画画面仍未完成。


## 2026-09-27：剧情时间贯通规范化与提示词

- ISSUE-CONTINUITY-007：英文night/morning等原先落到daytime，中午变下午，深夜变傍晚。共享story-time解析用于规范化和prompt，常见中英文时段保持一致。
- 下游冲突：旧timeVisual会把时段泛化并给夜景强加亮窗/实用光源，黄昏强制开灯；现保留时段，光源服从场景规格，避免关灯剧情被抵消。
- 效果：完整128/128及TypeScript通过，矩阵覆盖时间→规格→实际Regional prompt、明确raw时间优先。日志workspace/quality-audits/2026-09-27-time-mapping.log。台账全链复核已记录，fixed_pending_review。
- 未生图；任意复合时间/原始字段来源及实际像素服从率仍有局限，整体目标未完成。


## 2026-09-27：已确认环境成为生成语义来源

- ISSUE-CONTINUITY-008：旧环境部分字段保留会把办公室家具、亮窗、环境光和雨滴混入已确认卧室。确认scene现在构造完整语义环境，去除旧sceneEn追加，Regional确认天气不再用旧剧情触发雨滴强化；当前锚点近景也保留。
- 效果：普通/Regional×近中全景的旧办公室→干燥关灯卧室矩阵通过；当前锚点和光照保留、旧字段排除，未确认路径保持。完整129/129及TypeScript通过，证据workspace/quality-audits/2026-09-27-scene-authority.log。台账全链复核完成，fixed_pending_review。
- 未生图；当前规格自己写错或缺细节不会被旧环境补成正确，实际像素执行率仍未验证，整体目标继续。


## 2026-09-27：身份精修保留光照和遮挡

- ISSUE-IDENTITY-003：旧身份模板固定正面补光、双眼全可见，并负向禁止阴影/头发遮挡，与剧情侧脸和夜间相冲突。新增身份请求prompt helper，消费本人视线/遮挡、场景光照与相机角度，移除无依据正脸模板；错身份与畸形负向保留。
- 效果：worker逻辑43/43、语法通过，多人不串遮挡、关灯侧视和相反模板排除已验证；实际worker refiner调用helper。日志workspace/quality-audits/2026-09-27-identity-light.log。身份ControlNet/mask/去噪及门禁未变，台账全链审查完成，fixed_pending_review。
- 未生成图片，其他后续pass的实际光照与最终语义质量尚未证明，整体目标继续。


## 2026-09-27：最后视线重绘保留场景上下文

- ISSUE-IDENTITY-003续修：道具视线和独立结构化视线prompt原本遗漏scene lighting与本人occlusion。抽出faceSceneContext，身份与两条视线请求共用，最后脸部重绘继续收到当前光照、阴影、角度与本人遮挡。
- 效果：object/target/work_point×双人物遮挡矩阵及其余worker逻辑43/43、语法通过；实际两处worker调用已核对。日志workspace/quality-audits/2026-09-27-gaze-scene-context.log。方向、身份ControlNet、mask、自动门与审批未改。
- 本轮未生图，保持fixed_pending_review，实际像素一致性仍未证明，整体目标继续。


## 2026-09-27：人物数量不再强制女性身份

- ISSUE-IDENTITY-004：人数/区域模板和交伞默认固定adult women，导致男性和混合角色冲突。数量改为person/people，性别年龄由本人档案保留；同步交伞默认和人数冲突识别。全链测试还发现stripTraits会删除含hair的整句身份，现保留其中主体身份词。
- 效果：完整130/130、TypeScript、worker语法通过；单男性/混合人物区域与普通prompt矩阵验证主体身份和数量。日志workspace/quality-audits/2026-09-27-character-count.log；原女性与交伞场景测试保持。台账全链复核完成，fixed_pending_review。
- 未生图，历史人工prompt旧词及自由文本解析仍有边界，实际身份像素执行率未证明，整体目标继续。


## 2026-09-27：人物资产接入完整结构化身份

- ISSUE-IDENTITY-005：资产prompt遗漏profile年龄、脸型、肤色、体型、特征与invariants，仍固定成年。五类资产现在共用上述身份字段，移除无来源年龄禁令；Regional也补agePresentation。
- 效果：内存DB五资产/Regional矩阵及完整131/131、TypeScript通过；原provider/母版确认测试保持。证据workspace/quality-audits/2026-09-27-asset-identity-fields.log。全链复核入台账，fixed_pending_review。
- 未生成图片或修改正式人物数据；旧资产不自动重写，模型实际身份服从尚未验证，整体目标继续。


## 2026-09-27：资产类型契约与独立外观字段

- ISSUE-IDENTITY-005续修：独立visualTraits发色/发型/眼色补入资产身份prompt，防止界面字段只在漫画生效。
- ISSUE-ASSET-001：五资产统一negative与正向冲突，现按类型区分。正脸不要求鞋服完整，三视图/表情允许同人多视图，衣物和鞋履保持本体完整性要求。
- 效果：完整131/131、TypeScript通过；五类型约束矩阵及任务保存prompt/negative逐字一致通过。日志workspace/quality-audits/2026-09-27-asset-contracts.log。全链复核入台账，fixed_pending_review。
- 未调用SD或改正式资产；像素多视图/衣物效果尚未验证，整体目标继续。


## 2026-09-27：资产执行母版绑定校验

- ISSUE-IDENTITY-006：worker原仅按ID/confirmed查询，不查归属/类型/最新；现非face执行前必须本人最新已确认face与任务ID相同，否则请求前失败，不换母版。确认候选时既有母版变化校验仍保留。
- 效果：隔离真实子进程外人face/本人outfit/旧face均failed、无HTTP、无候选；资产相关5/5、语法通过，日志workspace/quality-audits/2026-09-27-master-binding.log。全链审查写台账，fixed_pending_review。
- 未生成真实图片或修改正式数据；生成中途变化仍由确认门阻断，实际身份画质未证明，整体目标继续。


## 2026-09-27：三视图衣物和鞋履契约

- ISSUE-ASSET-002：三视图原仅要求服装一致，却没有传基础衣物鞋履；全身服装也漏鞋。现按可见范围追加wardrobe，三视图/服装包含两项，正脸/表情仅可见衣物且保持portrait framing，服装排除规则覆盖三视图。
- 效果：完整131/131、TypeScript通过；五类型矩阵与任务文本持久化一致性保持。日志workspace/quality-audits/2026-09-27-asset-wardrobe.log；全链审查入台账，fixed_pending_review。
- 未生图、不更新已有母版或衣物，不把全身服装图标成isolated garment。实际像素一致性尚未验证，整体目标继续。


## 2026-09-27：完整交付检查与侧脸负向补漏

- 内存数据库生产build完成，全部worker测试61/61通过，证明当前应用和独立执行器可一起构建/运行隔离测试。构建证据workspace/quality-audits/2026-09-27-production-build.log，worker证据2026-09-27-all-worker-tests.log。
- 交叉检查发现ISSUE-IDENTITY-003同根因遗漏：普通prompt负向asymmetrical eyes可被后序gaze继承，已移除，仍保留畸形眼睛与脸部负向；新增回归断言，修改后完整TS131/131，证据2026-09-27-delivery-tests.log。生产构建发生在这次单条负向文本删除之前，不宣称构建验证了后续像素效果。
- 构建/测试均未启动SD或生成图片，未动正式数据库。工作台独立文本模型/SD入口已有程序证据，但实际连续漫画人物、服装、四肢动作、视线、道具、道路环境的像素一致性仍缺完成证明；不能以构建成功或队列空宣布目标完成。


## 2026-09-27：结构化身份版本与候选确认

- ISSUE-IDENTITY-007：身份变化判断遗漏profile年龄/脸型/肤色/体型/特征，旧母版可继续使用；旧face候选也可重新确认。现这些字段进入身份失效判断；候选确认要求当前档案confirmed、任务归属/类型匹配、prompt/negative等于当前编译，然后再走原母版门。
- 效果：完整132/132、TypeScript通过，备注编辑保持、脸型变化使母版失效/旧配方拒绝的内存DB矩阵通过。证据workspace/quality-audits/2026-09-27-identity-version.log。全链审查写台账，fixed_pending_review。
- 未生图、不删除旧资产；旧编译模板候选可能需重新生成或用户另行上传确认，无法据历史像素推定适合新档案。整体目标尚未完成。


## 2026-09-27：基础衣物版本失效

- ISSUE-ASSET-003：两个服装更新入口原只改文字，旧基础衣物继续confirmed。现在按字段依赖失效outfit/turnaround，鞋变化另失效shoes；同步候选selected和角色状态，保留身份母版及其他自定义套装。
- 目的：避免新服装文本和旧默认视觉参考相互冲突。效果：内存DB完整133/133及TypeScript通过，两个入口和母版保持矩阵通过，证据workspace/quality-audits/2026-09-27-wardrobe-version.log。全链复核写入台账，fixed_pending_review。
- 未生图或修改正式数据。已排队recipe快照不回写，面部参考旧领口可能串色，实际连续漫画视觉一致性仍未证明。


## 2026-09-27：基础Regional光照与遮挡续修

- ISSUE-IDENTITY-003续修：基础递伞prompt仍强制正面补光/双眼可见，所有Regional negative又禁止眼部阴影，与先前局部pass修复矛盾。移除这些固定要求和伞沿遮脸禁令，改为服从场景光源、角度和剧情遮挡。
- 目的：防止基础生成先破坏夜间、逆光、侧脸及遮挡，再交给后续小mask补救。效果：完整134/134及TypeScript通过；月光/夕阳矩阵和旧中景递伞测试通过，证据workspace/quality-audits/2026-09-27-umbrella-lighting.log。全链复核补入原ISSUE，仍fixed_pending_review。
- 未生图、未修改正式数据。程序移除约束冲突不等于像素执行率通过，连续漫画目标仍未完成证明。


## 2026-09-27：确认天气与负向一致

- ISSUE-CONTINUITY-008续修：Regional正向遵循确认天气，负向却从旧雨景/递伞禁止晴天和干燥路面。确认规格现在不再消费旧描述推断的天气负向，雨伞本身不触发雨天排除。
- 目的：防止天气与道路状态被相反负向覆盖。效果：晴天、无雨阴天、小雨矩阵通过，完整135/135及TypeScript通过，日志workspace/quality-audits/2026-09-27-weather-negative.log；全链复核入台账，仍fixed_pending_review。
- 未生图、不改正式数据；未确认规格的复杂天气否定仍为启发式风险，旧排队recipe保留快照。实际像素一致性未验证，整体目标继续。


## 2026-09-27：通用负向不排除儿童身份

- ISSUE-IDENTITY-004续修：普通/Regional通用负向仍含child，会抵消儿童档案；删除两处无来源年龄排除，保留解剖和画风约束。
- 目的：人物年龄由剧情档案决定。效果：儿童/老人单人与混合人物编译矩阵通过，完整136/136及TypeScript通过，日志workspace/quality-audits/2026-09-27-age-negative.log。全链复核写台账，仍fixed_pending_review。
- 测试另定位到历史shot.negativePromptEn里的child，未自动改写用户文本；本轮测试隔离了人工覆盖，不能宣称任意历史提示词冲突都已消除。未生图或修改正式数据，实际像素一致性仍未证明。


## 2026-09-27：多人共享视线负向

- ISSUE-GAZE-007续修：普通/Regional只要有一人不看镜头，就全局禁止看镜头，覆盖另一人的显式视线。改为所有人物都不允许镜头视线时才加公共禁止词；Regional直接核对本人视线字段。
- 目的：支持同格不同人物有不同视线目标。效果：左右交换镜头视线、另一人看道路及双方看道路矩阵通过，完整137/137及TypeScript通过，日志workspace/quality-audits/2026-09-27-mixed-gaze.log。全链复核补入原ISSUE，fixed_pending_review。
- 未生图、不改正式数据。混合视线依赖各区域正向与现有局部控制，公共negative不能对单人定向，实际视线像素执行率未证明。


## 2026-09-27：基础与身份视线识别一致

- ISSUE-GAZE-007续修：基础识别遗漏directly/towards并把not looking at camera误判为允许，与身份worker相反。现采用相同肯定/否定模式，否定优先。
- 目的：避免基础阶段与后续身份阶段的视线要求相互抵消。效果：六种表达的普通/Regional矩阵通过，完整138/138及TypeScript通过，日志workspace/quality-audits/2026-09-27-gaze-wording.log。全链复核入台账，fixed_pending_review。
- 未生图、不改正式数据。复杂自然语言和实际像素执行率仍有限制，整体目标未完成证明。


## 2026-09-27：近期修改整体构建与完成证据审计

- 本轮未追加代码修改，对当前累计工作树做整体校验。STUDIO_DB_PATH=:memory:生产构建成功；独立执行器测试61/61通过。证据workspace/quality-audits/2026-09-27-current-build.log和2026-09-27-current-workers.log。此前最新TS138/138和类型检查已通过。
- 独立性证据：app/api/characters/route.ts的profile分支只有显式provider=codex调用CLI，默认独立文本模型；资产默认SD，Codex图像为显式备选。服装图片识别接口仍只支持显式Codex，提供手工描述路径，不能把该辅助识别能力说成已经独立。
- 身份/服装/动作/四肢/眼神/道具/道路环境：当前证据为规格、编译、区域/姿势/局部请求和状态逻辑测试；不证明每格像素执行或跨格视觉一致性。
- 审批与候选证据：app/page.tsx保留草稿整体确认；scripts/sd-worker.mjs以postprocessWarnings/pixelQa/semanticQa阻断草稿或成品，成品通过程序门后进入候选。请求成功仍有semantic_pending，不冒充视觉通过。
- 完成结论：构建及独立执行器兼容性有证据，实际连续漫画可用性和所有视觉要求仍未证明，目标保持active。按当前AGENTS不启动SD、不生成或等待测试图；未修改正式数据库或用户资产。本轮提供新的整体构建证据，不重复声称实现了新的功能。


## 2026-09-27：保留否定与混合表情

- ISSUE-EXPRESSION-001：unhappy/not happy曾被happy子串改成微笑，混合情绪被首个关键词覆盖。现仅完整简单标签扩写，复合描述保留。
- 目的：保持剧情本人表情语义。效果：139/139及TypeScript通过，证据workspace/quality-audits/2026-09-27-expression.log，全链复核入台账，fixed_pending_review。
- 未生图、未改正式数据；中文翻译仍由上游负责，复杂情绪像素执行率未证明。


## 2026-09-27：补齐视线修复中的表情语义

- ISSUE-EXPRESSION-001续修：上一轮漏查worker独立expressionCue/NegativeCue，后序仍把unhappy改微笑并排除悲伤。现提取可测helper、限制完整简单标签，两处实际视线payload共用，复杂情绪不加相反负向。
- 效果：worker逻辑44/44及语法通过，证据workspace/quality-audits/2026-09-27-expression-worker.log。完整业务链复核补正写入原ISSUE，仍fixed_pending_review；明确上一轮证据范围不足。
- 未生图或改正式数据；模型实际情绪与跨格像素一致性仍未证明。


## 2026-09-27：身份阶段保留当前剧情表情

- ISSUE-EXPRESSION-001续修：身份helper未直接消费当前表情，现读取本人characterLooks人工值/规格expression，并要求保留剧情表情而非复制母版表情；缺值保持已有表情。
- 目的：让身份修复与基础/视线阶段表情一致。效果：worker逻辑45/45、语法通过，双人不同情绪和人工覆盖矩阵通过，日志workspace/quality-audits/2026-09-27-identity-expression.log。全链复核补入台账，fixed_pending_review。
- 未生图、未改正式数据；参考图表情的实际像素影响仍待产品运行验证，整体目标未完成证明。


## 2026-09-27：中文夜间标签不再回落白天

- ISSUE-CONTINUITY-007续修：凌晨/雨夜/入夜/半夜/夜原解析daytime，现归night；晨归morning，明确黎明/午夜优先。
- 目的：防止时间识别导致跨格夜景和环境光照跳变。效果：139/139及TypeScript通过，扩展规格来源/显式覆盖/Regional时段矩阵，日志workspace/quality-audits/2026-09-27-time-aliases.log。全链复核写原ISSUE，fixed_pending_review。
- 未生图、不改正式数据；复杂时间叙述和实际日照不由标签解析器保证，实际连续漫画一致性仍未证明。

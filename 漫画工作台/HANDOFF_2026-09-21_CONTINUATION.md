# 连续漫画工作台续作交接（2026-09-21 晚间）

## 目标和当前结论

目标仍是工作台自身将剧情转成可用连续漫画，人物身份、服装、四肢、动作、眼神、道具、道路/环境正确且跨格连续。Codex只作开发诊断和备选。总体目标尚未完成，不能把代码测试、完整JSON或SD返回200当作画质通过。

本轮接续 HANDOFF_2026-09-21.md 和 CONTINUOUS_COMIC_AUDIT_2026-09-21.md。用户明确已启动SD并授权测试，因此本轮有真实生图；程序验收与视觉验收分开。没有代用户批准草稿、没有生成正式候选，没有Git提交，也没有应用memory pending。

## 本轮代码修改与已证实的作用

| 问题 | 修改 | 已证实作用 | 不能宣称 |
|---|---|---|---|
| PLANNING-001 | 全章拆成场景+每4格小批，跨批保留人物/道具最后状态，传入人工衣物选择；严格绑定shotId、顺序、角色/资产/场景；全部成功才保存；V4结构化规划禁用思考，拒绝length截断，英文失败反馈带具体片段 | 项目6/章35从两次90秒超时及批次空响应，推进到原生API返回完整24格；最终7场景/24格约155.4秒 | 规划仍未确认，不是24张图，不是语义和画质全通过 |
| GAZE-006 | 携物与阅读/通话分离；保留明确道路、窗户、同伴等视线，并同步gazeMode/point | 1256“手机在身侧，看道路”不再变成inspect/看手机；双人反排测试不串视线 | 不保证像素眼球已经正确 |
| POSE-019 | 复合动作不依赖V2持物分支的wristAssignments，使用明确contactAnchors回退；行走重设鼻点时眼耳同步平移 | 1256手机腕点与锚点一致，原422接触证据错误解除；眼耳不再停在旧头部位置 | job515尚未包含后补的眼耳平移，不能把它算修复后成图 |
| POSE-020 | V3道具证据包含完整包络；选景与worker共用尺寸算法，统一投影，旧recipe执行时再校验 | job515手机中心y=.95合法但底边超过512的程序漏洞已补；1256新投影scale约1.8163，完整包络在画内 | 不能保证底模实际把物体画到该几何位置；长工具与近景不兼容仍阻断 |

程序证据：120/120 TypeScript测试、44/44 worker/合成/衣物mask/投影测试、`tsc --noEmit --incremental false`通过。日志：`workspace/quality-audits/2026-09-21-current-regression.log`、`2026-09-21-current-worker-regression.log`。本轮问题只推进fixed_pending_review，不能标verified。

## 真实规划与持久状态

- 项目6《小粉买了一两本书》，章35，24格1255–1278。
- 原单次规划502记录：`2026-09-21-chapter-35-plan-result.json`；初版分批仍在9–12格空响应，478.5秒，`2026-09-21-chapter-35-batched-plan.json`。
- 小JSON服务探针1853ms成功，说明不是整个DeepSeek服务不可用。没有记录API key。
- 最终成功：`workspace/quality-audits/2026-09-21T13-38-13-400Z-chapter-35-batched-plan.json`。7场景区分白天客厅、门外步道、取件站、白天书房、夜间灯亮、灯灭和床边；24格完整，故事规定的换睡衣在后段发生。
- 已通过工作台原生saveChapterVisualPlan保存为未确认。没有修改24格剧情、现有confirmed spec或伪造章节/草稿确认。此前4场景版本亦保留独立审计文件。
- 后续refine-all仍要求现有产品的章节确认；不要未经用户确认就把未确认规划当正式生成输入。1255旧规格left与全宽region仍有真实P0冲突；1256旧规格visibleFacts写开门、hands写关门，属于待整理的既存语义矛盾，不能宣称已解决。

## SD环境和本轮图像实验

实际接口127.0.0.1:7860；DreamShaper_8_pruned [879db523c3]；vaeFinalPruneVAE_v10.pt；clip skip1；CPU启动参数已核对。本轮未启动或重启SD、未切底模。

`ip-adapter_clip_h`虽然不以同名出现在module列表中，但安装的ControlNet将ip-adapter_clip_sd15映射为该label，返回SD info也确认实际使用。它是有效别名，不是故障；不要为此改名或声称修好了模型加载。

### 身份参考成对实验

- 同模型/seed13579246/512平方/12步/CFG5.5、同Pose和有效区域mask、face adapter .68。仅身份输入变化：原始全身上半身参考与明确头部裁剪。
- 全参考目录：`workspace/quality-runs/2026-09-21T13-17-21-667Z-20260921-phone-identity-full-reference`，165.19秒。
- 头裁剪目录：`workspace/quality-runs/2026-09-21T13-23-22-898Z-20260921-phone-identity-head-crop`，约169.18秒。
- 两图都有单人粉色长发、手机、双手；但都看观众，衣服偏白且款式不符合目标。两图均整体失败，已写visual-review.json；未证明裁剪有效，未把特定裁剪坐标加入生产逻辑。

### 原生链路任务515

- 原生POST generateDraft，项目6/格1256，目标512×640，cpu_local_complex，实际草稿384×512；未force。13:32:54至13:39:49 UTC；实际seed3037860868。
- 515包含携物视线和接触修复；不包含后补眼耳平移/完整道具包络修复。
- 初图粉发变短，上衣偏白长袖、裙子黄色，未呈现指定长发/黄上衣/粉裙；手机未清楚出现。身份局部pass没有纠正整体发长/服装。
- 服装pass明确skipped_unisolated_reference：XF-CASUAL-01是带人物设定图，不是纯服装。没有标成已应用。将参考裁去人脸并不能自动证明衣物控制有效。
- 道具/接触请求200但图像仍失败；手部depth与openpose_hand均方差0、无有效轮廓，保留失败证据，最终draft_blocked，没有正式候选，也没有调用草稿审批。
- 发现手机center=.46,.95，mask envelope底边1.02，objectPixelBounds底边515.79/512，为POSE-020提供直接证据。手部检测失败不全归因于该裁切。
- 精确stage图、mask、控制、trace在DB job515及`workspace/quality-audits/2026-09-21-native-job-515.json`。草稿路径：`workspace/generated/sd-draft-job-515-5d4528a3-d22f-42fe-8ef1-de6dc6437084.png`。

### 修复后任务516

- 使用515同一seed3037860868，经原生入口重新编译，包含头部同步和包络修复；不改历史recipe。
- 已结束：13:46:33–13:53:23 UTC，约410秒，最终draft_blocked，手部检测仍无有效轮廓。真实手机center变为(.4637,.8828)，objectPixelBounds底边约481.36/512，几何已在画内；成图仍短发、白色上衣与黄色衣裙，手机未清楚出现，未证明眼神/开门动作或道路。原生完整流程视觉验收失败，没有正式候选。最终图：workspace/generated/sd-draft-job-516-adb66b21-7230-4786-93ce-d02c669474db.png。

## 后续工作重点

1. 原生515/516均已完整结束并阻断；不要重复提交同一组无变化实验。以现存各阶段图片追踪为什么ControlNet声明的手物位置没有落实到像素，再设计新的有区分力实验。
2. 当前最明显视觉短板是指定发长/服装、有效手物接触、正确视线和环境呈现；现有设定图未具备生产局部服装的隔离条件。需要工作台内可用的资产准备与控制流程，不能用Codex替代日常生成。
3. 章节规划完成后还需合适的视觉规格和连续多格出图证据。当前没有完整连续漫画，更没有全24格验收。
4. 不再重复已失败的“只裁身份参考”“仅增大提示词权重”并宣称解决；真实输入语义矛盾需在规格阶段处理。
5. 本轮所有失败保留。产品审批仍是草稿一次整体确认→成品程序硬门→自动候选，不恢复逐项人工勾选或第二次成品人工审核。

DeepSeek参数核对来源：[官方思考模式文档](https://api-docs.deepseek.com/guides/thinking_mode/)、[官方Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。关闭思考只用于支持该参数的V4/flash结构化章节请求，其他模型不强塞专属参数。

## 结束补充：最新规划和真实运行边界

- 最新章节结果是6场景/24格，146.2秒，文件workspace/quality-audits/2026-09-21T13-53-22-556Z-chapter-35-batched-plan.json；它取代数据库中未确认的7场景版本，旧版文件保留。输入增加已确认镜头规格；来源未知的重复衣物不再被一概描述为人工逐格换装；新增模型不得覆盖已确认衣物的硬校验。
- 最新结果1266–1278均维持XF-SLEEP-02，不再下一格跳回日常装；warnings如实指出旧shot-level衣物/鞋履与剧情冲突。还未把这些规划衣物回写到原始shots，也未确认章节。
- 最新规划仍有语义风险：1276关台灯的timeline绑定home_study_night，而该scene定义仍写台灯亮；这版未进行全语义验收，不能直接作为所有场景已正确的证据。重复预填选择的历史来源未知，后续细化/确认时还需防止旧characterLooks/legacy选择重新覆盖计划换装。
- 原生515/516均被后处理失败门阻断。真实图并未解决指定长发、衣物、手机接触或连续环境；没有合格连续漫画。本轮不以重复失败图归因底模完全无能力，也不解除检测或审批门禁。
- 最终程序120/120、worker44/44、类型检查通过；4项本轮代码问题fixed_pending_review，未verified。台账82项有效、解决队列为空。代码队列空不等于总体目标完成。无本轮待运行SD或规划请求。

## 2026-09-21 再续：身份预算、场景保真与独立人物入口

### 目标及边界

继续让工作台自行完成剧情→连续漫画，Codex只负责辅助开发或用户明确选择的备选。当前仍没有合格连续漫画。下述程序修复已到fixed_pending_review，真实图像仍失败，不能把空队列当总体目标完成。

### 本轮改了什么、目的、证据

1. ISSUE-CONTROL-003：抽出scripts/support-control.mjs，按实际投影后的SVG边界过滤画外支持面，保留部分可见边缘。CPU预算从固定3改为优选3、必需控制最多8；可选项让位，超过上限而无等价补偿仍阻断。face-only身份精修不再被声明为全局外观补偿。目的：画外黑色地面guide不能挤掉人物身份。真实518基础identity_reference、pose、initial_prop_structure三项全部保留；support:floor:primary记录outside_projected_viewport，没有虚假applied。
2. ISSUE-PROMPT-009：upperBodyVisiblePrompt不再按家具/道路/鞋关键词删除整句，不再追加interior backdrop或强制支持面画外；负向移除一概排除floor/ground/rug。保留原有景别契约，只移除确切通用装饰占位。目的：室外、坐卧、书写、手持鞋等剧情不被执行层改写。测试覆盖单/多区域BREAK；518真实请求无室内追加且保留门口/路径。
3. ISSUE-INDEPENDENCE-001：人物档案草拟默认使用已配置DeepSeek，复用character-profile.schema.json并验证英文字段/数组/完整profile；Codex显式备选。UI网络失败恢复按钮，不自动写库/确认。首次真实调用503拒绝错误结构；加入完整schema后真实API200，provider=deepseek、model=deepseek-v4-pro。没有创建或确认测试人物，审计*-independent-profile.json。
4. ISSUE-INDEPENDENCE-002：人物资产任务默认provider=sd，保留显式codex-imagegen和历史任务兼容；本地worker每次生成一张候选，非face资产必须有已确认身份母版、IP-Adapter模型和模块。新scripts/character-asset-sd.mjs调用本机SD、解码像素并核对尺寸，记录模型/请求/母版/状态；失败不建候选，候选不自动确认。UI显示SD生成与Codex备选。图片服装识别仍只有Codex能力，现明确标注备选并要求显式provider，不悄悄调用。目的：人物准备不再默认要求Codex。真实SD资产尚未生成；隔离worker集成证明无Codex路径可跑通，并能阻断坏图，不可写成资产画质通过。

### 原生任务518实际效果

- 工作台原生generateDraft，project6/shot1256，seed3037860868，与516相同；目标512×640、cpu_local_complex，实际384×512、12步。
- 时间约14:13–14:27 UTC（以完整DB快照为准），比先前任务更慢；本轮没有篡改SD启动方式/模型。
- 完整快照workspace/quality-audits/2026-09-21-native-job-518.json，视觉结论同名-visual-review.json。
- 基础图长粉发恢复，门框/门口更明确；不能从一次合并修复对照分离身份预算与环境提示词各自贡献。
- 仍是粉色上衣/黄色裙子，与指定黄上衣/粉裙相反；手机未清楚出现，握门把/出门行走和道路视线未落实。最终局部精修没纠正这些问题。
- outfit_refinement仍skipped_unisolated_reference；不可为了解除跳过把带人物设定图直接标为纯衣物参考。
- hand_depth/openpose_hand无有效轮廓，最终draft_blocked，无批准、无正式候选。
- 最终图workspace/generated/sd-draft-job-518-f8f15837-5e47-45be-84c4-fb96697f9b96.png；中间pose/prop/base/identity/contact均保留stage图片。

### 精简提示词实验

- 脚本workspace/quality-audits/build-short-native518.mjs从518实际recipe重建三项控制、身份mask、尺寸、seed、采样参数，仅缩短正向提示词；不是改生产默认。
- 请求workspace/quality-fixtures/20260921-native518-short-prompt.json。
- 结果workspace/quality-runs/2026-09-21T14-32-46-423Z-20260921-native518-short-prompt，约178秒，未中断。
- 上衣浅奶油色/粉裙比518接近，但手机未清楚成立，矩形物更像包/书，右手未握门把，仍看观众；整体失败。不能据此宣称短提示词解决全部质量或直接替换生产编译器。

### 验证与后续方向

- TS组合121/121（STUDIO_DB_PATH=:memory:），worker组合50/50，额外完整asset worker集成1/1；tsc --noEmit --incremental false通过。日志2026-09-21-control-ts-tests.log与2026-09-21-control-worker-tests.log。worker集成使用临时数据库、模拟HTTP与可解码测试像素，显式无Codex位置；未写正式角色。
- 86项台账有效，解决队列为空，新增4项均fixed_pending_review，未verified。每项含全链复核及实际视觉边界。
- 当前未证明：全章连续性、真实身份相似度、服装修复、道路视线、动作/环境几何的一致执行；章节规划仍未确认。不要替用户批准草稿/章节/角色母版。
- 后续优先排查基础图为何不服从手物/门把几何、衣物资产准备与控制、文本/结构化独立视线的控制策略。门把在场景中的位置与手部姿态是否有统一环境几何尚待核验；只是调查方向，未新建已确认问题。
- 短提示词只有一次失败对照，不继续盲目换seed。已有文字服装重绘实验也失败过，先看旧worklog与真实mask/图像偏差，不能重复宣称新方案。
- 本轮没有用Codex生成日常漫画或参考资产，没有取消用户任务，没有删除旧产物。


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

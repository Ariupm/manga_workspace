# 任务543根因核验与统一修复方案

日期：2026-10-05。范围：用户要求确认根因并出方案；本轮不实施生产代码修复、不修改正式任务/规格、不生成图片。

## 证据与结论

正式数据库只读确认：job543/shot1259，awaiting_draft_approval；generationSpec.visualSpec非空，实际requestTrace.prompt含新规格场景与两条交互。已保存草稿与用户附件画面一致。新规格未应用已不是本次原因。

审计快照：workspace/job543-root-audit.json（运行证据，不提交）；保留实际stageOutputs、promptRequestTraces、controlUnitTrace。初始图就有短发、看镜头、错衣物、露膝；不应将全部偏差归因于后序局部pass。

1. **支持物误识别，确定代码缺陷。** lib/pose-v2.ts:436/464的textForCharacter不读取确认scene.anchors；supportForCharacter以/bed|床/匹配，命中hands naturally positioned for the described action中的described。实际supportKind=bed，support_surface_geometry床结构控制以0.64权重进入基础请求；确认规格明明包含desk/chair。手动retarget分支也有相同无词边界规则。
2. **具体交互未形成跨物体约束，确定结构缺口。** interaction-facts-1有手接触自身物体和视线targetId，没有工具作用端指向哪个物体哪个表面的工作绑定。lib/story-action-contract.ts:35独立按工具中心+.035推工作点，不读取package_01。包裹open仅支持门窗铰链/抽屉滑动；包装盒返回ambiguous。实例ID和数量一致不能证明刀刃接触胶带。
3. **二维形状被当成物体类别，确定错误请求。** lib/prompts.ts:246将package定义为landscape_rect；scripts/sd-worker.mjs:95对所有landscape_rect追加thin rigid landscape rectangle。job543包裹局部请求实际包含这句话，将有体积的纸箱描述为薄片。包裹objectPixelBounds约35×32px，剪刀控制范围约202×83px；两者来自独立尺度，不表示所有场景都必须采用某一固定比例，但本场景缺少共同布局依据。
4. **身体姿态未闭合到文本，确定遗漏。** Pose basicGeometry/layers为sit；lib/pose-v3/prompt-consistency.ts只在manual override等条件补姿态。结构化关系编译只拼工具/开合动作，丢失坐在桌前；最终请求没有seated/sitting。确认规格中的旧通用人物动作/视线覆盖及walking发丝状态说明上游连续性还有临时状态混入，不能把所有历史字段视为当前事实。
5. **景别文字与控制不一致，确定执行事实。** projection.composition=waist_up，visibility中膝盖可见，safety.valid=false且hardFailures明确requested waist_up crop still includes knees or feet，仍发送OpenPose。当前用户政策为advisory，放行本身符合设置；需修投影/工作布局，不擅自恢复语义硬阻断。
6. **末端视线文本重新引用当前道具，确定代码缺陷。** scripts/sd-worker.mjs:1267/1279给gazeRefinementPrompt传object=propInteraction.object，未传解析后的targetDescription。剪刀pass坐标targetId=package_01，却实际发送eyes focused on the cardboard delivery package和head and eyes directed toward the same scissors。同一角色/同一目标还重复执行两次gaze。
7. **文本仍多源堆叠，确定编译缺陷。** 人物action、关系actionPlan.evidence、mechanism terms重复表达using/opening；uniquePrompt按字符串近似去重，不能识别这些语义重复。姿态、操作关系完整性比删除形容词优先。
8. **身份/衣物控制覆盖有边界，事实明确但像素因果未唯一定位。** 基础脸部IP-Adapter只覆盖约103×132px；不能把脸部覆盖说成及腰发型覆盖。衣物引用stagedOnly=true、isolatedGarmentReference=false，基础过滤且局部明确跳过，本次没有有效服装视觉参考控制。原始脸部参考确为长发动漫人物；短发/半写实偏差不能归咎于原图本来短发。DreamShaper8与现有权重参与结果，但无对照不能认定换模型即可修好。

## 目标与职责

目标是同一个人物在同一个空间完成同一个可见动作；文本、骨架、道具控制、局部mask与最终请求共享事实。沿既有数据链扩展，不新建平行提示词系统。

剧情/人工选择 → 当前ShotVisualSpec（事实及来源） → InteractionContract（跨对象关系） → Pose/物体共同布局 → PromptPlan（表达） → recipe/payload（快照） → worker各pass（限定职责） → 草稿整体确认 → 自动硬门 → 候选。

- 剧情层：决定事件和最终可见时刻；人工当前选择优先。
- 视觉规格层：身体姿态、人物支持物、物体类别/尺寸依据、工作目标与表面、手的职责、视线。连续性只继承稳定身份/衣物状态；走动发丝等临时动作不能无条件沿用。
- 交互层：表示“人物右手握剪刀柄；剪刀刀刃作用于package_01的封口胶带；左手稳定同一个package_01；包裹由desk支持”。注视关系与工作关系分别存储，不从注视对象推工作对象。
- 几何层：从同一关系图求支持面、包裹体积、工具端点、双手和视线点，然后单次投影。没有执行机制的关系明确记录未解，不伪装为有效控制。
- 提示词层：公共块只负责镜头/环境/风格；人物块负责身份/可见衣物/身体姿态；交互块完整表达一次操作；表情/视线一次；负向独立且保持人物范围。没有工作关系的情况下禁止使用含糊work surface冒充目标已绑定。
- 执行层：各pass消费相同实例和坐标，保留非目标内容，记录实际控制与跳过原因。

## 实施顺序与验收

### 第一步：消除确定性相反指令
修支持物解析词边界和来源范围；优先明确人物支持关系，确认场景anchors只作受控候选，不能看到chair就让所有人坐椅子。旧文本兼容也需动作和归属证据。修gaze统一按targetId解析label/surface/point，按人物和目标合并重复修复。给纸箱独立体积形状/厚度，不从landscape_rect生成薄片语义。
验收：described/embedded不产生bed，明确床仍可识别；同场景站立人物不继承他人的椅子；剪刀/画笔/螺丝刀视线可独立看操作对象或其他人物；纸箱不出现thin rigid，书/文档保持适当薄片语义。实际所有阶段请求一致。

### 第二步：补齐上游结构并解联合布局
在现有visualFacts及角色规格增加向后兼容的bodyPose、bodySupport、workTarget（实例ID/表面）、operation、objectForm、必要尺寸/来源；方案字段名在实施时与现有类型对齐。AI单次英文输出；中文沿既有本地编译，未知失败保留候选。明确区分切封口、掀盖、取物等时刻，辅助手是stabilize而不是另一条独立开箱过程。
工具端点与目标表面必须引用同一个几何点；手接触点分别属于工具柄和被加工物体；桌面支持关系要真正参与物体高度。先联合布局再按用户景别投影，不用缩小包裹满足可见性。代表性尺寸须记录来源和假设，不按任务ID硬编码。
验收：切箱、切纸、画笔画纸、螺丝刀拧螺钉，以及拿书/放杯、多人分别操作场景；点位误差、手占用、实例数、投影前后关系保持一致。未知机制审计准确，advisory政策保持。

### 第三步：补齐身体姿态并收敛编译
自动Pose的最终身体姿态同样投影到人物prompt；动作手部层不覆盖身体层。语义字段按唯一职责编译，保留具体动词、对象、阶段，移除重复using/opening、side readable等协议化套话。解决当前剧情事实被旧自动look误作人工覆盖的问题，需要显式来源标记与迁移策略，不能粗暴反转所有人工优先级。
验收：坐姿+工具、站姿+工具、蹲姿+取物独立保持；近中全景遵循用户选择；多人物不广播本人动作/负向。检查有效Pose之后、实际worker请求，而不只检查初始Regional。

### 第四步：补足外观控制与局部pass边界
身份脸部与发型轮廓分别审计覆盖；长发区域未覆盖不能记为完整外观一致。隔离衣物参考不可用时显示具体缺口，完善资产准备或现有安全使用路径；不得将整个人物服装图伪标成隔离图。模型/风格适配作为后续独立选型项，不自动换模型掩盖上面确定缺陷。
道具/手部pass按同一操作组布局，保护已建立的工具、对象、双手；视线在相关操作处理结束后按角色只执行需要的一次。成品沿现有像素解码/后处理/配置自动门禁自动入候选，不恢复逐项勾选或成品二次审批。

### 第五步：全链验证与实际数据回放
使用内存库、纯函数和已存job543快照回放，不创建SD任务。对照上游事实→规范化→有效Pose→PromptPlan→所有阶段payload/control/mask→审批/失败/候选状态。验收检查具体关系、坐姿、支持物、纸箱体积、工作目标、视线指向和控制覆盖，不能再以无中文/无编译错误/HTTP成功替代语义一致。
旧任务不改写；当前镜头修正规格作为新版本保留来源，沿原确认流程用于新任务。输出修前/修后真实编译差异及未解决项。程序逻辑验收与模型实际视觉执行率分别记录。

## 诊断阶段状态（修复前）

本轮仅完成根因诊断与方案，未实施以上修复。ISSUE-PROMPT-011回到partially_fixed；支持物、工具目标几何及视线末端冲突分别登记独立问题。脸/发/衣物与checkpoint导致像素偏差的贡献尚不能唯一量化，不宣称全部像素根因已确认。


## 实施记录（用户授权“修复”后）

五项代码问题已推进 fixed_pending_review，等待独立诊断复核。没有启动 SD、生成图片或改写 job543；当前 shot1259 的已确认 v2 保留，新任务直接使用新编译链，无须为了代码生效再次调用 DeepSeek。

| 层级 | 已落实职责 |
|---|---|
| 上游规格 | bodyPose/bodySupport；workTarget 包含实例、表面、操作、局部UV；形态/尺寸及分字段来源；校验及人工编辑保留 |
| 关系布局 | 同一工作对象的工具与辅助稳定手共同布局；视线与工作目标分开；缺失、同手及人工动作冲突显式失败 |
| Pose / 控制 | 词边界消除 described→bed；自动坐姿进入文本；支持物体轮廓与工具工作点单次投影 |
| 提示词 | 结构化交互一次表达具体操作/双手职责/支持面；取物阶段、数量保留；纸箱描述体积，视线仅指实际目标 |
| Worker | 同源几何用于轮廓、mask、接触及视线；每角色一次末端gaze；关联物体主体受后续道具/手部遮罩保护 |
| 页面 / 审计 | 身体姿态与工作绑定可编辑；任务显示完整发型、脸部和服装控制的实际规划覆盖范围 |
| 状态与交付 | 既有规格确认、草稿整体确认、自动硬门和候选事务保留，失败不伪报成功 |

### 当前真实镜头纯编译结果

- 支持物：chair，不再是 bed；自动坐姿明确写入人物块。
- Pose safety：valid=true，errors=[]，warnings=[]；腰上取景检查通过。
- 纸箱投影尺寸：0.26945 × 0.16841（归一化画布尺寸）；默认尺寸是带 assumptions 的代表性布局。
- 剪刀工作点 = 剪刀末端 = 纸箱胶带目标点：(0.49286, 0.63745)。
- 末端视线文字和坐标均指纸箱胶带；明确人工视线表面不被共同布局覆盖。

人物块实际输出：

```text
centered in the frame, one person, adult woman, gentle oval face,
(waist-length layered hair with airy side-swept bangs soft pink hair:1.45),
(warm pink-brown eyes:1.25), (wearing cream-yellow top:1.5),
sitting, on the chair, one cardboard delivery package,
left hand stabilizing the top panel of the cardboard delivery package,
cardboard delivery package resting on the desk, one pair of scissors,
scissors cutting the sealing tape on the cardboard delivery package,
right hand gripping the scissors handle, focused,
(eyes focused on the cardboard delivery package sealing tape:1.3),
face and action remain unobstructed
```

### 验证与边界

234/234 项目测试、69/69 执行层测试通过。覆盖剪刀/纸箱、刀/纸、刷/画布、螺丝刀/螺丝、双角色归属、支持物误匹配、人工视线、错误目标及翻译不变量、取物阶段、遮罩保护。记忆同步另在 clean / dirty / missing_git 三类临时目录实测通过，均只写 pending。

完整链冲突复核见五项 ISSUE 的逐项记录：剧情/人工选择→规格/P0→交互与有效Pose→PromptPlan/recipe/payload→Regional/ControlNet→基础及全部局部pass→自动硬门/草稿整体确认→候选。检查过程中修复了辅助物体轮廓未被worker消费、后续局部mask可能覆盖关联道具、manual视线来源被覆盖和取物后阶段描述遗漏，均属于本轮根因范围。

程序逻辑验收通过，未进行图片生成或视觉效果验收。当前服装参考未满足安全使用条件时仍跳过；face-only控制不等于整头发型控制。完整长发/服装效果、模型随机性与实际视觉执行率保留为产品运行风险，不把文本修复当作像素效果保证。工作目标模糊时不进行无依据绑定；明确旧文字只允许唯一匹配并标 legacy_default。没有擅自恢复用户关闭的姿态语义硬阻断。

生产构建最终通过；期间并发开发服务占用同一.next导致一次ENOENT，已停下核实进程并将旧缓存保留在workspace内后干净重建。没有删除业务数据。

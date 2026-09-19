# 漫画工作台问题台账

## ISSUE-PIPELINE-002 用户授权的生图剧情一致性全链审计与优化

- 优先级：P1
- 状态：verified
- 诊断 Agent 独立终审（2026-09-13）：核对审计报告及两条 gaze 实际 payload：gazeIdentityUnit 已不受 CPU 排除，按对应人物 identityReference、可用路径与 gazePlan 创建，和 head-direction Pose 同时进入 ControlNet.args；实际 trace 随单元记录而非只记录计划。面部 mask、对象目标上下文及 relation/character 归属未改变，没有手机/job 硬编码。沿输入契约、基础覆盖、局部继承、错误阻断及审批/候选核对；本项交付为证据驱动审计和明确遗漏修复，不将尚未定位的发色、头向或手检测视觉失败判成代码已解决。worker 31/31 测试、语法检查、TypeScript noEmit 通过。程序逻辑验收通过，未进行图片生成或视觉效果验收。两局部控制的 CPU 耗时与内存、face-only 对头发覆盖不足及检测未命中仍为已记录风险。标记 verified，本轮未确认新增独立缺陷；以下旧 open 结论为历史。
- 用户报告：2026-09-13 用户要求把最新失败草稿与项目级优化方案交给另一个对话执行。
- 已确认事实：job 503 基础及后处理图均未表达看通知，且发色/发长偏离；手部检测失败导致 draft_blocked。此项是明确授权的审计优化任务，不代表已确认新增代码根因。UI 另由 ISSUE-UI-001 处理。
- 高概率原因：待审计，不能仅凭视觉偏差认定模型、mask 或权重为根因。
- 未验证假设：身份覆盖范围、头向执行、局部坐标和检测输入可能存在缺口，均须代码或请求证据核验。
- 反证或冲突：历史 426 有低头看手机但非整体合格；近期两项 verified 仅证明特定程序缺陷消除，不证明整个生图效果已合格。
- 复现步骤：只读比对 jobs 426/500/502/503 的实际请求、控制及阶段图，按 GENERATION_OPTIMIZATION_HANDOFF.md 执行审计，不运行 SD。
- 涉及文件：GENERATION_OPTIMIZATION_HANDOFF.md；scripts/sd-worker.mjs、scripts/sd-worker-logic.mjs、lib/prompts.ts、lib/pose-v3/、app/api/studio/route.ts、现有 recipe 与阶段日志。
- 影响范围：项目不同人物、动作、道具和景别的剧情生成一致性。
- 建议方案：先定位首次偏离及确证程序根因，再做通用修复；保留单一契约/共享几何、资源覆盖和后序保护，区分请求成功与语义效果。
- 验收标准：交付可追溯根因报告与必要程序修复；确证独立缺陷建项，风险不冒充缺陷；覆盖方案列出的矩阵及全链冲突复核。无代码缺陷的视觉风险如实记录，不以必须改善某一张图作为关闭条件。
- 解决 Agent 修改：2026-09-13 完成 `GENERATION_OPTIMIZATION_AUDIT_2026-09-13.md` 根因报告。确认 CPU 两条 gaze 执行路径把已规划且可用的角色身份 ControlNet 特判排除，而历史 502/503 trace 证实最后脸部 pass 没有该单元；已移除排除，按实际请求记录控制单元。没有证据的初始发色/头向偏差及手部空检测不擅自调参或降低门禁。
- 解决 Agent 测试：worker 语法、31/31 纯逻辑测试及 TypeScript noEmit 通过；核对 426/500/502/503 的 seed、prompt、控制阶段、输出及失败。完整链路复核：剧情/人工选择→视觉规格→canonical prompt/交互→recipe/payload→Regional/ControlNet→基础生成→身份/服装/道具/接触/手/视线→自动质量门与草稿整体确认→正式候选，详见审计报告。单/双人、左右区域、单/双手、多类道具与意图、坐/站/行走、近/全景沿既有共享契约与几何路径；本次仅修正可用身份单元在 CPU gaze 请求中的遗漏，未引入角色或道具硬编码。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 残余风险：模型执行随机性、CPU 局部双控制峰值内存与耗时、实际视觉成功率未验证；face-only 身份控制不保证长发和衣着，503 initial 的视觉偏差不能由现有样本锁定代码根因。手部检测在锚点内返回空轮廓的原因未确认，仍保留硬阻断；不得承诺 100%。
- 诊断 Agent 复核证据：前轮已查看用户已有 initial/保存草稿及任务状态；本项明确作为用户授权的审计工作登记。
- 诊断 Agent 复核结论：open，待实施审计与证据驱动优化，不预先宣称代码回归。
- 后续处理：读取 GENERATION_OPTIMIZATION_HANDOFF.md；完成后 fixed_pending_review，诊断复核审计证据与实际修复范围。

## ISSUE-UI-001 阻断草稿已保存但分镜预览过滤该状态

- 诊断 Agent 补充运行证据（2026-09-13）：用户再次报告最新草稿不显示。只读 job 503/shot 1255 为 draft_blocked，draftImagePath=workspace/generated/sd-draft-job-503-7144a132-7a62-4431-a7be-134055699216.png 且文件存在；仍为手部检测器未返回可用轮廓，当前 pendingSdReview 仍排除此状态，本项继续 open。对用户已有 initial 与最终保存图进行对照，基础阶段已是短深色发、正视观众、手机位于膝前且接触手被遮挡；后处理改变表情与道具表面但未纠正这些整体关系。视觉偏差仅作后续定位线索，不能据此确定独立代码根因；检测输入尺寸/裁剪/遮挡、身份与头向控制的实际继承应另行程序审计，不降低失败门禁，不以新增生成图作为程序验收条件。

- 优先级：P1
- 状态：fixed_pending_review
- 用户报告：2026-09-12 最新草稿生成结束后没有展示。
- 已确认事实：job 502/shot 1255 为 draft_blocked，progress=100，错误为手部深度修复未应用、所有可用手部检测器未返回可用轮廓；payload.draftImagePath 已保存且文件存在。app/page.tsx pendingSdReview 只过滤 awaiting_draft_approval/awaiting_final_approval，排除 draft_blocked；轮询阻断分支只刷新并 flash 错误。旧 job 501 仍为 awaiting_draft_approval，可被筛选成预览而掩盖最新失败结果。
- 高概率原因：把可查看图片与可批准继续混为同一状态筛选。
- 未验证假设：手部检测失败的具体原因需另查，不据此断言 detector 实现错误，也不要求降低门禁。
- 反证或冲突：不是生成文件丢失；技术失败阻断继续生成本身符合规则。
- 复现步骤：只读 jobs 502/501 并检查 draftImagePath 文件存在；用当前 pendingSdReview 过滤条件推导，502 被排除而 501 可被选中。
- 涉及文件：app/page.tsx:1624（分镜预览筛选）、:378（轮询 draft_blocked 分支）；data/studio.db job 502。
- 影响范围：已保存中间或草稿结果但后处理失败的 SD 任务。
- 建议方案：将诊断预览与审批资格分离；最新 blocked 且有图时显示其图片、任务 ID、失败原因与重试入口，并明确禁止确认成品/正式入候选。不能静默回退旧待确认图冒充本轮结果；无文件时明确无可用预览。保留现有技术门禁，不修改历史数据。
- 验收标准：blocked 有图/无图、最新 blocked 加旧 awaiting、正常 awaiting、completed 路径可通过状态数据推导；blocked 可查看不可批准，无旧图误认。仅程序逻辑验收，不启动 SD 或生成测试图。
- 解决 Agent 修改：2026-09-13 以该分镜最新 SD job 决定当前预览状态；blocked 有图显示诊断图、任务 ID、阶段、错误和重试入口，无图明确无可用预览；最新 blocked 不再回退旧 awaiting 或候选图。审批对象仅由非 blocked、带草稿路径的 awaiting 状态产生，completed 仍回到正式候选。
- 解决 Agent 测试：按状态数据推导 blocked 有图/无图、503 blocked+501 awaiting、正常 awaiting、completed；blocked 无审批按钮且无正式候选写入路径，正常 awaiting 仍一次整体确认。TypeScript noEmit 通过。完整链路复核：剧情/人工选择→视觉规格→prompt/交互→recipe/payload→Regional/ControlNet→基础生成→身份/服装/道具/手/视线→自动质量门与草稿整体确认→正式候选；本次 UI 仅展示真实最新状态，不更改人数、区域、景别、姿态、身份、服装、道具、遮挡、环境或控制请求，失败/降级没有伪装成已应用。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 残余风险：显示诊断图不意味着图像通过语义或技术验收；模型视觉执行率仍为运行风险。
- 诊断 Agent 复核证据：2026-09-12 当前代码与只读数据库及文件存在检查确认；未生成图片。
- 诊断 Agent 复核结论：新建 open，UI 状态消费缺口已确认；检测失败根因未确认。
- 后续处理：解决 Agent 修复至 fixed_pending_review；保留草稿整体确认与成品程序硬门禁，不增加逐项人工审核。

## ISSUE-CONTROL-002 必需手物控制延后时覆盖检查未验证串行补偿能力

- 优先级：P0
- 状态：verified
- 诊断 Agent 独立复核（2026-09-12，本轮）：当前 CPU 基础预算为 3，required prop 不再标为延后，实际 controlUnits 进入 request payload；coverage 读取显式能力且 worker 对 object-only prop 声明 includesRequiredHands=false/includesPoseContact=false，预算溢出时在请求前 throw。独立 CPU fast/complex/GPU × phone/book/cup/package 共 12 组选择与覆盖推导通过，额外双道具超预算用例确认不能被串行标记掩盖。identity 补偿与 API enabled=true、worker 按 identity reference 循环的执行路径相符。检查了规格/recipe、基础控制筛选、后续 relation 共享数据、失败阻断和既有草稿整体确认/候选路径。本项已确认的覆盖缺口通过；未承诺所有像素交互正确，也未把计划位置视为检测结果。30/30 worker 测试、两份 worker 语法检查、TypeScript noEmit 均通过。程序逻辑验收通过，未进行图片生成或视觉效果验收。CPU 三控制的内存和速度、模型实际执行率保留为运行风险；历史 job 500 不会自动改写。以下旧“新建 open”结论为历史，当前以本轮为准。
- 用户报告：2026-09-12 用户要求将本轮项目级解决方案登记入解决队列。第一格为收到取件通知；最小目标是手机可辨认、人物看通知且开心，景别无需严格。
- 已确认事实：只读 job 500（shot 1255）profileExecution/requestTrace：基础仅发送 pose/support_surface_geometry，deferred_prop_structure 被省略但 coverage.complete=true。当前 scripts/sd-worker-logic.mjs 的 selectControlUnitsForProfile 固定优先 pose=100、support=95、initial_prop=90；controlExecutionCoverage 仅凭 runRefinements 与阶段名将遗漏控制标 scheduled_serial_refinement，不验证阶段能力及接触几何前提。worker CPU 分支将手持道具延后；generic_prop trace 为 maskIncludesHands=false、poseControlExcludedFromObjectPass=true。
- 高概率原因：把已安排串行请求视为关系控制完整覆盖，没有校验串行阶段是否能补偿基础手物结构。
- 未验证假设：不能由单张失败图证明所有串行策略无效；景别投影、局部定位和 gaze 身份继承需继续核对当前代码，不能把历史图像自动判成当前回归。
- 反证或冲突：job 500 确实运行道具、接触和视线修复且保持 semantic_pending。关联 ISSUE-PROFILE-001、ISSUE-PROP-003、ISSUE-PROP-004；本项补充旧方案的覆盖判定缺口，不否认已有阶段审计修复。
- 复现步骤：用 pose/support/deferred_prop_structure 输入 CPU 控制筛选，以 runRefinements=true 调用 coverage；道具未进入基础而 complete=true，函数无阶段能力/接触前提输入。对照 job 500 recipe 与当前 worker 数据流。
- 涉及文件：scripts/sd-worker-logic.mjs:290、scripts/sd-worker.mjs:366、scripts/sd-worker.mjs:994；data/studio.db job 500。
- 影响范围：不同人物、区域、单手/双手和不同道具的生成控制与局部修复。
- 建议方案：按剧情 relation 声明对象结构、接触、姿态与支持需求，按必要性分配预算。基础建立必要手物关系或提供可证明等价的联合控制；串行补偿需明确能力和前提，不能仅凭 pass 存在判完整。预算不足明确阻断或可追溯降级。所有 mask/对象/接触/视线共用几何及投影；预设坐标不得伪装成检测位置。景别未锁定时可调整，选定后各控制必须一致。
- 验收标准：CPU/GPU、单/双人、单/双手、phone/book/cup/package/无道具矩阵，必要控制实际发送或等价策略有程序证据；缺口不能被 runRefinements 掩盖。后序 pass 的几何、身份和姿态继承闭合。仅程序逻辑验收，不启动 SD、不生成图；维持草稿整体确认与成品自动流程。
- 解决 Agent 修改：2026-09-12 扩展 `controlExecutionCoverage`，遗漏控制只有在 worker 显式声明串行阶段 available、保持 Pose，且道具阶段同时包含对象、全部必要手部和 Pose 接触时才可记为 `scheduled_serial_refinement`；能力不足一律 `uncovered` 并在 SD 请求前阻断。当前 generic prop 的 mask/guide 明确不含手和 actor skeleton，因此不再冒充等价补偿。CPU 必需手持道具结构恢复进入基础请求，CPU 基础控制预算由 2 调整为 3，使常见 pose+prop+support 同时发送；identity 仍可由真实 face-only 串行 pass 补偿。
- 解决 Agent 测试：`node --check scripts/sd-worker-logic.mjs`、`node --check scripts/sd-worker.mjs`、`node --test scripts/sd-worker-logic.test.mjs`（30/30）和本地 `tsc --noEmit --incremental false` 通过。新增“仅存在 pass 但缺手/接触能力仍 uncovered”及“能力完整才允许串行覆盖”断言。完整出图业务链冲突复核：剧情/人工选择的 required relation 经视觉规格、canonical prompt 和 interaction contract 进入 recipe；对象中心、contactAnchors、handMode、人物 region 与 framing 投影继续共用结构化计划；CPU payload 现实际同时发送 pose/required prop/support，身份按人物串行；generic prop/hand/gaze 后序仍使用 relationId/objectInstanceId/共享锚点并保留身份、姿态、服装与构图，且其对象-only 能力不会再被覆盖门虚报；请求或后处理失败继续写 warning 并阻断草稿确认/正式候选，HTTP 2xx 仍只表示 request_succeeded。草稿一次整体确认与成品自动入候选规则未改变。
- 残余风险：CPU 同时发送三个基础控制会增加峰值内存与耗时；若设备确实无法承载，当前选择明确阻断而不是静默降级。无视觉检测器时语义执行仍不确定，不承诺 100% 成图合格，不把请求成功当语义通过。
- 诊断 Agent 复核证据：2026-09-12 当前源码静态检查及只读 job 500 证据一致；未生成图片。
- 诊断 Agent 复核结论：新建 open，未修复。
- 后续处理：解决 Agent 修复至 fixed_pending_review。复核剧情/人工选择→视觉规格→提示词/交互→recipe/payload→Regional/ControlNet→基础生成→身份/服装/道具/视线 pass→自动质量门与草稿整体确认→正式候选。独立新冲突登记 ISSUE；仅假设写风险。不得恢复逐项语义勾选或成品二次人工审核。

## ISSUE-PROMPT-003 基础道具提示词改写无条件双手化并删除动作视线

- 优先级：P0
- 状态：verified
- 诊断 Agent 再次独立复核（2026-09-12）：已移除命中表面关键词后删除整句的分支，当前只原位替换细节短语；上轮分号复现句保留身侧位置、另一手关门、看向道路与 no legible text。独立运行 smartphone/book/cup/tool × left/right × 逗号/分号 × no/without/avoid/正向细节共 64 组，动作与具体视线均保留；额外多关系单/双手及无道具分支通过。单手不再强制双手，双手仍保留不同接触锚点。检查 worker deferredBase.prompt 在基础 payload 的使用和 requestTrace 记录，修改没有改写 relation、Pose、对象/手 mask、身份/服装/视线阶段输入或审批状态机；上轮已通过的控制覆盖修复继续有效。31/31 worker 测试、两份 worker 语法检查、TypeScript noEmit 全部通过。原整句删除复现已消除，本项标记 verified，以下 partially_fixed 和剩余修改要求为历史记录。程序逻辑验收通过，未进行图片生成或视觉效果验收；模型随机性与实际视觉执行率保留为产品运行风险。本轮无新增确定问题。
- 解决 Agent 再修复（2026-09-12）：移除“匹配表面细节就删除整个 prompt clause”的路径，改为在原句内仅替换明确的正向细节短语；`no/without/avoid legible text` 等否定约束保持原文。无法安全切分的逗号、分号混合句整体保留，因此人物位置、主动手、另一手动作和具体视线目标不会被通用占位语替代。
- 解决 Agent 再测试（2026-09-12）：新增诊断复现原句 `left hand holding smartphone at her side; right hand closing the door; eyes looking toward the path; no legible text`，确认四项语义全部保留且 removed 为空；另测 book 正向 intricate surface detail 只原位替换该短语，前后动作和视线不变。`node --test scripts/sd-worker-logic.test.mjs` 31/31、worker 两文件语法与 TypeScript noEmit 通过。完整链复核：剧情/人工选择、视觉规格、canonical prompt、recipe/payload 保留同一句级事实；Regional、Pose、道具 geometry/mask 与后续 identity/prop/hand/gaze pass 仍消费既有 relation 和共享坐标，没有重新推断手数、位置或视线；技术失败及自动门禁继续阻断，草稿整体确认和成品自动入候选状态机未改变。程序逻辑验收完成，未进行图片生成或视觉效果验收。
- 诊断 Agent 独立复核（2026-09-12，本轮）：单手/双手条件编译和保留普通 phone 句的修复有效，30/30 worker 测试、语法与 TypeScript 检查通过。但 deferRequiredPropsFromBasePrompt 仍对 deferredSurfaceDetailPattern 命中的整个 splitPromptClauses 结果删除。独立可复现输入为 `left hand holding smartphone at her side; right hand closing the door; eyes looking toward the path; no legible text`，relation 为 required=true/object=smartphone/handMode=one/activeHand=left/purpose=carry/gazeMode=independent。返回 removed 包含完整输入，实际输出丢失身侧位置、右手关门和朝路看，只余泛化 other hand remains available 与 independently declared gaze。no legible text 自身也被正则 legible text 命中。此为当前程序确定分支，非视觉失败推断，属于原整句删除根因残留，退回 partially_fixed；不新增重复 ISSUE。
- 本轮剩余修改要求：只替换或删除局部表面细节短语，混合动作/位置/视线句须保留其语义；无法安全切分时保留原句，不得删除后用通用占位语补回。覆盖逗号与分号、无可读文字的否定表达、单手携带与另一手动作、多关系句；验证返回实际 prompt 仍含原有动作和视线目标。按原要求完成全链路复核。程序逻辑验收部分通过，未进行图片生成或视觉效果验收。
- 用户报告：本轮用户要求把项目级解决方案写入台账，由另一个解决 Agent 执行。
- 已确认事实：当前 deferRequiredPropsFromBasePrompt 按对象别名删除整个 clause，然后无条件追加 both acting hands wrap naturally around the declared actual handheld object，未按 handMode/activeHand 分支。job 498 单手身侧持手机、另一手关门的输入在实际请求变成双手握物；job 500 基础请求删除保存 prompt 中含 phone/smartphone 的视线动作句。当前函数仍存在相同处理。
- 高概率原因：简化道具表面内容的阶段越权删除动作语义，并使用全局双手模板重建。
- 未验证假设：图片中的杯状物不能仅归因于提示词；模型与控制缺口仍共同影响结果。
- 反证或冲突：最终请求并未漏写 smartphone；不能归咎于 DeepSeek 没要求手机。关联 ISSUE-INTERACTION-001、ISSUE-TOOL-001、ISSUE-PROMPT-001，本项为 worker 改写层的独立缺口。
- 复现步骤：调用 deferRequiredPropsFromBasePrompt，输入 required=true、object=smartphone、handMode=one 及单手携带/看手机句；结果包含 both acting hands 且 removed 含视线整句。对 cup/book 和多关系核对同分支。
- 涉及文件：scripts/sd-worker-logic.mjs:489；scripts/sd-worker.mjs 调用链；lib/prompts.ts；data/studio.db jobs 498/500。
- 影响范围：单/双手持物、携带/阅读/通话/交接及多对象关系。
- 建议方案：基础和后处理提示词从同一结构化契约编译，保留手数、主动手、动作目的及视线。只简化表面细节，不能按对象名称删除完整剧情句。逐 relation 编译并校验规格、骨骼、recipe、实际请求、pass 一致；UI 可追溯实际请求。剧情事实、身份和服装保持；用户未锁定的景别允许调整但不得各层冲突。
- 验收标准：one/two、left/right、携带/阅读/通话/交接、phone/book/cup/tool、多人物多关系矩阵，表面简化不改变手数和视线；无道具不发明动作。程序逻辑验收，不生成图，不要求视觉检测器作为关闭条件。
- 解决 Agent 修改：2026-09-12 将 `deferRequiredPropsFromBasePrompt` 从“命中任一道具别名即删除整句并统一追加双手”改为只延后可由道具 pass 承担的细粒度表面/伪文字内容。原始对象、动作目的、另一只手动作、视线与表面可见性句保持不变；每条 relation 独立按 handMode、activeHand/contact anchor、purpose 和 gaze 编译。one-hand 明确只有主动手接触且另一手保留既定动作，two-hand 明确两手落在不同接触锚点，不再从 smartphone 类别推断双手。
- 解决 Agent 测试：worker 逻辑测试 30/30、两个 worker 语法检查与 TypeScript 检查通过；新增“右手身侧携带手机、左手关门、看前方”回归用例，确认动作、视线、主动手全部保留且不出现 both-hands 重写；既有双手阅读用例确认仍保留双手不同锚点、手机可见与看屏幕语义。完整出图业务链冲突复核：剧情/人工选择→视觉规格的 action/hands/gaze/outfit 不被 worker 改写层覆盖；canonical prompt、recipe 与实际基础 payload 保留同一 relation 事实；Regional、OpenPose、prop guide/mask 继续消费同一 characterId/region/objectCenter/contactAnchors；identity/prop/hand/gaze 后序 pass 不改变 handMode/purpose/gaze，技术失败保持上一阶段并阻断候选；草稿整体确认及成品程序硬门后自动回写候选的状态机未增加逐项 UI 或二次人工审核。服装与锁定景别未被本修复修改。
- 残余风险：程序一致不代表像素 100% 正确；自由文本若上游本身含互斥动作仍需视觉规格校验阻断，模型对携带、阅读、通话、交接及视线的实际执行率保留为产品运行风险。
- 诊断 Agent 复核证据：2026-09-12 静态核对当前函数和历史实际请求，明确无条件双手追加与关键词整句删除分支。
- 诊断 Agent 复核结论：新建 open，未修复。
- 后续处理：解决 Agent 推进 fixed_pending_review，按剧情→视觉规格→提示词/交互→recipe/payload→控制→基础图→局部 pass→质量门/草稿整体确认→候选全链复核。保留现有一次草稿整体确认，成品通过程序硬门禁自动入候选。

## ISSUE-PROFILE-001 CPU 草稿控制预算省略身份及关键道具控制且没有补偿阶段

- 优先级：P0
- 状态：verified
- 诊断 Agent 独立复核（2026-09-12）：CPU fast/complex 已启用草稿串行精修，基础优先保留 pose/support；coverage 不完整在请求前阻断，API 启用身份精修，worker 按人物与 required relation 执行后续 pass，失败写 postprocessWarnings 阻断审批/候选。核对了视觉规格、prompt、recipe、ControlNet、身份/服装/道具/手部/视线、人工审核和正式回写；12 组 CPU/GPU×单双人×有无道具覆盖推导通过。29/29 worker 测试、worker 语法和本地 TypeScript noEmit 检查通过。程序逻辑验收通过，未进行图片生成或视觉效果验收。非隔离服装参考仍按原规则跳过，模型服从率与 CPU 耗时保留为运行风险。
- 用户报告：2026-09-12 提交两次生成图，要求评估剧情符合度和人物一致性；本轮仅评估。
- 已确认事实：附件对应 job 487 与 489。489 的 profileExecution 记录仅发送 pose，identity_reference 和 support_surface_geometry 被省略，identityReferenceControls.controlApplied=false；487 发送 identity_reference 和 pose，但 deferred_prop_structure 未发送。两者 runDraftRefinements=false，stageOutputs 无身份/服装/道具/视线精修。
- 高概率原因：generationProfilePlan 将 CPU 控制数限制为 1/2；selectControlUnitsForProfile 按固定优先级截断，草稿同时关闭补偿 pass，必需控制没有覆盖完整性门禁。
- 未验证假设：不能将所有视觉偏差都归因于控制省略；checkpoint 和采样随机性仍会影响执行。
- 反证或冲突：程序真实记录 omitted_by_profile，没有虚报请求已经应用；但 API 要求身份参考存在，随后 worker 又可将它筛掉，资产前置要求没有落实到执行。
- 复现步骤：只读查询 jobs 487/489 payload.recipe.profileExecution/requestTrace/stageOutputs；纯函数 selectControlUnitsForProfile([{stage:'identity_reference'},{stage:'pose'}], 'cpu_local_fast') 只返回 pose。
- 涉及文件：scripts/sd-worker-logic.mjs:279、scripts/sd-worker.mjs:671、app/api/studio/route.ts；data/studio.db jobs 487/489。
- 影响范围：CPU 下有动作骨骼的人物草稿，以及将关键道具结构延后却关闭草稿精修的镜头；多人必须逐角色审计。
- 建议方案：按镜头定义 required control coverage，优先保证身份与剧情动作；预算不足采用可追溯串行阶段或明确降级预览状态，不得直接删除关键条件后当成具备一致性约束的草稿。
- 验收标准：CPU fast/complex 与 GPU、单人/多人、有无道具矩阵中，每个必需控制实际执行或明确阻断/降级，延后控制必须有真实执行阶段；程序逻辑验收，不生成图片。
- 解决 Agent 修改：2026-09-12 将 CPU 档位改为“最多两个基础 ControlNet 单元 + 串行局部阶段”，草稿不再关闭 identity/prop/hand/gaze refinement；CPU 必需道具结构统一延后到真实 prop pass，基础槽优先保留无法串行补偿的 pose 与 support。新增 requiredControlCoverage 审计，逐项记录 applied_in_base/scheduled_serial_refinement/uncovered，存在 uncovered 时在发起 SD 请求前阻断；profileExecution 记录执行策略与完整覆盖结果。
- 解决 Agent 测试：node --check scripts/sd-worker.mjs 与 scripts/sd-worker-logic.mjs 通过；node --test scripts/sd-worker-logic.test.mjs 29/29 通过，覆盖 CPU fast/complex、身份/姿态/支持面/延后道具及关闭串行补偿时的阻断。完整出图业务链冲突复核：剧情/人工选择继续经视觉规格和 canonical prompt 进入 recipe；基础 payload 在 CPU 下只并发 pose/support，身份和各角色道具/手部/视线按既有 pass graph 串行且后序继续携带身份/姿态/共享道具几何；失败会写 postprocessWarnings 并进入 draft_blocked/阻断正式候选；语义门仍要求逐项人工审批，未改变 P0 门禁或非目标镜头规则。pnpm test 未进入测试用例，tsx 在 uv_os_get_passwd 处因 ENOMEM 退出。
- 残余风险：程序已保证必需控制实际进入基础请求或有真实串行阶段，否则阻断；CPU 串行阶段会增加耗时，模型随机性与实际视觉服从率仍属产品运行风险。未启动 SD、未生成测试图，也未修改 jobs 487/489 的历史记录。
- 诊断 Agent 复核证据：2026-09-12 只读数据库和上述纯函数结果一致；查看已存在图片确认附件对应任务，未启动 SD。
- 诊断 Agent 复核结论：新建 open；已确认程序执行覆盖缺口，未进行新图片生成或修复效果验收。
- 后续处理：解决 Agent 按控制覆盖而非简单数量裁剪重构降级策略，关联 ISSUE-PROP-003 和 ISSUE-IDENTITY-001。

## ISSUE-QA-006 草稿审批主动过滤剧情表情检查

- 优先级：P1
- 状态：verified
- 诊断 Agent 独立复核（2026-09-12）：draftIds 已保留 expression_review_required；只读 job 487 重算确认表情项恢复，draft/final×happy/sad/eager×单双人 12 组检查通过，缺失 required verdict 被拒绝。检查来源保持当前视觉规格/执行输入，并由 UI/API/数据库通用 items 机制消费。29/29 worker 测试和 TypeScript 检查通过。程序逻辑验收通过，未进行图片生成或视觉效果验收；历史任务已保存的清单不会自动刷新。
- 用户报告：2026-09-12 评估剧情表达与人物表情一致性。
- 已确认事实：semanticReviewContractForStage 的 draftIds 未包含 expression_review_required。使用 job 487 真实 recipe 调用，final 清单有表情项，draft 清单没有。
- 高概率原因：阶段白名单省略了基础契约已经生成的表情项。
- 未验证假设：尚未认定最终审批也遗漏本镜头表情；当前 final 分支实际保留该项。
- 反证或冲突：ISSUE-QA-005 的基础检查仍存在，缺口发生在新增阶段过滤层，不应把旧修复全盘认定无效。
- 复现步骤：以 job 487 recipe 构造 semanticReviewContractForStage 参数，分别传入 draft/final，比较 labels。
- 涉及文件：scripts/sd-worker-logic.mjs:496；scripts/sd-worker.mjs:1663。
- 影响范围：所有有明确剧情表情的草稿审批。
- 建议方案：草稿保留剧情表情必审项，阶段过滤必须有业务依据并保留可审计的延后原因。
- 验收标准：明确 happy/eager/sad 等剧情表达在草稿生成对应 required verdict；无明确表情不强加固定表情；final 继续保持检查。程序逻辑验收，不生成图片。
- 解决 Agent 修改：2026-09-12 将 expression_review_required 加入 draft 阶段允许清单；表情项仍只由明确且非 unknown/通用自然表情的当前执行人物要求触发，final 分支保持完整契约不变。
- 解决 Agent 测试：node --test scripts/sd-worker-logic.test.mjs 29/29 通过，明确断言 draft/final 均保留剧情表情、无明确表情的静态输入不发明要求。完整出图业务链冲突复核：表情来自当前视觉规格或 compiled execution reviewInputs，与 prompt/characterLooks 及 identity/gaze pass 使用同一剧情表达；新增 verdict 由现有 UI、API、数据库审批及 final worker 的通用逐项机制消费，缺项或 fail 不能进入正式生成/候选；未改变人数、姿态、服装、道具、视线、构图或降级状态。
- 残余风险：人工可能误判表情，模型执行率仍有随机性；参考图表情没有被当作身份不变量。程序逻辑验收，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核证据：2026-09-12 用当前函数和只读 job 487 数据复现阶段 labels 差异。
- 诊断 Agent 复核结论：新建 open，关联 ISSUE-QA-005；未启动 SD，未进行新图片生成或修复效果验收。
- 后续处理：修复阶段过滤并检查 UI/API 审批消费。

## ISSUE-QA-007 未确认视觉规格路径缺少基础人数解剖景别视线及表情复核

- 优先级：P0
- 状态：verified
- 诊断 Agent 独立复核（2026-09-12）：新任务 API 将实际 compiled.characterLooks 的 expression/gaze/hands、人数和景别保存到 reviewInputs；无 confirmed visualSpec 时 worker 从其补齐基础审核，未启用旧未确认 JSON。draft/final 组合检查和必审缺失拒绝通过，候选仍需最终审核。29/29 worker 测试、TypeScript 检查通过。程序逻辑验收通过，未进行图片生成或视觉效果验收。范围为新建任务：数据库最新仍为旧 job 489，其未迁移清单不能视作已更新，需重建草稿使用新逻辑；模型执行率保留为运行风险。
- 用户报告：2026-09-12 第二张图人物形象和剧情动作偏离，要求评估链路。
- 已确认事实：job 489 generationSpec.visualSpec=null，shot 1256 visual_spec_confirmed=0，实际 prompt 有单人、中景、eager 和沿移动方向看等要求；当前 semanticReviewContractForStage 对其 draft/final 都仅生成 pose、identity、outfit、support、composition、lighting 六项，遗漏人物数量、解剖、景别、视线和表情。
- 高概率原因：semanticReviewContract 对这些检查依赖 visualSpec 的 characters/camera，未从当前编译后的其他结构化输入统一补全，legacy 可生成路径与审批契约不对等。
- 未验证假设：未确认详细规格没有注入请求本身可能是有意设计；不能直接把未确认内容视为用户已经批准，也不能据此要求无条件套用旧规格。
- 反证或冲突：job 489 仍等待草稿审批，不能据此宣称错误图已经成为正式候选；其他六项仍会执行。
- 复现步骤：读取 job 489 recipe，以当前 semanticReviewContractForStage 分别生成 draft/final 清单，对照 requestTrace.prompt/negativePrompt 和 characterLooks；五类检查均缺失。
- 涉及文件：scripts/sd-worker-logic.mjs:218、app/api/studio/route.ts:881、scripts/sd-worker.mjs:1663。
- 影响范围：允许未确认 visualSpec 生成的旧镜头和兼容路径；与具体人物、道具无关。
- 建议方案：确认后的镜头执行规格作为统一生成/审批来源；legacy 路径先把已采用的人数、动作、景别、视线、表情规范化，或要求完成视觉规格确认，不得仅从可空 visualSpec 推导质量门。
- 验收标准：同一有效执行契约在 confirmed/legacy 路径产生等价基础必审项；纯环境镜头合理豁免人物项，任何必审项缺失/fail 不得批准；未确认旧内容不得被静默当作当前事实。程序逻辑验收，不生成图片。
- 解决 Agent 修改：2026-09-12 在创建 recipe 时新增 generationSpec.reviewInputs。confirmed 路径标记 confirmed_visual_spec；未确认路径只保存本次实际编译并发送的人数、当前 camera/shotSize、逐人物 expression/gaze/hands，不读取或静默启用未确认旧 visualSpec。semanticReviewContract 优先使用 confirmed visualSpec，缺失时使用 reviewInputs 补齐人物数量、解剖、景别、视线、表情和可见手部检查。
- 解决 Agent 测试：node --test scripts/sd-worker-logic.test.mjs 29/29 通过，新增 visualSpec=null 的单人中景/eager/移动方向视线/可见手部矩阵，六项基础检查全部生成且来源可审计；既有 confirmed、多人物、交互、纯静态无人物契约测试保持通过。完整出图业务链冲突复核：reviewInputs 与本次 canonical prompt、negative、characterLooks 同源写入 recipe，worker draft/final 共用同一 semantic contract；Regional/ControlNet 和各 identity/prop/gaze pass 不由审批反向改写；任何 required verdict 缺失/fail 均由现有 API/数据库/final worker 门禁拒绝，审批后正式图仍需最终复核才回写候选；legacy 未确认 JSON 中的开门/关门冲突没有被启用。
- 残余风险：旧 job 489 不会被追溯改写，新任务才携带 reviewInputs；未确认镜头的文字语义本身仍需用户通过视觉规格流程仲裁。程序逻辑验收，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核证据：2026-09-12 当前纯函数对 job 489 的 draft/final 清单均为六项，与实际保存清单一致。
- 诊断 Agent 复核结论：新建 open，关联 ISSUE-QA-004/005；未启动 SD，未进行新图片生成或修复效果验收。
- 后续处理：统一执行规格与质量门的数据源，复核无规格、有规格、单人/多人及无人物矩阵。

> 本文件是诊断 Agent 与解决 Agent 的唯一问题交接面。代码、数据库、任务 recipe、实际请求和运行日志优先于本文件。  
> 只有诊断 Agent 可以将问题标记为 `verified`；解决 Agent 完成修改后只能标记为 `fixed_pending_review`。

诊断 Agent 每轮复核后必须更新状态，不能只在对话中汇报：通过改为 `verified`；部分通过改为 `partially_fixed`；未解决改为 `open`；出现回归改为 `regression`。诊断中发现的可复现新问题必须新增唯一 ISSUE ID 并标记为 `open`，标题或证据中注明来源问题。解决 Agent 默认从 `issue:queue` 读取全部可行动问题。

图片生成类问题不进行 Agent 成图测试。解决 Agent 不启动 SD、不生成测试图，只测试代码修改和程序链路是否到位；诊断 Agent 只从通用程序逻辑复核根因、数据流、提示词编译、recipe/payload、mask/坐标、控制参数、状态与失败分支。证据充分即可标记 `verified`，并在“诊断 Agent 复核结论”注明“程序逻辑验收通过，未进行图片生成或视觉效果验收”。模型随机性和实际视觉执行率作为运行风险记录，不阻塞代码问题关闭。

自动化测试不是强制验收项。诊断 Agent 不得仅因缺少新增测试、逻辑内嵌在 worker 或没有真实图而判定未通过；必须给出仍存在的具体代码缺陷、错误数据流、错误参数或程序分支。各 ISSUE 中遗留的成图、视觉检测、同 seed 或强制自动测试标准若与本节冲突，以本节为准并应在复核时改写。

## 状态与权限

| 状态 | 含义 | 可设置角色 |
|---|---|---|
| `open` | 已确认、等待处理 | 诊断 Agent |
| `in_progress` | 正在解决 | 解决 Agent |
| `fixed_pending_review` | 已提交修复证据、等待复核 | 解决 Agent |
| `verified` | 诊断 Agent 独立复核通过 | 诊断 Agent |
| `partially_fixed` | 部分通过，仍有剩余问题 | 诊断 Agent |
| `rejected` | 原诊断被证据推翻 | 诊断 Agent |
| `blocked` | 缺少必要条件，暂时无法继续 | 任一 Agent，必须说明条件 |
| `regression` | 已修复问题再次出现或引入回归 | 诊断 Agent |

## ISSUE-GAZE-001 人物持续看镜头

- 优先级：P0
- 状态：verified
- 用户报告：多张生成图中的人物持续看镜头，没有看向剧情目标或手机。
- 已确认事实：提示词编译器会生成禁止镜头视线和指向动作目标的语义约束，因此“系统完全没有视线提示”不成立。job 378 最终 PNG 元数据显示 gaze inpaint 确实使用了 `eyes focused on the smartphone screen`、`no eye contact with camera/viewer`，但成图仍明显正视观众。
- 高概率原因：身份精修和视线修复的执行结果可能覆盖或未落实基础提示词中的视线意图。
- 未验证假设：模型或特定 checkpoint 对正脸身份参考存在强烈镜头凝视偏置；尚未用同 seed 对照实验验证。
- 反证或冲突：`inferGazeFromAction`、`deriveInteractionContract` 和负面提示词均包含 no eye contact/looking at viewer 约束。
- 复现步骤：直接复核 job 378（`workspace/generated/sd-draft-job-378-34a9476d-3845-4402-bb77-589b9a842c53.png`，最终 gaze seed 150922099）；或选择单人看手机镜头，确认 `gazeEn` 指向手机后生成草稿，检查最终双眼方向。
- 涉及文件：`lib/prompts.ts`、`scripts/sd-worker.mjs`、任务 recipe 和对应 SD job 日志。
- 影响范围：看手机、阅读、工具操作、人物对视等所有非镜头视线场景。
- 建议方案：修正脸部定位；让身份精修尊重头部姿态；按人物独立执行视线修复；增加实际成图复核。
- 验收标准：同一测试镜头连续生成至少 4 张，人物头部和双眼均指向手机或动作目标，不得直视镜头；recipe 和日志证明视线修复实际执行。
- 解决 Agent 修改：调整 scripts/sd-worker.mjs 的身份精修：检测非镜头视线时取消强制正面补光与“双眼完全可见”，明确保留头部角度和镜头外视线，并将身份 ControlNet 权重上限降至 0.78、身份精修重绘强度降至 draft 0.28/final 0.24，避免身份参考覆盖动作视线。
- 解决 Agent 测试：node --check scripts/sd-worker.mjs 通过；node scripts/issue-ledger.mjs check 通过（7 个问题）。pnpm test 未能启动，pnpm 在依赖状态检查阶段尝试写入受限临时文件并报 EPERM。
- 残余风险：尚未连接 SD 后端完成同 seed 四张成图验收；固定脸部 mask 的纵向位置仍依赖景别常量，模型/Checkpoint 的正脸偏置可能仍需实际图片复核。
- 诊断 Agent 复核证据：job 378 recipe 的 propInteraction 为 read/object gaze，postprocessWarnings 为空，PNG parameters 证明视线局部重绘执行成功；最终人物仍正视观众而非手机。
- 诊断 Agent 复核结论：问题稳定复现，保持 open；已从“提示词缺失”收敛为“视线局部重绘语义执行失败/身份正脸偏置”。
- 诊断 Agent 最终复核：2026-08-09 再次独立复核，身份精修分支已有保护性改动，但现有 37 项 Studio 测试没有覆盖该 worker 分支及视线修复执行结果；仅语法、类型和构建通过不足以证明根因闭环，调整为 partially_fixed。
- 诊断 Agent 本轮复核：解决 Agent 未新增可测试的请求体构建函数或针对 off-camera 分支的断言；job 389 仍只能证明模型执行风险，程序分支本身缺少自动化证据，保持 partially_fixed。
- 解决 Agent 本轮验收：程序逻辑已闭环：非镜头视线分支由 `characterPrompt` 判定，身份精修请求写入姿态/视线保护文案、镜头凝视负向词、低 ControlNet 权重和低重绘强度；镜头视线分支保留正面模板。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：`identityRefinementPlan` 已抽成纯函数并由测试覆盖镜头视线与非镜头视线两类分支；非镜头分支使用 0.28/0.24 重绘强度、ControlNet 权重上限 0.78、保留头部方向和镜头外视线提示，并追加镜头凝视负向词。job 390 仍出现正视观众，归为模型随机性和实际视觉执行率风险，不构成程序分支缺陷。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：诊断 Agent 复核两个身份分支的请求体；模型随机性和实际视觉执行率保留为运行风险。

## ISSUE-GAZE-002 视线修复 mask 使用道具中心

- 优先级：P0
- 状态：verified
- 用户报告：人物视线修复后仍不看手机。
- 已确认事实：当前 `sd-worker.mjs` 已改为优先使用对应人物 OpenPose 鼻点 `poseNose.x`，job 378 使用 x=0.38，与成图脸部横向位置基本一致；旧版“直接使用道具中心”根因已经消除。
- 高概率原因：剩余风险是纵坐标仍按景别常量估算、没有保存实际 mask 或人脸检测框；但 job 378 的持续看镜头不能再归因于道具中心横坐标。
- 未验证假设：实际失败图片中的 mask 是否完全偏离双眼，需要保存或导出 mask 后核对。
- 反证或冲突：身份精修阶段会按人物 region 计算 face center，说明项目已有可复用的人脸横向定位逻辑。
- 复现步骤：使用人物位于非中心区域、手机位于身体侧面的镜头；导出 gaze mask 并叠加到原图。
- 涉及文件：`scripts/sd-worker.mjs`。
- 影响范围：所有 `gazeMode` 非 `independent` 的道具交互镜头。
- 建议方案：由人物 region 或实际人脸检测结果计算 face center；把人物脸部中心与道具中心分别存入 recipe；调试模式保存 mask。
- 验收标准：单人左、中、右三个区域测试中，gaze mask 均覆盖对应人物双眼且不以道具位置作为脸部位置；自动测试验证坐标来源。
- 解决 Agent 修改：视线 mask 的横纵坐标均优先使用对应人物 OpenPose 鼻点，回退时才使用 region/景别估算；recipe 记录 `debugMasks`，保存人物中心与坐标来源，且不再使用道具中心定位脸部。
- 解决 Agent 测试：新增近景坐姿 OpenPose SVG 越界 limb 测试；worker 语法检查和台账检查通过。
- 残余风险：真实成图仍需诊断 Agent 复核 mask 是否覆盖双眼。
- 诊断 Agent 复核证据：job 378 poseNose.x=0.38，worker 当前使用 poseNose 优先于 region 中点，成图脸部也位于画面左侧附近。
- 诊断 Agent 复核结论：横坐标根因部分修复；验收标准未全部完成，标记 partially_fixed。
- 诊断 Agent 最终复核：2026-08-09 再次独立复核，代码已使用 OpenPose 鼻点并记录 debugMasks，但现有测试没有覆盖左、中、右人物区域的 gaze mask 坐标及回退路径，调整为 partially_fixed。
- 诊断 Agent 本轮复核：现有新增测试仍只有 OpenPose 越界 limb 与结构化 propId，没有左/中/右 nose、region fallback 或 gaze mask 输出断言，保持 partially_fixed。
- 解决 Agent 本轮验收：程序逻辑已闭环：人物 OpenPose 鼻点优先，region 中点回退，脸部横纵坐标均独立于道具中心，并将 `debugMasks` 坐标来源和归一化中心写回 recipe；近景越界骨骼测试通过。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：`gazeMaskCenter` 已抽成纯函数，测试覆盖左/中/右鼻点与 region 回退；job 390 recipe 记录 `centerX=0.38`、`centerY=0.16`、横纵来源均为 `pose_nose`，未使用手机中心定位脸部。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：诊断 Agent 复核多人物区域输入的 recipe 坐标记录；模型随机性和实际视觉执行率保留为运行风险。

## ISSUE-PROP-001 手机或工具关键词未命中时不触发交互修复

- 优先级：P0
- 状态：verified
- 用户报告：人物手中的手机或工具只偶尔出现。
- 已确认事实：`deriveInteractionContract` 通过关键词匹配 `interactionObjects`；未命中时返回 `required:false`，不会建立道具修复 pass。
- 高概率原因：动作描述使用未覆盖同义词、只有中文或只写抽象动作时，手机/工具契约没有进入任务 recipe。
- 未验证假设：用户报告中的具体失败任务是否属于关键词未命中，需要读取对应 recipe。
- 反证或冲突：命中 smartphone、phone、tool 等已覆盖词时，代码确实会生成正向道具约束、负面缺失约束、Pose 和局部修复。
- 复现步骤：分别使用 `checking messages`、`using a device`、中文“看手机”和明确 `holding a smartphone` 创建任务，对比 `propInteraction.required`。
- 涉及文件：`lib/prompts.ts`、视觉规格和任务 recipe。
- 影响范围：手机、工具及所有依赖关键词推导的剧情道具。
- 建议方案：优先使用结构化 `propId/type`，关键词只作为旧数据兜底；未识别的显式道具阻断任务或给出可见警告。
- 验收标准：标准同义词、中文剧情和结构化视觉规格都能生成正确 `propInteraction`；明确道具场景的 required 命中率 100%。
- 解决 Agent 修改：已接入结构化 `interaction.propId`，并补充中文手机、设备和工具同义词，使显式道具始终建立 required 契约。
- 解决 Agent 测试：新增结构化 propId 与中文动作测试；node 语法检查和台账检查通过；pnpm 测试受临时文件 EPERM 阻断。
- 残余风险：结构化未知道具暂使用通用形状，需真实 recipe 复核。
- 诊断 Agent 复核证据：2026-08-09 Studio 测试 37 项中本项新增测试失败；结构化 `parcel_notification_device` 因包含 `device` 被关键词分支归一为 `smartphone`，未保留结构化 propId。
- 诊断 Agent 复核结论：2026-08-09 独立复核通过。结构化 propId 保持原值，中文与常见同义词均建立 required 契约；`pnpm test` 37/37 通过，标记 verified。
- 后续处理：关闭；后续若出现明确道具漏识别，以新复现证据建立回归问题。

## ISSUE-PROP-002 道具修复失败后仍可能进入候选

- 优先级：P0
- 状态：verified
- 用户报告：工具缺失的图片仍被生成并展示。
- 已确认事实：当前 worker 已在 `postprocessWarnings` 非空时将草稿标记为 `draft_blocked`，正式阶段不写入候选；但 job 378 的修复请求返回成功、warning 为空，成图仍是横向手机且没有可见通知内容，语义失败未被识别。
- 高概率原因：当前 warning 不是质量阻断条件，系统将“请求完成”视为可写入候选，而未验证道具是否实际存在。
- 未验证假设：失败图片可能没有 worker 异常，而是修复请求成功但模型未执行；需要对应日志和图片才能区分。
- 反证或冲突：保留上一阶段图片能避免整个任务丢失，这一降级策略本身合理；问题在于候选缺少“不合格/待复核”状态。
- 复现步骤：让道具修复请求失败或返回无目标道具图片，检查任务状态、warning 和候选写入。
- 涉及文件：`scripts/sd-worker.mjs`、候选状态和任务展示逻辑。
- 影响范围：所有局部修复失败或视觉执行失败的道具交互镜头。
- 建议方案：P0 修复失败时标记 `quality_review_required` 或阻断正式候选；保存基础图供诊断但不得自动视为合格成品。
- 验收标准：道具修复异常不会产生“正常完成”的正式候选；UI/recipe 明确展示失败原因；人工允许时才能保留为参考候选。
- 解决 Agent 修改：worker 将技术完整性与 `semanticQa` 分离，语义要求使用 `*_review_required` 标签而不是伪造失败；草稿进入可达人工审批，未写入 `semanticApproval` 的正式任务仍被阻断。
- 解决 Agent 测试：worker 语法检查、TypeScript 检查和台账检查通过；新增道具契约和近景骨架测试。真实 SD HTTP 成功但语义失败仍需图片复核。
- 残余风险：当前 semanticQa 是人工复核门，不是自动视觉模型，不能自动判断手机方向或屏幕内容。
- 诊断 Agent 复核证据：job 378 postprocessWarnings=[]、pixelQa=manual_required，任务进入 awaiting_draft_approval；成图手机横向贴在裙前且人物未阅读。
- 诊断 Agent 复核结论：2026-08-09 代码逻辑验收通过，未做真实图验证。技术修复异常会产生 postprocessWarnings 并阻断；请求成功但语义待确认的草稿只能进入人工审批，正式阶段缺少 semanticApproval 时阻断候选写入；人工明确批准后才可继续，标记 verified。
- 后续处理：关闭；残余风险是人工可能误判，未来接入视觉检测器后可升级为自动语义阻断。

## ISSUE-IDENTITY-001 身份精修可能破坏低头或侧脸动作

- 优先级：P1
- 状态：verified
- 用户报告：人物最终又看向镜头。
- 已确认事实：身份精修统一追加 `both eyes fully visible, unobstructed face`，同时使用标准正脸身份参考和较高 ControlNet 权重。
- 高概率原因：这些条件可能与低头看手机、侧脸对视和合理遮挡竞争，将脸部拉向正面身份照姿态。
- 未验证假设：该条件是否为持续看镜头的主因，需要同 seed、相同初始图的开关对照实验。
- 反证或冲突：身份精修负面词在未明确允许镜头视线时会排除 looking at viewer，因此不能仅凭 `both eyes fully visible` 断言它必然造成镜头凝视。
- 复现步骤：同一初始图分别启用和禁用正脸措辞/身份修复，比较头部 yaw/pitch 和瞳孔方向。
- 涉及文件：`scripts/sd-worker.mjs`。
- 影响范围：低头、侧脸、道具遮挡和多人对视镜头。
- 建议方案：按姿态选择身份精修模板；低头/侧脸禁止强制双眼完全可见；身份参考只约束身份特征，不覆盖头部方向。
- 验收标准：身份相似度保持可接受，同时低头/侧脸方向不被明显拉正；四组同 seed 对照中视线动作保留率至少 75%。
- 解决 Agent 修改：身份精修已按非镜头视线保留头部角度、禁止正面凝视、降低 ControlNet 权重和重绘强度。
- 解决 Agent 测试：worker node --check 通过；手机阅读契约覆盖镜头外视线约束；真实 SD 对照待复核。
- 残余风险：未接入 SD 后端，无法证明最终成图姿态保持率。
- 诊断 Agent 复核证据：worker 语法检查通过，非镜头视线分支已降低 ControlNet 权重和重绘强度；没有新的 SD 成图或四组同 seed 对照。
- 诊断 Agent 复核结论：代码层缓解已存在，但未达到成图验收标准，标记 partially_fixed。
- 诊断 Agent 最终复核：2026-08-09 再次独立复核，非镜头视线分支的权重、降噪和姿态保护逻辑已落实，但没有自动测试验证分支选择、请求参数与正脸分支互不回归，调整为 partially_fixed。
- 诊断 Agent 本轮复核：`preservesOffCameraGaze` 仍内嵌在 worker 主流程，未形成可单测逻辑；没有验证镜头视线与非镜头视线两类权重、降噪和提示词分支，保持 partially_fixed。
- 解决 Agent 本轮验收：程序逻辑已闭环：身份精修按 off-camera/camera-gaze 分支生成不同 prompt、negative_prompt、ControlNet weight 和 denoising_strength；身份参考仅作用于脸部 mask。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：非镜头视线与镜头视线的分支选择、重绘强度和权重策略已有纯函数测试；worker 的身份修复 mask 仅覆盖人物脸部，并在非镜头分支明确禁止把脸转向观众。job 390 的视觉失败保留为模型执行率风险。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：诊断 Agent 复核分支请求体；模型随机性和实际视觉执行率保留为运行风险。

## ISSUE-POSE-001 近景 OpenPose 仍通过越界骨骼诱导近全身站姿

- 优先级：P0
- 状态：verified
- 用户报告：job 378 设定为坐在沙发上的 close shot，成图却是站立的近全身人物，腿部进入画面。
- 已确认事实：近景模板把髋、膝、脚设置到 y=1.06/1.24/1.42，但 `renderOpenPoseSvg` 仍无条件绘制 neck-to-hip 和腿部连线；越界端点不会取消连接线，线段仍从颈部贯穿画布下沿。job 378 的 SVG 明确包含颈部到 y=542.72 的长线。
- 高概率原因：解决方案把关节移出画布，却没有让渲染器跳过越界关节及其 limb，ControlNet 仍接收到长躯干/下肢方向信息，并压过 close shot 和 seated 文本。
- 未验证假设：同 seed 下完全删除髋腿 limb 是否能稳定恢复胸像坐姿，需要 A/B 生成验证。
- 反证或冲突：提示词和负面词已明确 chest-up、no legs、not standing；因此本次失败不是缺少景别文本。
- 复现步骤：读取 job 378 pose SVG，确认 `[1,8]`、`[1,11]` 等线从颈部延伸到画布外；用当前模板生成 close seated shot，检查人物是否仍站立或出现腿部。
- 涉及文件：`lib/prompts.ts` 的 `renderOpenPoseSvg`、`buildSingleActionPoseSvg`，job 378 recipe。
- 影响范围：所有启用单人动作 OpenPose 的 close shot / medium close-up。
- 建议方案：支持不可见/禁用关节点；渲染 limb 前检查两端是否在画布有效范围；为胸像建立真正的 upper-body skeleton，不能用越界完整骨架代替；增加渲染 SVG 级测试和同 seed 成图测试。
- 验收标准：close/medium-close 的所有动作族均不得把髋、膝、脚或对应 limb 作为画布内控制信号发送；upper-body 与卧姿等特殊动作必须同时服从结构化裁切契约。通过 SVG 关节点、limb 和 recipe.poseControl 进行程序逻辑验收，不生成图片。
- 解决 Agent 修改：`renderOpenPoseSvg` 现在只绘制画布内两端均有效的 limb；近景越界髋、膝、脚点不会再通过颈髋或下肢长线传给 ControlNet。
- 解决 Agent 测试：新增近景坐姿 SVG 测试，确认不含越界颈髋线；worker 语法检查和台账检查通过。SD 同 seed 四张成图仍待复核。
- 残余风险：模型可能仍受其他姿态条件影响，需真实成图验证坐姿与裁切。
- 诊断 Agent 复核证据：job 378 prompt/negative 均要求近景且排除腿和站姿；实际图仍显示至膝部并呈站立姿态，pose SVG 存在穿过画布的颈髋长线。
- 诊断 Agent 复核结论：已确认代码根因，open。
- 诊断 Agent 最终复核：2026-08-09 根据用户明确授权，缺少连续四张成图验证不再作为验收阻断；越界 limb 已过滤且对应 Studio 测试通过，标记 verified。
- 诊断 Agent 回归复核（2026-08-09）：`ISSUE-POSE-004` 新增的 lie/recline 专用分支绕过了 `uprightLegs` 的近景越界策略。episode 35 的 shot 1278 为 `close-up`，当前编译出的 `single_action_lie_v1` 将 6 个髋/膝/脚点全部放在画布内，SVG 绘制 17 条完整 limb；对照 shot 1255 的 close seated，6 个下肢点均在画布外且 SVG 仅保留 11 条上身 limb。结构化 prompt 仍要求严格近景裁切，因此 ControlNet 与 framing 契约再次确定性冲突，状态改为 `regression`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修改（2026-08-09）：新增统一 `derivePoseFramingMode`，所有单人动作先生成完整动作拓扑，再独立应用景别裁切；close/medium-close/medium/waist-up 等上身景别统一把 8-13 号髋、膝、脚关节移出有效画布并由 limb 过滤器删除对应连线。lie/recline 不再拥有绕过裁切的特殊路径。`poseControl` 同步记录 `framingMode` 与 `hiddenJointIndices`，便于 recipe 和 UI 审计。
- 解决 Agent 本轮测试（2026-08-09）：11 个动作族乘 3 种上身景别的 33 组纯逻辑矩阵均确认 6 个下肢点不可见且 SVG 固定保留 11 条上身 limb；episode 35 全部 24 格复编译无 framing error，shot 1278 close-up lie 为 `upper_body`、0 个画内下肢点、11 条 limb，shot 1277 wide moving 仍为 `full_body`、6 个画内下肢点、17 条 limb。TypeScript 无增量类型检查、Worker 8 项逻辑测试和 Worker 语法检查通过；完整 `pnpm test` 被本机 `tsx` 的 `uv_os_get_passwd/ENOMEM` 环境故障阻断，`pnpm build` 180 秒超时且仅输出 Next.js 启动横幅。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：独立调用当前 `buildPoseControlV2` 复核 close-up lie 与 wide moving：前者 `framingMode=upper_body`、`hiddenJointIndices=[8..13]`、画内下肢点 0、SVG limb 11；后者 `framingMode=full_body`、画内下肢点 6、SVG limb 17。统一 `applyFraming` 位于所有动作拓扑之后，lie/recline 不再存在绕过分支。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：待诊断 Agent 按程序逻辑独立复核；模型随机性和实际视觉执行率仅作为产品运行风险。

## ISSUE-QA-001 Pixel QA 仅验证文件有效性，不能阻断语义 P0

- 优先级：P0
- 状态：verified
- 用户报告：job 378 手机方向、坐姿和视线均错误，但系统仍进入“等待人工视觉质检”。
- 已确认事实：当前 pixelQa 只读取 Sharp metadata、检查尺寸是否低于 256px、文件是否小于 20KB；它明确写入 semantic checks require visual review，不检查人物动作、视线、表情、道具、身份、服装或景别。
- 高概率原因：质量门把“文件可解码”命名为 pixel QA，HTTP 成功且文件有效时即允许进入 awaiting_draft_approval；没有把结构化视觉规格与成图进行语义比较。
- 未验证假设：现有运行环境可接入哪种本地/远程视觉模型，需要由解决 Agent评估部署条件。
- 反证或冲突：人工确认可以防止本草稿自动进入成品，但不满足项目决策中“P0 质量问题必须阻断”的自动门禁要求，也无法保护无人值守批量生成。
- 复现步骤：检查 job 378 pixelQa=manual_required、blockers=[]；对照成图与 visualSpec 的 seated、looking at phone、portrait smartphone、notification visible 等事实。
- 涉及文件：`scripts/sd-worker.mjs`、`lib/quality-gate.ts`、草稿批准接口和任务 UI。
- 影响范围：全部生成任务，尤其道具交互、多人、身份与服装一致性镜头。
- 建议方案：把文件完整性检查改名 technicalQa；新增真正的 semanticQa，输入图片和结构化可见事实，输出 count/pose/gaze/prop/identity/outfit/framing 标签；P0 自动进入 draft_blocked，无法检测时必须明确保持人工必审且禁止批量自动批准。
- 验收标准：job 378 类型图片至少命中 gaze_failed、interaction_failed、anatomy/pose_failed、framing_failed 中的对应标签，并禁止批准为成品；检测结果持久化到 recipe/数据库/UI。
- 解决 Agent 修改：worker 新增可持久化 `semanticQa`，记录结构化语义标签、人工复核提示，以及未配置视觉检测器时禁止批量自动批准的警告。
- 解决 Agent 测试：worker node --check 与台账检查通过；pnpm 测试受依赖状态检查临时文件 EPERM 阻断。
- 残余风险：`semanticQa` 不是视觉模型检测器；只能保证未经人工批准的语义复核不会进入正式成品。
- 诊断 Agent 复核证据：job 378 pixelQa 仅记录 512×512 和文件有效，未发现任何画面语义错误。
- 诊断 Agent 复核结论：2026-08-09 再次复核仍为 partially_fixed。semanticQa 已持久化并接入人工审批凭证，但当前标签来自 recipe 的“待检查要求”，没有读取图片像素，无法让 job 378 自动命中 gaze/interaction/pose/framing failed，未达到本项验收标准。
- 诊断 Agent 新增证据：job 389 的 visualSpec/propInteraction 明确要求双手竖持手机、低头看通知、胸像近景；成图没有手机、双手放在膝上、人物直视镜头且显示腿部，但 semanticQa 仅记录 interaction/gaze/framing/pose_review_required，blockers 为空，仍无法产出具体 failed 标签。
- 诊断 Agent 本轮复核：worker 仍只依据 recipe 生成 `*_review_required`，没有图片像素输入、人工结构化失败结果或 `*_failed` 持久化路径；本轮无实质修复，保持 partially_fixed。
- 解决 Agent 本轮验收：程序逻辑已闭环：技术 QA 与 semantic QA 分离；语义要求只写 `*_review_required`，不伪造像素失败；草稿进入人工审核；人工批准写入 `semanticApproval`；正式 worker 无批准凭证时阻断候选写入，批量流程不能绕过。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：按最新工作区规则将旧验收标准改写为等价程序逻辑标准：技术 QA 与语义人工复核必须分离，未配置像素语义检测器时不得伪造 `*_failed`，草稿必须进入人工必审，正式任务缺少 `semanticApproval` 时必须阻断。`semanticReviewLabels` 测试确认只生成 `*_review_required`；job 390 当前停在 `awaiting_draft_approval`，未写入正式候选。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：诊断 Agent 复核批准凭证跨 API、数据库和最终 recipe 的传递；模型随机性和实际视觉执行率保留为运行风险。

## ISSUE-BUILD-001 结构化道具契约修改导致 TypeScript 编译失败

- 优先级：P0
- 状态：verified
- 用户报告：诊断 Agent 在修复复核阶段发现当前修改版无法通过 TypeScript 编译。
- 已确认事实：运行 `tsc --noEmit` 报 `TS2339`；`lib/prompts.ts` 的结构化道具兜底分支读取 `plannedInteraction?.gazeTarget`，但联合类型中的 interaction 对象没有该字段。
- 高概率原因：实现把角色视觉规格字段误当成 interaction 字段使用，修改时没有同步扩展/收窄 TypeScript 类型。
- 未验证假设：修正该字段来源后是否还存在其他构建错误，需要重新执行完整类型检查和生产构建。
- 反证或冲突：`node --check scripts/sd-worker.mjs` 通过只能证明 worker JavaScript 语法有效，不能覆盖 TypeScript 应用代码。
- 复现步骤：在项目根目录运行 `tsc --noEmit`，观察 `lib/prompts.ts(132,223)` 的 `gazeTarget` 属性错误。
- 涉及文件：`lib/prompts.ts`，以及视觉规格/interaction 的类型定义。
- 影响范围：开发类型检查、CI、生产构建和新版本发布。
- 建议方案：从角色视觉规格的 `planned.gazeTarget` 读取视线目标，或在业务确实需要时统一扩展 interaction schema、规范化逻辑和类型；补充结构化 propId 分支的类型测试。
- 验收标准：`tsc --noEmit`、Studio 测试和生产构建全部通过，结构化未知 propId 仍能生成 required interaction contract。
- 解决 Agent 修改：结构化道具兜底改为读取角色视觉规格的 `planned.gazeTarget`，不再读取 interaction 联合类型不存在的字段。
- 解决 Agent 测试：worker 语法检查、台账检查通过；完整 TypeScript/生产构建待依赖环境允许后复核。
- 残余风险：pnpm 依赖状态检查当前因临时文件 `EPERM` 阻断，尚未完成完整构建。
- 诊断 Agent 复核证据：2026-08-09 本地类型检查稳定报告 `Property 'gazeTarget' does not exist`。
- 诊断 Agent 复核结论：2026-08-09 独立复核通过。`tsc --noEmit --incremental false`、Studio 测试 37/37 和 `pnpm build` 全部通过，结构化未知 propId 测试同时通过，标记 verified。
- 后续处理：关闭；构建或结构化契约再次失败时按 regression 重新开启。

## ISSUE-QA-002 语义门禁把待检查要求直接标成失败并造成草稿死锁

- 优先级：P0
- 状态：verified
- 用户报告：诊断复核“问题是否都已解决”时发现新语义门禁可能影响正常生成。
- 已确认事实：worker 仅依据 recipe 中存在交互、视线、近景或 pose 要求就写入 `interaction_failed`、`gaze_failed`、`framing_failed`、`pose_failed`，没有读取图片像素；这些标签使 `semanticQa.status=blocked`，草稿固定进入 `draft_blocked`。人工批准逻辑只接受 `awaiting_draft_approval`，因此 `semanticApproval` 无法从正常 UI 路径产生。
- 高概率原因：实现混淆了“需要检查的项目”和“已经检测失败的项目”，并把保守阻断接入了一个没有人工解锁入口的状态机。
- 未验证假设：无交互、非近景镜头可能仍可进入审批，但不能覆盖主要漫画镜头流程。
- 反证或冲突：正式 worker 支持 `recipe.semanticApproval`，但当前草稿状态阻断使该字段在正常批准流程中不可达。
- 复现步骤：生成任意 close/medium 或包含 propInteraction 的草稿；检查 semanticQa labels、job 状态和批准接口前置状态。
- 涉及文件：`scripts/sd-worker.mjs`、`lib/db.ts`、草稿批准 API/UI。
- 影响范围：手机、阅读、工具操作以及多数近景/中景任务；可能导致草稿生成后无法批准，阻断正常工作流。
- 建议方案：把 `review_required` 与 `*_failed` 分开；只有真实视觉检测或人工复核失败才能写 failed；为人工必审状态提供可达的批准/拒绝流程，并让正式候选只接受明确批准证据。
- 验收标准：合格的近景交互草稿可以进入人工审批；异常图被拒绝；未配置视觉检测器时不会伪造失败标签；批准后正式任务可正常排队，未批准时不能进入正式候选。
- 解决 Agent 修改：语义要求改为 `interaction_review_required`、`gaze_review_required`、`framing_review_required`、`pose_review_required`；`semanticQa.blockers` 保持为空，草稿进入 `awaiting_draft_approval`，正式任务只有草稿批准写入的 `semanticApproval` 凭证才能继续。
- 解决 Agent 测试：完整 `pnpm test` 已重新运行；当前仅剩结构化 propId 测试回归待修复后复跑；TypeScript 直接检查通过。
- 残余风险：尚未通过真实 UI 点击路径验证批准凭证在数据库和最终 recipe 中的完整传递。
- 诊断 Agent 复核证据：`scripts/sd-worker.mjs` 依据 contracts/camera/pose 直接生成 failed labels 并在 draftStatus 中阻断；`lib/db.ts` 的批准函数要求 job 已是 awaiting_draft_approval。
- 诊断 Agent 复核结论：2026-08-09 代码逻辑验收通过，未做真实 UI 点击验证。review_required 与 failed 已分离，manual_required 草稿可进入 awaiting_draft_approval；API 强制 visualReviewConfirmed，批准后写入 semanticApproval，正式 worker 无凭证则阻断，原草稿死锁已消除，标记 verified。
- 后续处理：关闭；建议后续补充 API 级批准/拒绝集成测试，降低状态机回归风险。

## ISSUE-OUTFIT-001 近景服装资产被排除但 recipe 仍显示已绑定

- 优先级：P1
- 状态：verified
- 来源问题：用户提交 job 389 效果图后诊断发现；与 ISSUE-QA-001 的服装语义检测缺失相关，但根因位于服装条件输入链路。
- 用户报告：人物服装与镜头规定的奶黄色上衣、粉色中裙不一致，出现白色 T 恤、深色短裙及异常长裙/毯状下装。
- 已确认事实：job 389 的 visualSpec、characterLooks 和 characterRegions 均绑定 `XF-CASUAL-01`，提示词也写入 cream-yellow top / soft pink midi skirt；但最终 `recipe.references` 与 `finalReferences` 只有 identity，没有 outfit。`app/api/studio/route.ts` 仅在远景/全景且资产带 isolated-garment 标签时才把服装参考加入 ControlNet；近景/中景一律排除。同时 generationSpec.assetBindings 仍列出 outfit，adapterStatus.outfit 只表示模型文件可用而非本任务实际应用，造成可追溯信息与实际控制单元不一致。
- 高概率原因：为避免带人脸的服装参考污染身份和构图，代码把安全限制扩大成了按景别全量禁用；没有为近景建立服装区域 mask、裁剪后的服装参考或明确的未应用状态，只剩文字提示，身份参考中的原服装偏置会覆盖选定服装。
- 未验证假设：当前 `XF-CASUAL-01` 原图是否能通过自动裁剪/去脸后安全参与 IP-Adapter，需要解决 Agent 核对资产内容和现有预处理能力。
- 反证或冲突：质量警告确实写明“仅使用结构化文字”，因此不是完全静默；但 assetBindings 和 adapterStatus 仍容易让调用方误认为服装已实际受控，且警告没有进入服装一致性阻断。
- 复现步骤：对绑定已确认服装资产的 close/medium 镜头创建 SD 草稿；检查 recipe 中 generationSpec.assetBindings 含 outfit，而 references/finalReferences 不含 outfit，adapterStatus.outfit 仍显示适配器名称。
- 涉及文件：`app/api/studio/route.ts`、`lib/prompts.ts`、recipe 的 references/assetBindings/adapterStatus/qualityGate。
- 影响范围：所有近景和中景人物镜头，尤其身份参考服装与当前剧情服装不同的换装场景。
- 建议方案：把“资产已选择”“适配器可用”“参考实际应用”拆成独立状态；为近景/中景提供安全服装裁剪或 torso 区域 conditioning。无法安全应用时明确标记 outfit conditioning 为 text_only/manual_required，并让服装一致性进入人工质检清单，不能仅保留误导性的已绑定状态。
- 验收标准：close、medium、wide 三类镜头及 isolated/non-isolated 两类服装资产均有自动测试；recipe 能准确区分 selected、text_only、control_applied；实际启用时 references 与 ControlNet 单元一致，未启用时 UI/qualityGate 明确要求服装人工复核，不得显示为已应用。
- 解决 Agent 修改：统一由 `classifyOutfitConditioning` 的单一决策结果构造 `outfitReferences`、`finalReferences`、`qualityGate.outfitConditioning` 和 `adapterStatus.outfit`；只有 wide/full、isolated garment 且 adapter 文件有效时 `controlApplied=true` 并发送引用。adapter 不可用时状态为 `text_only`、引用为空，worker 不会生成服装 ControlNet 单元，UI/recipe 保留人工服装复核警告。
- 解决 Agent 测试：Studio 测试覆盖 close/medium/wide × isolated/non-isolated 及 wide+isolated+adapter unavailable，确认不可用时 `controlApplied=false` 且引用筛选为空；`pnpm test` 41/41、`npx tsc --noEmit`、`pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：实际服装视觉还原率仍受 checkpoint、参考资产质量及身份/服装权重竞争影响；close/medium 和非 isolated 资产仍按设计降级为文字加人工复核。
- 诊断 Agent 复核证据：job 389 payload 中 outfit asset binding 存在，references/finalReferences 仅包含 identity；route.ts 的 `framingUsesOutfitReference` 仅匹配远景/全景；新图服装与结构化规格明显不一致。
- 诊断 Agent 复核结论：可复现的程序数据流缺口，标记 open；未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮复核结论：状态可追溯性已部分修复，recipe 现在区分 `control_applied` 与 `text_only`，adapterStatus 不再把近景文字兜底显示成已应用；但没有 close/medium/wide 与 isolated/non-isolated 自动测试，且 `outfitReferenceSafety` 仅按景别赋值，wide 非隔离资产未应用时仍可能显示 `wide_or_full`，不满足验收标准，标记 partially_fixed。程序逻辑复核，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮复核（2026-08-09）：最新效果图显示服装一致性仍存在运行层风险，但按项目规则不以单张成图关闭问题。当前 `route.ts` 仍仅允许“远景/全景 + 去人脸纯服装标签”进入 `references/finalReferences`；close/medium 或 wide 非隔离资产会进入 `text_only`，并写入人工复核警告。现有测试未覆盖 close/medium/wide × isolated/non-isolated 的六类组合，也未断言 `references` 与 `outfitConditioning.status` 全组合一致，故程序逻辑验收仍不完整，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：六类景别/isolated 组合测试已补齐，`status` 的纯函数判定正确；但 `app/api/studio/route.ts` 在构造 `outfitReferences` 时只检查 wide/full 与 isolated 标签，没有检查 `outfitAdapter.validFile`。因此 wide/full + isolated + adapter 不可用时，`outfitConditioning.status` 记录为 `text_only`，recipe 的 `references/finalReferences` 却仍包含 outfit；`scripts/sd-worker.mjs` 会把该引用作为 enabled ControlNet 单元发送（module=`reference_only`、model=`None`），状态、引用和实际请求仍不一致，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核结论（2026-08-09）：`outfitPlans` 现在只调用一次 `classifyOutfitConditioning`，同一个 `controlApplied` 同时决定 `references/finalReferences` 是否含 outfit，并将同一 decision 写入 `qualityGate.outfitConditioning`；adapter 不可用时 `controlApplied=false`，worker 收不到 outfit 单元，`adapterStatus.outfit=text_only_manual_review`。close/medium/wide × isolated/non-isolated 与 adapter 不可用分支均有纯函数断言。原状态、引用和实际请求分裂已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：诊断 Agent 复核六类 conditioning 组合及 adapter 不可用分支，确认 recipe 引用、状态与 worker ControlNet 单元一致。

## ISSUE-FRAMING-001 单人镜头实际 prompt 与结构化 framing 编译结果分裂

- 优先级：P0
- 状态：verified
- 来源问题：用户提交 job 390 最新效果图后诊断发现；job 399 同镜头再次提供程序链路复现证据。与已关闭的 `ISSUE-POSE-001` 不同，本项根因位于最终 prompt 选择与编译架构。
- 用户报告：规格要求近景、胸像和不出现腿部，成图却显示到膝部，前景桌面占比过大。
- 已确认事实：job 390/399 的 `generationSpec.commonPrompt` 包含 `strict crop at the waist, no legs or full bodies`，OpenPose 也已过滤越界髋腿 limb；但实际 `recipe.prompt` 来自 `buildGenerationPrompt` 的单人分支，只包含 `upper body framing, recognizable environmental context in soft depth`，没有上述严格正向裁切契约。`app/api/studio/route.ts` 对单人镜头发送 `prompt`，同时把 `buildRegionalPrompt` 的另一份 `commonPrompt`、pose 与 repairPasses 写进 generationSpec；`reconcileFinalPrompt` 只修复手机动作契约，不校验 camera/framing 契约。两次任务均为 `promptSource=manual_override`，实际 prompt 与 recipe 中的结构化 framing 记录不一致。
- 高概率原因：单人与多人路径维护两套最终提示词编译结果，manual override 只接受动作级 reconcile；真正发送给 SD 的 prompt 可以丢失结构化相机/裁切不变量，而诊断字段仍显示另一套更严格的文本。
- 未验证假设：统一最终 prompt 后模型对近景裁切的实际执行率仍受 checkpoint 随机性影响；按工作区规则作为运行风险，不阻塞程序问题修复。
- 反证或冲突：负面词已包含 `visible legs`、`visible shoes`，说明不是完全没有景别约束；本项确认的是正向 framing 契约与实际请求分裂，而不是断言单一词条必然决定像素结果。
- 复现步骤：对 shot 1255 以单人 + close shot + manual_override 创建草稿；比较 `recipe.prompt`、`generationSpec.commonPrompt` 和 worker `requestPayload.prompt`，可见严格裁切只存在于未发送的 commonPrompt。structured/forced_structured 路径也应执行同样比较。
- 涉及文件：`lib/prompts.ts`、`app/api/studio/route.ts`、`app/page.tsx`、recipe 与 worker 请求体构造。
- 影响范围：所有单人近景/中近景，尤其用户编辑 prompt、自动修复 prompt 和忽略警告生成路径；也会使 recipe 审计结果误判实际发送内容。
- 建议方案：建立唯一的最终 prompt 编译/合并层，把 camera、framing、人物数、动作和道具契约作为不可丢失的不变量；manual override 只能编辑非契约部分或必须通过统一 reconcile。recipe 只记录实际发送的 canonical prompt，并单独记录 override diff。
- 验收标准：单人/多人 × structured/manual_override/auto_repaired × close/medium/wide 的程序测试覆盖实际请求 prompt；close/medium 的正负 framing 契约必须与结构化 camera 一致，冲突 override 被修复或 422 阻断；`recipe.prompt`、worker request prompt 与可追溯的 applied prompt 一致。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增唯一 canonical prompt 合并层，以 `buildRegionalPrompt` 的结构化 common/character prompt 作为单人和多人共同契约层；manual/auto override 仅作为 editorial layer 追加。针对诊断退回分支，canonical 层现在同时清理 editable override 与 Regional contractPrompt 内的冲突景别词，再独立注入 camera、framing、人数不变量；validation 除检查正确契约存在外，还会拒绝同一 applied prompt 中残留的全身/近景冲突。反向 wide/full 分支也显式清除并拒绝项目自身近景短语 `no legs or full bodies`，避免与 `complete figures visible` 共存。路由的 recipe、任务 payload、Regional Prompter 与 worker requestTrace 继续统一使用同一 `appliedPrompt`。
- 解决 Agent 测试：新增单人/多人 × structured/manual_override/auto_repaired × close/medium/wide 矩阵，以及被 `full body portrait`、`both feet fully visible` 污染的 Regional contract 精确反例；再新增 wide/full contract 被 `strict crop at the waist, no legs or full bodies` 污染的反向回归用例，确认两类冲突都从 contract 移除、validation 有效且 repairs 可追溯。`pnpm test` 44/44、worker 5/5、`npx tsc --noEmit`、`pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：修复程序链路后，checkpoint 对景别词的实际服从率仍有随机性；保留为产品运行风险，不作为程序逻辑验收阻断。
- 诊断 Agent 复核证据：job 390 和 job 399 均为 shot 1255、同一 close 视觉规格，actual recipe.prompt 缺严格正向裁切，而 generationSpec.commonPrompt 保留该契约；当前 route.ts 第 697 行的单人回退仍选择另一套 `prompt`。
- 诊断 Agent 复核结论：实际请求 prompt 与结构化 framing 记录存在可复现数据流分裂，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核结论（2026-08-09）：单人主路径已改为统一 `appliedPrompt`，recipe、任务 payload 和 worker `requestTrace.prompt` 的数据流闭合；negative override 也不再覆盖结构化景别负向契约。但多人路径仍允许 `regionalPromptOverride.commonPrompt/characterPrompts` 在 canonical 层之前直接替换 `regionalSpec`。`buildCanonicalGenerationPrompt` 只从普通 `promptOverride` 删除冲突景别词，且 validation 只检查正确契约是否存在，不检查同一 contractPrompt 内仍有 `full body portrait`、`both feet fully visible` 等冲突。针对性推导证明包含“medium close-up + strict crop + full body + feet visible”的 contract 仍返回 `validation.valid=true`，故 manual regional override 仍可污染实际 appliedPrompt，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：close/medium contract 内的 `full body portrait`、`both feet fully visible` 已能被清除，且 canonical 层会重新注入 camera/framing/count 不变量；原退回分支已修复。但反向 wide/full 分支仍漏掉 `no legs or full bodies` 这一项目自身生成过的近景短语：`stripConflictingFraming` 只移除 `strict crop at the waist`，保留 `no legs or full bodies`，wide contract 仍返回 `validation.valid=true`。针对性推导的最终 applied prompt 同时包含 `complete figures visible` 与 `no legs or full bodies`，仍是确定性冲突，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：`stripConflictingFraming` 的 wide/full 分支现已同时清除 `strict crop at the waist`、`no legs or full bodies` 与 chest/waist-up 冲突词，validation 也会拒绝这些短语残留；close/medium 反向清除全身词保持有效。定向纯函数推导覆盖 contract 与 editorial layer 双侧污染，close 与 wide 均返回 `validation.valid=true` 且最终 prompt 不再含反向景别词；`app/api/studio/route.ts` 继续让 recipe、任务 payload、Regional Prompter 和 worker requestTrace 共用同一 `appliedPrompt`。`node node_modules/typescript/bin/tsc --noEmit` 通过；`pnpm test` 因本机 `uv_os_get_passwd ENOMEM` 未能启动，不构成已复现代码失败。原确定性数据流缺陷已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：诊断 Agent 静态复核路由生成的 `appliedPrompt`、recipe/payload 与 worker `requestTrace.prompt` 完全一致，并抽查三类景别和三类 promptSource。

## ISSUE-VISUALSPEC-001 明确道具交互可被保存为 interaction null

- 优先级：P0
- 状态：verified
- 来源问题：用户提交 job 390 最新效果图后诊断发现；与 `ISSUE-PROP-001` 的关键词覆盖不同，本项根因位于视觉规划 schema 与验证层。
- 用户报告：画面中的手机虽出现，但没有形成清晰的双手阅读通知动作，人物仍像在摆拍。
- 已确认事实：job 390/399 的 visibleFacts 明确写有“坐在沙发上双手持 smartphone”“看向 phone screen”“屏幕显示 delivery notification”，角色 action 也写 `Looking at phone notification`，但已确认 visualSpec 保存为 `interaction:null`，且没有 `interactions` 关系。`app/api/visual-planning/route.ts` 给模型的 `requiredShape` 仍是旧的单数 `interaction:null`；`ShotVisualSpec`、normalize 和验证主路径已使用复数 `interactions`。`assertVisualShape` 不要求任一交互字段，`validateVisualIds` 只验证已经存在的 relations，不会拒绝显式道具动作缺少关系。
- 高概率原因：schema 示例、运行类型和验证规则处于新旧双轨；规划模型可以把 subject-action-target 只写成自由文本并省略结构化关系，后续再靠关键词推导 object、contact、orientation 和 gaze，未知道具或复杂多关系容易丢失。
- 未验证假设：DeepSeek 在更强的 schema 说明下是否总能生成完整 relation；应由结构校验和规范化兜底，不能依赖模型自觉。
- 反证或冲突：本例 smartphone 被关键词兜底成功建立了 `propInteraction.required=true`，所以 `ISSUE-PROP-001` 没有回归；但这不能证明视觉规格的数据流闭合，也不能覆盖未知道具、多人物或一个镜头多个交互。
- 复现步骤：读取 job 390/399 的 confirmed visualSpec；或向 `normalizeShotSpec` 输入含明确 prop visibleFacts/character action 但 `interaction:null` 的数据，再执行 `validateVisualIds`，当前不会产生 `interaction_failed`。
- 涉及文件：`app/api/visual-planning/route.ts`、`lib/visual-planning.ts`、`lib/types.ts`、`lib/prompts.ts`。
- 影响范围：所有道具操作、人物交接、多对象动作和未知道具；关系缺失时 pose、mask、ownership、gaze 与提示词编译会退回启发式文本匹配。
- 建议方案：requiredShape 与系统提示统一为复数 `interactions` 完整结构，保留单数仅用于旧数据迁移；显式 subject-action-target/hand-contact 场景必须生成 relation，验证层对缺失关系给出 P0，而无交互镜头允许空数组。
- 验收标准：显式手机、未知道具、人物交接和多关系场景均生成/规范化为完整 interactions；缺少 actor、target/prop、contactPoints 或必要 gaze 时验证阻断；纯静态无交互场景不误报；legacy 单数数据可无损迁移。程序逻辑验收，不生成图片。
- 解决 Agent 修改：视觉规划 requiredShape 与系统提示统一为复数 `interactions` 完整关系结构；`assertVisualShape` 要求新复数字段但继续接受旧单数数据迁移。针对诊断退回的 job 390 输入，推导不再把 `the current story focus` 等通用 actionTarget 固化为 propId；会综合 action、hands、gaze、visibleFacts 优先识别 smartphone 等已知道具，并为有效未知 actionTarget/动作短语生成稳定 slug。若仍无法得到 prop 或人物目标，关系会保留缺口并由 P0 验证阻断。Regional prompt 与道具契约优先消费 actor 对应的正确复数关系。
- 解决 Agent 测试：新增 job 390 式“通用 actionTarget + phone action/gaze/visibleFacts”精确反例，确认 `interactions[0].propId=smartphone` 且 `deriveInteractionContract.object=smartphone`；原有 smartphone、未知道具、双人交接、多关系、legacy、残缺关系阻断和静态镜头测试继续通过。`pnpm test` 43/43、worker 5/5、`npx tsc --noEmit`、`pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：规划模型仍可能输出语义含混关系；修复后应由结构验证明确阻断或要求人工修订，不能再静默降级为自由文本。
- 诊断 Agent 复核证据：job 390/399 confirmed visualSpec 的自由文本与 `interaction:null` 直接冲突；当前 requiredShape、assertVisualShape 与 validateVisualIds 代码允许该状态落库。
- 诊断 Agent 复核结论：视觉规划 schema、类型和验证主路径不一致，关键道具关系可在缺失时通过校验，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核结论（2026-08-09）：新规划 schema 已统一要求 `interactions[]`，旧单数可迁移，已提供但残缺的 relation 会被 P0 阻断，纯静态镜头也不会误报；这些主路径修复成立。但用原始 job 390 失败规格复核时，角色 `actionTarget` 仍是通用占位 `the current story focus`，而 smartphone 只存在于 action、gaze 和 visibleFacts。当前 inference 固定从 `actionTarget` 生成 propId，结果错误得到 `the_current_story_focus`，随后结构化 prop 会优先于关键词源，`deriveInteractionContract` 不再识别 smartphone。即旧问题的真实输入仍会形成错误关系而不是正确 smartphone relation，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：`inferInteractionProp` 现在识别并排除 `the current story focus` 等通用占位，综合 action、hands、gaze 与 visibleFacts 优先解析已知道具；用 job 390 原始失败输入重新推导得到 `interactions[0].propId=smartphone`，`deriveInteractionContract.object=smartphone` 且 `required=true`。复数 schema、legacy 单数迁移、残缺关系 P0 阻断、多关系与静态镜头不误报路径均保持闭合，原真实失败输入已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：诊断 Agent 复核规划模型新 schema、旧数据迁移、明确交互推导与静态镜头不误报，并核对 actor 对应关系进入提示词/recipe。

## ISSUE-PIPELINE-001 面部精修与视线修复使用不同定位并由后序 pass 覆盖身份控制

- 优先级：P1
- 状态：verified
- 来源问题：用户提交 job 390 最新效果图后的后处理架构审查；与已关闭的 `ISSUE-GAZE-002` 不同，本项针对 identity pass 与 gaze pass 之间的数据流一致性。
- 用户报告：人物仍直视镜头，整体身份表现偏模板化，未形成低头读手机的表演。
- 已确认事实：`scripts/sd-worker.mjs` 的 identity refinement 横坐标会使用 OpenPose nose.x，但纵坐标仍固定为 close=0.30/medium=0.27/other=0.23；job 390/399 的 pose nose.y 为 0.16。随后 gaze pass 改用 `gazeMaskCenter` 的 nose.x/nose.y，因此两个连续面部 pass 操作不同区域。gaze pass 在 identity pass 之后执行，denoising_strength=draft 0.36/final 0.28，却没有携带 identity IP-Adapter/ControlNet，只用文本 `consistent established face`，可能重写刚完成的身份细节。recipe 只保存 gaze debug mask，不保存 identity mask 和各 pass 的实际 ControlNet 摘要。
- 高概率原因：面部定位和身份/视线约束由两个独立实现维护，后序局部重绘没有继承前序身份 conditioner，后处理不是可组合的单一面部约束计划。
- 未验证假设：当前图片的具体身份偏差有多少由 gaze pass 造成，需要像素模型或 A/B 才能量化；本项确认的是请求链路中 identity 条件确定丢失和 mask 坐标确定分裂。
- 反证或冲突：当前 `identityRefinementPlan` 已降低非镜头视线分支的重绘强度和身份权重，`gazeMaskCenter` 也已正确使用 nose 坐标；这些修复没有覆盖 identity mask 的纵坐标及最终 gaze pass 的身份条件。
- 复现步骤：用任意 pose nose.y 明显不等于景别常量的单人镜头推导两次 mask；identity centerY 固定而 gaze centerY 使用 nose.y。检查 gazePayload，可见没有 `alwayson_scripts.ControlNet` 身份单元。
- 涉及文件：`scripts/sd-worker.mjs`、`scripts/sd-worker-logic.mjs`、recipe debugMasks 与请求体构造。
- 影响范围：所有需要身份精修后再做视线修复的镜头，尤其低头、抬头、俯拍、侧脸和人物不在模板默认高度的构图。
- 建议方案：抽取共享 face geometry/face refinement plan；优先合并身份与视线为同一面部 pass，或在 gaze pass 保留对应人物身份 conditioning；持久化每个 pass 的 mask 来源、控制单元、denoise 与顺序。
- 验收标准：pose nose.x/y 或明确 face region 同时驱动 identity/gaze mask，回退规则一致；最终修改脸部的请求仍包含对应人物身份条件；测试覆盖高/中/低脸位、无 pose 回退、镜头外视线和多人区域；recipe 可证明最终 pass 的身份与视线约束同时存在。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增共享 `faceRefinementPassPlan`，identity 与 gaze pass 均由同一人物 OpenPose nose.x/y 或同一 region/景别回退计算中心和 mask 尺寸；identity pass 不再使用固定 Y 常量。最终 gaze img2img 会按 characterId 选择对应 identity reference，并携带同一脸部 mask 的身份 ControlNet 单元。recipe 新增 identity/gaze 两类 `debugMasks`、顺序、denoise 和去除 base64 的 identityControl 摘要，能够证明最终 pass 同时存在身份与视线约束。
- 解决 Agent 测试：worker 纯逻辑测试覆盖高/中/低脸位、无 pose 的 region/景别回退、镜头外视线、多人 characterId 身份选择、identity/gaze 坐标一致和 final gaze 身份控制，5/5 通过；worker 语法、`npx tsc --noEmit`、Studio 41/41、`pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：即使身份与视线条件在最终 pass 中同时存在，模型对细微瞳孔方向和身份相似度的执行率仍受 checkpoint 与重绘强度影响；作为运行风险保留。
- 诊断 Agent 复核证据：job 390/399 pose nose=(0.38,0.16)，当前 identity centerY=0.30、gaze centerY=0.16；worker 的 gazePayload 无身份 ControlNet 单元且在 identity pass 之后覆盖同一脸部区域。
- 诊断 Agent 复核结论：两个连续面部 pass 使用不同纵向定位，且最终 gaze pass 确定未携带身份 conditioner，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 复核结论（2026-08-09）：identity 与 gaze 均调用 `faceRefinementPassPlan`，使用同一 pose nose.x/y 或 region/shot-size 回退；worker 按 characterId 选择身份引用，最终 gaze payload 确实写入带同一 gaze mask 的身份 ControlNet 单元。recipe 同时记录 identity/gaze 的顺序、中心、坐标来源、denoise 与不含 base64 的 identityControl 摘要。纯逻辑测试覆盖高/中/低脸位、无 pose 回退和多人身份选择，5/5 通过；原固定 centerY 与后序无身份控制路径均已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：诊断 Agent 复核 identity/gaze 两个实际 payload 的 mask 中心一致、最终 gaze ControlNet 身份单元存在，并核对 recipe pass 顺序与摘要。

## ISSUE-QA-003 草稿审批把单次按钮点击等同于全部语义质检通过

- 优先级：P0
- 状态：verified
- 来源问题：用户复核最新效果图并追查 job 400；与已关闭的 `ISSUE-QA-001`/`ISSUE-QA-002` 不同，本项不要求自动视觉检测，而是针对人工语义复核的确认粒度和审计数据。
- 用户报告：最新图在手机持握、阅读视线、近景裁切、剧情动作、服装和身份上均明显不合格，应在人工质检时直接拒绝；job 400 的 recipe 已包含对应语义契约，但 `postprocessWarnings=[]`。
- 已确认事实：job 400 的 `semanticQa.status=manual_required`，并列出 `interaction_review_required`、`gaze_review_required`、`framing_review_required`、`pose_review_required` 四项；保存的 512×512 草稿仍可见手机横放在膝前、人物看向观众、腿部进入近景和服装/发型漂移。该任务随后写入了 `semanticApproval.source=manual_draft_approval` 并进入 `completed`，所以不是绕过审批门，而是审批粒度不足导致误放行。UI 只提供“放弃并修改设定”和“确认构图并生成成品”两个按钮，点击批准时 `handleDraft` 自动发送 `visualReviewConfirmed:true`；界面没有展示 `semanticQa.labels`，也没有逐项 P0/P1 检查、失败选择或备注。服务端只验证该布尔值，并在数据库中记录整体批准时间。
- 高概率原因：人工质检门只有一个不可审计的总开关，且按钮文案只强调“构图”；系统没有要求审核者对交互、视线、景别、姿势、服装/身份分别作出结论，因此已知的 `manual_required` 项可以在没有逐项证据时被整体批准。
- 未验证假设：逐项检查表能把实际人工误放行率降低到什么程度尚无运行数据；未来视觉模型检测的准确率与成本也未评估。
- 反证或冲突：`postprocessWarnings=[]` 仅证明各技术请求没有抛错，不能证明像素语义执行成功；现有 worker 正确把语义要求标成 `manual_required`，本项不把它误记为自动检测失败。
- 复现步骤：打开任一包含 `semanticQa.labels` 的 `awaiting_draft_approval` 草稿；不填写任何逐项检查，直接点击“确认构图并生成成品”；请求会自动携带 `visualReviewConfirmed:true`，任务可写入只有 source/time 的整体 `semanticApproval` 并继续正式生成。
- 涉及文件：`app/page.tsx`、`app/api/studio/route.ts`、`lib/db.ts`、job recipe/审批记录。
- 影响范围：所有需要人工确认关键交互、视线、景别、姿势、服装和身份一致性的草稿；P0 失败可能因误点击或检查遗漏进入正式候选。
- 建议方案：把现有 `semanticQa.labels` 映射为可读的逐项检查表；所有 P0 必须明确选择“通过/失败”，任一失败只能走拒绝/重做。批准请求提交逐项 verdict、审核时间和可选备注，服务端验证 required labels 全部通过后才写 `semanticApproval`；recipe 持久化检查版本与逐项证据，而不是只存一个布尔值。检查项覆盖范围由 `ISSUE-QA-004` 独立处理。
- 验收标准：含 interaction/gaze/framing/pose 等 required labels 的草稿不能用单一布尔值批准；缺少任一 verdict 或任一 P0=fail 时 API 返回 422 且不得进入 final；全部通过时 recipe 保存逐项 verdict 与审核信息；无语义要求的简单镜头不误阻断。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增版本化 `semantic-review-v1` 审批契约。草稿 UI 读取 worker 保存的检查项，逐项显示优先级、期望值和通过/失败按钮；任一缺项或失败项都不能点击批准。API 不再接受 `visualReviewConfirmed:true` 这种总开关，而是按当前 job 的 required items 校验逐项 verdict；缺项、失败或未知项返回 422。`approveSdDraft` 再次执行同一校验并把版本、逐项 verdict、审核项快照、时间与备注写入 `recipe.semanticApproval`；旧 `semanticQa.labels` 会迁移为等价检查项，无检查项的简单旧任务保持兼容。final worker 也会验证 approval 是否覆盖全部 required items，避免绕过 API 的脏数据进入候选。
- 解决 Agent 测试：新增数据库审批集成用例，依次证明无 submission、P1/P0 fail、缺项均不能进入 final，全部 pass 后才写入完整审计证据；Studio 50/50、worker 8/8、`npx tsc --noEmit`、worker 语法检查和 `pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：人工仍可能主观误判；结构化检查表提高可追溯性但不能替代未来可选的视觉模型检测。
- 诊断 Agent 复核证据：job 400 保存草稿、recipe 的四项 `semanticQa.labels`、整体 `semanticApproval`，以及 UI/API/数据库审批代码共同证明点击即全量确认的数据流。
- 诊断 Agent 复核结论：代码、job 400 recipe 与保存草稿共同复现整体审批误放行路径，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：草稿 UI 已展示逐项 priority/label/expectation 与 pass/fail 控件，缺项或失败时批准按钮不可用；请求不再发送 `visualReviewConfirmed` 总开关。API 与 `approveSdDraft` 均调用同一 `validateSemanticReviewSubmission`，会拒绝空提交、缺项、失败项和未知项；通过后 recipe 持久化版本、逐项 verdict、检查项快照、审核时间与备注。final worker 再次用 `semanticApprovalCoversItems` 校验全部 required items，无法仅凭整体批准时间写入候选。以 job 400 当前 recipe 独立推导的 10 项检查验证：空/缺项/fail 均为 invalid，all-pass 才生成 final worker 可接受凭证；无检查项旧任务保持兼容。原整体布尔审批路径已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 实现可见、逐项、服务端强校验的人工语义审批契约，并补齐 approval 数据结构与迁移兼容。

## ISSUE-QA-004 semanticQa 只覆盖四类检查，遗漏身份、服装、手部与画面质量契约

- 优先级：P1
- 状态：verified
- 来源问题：用户逐项复核最新效果图后追问问题记录是否完整；与 `ISSUE-QA-003` 的审批交互和审计粒度不同，本项针对检查项生成器本身的覆盖范围。
- 用户报告：除交互、视线、景别和动作外，最新图还存在服装不一致、身份/发型漂移、手指粘连、手机与书本透视僵硬、前景占比过大和光照失衡；这些缺陷同样需要进入人工质检。
- 已确认事实：`semanticReviewLabels` 只接收 `hasInteraction`、`gazeMode`、`shotSize`、`poseRequired`，最多生成 `interaction_review_required`、`gaze_review_required`、`framing_review_required`、`pose_review_required` 四类标签。它不消费 identity reference、人物 invariants/hair、`qualityGate.outfitConditioning`、手部/道具表面要求、environment/composition/lighting 或对应 warnings。job 400 已记录 `outfit=text_only_manual_review` 和服装人工复核 warning，但 `semanticQa.labels` 没有 outfit、identity、anatomy、composition 或 lighting 检查项。
- 高概率原因：语义复核标签最初只为解决关键交互死锁而建立，没有从完整 generationSpec/qualityGate 推导审核契约；不同质量要求散落在 prompt、warnings 和 adapterStatus 中。
- 未验证假设：构图和光照需要拆成强制检查还是建议检查，尚需产品优先级定义；不影响“当前标签确定遗漏已有结构化 warning”的缺陷成立。
- 反证或冲突：`qualityGate.warnings` 和 `adapterStatus.outfit=text_only_manual_review` 已保留部分风险，因此不是信息完全不存在；缺陷是这些风险没有进入统一可执行的 semanticQa 检查集合。
- 复现步骤：读取 job 400 recipe，比较 `qualityGate.warnings`、`qualityGate.outfitConditioning`、identity/characterLooks 与 `semanticQa.labels`；可见已有服装文字兜底、身份和完整画面契约没有相应 review label。
- 涉及文件：`scripts/sd-worker-logic.mjs`、`scripts/sd-worker.mjs`、generationSpec.qualityGate、recipe.semanticQa 和草稿复核 UI。
- 影响范围：所有依赖文字服装控制、身份参考、复杂手部、道具表面内容、构图和光照的镜头；即使 `ISSUE-QA-003` 增加逐项确认，遗漏项仍不会被要求检查。
- 建议方案：从 generationSpec、qualityGate 和实际启用/降级的 conditioner 统一生成带优先级的 review contract，至少覆盖 identity/hair、outfit、hand anatomy/contact、prop appearance/screen content、interaction、gaze、framing/pose、composition/depth 和 lighting/exposure；只对当前镜头有要求的项目生成检查项，并区分 P0/P1/P2。
- 验收标准：job 400 式 close + text-only outfit + identity reference + phone read 场景能推导出 identity、outfit、hands/prop、interaction、gaze、framing/pose 复核项；含环境/光照契约时生成对应 P2 项；纯静态无相关要求的镜头不误报。recipe 保存检查项来源、优先级和期望值，供 `ISSUE-QA-003` 的逐项审批消费。程序逻辑验收，不生成图片。
- 解决 Agent 修改：以 `semanticReviewContract` 统一消费 generationSpec、visualSpec、repairPasses、qualityGate、references、adapterStatus、characterLooks 与 environment，生成带 `id/label/priority/required/expectation/sources` 的检查项。当前覆盖 identity/hair、outfit、hands/contact、prop appearance/surface、interaction、gaze、framing、pose、composition/depth、lighting/exposure；P0/P1/P2 来源和期望值随 recipe 持久化，供 QA-003 的 UI/API/worker 共用。只有当前输入存在对应结构化要求时才创建检查项，纯静态最小输入返回空集合。
- 解决 Agent 测试：worker 纯函数测试覆盖 job 400 式 close + text-only outfit + identity + phone read，断言十类检查、优先级、来源和期望值齐全；另覆盖纯静态空集合与逐项 approval 完整性。Studio 50/50、worker 8/8、`npx tsc --noEmit`、worker 语法检查和 `pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：身份相似度、手部自然度和光照好坏仍包含主观判断；结构化检查项只保证被审核和可追溯。
- 诊断 Agent 复核证据：当前 `semanticReviewLabels` 函数签名及返回值确定只覆盖四类；job 400 的 outfit/manual warning 与 semanticQa 标签集合存在可复现缺口。
- 诊断 Agent 复核结论：检查项生成数据流不完整，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：worker 已从实际 generationSpec、repairPasses、qualityGate、references、adapterStatus、characterLooks 与 environment 生成统一 `semantic-review-v1` 契约并持久化 items/labels/version。用 job 400 当前 recipe 独立推导得到 interaction、gaze、framing、pose、identity、outfit、hands、prop、composition、lighting 共 10 项，优先级分别覆盖 P0/P1/P2，且每项都含 expectation 与 sources；纯静态最小输入返回空集合，不误报。该集合被 QA-003 的 UI/API/数据库/final worker 共用，原四标签覆盖缺口已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 建立统一 review contract，并让 worker recipe 与人工审批复用同一检查项集合。

## ISSUE-POSE-002 动作风险与骨骼选择路由漏掉无道具剧情动作

- 优先级：P0
- 状态：verified
- 来源问题：用户追查“骨骼图为什么看起来只有两种”；与已关闭的 `ISSUE-POSE-001` 不同，本项针对动作识别、模板选择和动作几何表达能力，而不是近景越界 limb。
- 用户报告：走路、指向文字、揉眼睛、关台灯、躺下等剧情动作没有进入骨骼路径，人物持续像摆拍。
- 已确认事实：当前章节 episode 35 共 24 格，使用当前 `buildRegionalPrompt` 实际编译得到：`poseControl=null` 11 格、`single_action_standing_v1` 9 格、`single_action_seated_v1` 3 格、`single_full_body_v1` 1 格，moving 与 umbrella 均为 0。`deriveShotRiskProfile` 的 fullBody 规则不含 walk/enter，故 shot 1256 `Walking out of the door` 在 medium shot 下直接得到 `poseRequired=false`；部分无道具动作虽得到 `poseRequired=true`，但 selector 只在“已识别道具交互”或“wide/full 单人”时生成骨骼，因此 shot 1261 指向目录、1263 点头、1269 抬头回想、1276 关灯、1278 躺下均返回 `null`。揉眼睛等动作还会在风险识别层直接漏判。
- 高概率原因：风险识别与 pose selector 没有共享结构化 action plan；模板选择被 `interactionContracts[0].required` 绑在已知道具上，移动/自触摸/环境操作等无道具动作要么在风险层漏判，要么在选择层返回 null。模板几何同质化由 `ISSUE-POSE-004` 独立处理。
- 未验证假设：新增动作族数量与几何复杂度达到何种程度后才足以显著改善实际模型服从率，尚未通过运行数据量化；不作为当前程序缺陷确认依据。
- 反证或冲突：底层确实定义了 `single_action_moving_v1` 等 kind，job 400 也能命中 seated；问题不是“完全没有骨骼”，而是通用动作覆盖率与几何差异不足。
- 复现步骤：对 episode 35 的 24 个 shot 逐一调用 `deriveShotRiskProfile` 和 `buildRegionalPrompt`，统计 `poseControl.kind`；重点核对 shot 1256、1261、1273、1276、1278。另对同一角色编译 holding phone、walking、pointing、rubbing eyes、turning off lamp、lying down，比较是否为 null 及关节点差异。
- 涉及文件：`lib/prompts.ts` 的 `deriveShotRiskProfile`、`buildSingleActionPoseSvg`、`buildRegionalPrompt`，视觉规格 interactions/action 数据和 recipe.poseControl。
- 影响范围：无道具肢体动作、移动、姿态变化、自触摸、环境开关交互、卧姿及连续动作；会直接削弱剧情动作契约并放大“人物摆拍”倾向。
- 建议方案：建立结构化 action/pose plan，至少识别 locomotion、reach、point、self-touch、operate-environment、sit/recline/lie、turn/bend 等动作族；风险识别与 pose selector 消费同一结构，不能要求动作必须先命中道具，并记录 selector reason/source。
- 验收标准：walking/entering、pointing、rubbing eyes、turning off lamp、lying/reclining、seated prop interaction、standing reach、wide full-body 均走非 null 的对应 pose 路径；当前 24 格中所有被判定 poseRequired 的单人剧情动作不得因无已知道具而返回 null。测试比较 kind 与 selector reason，禁止按具体章节标题硬编码。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增共享 `PoseActionPlan`，从 visual interactions、人物动作/手部、shot action 与上下文推导 locomotion、point、self-touch、operate-environment、reach、sit、recline/lie、turn/bend、head-gesture、full-body 等动作族；当前结构化动作优先于描述中的后续状态。`deriveShotRiskProfile` 与 pose selector 共同消费该 plan，无道具动作不再依赖 `interaction.required` 才生成骨骼；pose recipe 记录 `actionFamily/source/selectorReason`。新增可复用 `scripts/audit-pose-coverage.ts` 检查 required 单人格的 null 漏洞。
- 解决 Agent 测试：通用动作矩阵覆盖 walking/entering、pointing、rubbing eyes、turning off lamp、lying/reclining、seated prop、standing reach 与 wide full-body，均得到非 null 对应 kind 和选择原因。正式数据库临时副本上的 episode 35 审计为 24 格、9 类 kind、`missingRequiredSinglePose=[]`，原 11 格 null 已归零；shot 1277 正确优先识别为 moving。Studio 50/50、`npx tsc --noEmit`、worker 语法检查和 `pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：OpenPose 对复杂遮挡和卧姿的实际执行率仍受 ControlNet/model 影响，作为运行风险保留。
- 诊断 Agent 复核证据：episode 35 的 24 格数据库输入经当前 `deriveShotRiskProfile`/`buildRegionalPrompt` 逐格纯函数编译，统计与用户报告完全一致；关键 null 分支和固定模板坐标可直接定位到 `lib/prompts.ts`。
- 诊断 Agent 复核结论：数据库章节数据与当前纯函数编译完全复现用户统计和关键 null 分支，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：`derivePoseActionPlan` 先按 visual interaction/character、shot action 与 camera 推导 locomotion、point、self-touch、environment operation、reach、sit/recline/lie、turn/bend、head gesture 和 full-body，`deriveShotRiskProfile` 与 `buildRegionalPrompt` 共用该 plan，单人动作不再以已知道具为进入骨骼路径的前置条件。对正式数据库 episode 35 的 24 格独立编译得到 9 类 kind，原 11 个 null 已归零，`missingRequiredSinglePose=[]`；shot 1256/1261/1273/1276/1278 分别命中 moving/point/self-touch/environment-operation/lie，并记录 actionFamily/source/selectorReason。路由根因已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 重构风险识别与 pose selection，保证不同动作族稳定进入对应骨骼路径。

## ISSUE-POSE-003 UI 将真实 OpenPose kind 折叠为二元类型标签

- 优先级：P2
- 状态：verified
- 来源问题：用户追查“骨骼图为什么看起来只有两种”；本项是 `ISSUE-POSE-002` 的界面可观测性关联问题。
- 用户报告：界面里的骨骼“类型”看起来始终只有“单人动作”或“多人交互”，无法判断实际使用了坐姿、站姿、移动还是全身模板。
- 已确认事实：`app/page.tsx` 的类型显示硬编码为 `people.length > 1 ? "多人交互" : "单人动作"`，没有读取 `poseControl.kind`。底层实际存在 `umbrella_handover_v1`、`single_full_body_v1`、`single_action_seated_v1`、`single_action_moving_v1`、`single_action_standing_v1`，但都被折叠为两类 UI 文案。
- 高概率原因：界面以人数代替真实 pose kind，生成配方的动作路由与调试信息没有向用户暴露。
- 未验证假设：更细的 UI 标签是否会改变最终成图质量尚未验证；本项只确认调试与审计信息被折叠。
- 反证或冲突：recipe 中保留了真实 `poseControl.kind`，因此数据没有丢失；缺陷位于展示层。
- 复现步骤：分别打开包含 seated、standing、full-body 或 handover 的 generationSpec；检查骨骼卡片“类型”，单人均显示“单人动作”，多人均显示“多人交互”。
- 涉及文件：`app/page.tsx` 与 pose kind 的显示映射。
- 影响范围：用户无法从 UI 判断模板是否选错，也无法区分动作覆盖不足和生成模型未执行，增加调试与人工复核成本。
- 建议方案：显示真实 kind 的可读映射，例如“单人·坐姿动作 / 单人·移动 / 单人·站姿交互 / 单人·全身 / 双人·雨伞交接”，并同时展示 `source` 与自动选择原因；未知 kind 回退显示原始值，不得重新折叠为人数二分类。
- 验收标准：所有现有 kind 在 UI 中有互不混淆的标签；未知 kind 可见；自动模板与用户覆盖来源可区分；展示值与 recipe.poseControl.kind 一致。
- 解决 Agent 修改：新增集中式 `poseDisplayDetails` 映射，骨骼卡片直接读取真实 `poseControl.kind`，显示坐姿、移动、站姿、指向、自触摸、环境操作、伸手、卧姿、斜靠、转身、俯身、头部动作、全身和双人交接等互不混淆标签；同时显示 `source` 与 `selectorReason`。用户上传覆盖显示“用户覆盖”，未知 kind/source 保留原始值，不再退回人数二分类。
- 解决 Agent 测试：新增现有主要 kind、source、selector reason 与未知值回退纯函数断言；Studio 50/50、`npx tsc --noEmit` 和 `pnpm build` 通过。
- 残余风险：即使展示真实 kind，模板本身的动作覆盖问题仍须由 `ISSUE-POSE-002` 解决。
- 诊断 Agent 复核证据：`app/page.tsx` 直接以 `people.length > 1` 生成二元文案，而 job recipe 与编译器保留多个不同 kind；展示与真实类型确定性不一致。
- 诊断 Agent 复核结论：硬编码二元表达式稳定复现，标记 `open`。
- 诊断 Agent 最终复核（2026-08-09）：骨骼卡片已删除按 people.length 生成的二元类型文案，改为调用集中式 `poseDisplayDetails(kind, source, selectorReason)`；映射覆盖当前全部 seated/moving/standing/point/self-touch/environment-operation/reach/lie/recline/turn/bend/head-gesture/full-body/umbrella kind，用户覆盖与自动来源可区分，未知 kind/source 保留原始值，选择原因也直接显示。展示值与 recipe.poseControl 数据流一致，标记 `verified`。
- 后续处理：解决 Agent 增加真实 kind/source/selector reason 映射与界面展示测试。
- 诊断 Agent 回归复核（2026-08-09）：UI 仍读取真实 `poseControl.kind`，但解决 `ISSUE-POSE-005` 时把 `kindForSingle` 的首个条件改成 `framingMode === "full_body"`，导致所有 wide/full 动作在读取 `primaryAction` 前统一返回 `single_full_body_v1`。独立矩阵中 wide walking 的 `primaryAction=locomotion`、wide seated 的 `primaryAction=seated`，recipe kind 均被折叠为 `single_full_body_v1`；Studio 测试中手机、工具、坐姿等 4 个动作 kind 断言因此回归失败。真实动作类型再次无法由 recipe/UI 区分，状态改为 `regression`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：当前 `kindForSingle` 只在 `primaryAction=static && framingMode=full_body` 时返回通用 `single_full_body_v1`，动作镜头先保留结构化 kind。独立 medium/wide 矩阵中 locomotion、seated、recline、lie、write_tool 分别保持 moving/seated/recline/lie/write_tool kind，且 framing 独立记录 upper/full body；`poseDisplayDetails` 的真实 kind/source/reason 测试通过。wide/full 动作折叠回归已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-POSE-004 单人动作骨骼几何高度同质化，不能表达不同动作拓扑

- 优先级：P0
- 状态：verified
- 来源问题：用户追查“骨骼图为什么看起来只有两种”；从原 `ISSUE-POSE-002` 拆分，便于独立修复和验收。本项假设动作已进入 pose 路径，专门检查输出几何是否真正匹配动作。
- 用户报告：即使底层存在 seated、moving、standing 等 kind，视觉上仍主要是坐姿和静态站姿，指向、揉眼、关灯、躺下等动作无法由当前骨骼表达。
- 已确认事实：`buildSingleActionPoseSvg` 只用关键词布尔值粗分 `seated`、`moving`、默认 `standing`；头、颈、肩、髋等主体坐标固定，seated 主要只改变 hipY，moving 主要只改变膝/脚横向偏移，手腕主要由 `interaction.objectCenter` 和 one/two-hand 模式决定。函数没有结构化 action kind、目标接触点、躯干朝向、头部俯仰、自触摸关节或卧姿坐标，因此相同道具中心下的大量动作会得到相同或近似骨骼。
- 高概率原因：骨骼构建器是“通用人体 + 道具手腕定位”模板，而非动作参数化求解器；kind 名称变化没有对应足够的关节拓扑差异。
- 未验证假设：需要多少动作模板或是否应改用外部姿势估计/姿势库才能达到产品效果，尚未评估；当前缺陷只确认现有关节数据无法表达已知动作差异。
- 反证或冲突：moving 会改变腿部横向偏移、seated 会改变髋部高度，因此不是逐像素完全相同；但这些差异不足以表达指向、自触摸、按开关、俯身和卧姿等关键动作。
- 复现步骤：为同一人物、相同画面区域和相同 objectCenter 分别调用 walking、standing reach、pointing、rubbing eyes、turning off lamp、lying/reclining 的 pose 构建；比较 kind 与 18 个关节点，可见当前函数最多落入三类且缺少对应手-脸、手-文字、手-开关、水平躯干等几何。
- 涉及文件：`lib/prompts.ts` 的 `buildSingleActionPoseSvg`、PosePoint/action plan 类型与 recipe.poseControl。
- 影响范围：所有非标准持物站姿/坐姿动作；即使 `ISSUE-POSE-002` 修复 null 路由，仍会因为几何同质化继续产生摆拍姿势。
- 建议方案：按结构化动作族建立参数化骨骼或可扩展姿势库，显式表达头/颈/躯干方向、双臂目标与接触点、支撑腿/移动相位、坐卧状态和遮挡；pose kind 应对应可验证的关键关节约束，而不是只反映关键词名称。
- 验收标准：point、self-touch、operate-environment、reach、walk/run、sit、recline/lie 等动作在关键关节上存在与语义一致的确定差异；例如揉眼手腕靠近对应眼部、关灯手腕到达灯开关、卧姿躯干近水平、行走双腿处于不同相位。相同区域/道具中心不能让这些动作退化成同一骨架。测试直接断言关键关节和 kind，禁止针对具体章节标题硬编码。程序逻辑验收，不生成图片。
- 解决 Agent 修改：`buildSingleActionPoseSvg` 改为消费结构化动作族的参数化骨骼构建器，而非 seated/moving/default 三分支。point 使用目标方向的伸展臂；self-touch 把手腕绑定到眼部；operate-environment 把手腕送至环境接触点；reach、walk/run、sit、recline、lie、turn、bend、head-gesture 分别调整手臂、头颈、肩、髋、支撑腿和躯干拓扑；近景下肢继续置于画布外并由现有 limb 过滤保护裁切。相同 region/objectCenter 不再使不同动作退化为同一骨架。
- 解决 Agent 测试：直接断言指向腕部离开躯干、自触摸腕部靠近鼻眼、环境操作腕部到达侧方目标、行走双腿处于相反相位、卧姿颈髋近水平且横向展开；另覆盖坐姿、斜靠、伸手、当前动作优先级和完整 episode 35 kind 分布。Studio 50/50、`npx tsc --noEmit`、差异检查和 `pnpm build` 通过。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：OpenPose/ControlNet 对复杂姿势的最终服从率仍受模型影响；作为运行风险保留。
- 诊断 Agent 复核证据：当前 `buildSingleActionPoseSvg` 的输入解析、kind 分支和 18 点坐标计算直接证明模板只含三类粗变化，缺少上述动作需要的几何自由度。
- 诊断 Agent 复核结论：动作几何表达能力存在确定性程序缺口，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：动作几何分化部分通过：point 的伸展腕、自触摸的腕到眼、environment operation 的侧方接触腕、moving 的反相腿、lie 的近水平颈髋，以及 seated/recline/reach/turn/bend/head-gesture 都有独立 kind 和确定性关键关节差异，不再只是三类粗模板。但 lie/recline 分支没有按 close/medium-close 裁切下肢；shot 1278 close-up 的 `single_action_lie_v1` 把 6 个髋/膝/脚点全部置于画布内并绘制完整下肢 limb，与 `strict crop at the waist, no legs or full bodies` 冲突，也使解决 Agent 所称“近景下肢继续置于画布外”不成立。动作拓扑修复有效但景别数据流未闭合，标记 `partially_fixed`，并同步将 `ISSUE-POSE-001` 标为 `regression`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修改（2026-08-09）：动作骨骼与景别控制改为正交两层：point/self-touch/operate-environment/reach/locomotion/seated/recline/lie/turn/bend/head-gesture 各自先构建完整语义拓扑，之后由同一 framing pass 决定关节可见性。进一步为 seated 增加水平大腿、垂直小腿拓扑，为 locomotion 保留反相腿，为 bend 保留非对称支撑腿；近景裁切只修改下肢可见性，不再抹平上身动作差异。
- 解决 Agent 本轮测试（2026-08-09）：关键关节断言覆盖指向伸臂、揉眼手腕到脸、环境操作侧方接触、远景行走反相腿、远景坐姿屈膝、远景卧姿水平躯干，以及同一卧姿在 close 与 wide 下的拓扑保持和可见性差异；33 组动作/上身景别矩阵、episode 35 的 9 种实际 kind/24 格覆盖均无缺失骨骼或景别错误。TypeScript 无增量类型检查、Worker 逻辑测试和语法检查通过；完整测试与构建的环境限制同 `ISSUE-POSE-001`。未启动 SD，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-09）：独立纯函数推导确认 point、self-touch、operate-environment、reach、locomotion、seated、lie 分别进入不同 kind；揉眼腕到鼻眼距离约 0.025，指向与伸手腕到达目标侧，行走双腿反相，坐姿为水平大腿/垂直小腿，卧姿颈髋横向展开。close 与 wide 仅改变下肢可见性，不抹平上身动作拓扑；所有抽查 `safety.valid=true`。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`。
- 后续处理：待诊断 Agent 独立复核动作关键关节和 framing 数据流；模型对复杂姿势的服从率保留为运行风险。

## ISSUE-GAZE-003 视线局部重绘裁剪区不包含剧情目标

- 优先级：P0
- 状态：verified
- 来源问题：用户提交最新 job 403 效果图并要求重新审查视线架构；与 `ISSUE-GAZE-001/002` 的文字约束、身份分支和脸部中心定位不同，本项针对视线目标的空间几何是否进入 gaze pass。
- 用户报告：人物仍直视镜头，没有低头看双手中的手机；最终图中手机实际落在前景桌面，脸部与目标相距很远。
- 已确认事实：job 403 的 face/gaze center 为 `(0.50,0.16)`，手机契约中心为 `(0.38,0.58)`。close gaze mask 半径约为 `rx=0.14W`、`ry=0.1792H`，worker 使用 `inpaint_full_res=true`、padding 48；512 图的高分辨率裁剪纵向最多约覆盖 y=0..222px，而手机中心约 y=297px，目标不在重绘裁剪上下文中。`gazePayload` 只写“看向 smartphone”的文字，没有把 face→target 向量、上下左右方向或目标坐标编码进请求。
- 高概率原因：系统正确定位了要改的脸，却没有把“看哪里”的空间信息传给局部模型；高分辨率脸部裁剪隔离了手机/工具/交互点，文本只能要求抽象凝视，无法确定瞳孔应朝画面中的哪一处收敛。
- 未验证假设：哪一种目标上下文编码对当前 checkpoint 的执行率最高尚未量化；这不影响现有请求确定缺少空间目标的结论。
- 反证或冲突：身份条件、禁止看镜头负向词和 nose 定位均已实际进入请求，因此不能再把本次失败归因于缺少 gaze 文本或 mask 横坐标错误。
- 复现步骤：读取 job 403 recipe，比较 `faceRefinementPasses[gaze].centerY=0.16`、`propInteraction.objectCenter.y=0.58` 与 worker 的 `radiusYRatio/padding/inpaint_full_res`；可确定目标位于裁剪外。对位于左下、右下、侧方的目标均可做同样几何推导。
- 涉及文件：`scripts/sd-worker-logic.mjs`、`scripts/sd-worker.mjs`、recipe 的 `propInteraction.objectCenter` 与 `faceRefinementPasses`。
- 影响范围：看手机、读书、工具接触点、人物对视、递接物品等所有目标不在脸部近邻的非镜头视线。
- 建议方案：新增结构化 `GazePlan`，由 face center 和 gaze target center 计算 yaw/pitch、八方向与距离；请求必须携带方向化提示和可审计 target 坐标。高分辨率裁剪应动态包含目标上下文，或提供同时包含脸和目标的条件图/目标标记，同时保持只重绘眼脸 mask；多人目标必须按 characterId 独立求向量。
- 验收标准：左下/右下/正下/侧方人物目标的纯函数请求体分别生成不同方向约束；recipe 同时记录 face center、target center、向量、裁剪范围和是否包含目标；任何 object/work_point/target gaze pass 不得在无方向信息且目标位于裁剪外时静默执行。程序逻辑验收，不生成图片。
- 解决 Agent 修改：视线 mask 由人脸几何与剧情目标几何联合生成，连线与目标区域一并进入 inpaint mask；recipe.debugMasks 记录目标中心与 maskBounds。
- 解决 Agent 测试：`node --check scripts/sd-worker.mjs`、`npx tsc --noEmit` 通过；未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：即使空间向量与上下文进入请求，细微瞳孔方向仍受 checkpoint 和局部重绘强度影响，作为产品运行风险保留。
- 诊断 Agent 复核证据：job 403 recipe 坐标、`faceRefinementPassPlan` 半径和 worker inpaint padding 的数值推导证明手机中心位于 gaze 高分辨率裁剪外；gazePayload 无 target 坐标或方向向量字段。
- 诊断 Agent 复核结论：目标空间信息在 gaze pass 中确定丢失，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 建立 GazePlan，并闭合 face/target/crop/request/recipe 数据流。
- 解决 Agent 本轮修改（2026-08-09）：`gazeMaskGeometry` 新增真实 `crop`、`targetBox` 与 `containsTarget`，worker 按 face→target 距离扩大 full-res padding，并用 `propInteraction.objectCenter` 写入目标坐标；等待诊断复核。
- 解决 Agent 本轮补修（2026-08-09）：`gazeTrace` 现在同时持久化 `cropBounds` 与 `targetBox`，可直接审计实际裁剪和目标包含关系。
- 诊断 Agent 最终复核（2026-08-09）：联合几何已经让 `maskBounds` 覆盖 face 与 target，旧的“目标完全位于高分辨率裁剪外”问题部分消除；但 `gazeMaskGeometry` 只返回 face/target/bounds，没有 face→target 向量、八方向或距离，四组左下/右下/正下/侧方输入的 worker prompt 仍是同一抽象“converge on object/target”文本。recipe 也没有记录 vector/direction/containsTarget；worker 还把目标椭圆和连接走廊写成白色实际 inpaint mask，导致本应作为方向上下文的手机/工具本体及中间区域被二次重绘，而不是保持“只重绘眼脸 mask”。未满足方向化请求与可审计 GazePlan 验收，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：本轮新增 face→target vector、角度、八方向、距离 trace，实际白色 inpaint mask 已缩回脸部，padding 也会随距离扩大，属于实质性进展；但 worker 的方向提示把“target at normalized coordinates”写成 `gazePlan.center`（人脸坐标），而不是 `propInteraction.objectCenter`。`containsTarget` 仅为 `Boolean(target)`，不验证实际 full-res crop：在 768×512、face.x=0.12、target.x=0.88 的合法横向镜头中，动态 crop 右边界约 469.76px，目标位于 675.84px，实际不包含却记录为 true。目标坐标和边缘景别上下文仍错误，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：独立左下、右下、正下、侧方矩阵确认 vector/direction/angle/distance 已产生不同结果，且白色重绘 mask 只覆盖脸部，这是有效修复；但实际 `gazePayload.prompt` 仍把 `gazePlan.center` 人脸坐标写成 target coordinates，recipe 的 `containsTarget` 仍仅等于 `Boolean(target)`，不验证扩大后的 full-res crop 是否包含远端目标。宽画幅边缘目标可继续在 crop 外却记录 true，因此保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 增量复核（2026-08-09）：修复 Agent 最新提交未改变上述两个失败点；当前 worker 第 495 行仍输出人脸中心为 target coordinates，`gazeMaskGeometry.containsTarget` 仍是 `Boolean(target)`。状态维持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本次复核（2026-08-09）：最新源码仍以 `gazePlan.center`（人脸中心）填写 prompt 的 target coordinates，`gazeMaskGeometry.containsTarget` 仍只判断 target 对象是否存在，不计算动态 full-res crop 的实际包含关系。方向向量和脸部 mask 修复有效，但目标坐标与边缘宽画幅审计仍错误，状态同步为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新复核（2026-08-09）：目标坐标已改为 `propInteraction.objectCenter`，768×512 的左下、右下、正下、侧方矩阵均生成不同 direction，动态 padding 后 `containsTarget=true`，原错误坐标和目标在 crop 外路径已消除。但 recipe 的 `gazeTrace` 仍只写 `maskBounds:gazeGeometry.bounds`；这里的 bounds 是 face+target 联合范围，不是实际 `gazeGeometry.crop`，也未记录 `targetBox`。实际裁剪范围仍无法从 recipe 审计，不满足本项明确的 crop trace 验收，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-09）：worker 的 `gazeTrace` 已补入 `cropBounds:gazeGeometry.crop` 与 `targetBox:gazeGeometry.targetBox`，并继续记录 face/target、vector、direction、containsTarget；实际 payload 使用同一个 `gazePadding` 和正确的 `propInteraction.objectCenter`。768×512 左下、右下、正下、侧方矩阵均得到方向化约束、目标框完整位于 crop，白色重绘 mask 仍只覆盖脸部。face/target/crop/request/recipe 数据流闭合，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；瞳孔方向的模型服从率作为产品运行风险保留。

## ISSUE-VISUALSPEC-002 已确认旧视觉规格绕过生成时规范化与校验

- 优先级：P0
- 状态：verified
- 来源问题：job 403 数据链审查；关联 `ISSUE-VISUALSPEC-001`，但本项针对历史已确认数据的运行时迁移入口。
- 用户报告：提示词和 repair recipe 看似有手机要求，但视觉规格面板/recipe 仍没有完整交互关系，组件之间依赖文本猜测。
- 已确认事实：job 403 在最新代码下生成，payload 的 `visualSpec.interaction=null` 且没有 `interactions` 字段；可见事实却明确包含双手持手机、看屏幕和通知内容。`normalizeShotSpec` 已能从该输入推导 smartphone relation，但 `getShotGenerationInput` 仅对数据库 `visual_spec_json` 做 `safeJson`，生成 API 没有再次规范化或调用 `validateVisualIds`，因此旧确认规格原样进入 prompt/pose/repair 编译。
- 高概率原因：新 schema 只覆盖重新规划、手工更新和新确认路径，没有在生成边界建立版本迁移/校验；历史 `visual_spec_confirmed=1` 被错误地视为天然符合当前契约。
- 未验证假设：历史库中还有多少 confirmed spec 处于旧形状尚未全量统计；单个 job 403 已足以复现运行时绕过路径。
- 反证或冲突：手机因自由文本关键词兜底仍建立了单个 `propInteraction`，所以本次不是手机关键词漏识别；但未知道具、多关系和交接场景无法保证同样被恢复。
- 复现步骤：读取 shot 1255/job 403 visualSpec；直接调用 `normalizeShotSpec` 可得到 smartphone interaction，而 `getShotGenerationInput(1255)` 返回原始 null，生成路由仍创建任务。
- 涉及文件：`lib/db.ts`、`lib/visual-planning.ts`、`app/api/studio/route.ts`。
- 影响范围：所有升级前已确认视觉规格；会让结构化关系、所有权、接触点、视线目标和多道具信息在生成链继续依赖启发式文本。
- 建议方案：在 generation boundary 按 schemaVersion 执行幂等规范化和 P0 校验；规范化结果应写入本次 recipe 并带 migration trace，必要时回写数据库并递增版本。无法补全的旧规格应返回 422 要求重新确认，不能静默生成。
- 验收标准：job 403 原始规格进入生成前得到完整 smartphone interaction；legacy 单数、null、多关系和残缺关系分别正确迁移或阻断；recipe 不再保存缺失 `interactions` 的 confirmed spec。程序逻辑验收，不生成图片。
- 解决 Agent 修改：生成边界对 confirmed visualSpec 幂等执行 normalizeShotSpec + validateVisualIds；失败返回 422，recipe 写入 visualSpecMigration trace。
- 解决 Agent 测试：`npx tsc --noEmit` 通过；未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：自动推导可能遇到语义含混旧文本；无法确定时必须阻断并要求人工确认，不能猜测所有权或动作阶段。
- 诊断 Agent 复核证据：shot 1255/job 403 的数据库与 payload 均保留 interaction null；`getShotGenerationInput` 直接 safeJson，生成路由未调用 normalize/validate。
- 诊断 Agent 复核结论：历史确认数据绕过当前 schema 契约的路径稳定存在，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 在生成边界增加版本迁移、验证和可追溯 migration trace。
- 诊断 Agent 最终复核（2026-08-09）：生成路由在任何 prompt/risk/Regional/pose/repair 编译之前，对 `visualSpecConfirmed` 输入执行 `normalizeShotSpec` 和 `validateVisualIds`；校验错误返回 422，成功后以规范化后的 `shot` 继续全链编译，并把 normalized spec 与 `visualSpecMigration` 写入 recipe。纯函数用例覆盖显式手机、未知道具、legacy 单数、复数关系、残缺关系阻断和静态镜头，相关测试均通过。原 job 403 式旧数据不再能绕过当前契约，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-INTERACTION-001 复数 interactions 在编译和后处理层被折叠为单一关系

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：`interactionGeometry` 新增独立 `contactPoints` 输入；单手 activeHand 先读取当前 relation 的显式左/右手，再回退到 source 文本，避免 actor-wide `hands` 描述覆盖当前 relation。多关系 activeHand 回归断言保留；`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过，完整 Studio 套件受 Node `uv_os_get_passwd ENOMEM` 阻断，未启动 SD。
- 解决 Agent 本轮修复（2026-08-11）：每条 relation 的 contactPoints 现在在独立 contract 编译后继续参与 geometry source/activeHand，避免同一人物复用首条关系的手别；pose 构建在双手关系优先后保留显式单手冲突，并由 relation-level geometry 将 `relation_target_plan` 视为有效姿态接触。`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过；完整 Studio 套件受 Node `uv_os_get_passwd ENOMEM` 阻断，未启动 SD。
- 解决 Agent 本轮修复（2026-08-11）：显式 relation `contactPoints` 现在进入 interaction geometry 的 source，稳定决定 `activeHand` 与 contact anchor；pose 构建按双手关系优先、单手关系保留的分配结果写入 `wristAssignments`，two-hand 与单手竞争时不再静默覆盖，并将 `wrist_already_reserved` 写入 `relationConflicts`。新增纯逻辑断言覆盖 left/right active hand。`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-10）：pose 关系按双手关系优先、显式单手关系保留的确定性腕点分配写入 `wristAssignments`；已占用腕点不再静默覆盖，关系记录 `wrist_already_reserved` 并写入 `relationConflicts`。worker geometry 优先读取对应 `relationId` 的 pose relation target，而不是读取被后续关系改写的整张最终骨架。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：`deriveInteractionContracts` 按全局 interactions 为独立关系生成唯一实例键，显式 contactPoints 优先决定 `handMode/activeHand`，并将 `activeHand/objectInstanceId` 传入 `PosePersonPlanV2.relationTargets`；`buildSinglePerson` 按关系逐条写入对应左/右腕，重复占用同一只手时生成 `relationConflicts` 和人工仲裁警告。worker 按全部 required relation 顺序执行并写入逐关系状态/阶段追踪。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：用户要求覆盖手机、伞和全部工具关系并重新评估组件配合；关联 `ISSUE-VISUALSPEC-001` 的复数 schema 决策。
- 用户报告：复杂镜头里道具/工具只偶尔正确出现，交接、持物和操作关系不能同时稳定落实。
- 已确认事实：`deriveInteractionContract` 对每个 actor 使用 `.find(...)` 只取第一条带 propId 的 relation；`buildRegionalPrompt` 仅生成 `interactionContracts=characterIds.map(...)`，`repairPasses.propInteraction` 又用 `.find(required)` 只保留全镜头第一份；worker 也只执行单数 `propInteraction`。同一人物先看手机再拿工具、同时持伞和包、一个镜头多个物件或一个 actor 多个接触关系都会丢掉后续 relation。
- 高概率原因：视觉规划已升级为 `interactions[]`，但提示词契约、pose 输入、repair recipe 和 worker 仍沿用“一人一个/一镜一个 InteractionContract”的旧数据模型。
- 未验证假设：多 relation 的最优 repair 顺序和重叠 mask 合并策略尚未设计；不影响当前 `.find` 确定丢数据的结论。
- 反证或冲突：Regional common prompt 会把多条 plannedInteractions 拼成文字，说明文本信息未必完全丢失；确定丢失的是结构化 prop geometry、mask、repair pass、handMode、ownership 和 gaze target。
- 复现步骤：构造同一 actor 的 smartphone read + handheld tool operate 两条 relation；第二条不会出现在 `deriveInteractionContract` 返回值或 `repairPasses`，worker 最多执行一次道具修复。
- 涉及文件：`lib/prompts.ts`、`lib/pose-v2.ts`、`scripts/sd-worker.mjs`、generationSpec recipe 类型。
- 影响范围：手机+包、伞+交接、工具+工件、双手分别操作、多道具连续动作及所有一镜多关系场景。
- 建议方案：以带稳定 relationId 的 `InteractionContract[]` 为唯一主路径；prompt、pose scene plan、gaze plan、mask 与 worker 按 actor/relation 顺序消费全部关系，并显式解决共享手、重叠 mask 和先后阶段冲突。单数只作旧数据迁移输入。
- 验收标准：同 actor 双道具、双 actor 共享道具、交接+视线、多工具/工件关系均在 recipe 中保留全部 relationId，且每条 required relation 都有对应 prompt/pose/repair/QA trace；不能使用 `.find` 静默丢弃。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增 deriveInteractionContracts 与 propInteractions 数组，Regional recipe 保留全部关系并让负向/姿态编译消费完整关系集合。
- 解决 Agent 测试：现有 55/59 Studio 测试通过；剩余 4 项为既有 framing/negative 兼容断言，类型与 worker 语法检查通过；未启动 SD。
- 残余风险：多个关系可能竞争同一只手或重叠区域；解决后仍需显式冲突检测和人工编辑入口。
- 诊断 Agent 复核证据：`deriveInteractionContract`、`repairPasses.propInteraction` 与 worker 的单数读取路径共同证明复数关系在执行边界被截断。
- 诊断 Agent 复核结论：复数 schema 到单数执行器的数据流断裂可由代码直接复现，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 将 interaction contract、pose、repair 和 QA 全链升级为 relation 数组。
- 解决 Agent 本轮修改（2026-08-09）：worker 对全部 required `propInteractions` 逐条执行，并把 relation trace 从 queued 更新为 executing/completed/failed；等待诊断复核。
- 解决 Agent 本轮补修（2026-08-09）：pose scene plan 改为聚合同 actor 的全部 relation actions/handMode，Regional pose 输入改为完整 relation 数组；semantic QA 的 interaction/gaze/prop 来源改为逐关系集合。
- 诊断 Agent 最终复核（2026-08-09）：`deriveInteractionContracts` 与 `repairPasses.propInteractions` 已保留同一 actor 的多条关系，Regional 负向词也消费数组，属于有效的部分修复；但 `InteractionContract` 仍无 `relationId`，pose 输入仍使用 `characterIds.map(deriveInteractionContract)` 每人只取第一条，recipe 同时保留单数 `propInteraction=.find(...)`，而 `sd-worker.mjs` 只读取并执行该单数值。semantic QA 的 interaction/gaze/prop 摘要同样以单数为主。第二关系没有对应 pose、prop/gaze pass 或逐关系 QA trace，仍可被执行层静默丢弃，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：关系现有稳定 `relationId`，recipe 也保留全部 `propInteractions`，但执行链仍未升级。单 actor 的 smartphone+screwdriver 推导会产生两条 relationId，pose 仍由 `characterIds.map(deriveInteractionContract)` 只消费 smartphone，动作仅含 `read_phone`；worker 仅给数组建立 `relationTraces`，把第二条标为 `queued_for_followup_pass`，随后仍以单数 `propInteraction` 进入唯一一次 prop/gaze 修复，代码中不存在 follow-up loop。第二 required relation 仍未执行，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：同 actor smartphone+screwdriver 独立推导得到两条稳定 relationId，`repairPasses.propInteractions` 也保留两条；但 pose 仍只取 smartphone，worker 把第二条写成 `queued_for_followup_pass` 后只执行单数 `propInteraction`，没有任何后续循环或逐关系 QA 结果。记录 queued 不能替代执行，第二条 required relation 仍被截断，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 增量复核（2026-08-09）：最新 worker 已新增 `for (const propInteraction of propInteractions.filter(required))`，每条 required relation 的 prop/gaze pass 会顺序执行，旧的“第二条完全不执行”缺陷得到实质修复。但 pose 仍由每人物首条 contract 驱动，semantic review 仍以单数 `propInteraction` 汇总；`relationTraces` 只在循环前写 executing/queued，成功、失败和循环结束均不更新状态，第二条实际执行后仍永久显示 queued。未满足逐关系 pose/QA/完成证据验收，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本次复核（2026-08-09）：逐 relation worker 循环继续存在并会执行全部 required 道具/视线 pass；但 `relationTraces` 仍只在循环前写第一条 `executing`、其余 `queued_for_followup_pass`，成功、失败与结束均不更新，实际已执行的后续关系仍被永久审计为 queued。pose 与 semantic review 也仍以每人物首条/单数关系为主，未形成逐关系 pose/QA 闭环，状态同步为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新复核（2026-08-09）：worker 现会把每条 required relation 从 `queued` 更新为 `executing`，并在结束写为 `completed/failed`，旧的执行状态假象已修复。但 `buildRegionalPrompt` 构建 pose 时仍使用 `characterIds.map(deriveInteractionContract)`，同一 actor 只消费第一条关系；`semanticReviewContract` 也仍以单数 `repair.propInteraction` 生成 prop/gaze 期望，只显示首个道具。逐 relation worker trace 通过，但逐关系 pose 与 QA 仍未闭环，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-09）：Regional pose 已改为传入全部 `deriveInteractionContracts`，semantic review 的 interaction/gaze/prop sources 也会列出全部 relationId/object，旧的首条 QA 汇总缺陷已修复。同 actor smartphone-read+screwdriver-operate 矩阵得到 `actions=[read_phone,write_tool]`，但 `PosePersonPlanV2` 仍只有一个 `target` 和一个 `handMode`，均取第一条 smartphone relation；关节构建只按 primary `read_phone` 的 target=.42/.55 与 two-hand 几何执行，第二条 screwdriver target=.62/.58、one-hand 几何没有对应 pose 数据。动作名聚合不能替代逐关系关节目标，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 通用性复核（2026-08-09）：最新代码把全部关系写入 `PosePersonPlanV2.relationTargets`，属于有效的数据保留；但 `buildSinglePerson` 没有任何地方消费 `relationTargets`，关节仍只读取单数 `target/handMode`，因此第二关系依旧没有独立腕点与目标几何。并且 `PoseInteractionInput` 未声明 `relationId`，新映射在 `npx tsc --noEmit` 稳定触发 TS2339。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新架构复核（2026-08-10）：`PoseInteractionInput.relationId` 已补齐且类型检查通过，但 `buildSinglePerson` 仍完全不读取 `relationTargets`；所有腕、肘、头部与 `target/handMode` 仍只由首条 relation 决定。多关系 ID 已保留、逐 relation worker 也会循环，但第二个手机/工具/包关系依然没有独立关节几何，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮复核（2026-08-10）：最新代码已经消费 `relationTargets`，但没有逐 relation 的主动手与共享手仲裁。独立 smartphone+ screwdriver 矩阵中两条 relation target 均落在 `x=.38`；第二条 screwdriver 的契约因人物全局 hands 文本先命中 `left hand` 而记录左手，pose 却因全局 `activeHand=both` 把右腕写到 screwdriver target，并覆盖第一条 two-hand smartphone 对右腕的占用。`relationTargets` 本身也未保存 `activeHand/objectInstanceId`。完整 Studio 套件新增用例因此失败（60/62），多关系虽未再丢数组元素，但手、目标与实例仍未形成可同时满足的几何计划，状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-10）：关系数组、独立 target、`activeHand/objectInstanceId` 与逐关系 worker trace 已贯通，原新增多关系测试现通过；但显式 contactPoints 并未稳定决定主动手。只在 relation 写 `left hand`、人物全局 hands 不重复该词时，contract 仍得到 `activeHand=right`，因为 `interactionGeometry` 不消费 relationContactText。冲突检测也只统计“两个 one-hand relation 占同一手”，不会检测 two-hand phone 已占左右手后又出现 right-hand screwdriver；该矩阵 `relationConflicts=[]`，右腕继续被后写工具覆盖。多关系信息已保留但不可满足关系仍被静默执行，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮复核（2026-08-11）：新增 `relationContactText` 只进入 `deriveInteractionContract` 当前 `.find(...)` 命中的首条 relation；`deriveInteractionContracts` 随后仍对同一 actor 复用这份首条 contract，再覆盖 relationId/中心等字段。smartphone-left + screwdriver-right 的现有纯逻辑用例因此稳定得到第二条 `activeHand=left`，期望为 right，Studio 60/63。复数关系虽保留，但第二条手别仍被第一条污染，状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮再复核（2026-08-11）：`deriveInteractionContracts` 现会为每条 relation 单独构造只含该 relation 的 visualSpec，修复了直接复用首条 contract 的一层问题；但 `deriveInteractionContract` 的 source 仍先包含 actor-wide `planned.hands`，再把当前 `relationContactText` 追加到末尾，`interactionGeometry` 又以“只要 source 含 left hand 就选 left”的顺序判定。含“left phone, right screwdriver”的第二条 right-hand relation 仍得到 `activeHand=left`，现有测试稳定失败，完整 Studio 62/63。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-11）：`interactionGeometry` 现接收独立 `contactPoints`，单手关系先从当前 relation 的显式 left/right hand 得到 contact anchor 与 activeHand，仅在缺少显式手别时才回退 actor-wide source。smartphone-left + screwdriver-right 矩阵现分别得到 `activeHand=[left,right]`，两条 relationId、实例、独立 target、pose relationTargets、passGraph 和 worker 逐关系路径继续保留；双手优先后的腕点竞争仍写入显式 conflict，不再静默覆盖。TypeScript、worker 语法、台账测试及完整 Studio 63/63 通过，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；模型实际多道具服从率保留为产品运行风险。

## ISSUE-TOOL-001 单手工具契约在 OpenPose v2 中变成双手聚集

- 优先级：P0
- 状态：verified
- 来源问题：用户明确要求排查手机、雨伞和工具；本项针对工具 handMode 与姿态组件之间的确定性冲突。
- 用户报告：工具容易缺失、形态错误或与手部关系不自然。
- 已确认事实：已知 screwdriver/hammer/wrench/scissors 等工具会得到 `handMode=one`、`purpose=operate`、`shape=elongated`、`gazeMode=work_point`。但 `derivePoseScenePlanV2` 把所有 `purpose=operate` 追加为 `write_tool`，`buildSinglePerson` 的 read_phone/hold_carry/write_tool 分支无条件同时把 4、7 两个腕点放到目标两侧，完全不读取 one-hand 契约。独立推导 screwdriver 场景得到 `handedness=right`，但左右腕到目标距离分别约 0.045/0.051，形成确定的双手聚集。
- 高概率原因：`PoseInteractionInput.handMode` 没有持久化到 `PosePersonPlanV2`，动作族把“工具操作”和“双手持物”共用同一腕部模板；主动手/支撑手/工件接触没有分层。
- 未验证假设：各具体工具需要多少动作子族才能覆盖产品场景尚未评估；当前 one-hand 被确定改成 two-hand 已构成独立缺陷。
- 反证或冲突：worker 的 prop mask 和提示词仍按 one-hand 生成，因此错误不在工具关键词识别，而是 OpenPose 与局部修复给出了互相冲突的手部几何。
- 复现步骤：以 `using a screwdriver on the screw` + one-hand interaction 调用 `buildPoseControlV2`；检查 kind=`single_action_write_tool_v2` 且两个腕点都靠近同一 target。
- 涉及文件：`lib/pose-v2.ts`、`lib/prompts.ts`。
- 影响范围：螺丝刀、锤子、扳手、剪刀、画笔等单手工具；也影响单手提物/持物被归入 hold_carry 的场景。
- 建议方案：将 handMode、activeHand、supportRole、workPoint 与 heldPropPoint 写入 PosePersonPlan；one-hand 只移动主动腕，另一手按语义保持自由或支撑工件；two-hand 才允许双腕围绕同一道具。工具动作还应区分 write/cut/strike/turn/grip 等关节拓扑。
- 验收标准：one-hand screwdriver/hammer/scissors 只有主动腕接近工具柄/工作点，另一腕保持自由或到工件支撑点；two-hand phone/book 保持双腕接近物体；pose 与 prop repair 的 handMode 一致。程序逻辑验收，不生成图片。
- 解决 Agent 修改：PosePersonPlanV2 持久化 handMode/activeHand；单手工具仅移动主动腕，双手契约才绑定双腕。
- 解决 Agent 测试：单手工具契约测试通过，`npx tsc --noEmit` 通过；未启动 SD。
- 残余风险：ControlNet 对手指握持细节的最终服从率仍受模型影响；程序层应至少消除左右腕都被错误绑定到同一点的冲突。
- 诊断 Agent 复核证据：当前纯函数 screwdriver 推导得到 handMode one、handedness right，但两腕距 target 均小于 0.052；代码分支无 handMode 判断。
- 诊断 Agent 复核结论：one-hand 信息在 pose plan 中确定丢失，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 贯通 handMode/activeHand/supportRole 并为工具族增加关键关节断言。
- 诊断 Agent 最终复核（2026-08-09）：one-hand 分支现只把一个腕点送到工具目标，双腕聚集的原缺陷已部分消除；独立推导 screwdriver 得到单手时一腕距离目标 0、另一腕约 0.10/0.20，two-hand phone/book 路径仍让双腕接近目标。但 COCO 索引语义写反：标准右腕为 4、左腕为 7，代码却用 `activeHand === "left" ? 4 : 7`。显式 left-hand 输入实际移动右腕，right-hand 输入实际移动左腕，且 elbow 计算仍依赖另一套 `activeRight`。左右主动手契约未闭合，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：COCO 主动手索引已修正为 left→腕7/肘6、right→腕4/肘3。独立矩阵中 left-hand 工具的左腕到 target 距离为 0、右腕约 0.20；right-hand 工具的右腕距离为 0、左腕约 0.10；two-hand 输入则两腕分别约 0.045/0.051。单双手与左右主动手均和 prop contract 一致，原双腕聚集及左右反转路径消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：当前源码继续保持 left→腕7/肘6、right→腕4/肘3；独立 medium/wide 矩阵中左右单手均只有对应主动腕到 target，另一腕保持自由，双手分支不受影响。`ISSUE-TOOL-001` 维持 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-UMBRELLA-001 雨伞交接修复的 mask 与伞面结构引导空间断裂

- 优先级：P0
- 状态：verified
- 来源问题：用户明确要求重新排查雨伞类工具；本项针对 handoff worker 的实际 mask/guide 几何。
- 用户报告：雨伞容易缺失、伞柄断开、人物持有关系和交接手势错误。
- 已确认事实：handoff inpaint mask 固定为 x=34%..66%、y=31%..74%；Canny 伞面引导却位于约 x=37%..70%、y=11%..25%，伞轴从 y=18% 延伸到 52%。同一个 handoffMask 还作为 `effective_region_mask` 传给 Canny，因此整个伞面和伞轴上段都在有效 mask 外，结构控制最多作用于下半段伞轴。坐标不读取 `PoseScenePlan.interactionTarget`、人物 region、腕点、景别或实际伞位置。
- 高概率原因：雨伞 post-pass 由一套固定画布百分比模板独立实现，与已经参数化的 OpenPose v2/关系计划没有共享几何；mask 只围住两手中部，却要求同一 pass 修复画外伞面连续性。
- 未验证假设：伞面、伞轴和双手是否应一次重绘或拆分 pass 尚需实现评估；现有关键 guide 落在 effective mask 外是确定事实。
- 反证或冲突：OpenPose v2 能生成 handover 接触点并校验双腕闭合，prompt 也写明伞柄/伞面连续；缺陷是这些结构化坐标没有驱动 worker 的伞 mask 和 Canny guide。
- 复现步骤：按 worker 常量推导 handoffMask 与 guide 范围，确认 canopy y≤25% 而有效 mask y≥31%；改变人物左右间距或使用近景时，修复区域仍完全不变。
- 涉及文件：`scripts/sd-worker.mjs`、`lib/pose-v2.ts`、`lib/prompts.ts`。
- 影响范围：递伞、接伞、共同持伞、撑伞和其他带长柄/大轮廓工具的双人交互。
- 建议方案：从 relation/pose plan 生成共享 PropGeometry，明确 canopy/shaft/handle/contact polygons；mask 应覆盖需要重建的完整连通结构，guide 与 effective mask 必须求交校验非空且覆盖关键部件。按景别和腕点动态布局，并把几何范围写入 recipe；长柄道具用通用连通结构计划，不再维护独立硬编码百分比。
- 验收标准：不同人物间距、左右角色交换、close/medium/wide 的 handoff 计划均让 canopy、shaft、handle 和双腕接触区落入相应有效 mask；安全检查拒绝关键 guide 部件位于 mask 外；recipe 可审计实际坐标。程序逻辑验收，不生成图片。
- 解决 Agent 修改：雨伞 handoff 使用 scenePlan interactionTarget/anchors 计算 canopy、shaft、contact 连通 bounds，mask 与 Canny guide 共用几何并记录 debug trace。
- 解决 Agent 测试：`node --check scripts/sd-worker.mjs` 与类型检查通过；未启动 SD。
- 残余风险：大范围伞面重绘可能影响人物身份和构图；应通过分层 mask、顺序和身份条件控制，而不是保留错误几何。
- 诊断 Agent 复核证据：worker 常量直接证明 canopy y=11%..25% 与 handoffMask y=31%..74% 不相交，且 mask/guide 均未读取 scenePlan 坐标。
- 诊断 Agent 复核结论：handoff mask 与 canopy guide 的几何冲突为确定性程序缺陷，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 用共享 PropGeometry 重构 handoff mask/guide，并增加几何覆盖安全检查。
- 解决 Agent 本轮修改（2026-08-09）：handoff 改用覆盖 `umbrellaGeometry.bounds` 的圆角矩形 effective mask，计算 guide 覆盖并在失败时拒绝修复；双腕间距收紧至 target±0.035；等待诊断复核。
- 解决 Agent 本轮补修（2026-08-09）：guide 覆盖校验改用实际裁切后的 canopy 端点，避免边缘位置因检查未裁切坐标被错误拒绝；双腕进一步收紧至 target±0.025，contactError=0.05。
- 诊断 Agent 最终复核（2026-08-09）：worker 已读取 `scenePlan.interactionTarget/anchors`，伞面、伞轴、接触区与 mask 共用 `umbrellaGeometry`，旧固定 y=31%..74% 导致伞面完全落在 effective mask 外的缺陷得到部分修复。但验收矩阵仍失败：target.x=0.05 时 canopy.x1=-87.04，target.x=0.95 时 canopy.x2=599.04 且 bounds 右侧越出 512；代码没有实际覆盖安全检查，`maskGuideIntersection:true` 只是硬编码 trace。handoff prompt 仍硬编码“right-side giver / left-side receiver”，不读取 `swapRoles` 或关系 actor/target；双人 handover 的两个腕点还被设为同一坐标，现有 Studio 用例的 receiverWrist.x < giverWrist.x 失败，存在手部融合诱因。不同边缘位置、角色交换与接触分离未通过，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：`umbrellaGeometry` 已对 canopy 和 bounds 做画布裁切，左缘、右缘和宽间距三组 512 输入均完全落在画布内，旧越界路径已消除。但 worker 仍硬编码 `maskGuideIntersection:true`，没有真正的关键部件覆盖拒绝分支；handoff prompt 仍固定“right-side giver / left-side receiver”，不消费 `swapRoles` 或结构化 actor/target。双人 handover 仍把双方腕点设为完全相同坐标，Studio 的 `receiverWrist.x < giverWrist.x` 断言继续失败。边缘几何通过，角色交换、接触分离和安全检查未通过，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：左缘、右缘、宽间距的 canopy/shaft/bounds 均已落在 512 画布内，UI `swapRoles` 也会改变 worker 递出/接收侧文案，属于有效进展。但 `maskGuideIntersection` 仍是无计算的硬编码 true；默认角色仍由固定左右侧而非结构化 actor/target 决定。双人 handover 腕点现从完全重合改为目标两侧 ±0.045，距离 0.09，却超过 `validatePosePeople` 的 0.08 接触闭合阈值，导致 handover safety=false；完整 Studio 测试中的区域递伞、通用 handover、接触闭合三项因此失败。安全检查、角色泛化和接触几何未闭环，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 深入复核（2026-08-09）：进一步按 worker 实际椭圆 mask 而非矩形 bounds 做点包含检查，原 mask/guide 空间断裂仍直接存在。center/wide 输入的 canopy 左右端点均在椭圆外，left/right 边缘输入也有多个 canopy/shaft 点在椭圆外；四组输入的 shaftBottom 全部超出 bounds 和椭圆。也就是说“bounds 在画布内”不等于关键 guide 被 effective mask 覆盖，而硬编码 `maskGuideIntersection:true` 会掩盖该失败。此证据继续归入 `ISSUE-UMBRELLA-001`，状态保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本次复核（2026-08-09）：worker 仍用矩形 bounds 的内接椭圆作为 inpaint/ControlNet effective mask，并继续硬编码 `maskGuideIntersection:true`；canopy 端点与 shaftBottom 的真实覆盖失败没有拒绝分支。通用工具递交反向用例虽正确分类为 `offer/handover`，但双腕固定在 target±0.045，接触误差 0.09 超过安全阈值 0.08，`safety.valid=false`；完整 Studio 套件剩余 3 项均稳定落在交接几何。状态同步为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新复核（2026-08-09）：handoff 已改用覆盖 bounds 的圆角矩形 mask，`maskGuideIntersection` 也会计算并在 false 时拒绝请求；双腕收紧至 target±0.035 后 contactError=0.07、基础 safety 通过，均为有效修复。但边缘矩阵 x=0.05/0.15/0.85/0.95 全部返回 `maskGuideIntersection=false`：校验使用未裁切的 `cx±spread`，实际 guide SVG 使用已裁切的 `canopy.x1/x2`，因此可见 guide 已在矩形 mask 内仍被错误拒绝。中心递伞腕距 0.07 还未满足现有区域递伞约束 `<0.06`。边缘泛化与接触几何仍有确定失败，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；测试中要求双腕完全重合的冲突断言另建 `ISSUE-TEST-002`。
- 诊断 Agent 本轮终审（2026-08-09）：x=.05/.15/.5/.85/.95 边缘矩阵现全部使用裁切后 canopy 端点并返回 `maskGuideIntersection=true`；圆角矩形 effective mask 覆盖 canopy/shaft，双腕 target±.025 的 contactError=.05，区域递伞 `<.06` 与 safety `<.08` 均通过。mask/guide/contact 主缺陷已修复。但 handoff worker 仍仅以 `poseControl.override.swapRoles` 决定 `right-side giver/left-side receiver`，没有从 `visualSpec.interactions[].actorCharacterId/targetCharacterId` 与 character region 推导默认左右角色；当结构化 actor 位于左侧且无人工 swap 时，`handoffPrompt` 的 actor/target 与 worker 追加的固定左右文案冲突。角色泛化验收仍未闭合，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；当前 58/59 唯一测试失败属于独立 `ISSUE-TEST-002`。
- 诊断 Agent 通用性复核（2026-08-09）：worker 现从 `visualSpec.interactions` 取得 actor/target，并按两者 character region 推导默认 giver 左右侧；`swapRoles` 只在该结构化结果上反转。此前已通过的边缘 canopy/shaft/mask、contactError=.05 与拒绝分支继续成立，Studio 59/59 通过。角色、边缘几何、遮罩与接触数据流闭合，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；缺少 region 时的默认左右侧与模型实际握伞服从率作为产品运行风险保留。

## ISSUE-CONTROL-001 depthGuideRequired 只记录风险但没有任何执行组件

- 优先级：P0
- 状态：verified
- 来源问题：job 403 近景/构图失败后的组件链审查；关联已关闭的 `ISSUE-FRAMING-001`，但本项不针对 prompt 分裂，而是缺少实际构图控制执行器。
- 用户报告：严格近景仍显示到膝部，前景桌面占比过大，人物尺度和主体位置失控。
- 已确认事实：job 403 的 `repairPasses.risk.depthGuideRequired=true` 且 `repairPasses.depth=true`，理由含道具接触和动作计划；但 worker 只读取 identity、pose、prop、gaze、handoff，代码中没有消费 depth flag、没有 depth model/guide/control unit，也没有将执行状态写入 `adapterStatus`。当前近景只靠文本裁切和删掉 OpenPose 下肢关节；缺少人物占比、裁切边界和前景深度的结构控制。
- 高概率原因：风险分析器先声明了 depth/composition 能力，recipe 和 QA 把它当成计划记录，但执行层从未实现，形成“要求存在、组件缺席”的架构假象。
- 未验证假设：本机是否已安装可用 depth/segmentation ControlNet 模型尚未核对；不可用时也必须如实降级，不能保留伪执行标记。
- 反证或冲突：`ISSUE-POSE-001/004` 已保证 OpenPose 不再发送冲突下肢拓扑，`ISSUE-FRAMING-001` 已保证实际 prompt 含严格裁切；这两项通过仍不能锁定像素中的人物尺度和桌面占比。
- 复现步骤：全仓搜索 `depthGuideRequired`/`repairPasses.depth`，只有推导和 recipe 记录，没有 worker payload 消费；job 403 requestTrace 中也不存在 depth ControlNet 单元。
- 涉及文件：`lib/prompts.ts`、`app/api/studio/route.ts`、`scripts/sd-worker.mjs`、adapterStatus/recipe。
- 影响范围：近景主体尺度、多人前后层级、道具遮挡、前景占比、室内纵深和所有被标记 depthGuideRequired 的镜头。
- 建议方案：要么实现可审计的 composition/depth plan 与相应 ControlNet/区域遮罩/主体框控制，要么删除伪启用标记并明确降级为 text+manual_review。构图计划至少应包含 subject box、crop boundary、foreground exclusion/占比和 depth layers，并与 OpenPose framing 正交组合。
- 验收标准：depth=true 时 recipe 和实际请求必须存在相同的结构控制单元及参数摘要；不可用时状态明确为 unavailable/manual_required，不能写成已启用。close/medium/wide 的 subject box/crop/depth 计划有纯函数断言，且不会与 pose framing 冲突。程序逻辑验收，不生成图片。
- 解决 Agent 修改：recipe.structureControl.depth 明确写入 unavailable_manual_required，adapterStatus.depth 同步，不再伪装已执行 depth ControlNet。
- 解决 Agent 测试：`npx tsc --noEmit` 通过；未启动 SD。
- 残余风险：即使增加结构控制，checkpoint 对复杂前景和人物尺度仍有执行率波动；必须保留人工构图复核。
- 诊断 Agent 复核证据：全仓引用与 job 403 requestTrace 证明 depth flag 只被记录，不存在对应 worker 分支或 ControlNet 单元。
- 诊断 Agent 复核结论：风险标记与执行组件确定脱节，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 实现 composition/depth plan 或明确 unavailable 降级，并让状态与实际 payload 一致。
- 诊断 Agent 最终复核（2026-08-09）：当前未虚构 depth 执行器：recipe 明确写入 `structureControl.depth={enabled:false,status:"unavailable_manual_required"}`，`adapterStatus.depth` 同步为 `unavailable_manual_required`，worker 也没有发送 depth ControlNet 单元。`repairPasses.depth` 仅保留风险/需求标记，实际能力和降级状态已有独立、明确、可审计字段，符合本问题允许的 unavailable/manual_required 路径，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；主体尺度和前景占比仍需人工构图复核，作为产品运行风险保留。

## ISSUE-PROMPT-001 默认“编辑后生成”把完整旧提示词重复塞入 editorial layer

- 优先级：P1
- 状态：verified
- 来源问题：job 403 实际请求与 UI 状态链审查。
- 用户报告：提示词看起来很完整，但画面仍像通用人物摆拍，关键动作被环境、服装和重复描述稀释。
- 已确认事实：单人 UI 的 `editablePositive` 默认就是旧 `buildGenerationPrompt` 的完整 prompt；`generateEditedPrompt` 无论用户是否修改都把它作为 `promptOverride` 并标记 `manual_override`。canonical 层随后把结构化 Regional contract 作为主层，再把该完整旧 prompt 的前 28 个逗号项作为 editorial layer 追加。job 403 的 requested override 长 2447 字符，最终 applied prompt 长 4203 字符；相同开头片段在最终请求中出现两次，promptSource 为 manual_override，即使默认内容本身并不是用户差异。
- 高概率原因：界面没有 dirty state/结构化 diff，服务端把“完整可编辑预览”误当成“用户增量编辑”；`compactPrompt(...,28)` 又按前 N 项静默截断，既重复常规内容，也可能丢掉用户实际写在后面的编辑。
- 未验证假设：重复长 prompt 对当前 checkpoint 的视觉服从率影响比例尚未做对照；不影响默认输入被错误标记和静默截断的数据流结论。
- 反证或冲突：canonical action/framing/count 契约位于最终 prompt 前部，因此本项不是这些关键词完全缺失；缺陷是提示词预算、来源语义和编辑可追溯性错误。
- 复现步骤：打开单人镜头，不改正向提示词，点击编辑后生成；检查请求仍有 promptOverride/manual_override，最终 appliedPrompt 包含 Regional 完整契约加旧 prompt 前 28 项。job 403 为现成证据。
- 涉及文件：`app/page.tsx`、`lib/prompts.ts` 的 `buildCanonicalGenerationPrompt/compactPrompt`、`app/api/studio/route.ts`。
- 影响范围：所有单人手工生成和自动修复路径；会增加 CLIP 分块、重复人物/场景词权重，污染审计并静默截断真实编辑。
- 建议方案：UI 仅在内容相对基线发生变化时发送 override，并提交结构化 diff/dirty blocks；服务端 editorial layer 只接受增量短语，不接受完整旧编译结果。使用按语义块/token 的显式预算和超限 422/警告，禁止 first-N 静默截断；recipe 分别记录 baseline、requested diff、accepted diff 和丢弃项。
- 验收标准：未编辑时 promptSource=structured 且无 editorial layer；只改光照时最终只追加光照差异；位于输入尾部的合法编辑不会被静默丢弃；完整旧 prompt 作为 override 会被识别去重或拒绝。程序逻辑验收，不生成图片。
- 解决 Agent 修改：canonical editorial layer 按契约差异项合并；服务端忽略未变化的完整旧 promptOverride，避免重复与 first-N 静默截断。
- 解决 Agent 测试：canonical prompt 相关测试通过，类型检查通过；未启动 SD。
- 残余风险：用户自由编辑仍可能引入语义冲突；canonical invariants 和明确的超限/冲突反馈需继续保留。
- 诊断 Agent 复核证据：job 403 promptOverride/requested、appliedPrompt 长度和重复前缀，加上 page.tsx 默认 state 与 generateEditedPrompt 代码共同复现该路径。
- 诊断 Agent 复核结论：UI 默认值与 canonical editorial 契约的数据流冲突由 job 403 和代码共同复现，标记 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 增加 dirty diff、去重和显式 token/语义块预算。
- 解决 Agent 本轮修改（2026-08-09）：API 新增 `extractPromptEditorialDiff`，完整旧正向 prompt 及尾部编辑均按 compiled baseline 提取差异后再进入 canonical layer；等待诊断复核。
- 诊断 Agent 最终复核（2026-08-09）：服务端会把与 `compiled.prompt` 完全相等的默认 override 清空，canonical 层也不再 first-N 截断，尾部合法编辑能够保留，属于有效部分修复。但 UI 未编辑时仍固定发送 `promptMode:"manual_override"`，route 的 `promptSource` 直接信任该值，因此 recipe 仍错误标记为 manual_override。更重要的是，只在完整旧 prompt 尾部追加一个光照短语时，服务端把整份旧 prompt 交给 Regional contract 做逐逗号项差集；独立推导中一个新增短语产生约 529 字符 editorial layer，而不是只追加该光照差异。缺少基线 dirty/diff 数据流，未满足“未编辑 structured、单项编辑只追加差异”的验收，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮最终复核（2026-08-09）：未编辑链已修正：UI 以 `promptDirty` 标记 structured/manual，route 也只在 `requestedPromptOverride` 非空时记录 manual source，默认完整 prompt 不再错误标为人工覆盖。但单项差异仍未实现；完整 compiled prompt 尾部只追加一个光照短语时，canonical 与 Regional contract 做项级差集后产生 21 项、约 529 字符 editorial layer，`onlyEdit=false`。因此默认来源问题通过，增量预算和去重仍失败，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-09）：UI 已新增 `promptDirty` 和单人 `promptEditorialDiff`，未编辑时请求 source=structured，只追加一个光照逗号项时 UI 会只发送该差异，默认交互路径通过。但 API/canonical 仍接受“完整 compiled prompt + 尾部光照”作为 override，并相对 Regional contract 产生 21 项、约 529 字符 editorial layer，而不是识别旧 baseline 后只保留尾部差异或返回 422；这仍违反本项明确的直接 API/旧客户端验收标准，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本次复核（2026-08-09）：当前默认 UI dirty/source 路径继续有效；但按 route 的真实两层输入复测，旧客户端提交 `compiled.prompt + soft amber rim lighting` 时，Regional contract 差集仍产生 21 个 editorial 项、503 字符，而不是仅保留 1 个 23 字符的光照差异，也没有返回 422。直接 API/旧客户端兼容验收仍失败，状态同步为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新复核（2026-08-09）：route 现先用 `extractPromptEditorialDiff(compiled.prompt, rawPromptOverride)` 提取旧客户端差异，再交给 canonical Regional 层。独立推导中 `compiled.prompt + soft amber rim lighting` 得到且只得到一个 `soft amber rim lighting` 差异，最终 applied prompt 保留该项；完全未编辑时差异为空并保持 structured。UI dirty/diff 路径与直接 API/旧客户端路径均满足验收，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-POSE-005 recline 计划被 sofa 关键词错误标记为 seated kind

- 优先级：P2
- 状态：verified
- 来源问题：诊断 Agent 复核 fixed_pending_review 时运行完整 Studio 测试发现；关联 `ISSUE-POSE-003/004`，但根因位于 OpenPose v2 的 recipe kind 选择而非 UI 映射或关节拓扑。
- 用户报告：用户要求重新评估人物动作、组件配合和所有生成问题；错误 kind 会让 UI、recipe 与排障结论把斜靠误报为坐姿。
- 已确认事实：输入 `reclining against the sofa back` 时，`derivePoseScenePlanV2` 正确得到 `primaryAction=recline`、`templateId=single_recline_v2`，生成安全校验也通过；随后 `kindForSingle` 在读取 primaryAction 前先用 `/sofa|couch/` 返回 `single_action_seated_v1`。独立推导结果为 scene plan=recline、recipe kind=seated，完整 Studio 测试对应断言失败。
- 高概率原因：kind 选择保留了旧的场景物体关键词快捷判断，覆盖了已经结构化的 `primaryAction`；“沙发”被错误等同于“坐姿”。
- 未验证假设：其他家具或环境词是否还会覆盖已结构化动作尚未做全词表审计；当前已确认 sofa/couch 与 recline 的稳定冲突。
- 反证或冲突：实际关节由 recline plan 构建，因此本项不证明斜靠几何退化；确定错误是 recipe/UI 可观测 kind 与实际 plan 不一致。
- 复现步骤：对中景单人 shot 调用 `buildPoseControlV2`，actionEn 设为 `reclining against the sofa back`；比较 `pose.kind` 与 `pose.scenePlan.people[0].primaryAction/templateId`。
- 涉及文件：`lib/pose-v2.ts` 的 `kindForSingle`，以及读取 `poseControl.kind` 的 UI/recipe/测试。
- 影响范围：所有明确 recline/lean back 但文本同时含 sofa/couch 的镜头；也可能影响其他动作与场景家具词共存时的类型审计。
- 建议方案：以结构化 `primaryAction` 为 kind 唯一真值，只有 primaryAction 本身为 static/unknown 时才允许兼容关键词兜底；增加 recline-on-sofa、lie-on-sofa、sit-on-sofa 对照用例。
- 验收标准：上述三类输入分别得到 recline/lie/seated kind，且 kind、templateId、primaryAction 三者一致；UI 展示与 recipe 保持一致。程序逻辑验收，不生成图片。
- 解决 Agent 修改：移除 sofa/couch 对 kind 的快捷覆盖，kind 现在以结构化 primaryAction/templateId 为唯一真值；recline 不再被家具词改写。
- 解决 Agent 测试：`npx tsc --noEmit`、`node --check scripts/sd-worker.mjs` 通过；未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：修正 kind 后，复杂斜靠姿态的模型服从率仍需作为产品运行风险保留；不阻塞程序逻辑验收。
- 诊断 Agent 复核证据：独立调用 `buildPoseControlV2` 得到 `kind=single_action_seated_v1`、`primaryAction=recline`、`templateId=single_recline_v2`、`safety.valid=true`；完整 Studio 测试 55/59 中对应 recline kind 断言失败。
- 诊断 Agent 复核结论：结构化动作计划与 recipe kind 的确定性冲突已复现，创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 删除 sofa 快捷覆盖或将其限制为静态兜底，并补充三类对照断言。
- 诊断 Agent 最终复核（2026-08-09）：中景纯函数矩阵确认 `reclining against the sofa back` 得到 primaryAction=recline、template=`single_recline_v2`、kind=`single_action_recline_v1`；lying on sofa 与 sitting on sofa 分别得到 lie/seated，三者一致且 safety 有效。原 sofa 覆盖 recline 的确定性冲突已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。此次修改引入的 wide/full kind 折叠已单独将 `ISSUE-POSE-003` 标记为 `regression`，不混入本项关闭结论。
- 诊断 Agent 再复核（2026-08-09）：medium/wide 双景别矩阵中 sitting/reclining/lying on sofa 分别保持 seated/recline/lie 的 primaryAction、templateId 和 kind，且 safety 有效；wide 动作也不再被折叠为通用 full-body kind。`ISSUE-POSE-005` 维持 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-TEST-001 OpenPose v2 测试夹具继承旧镜头与旧 kind 语义

- 优先级：P2
- 状态：verified
- 来源问题：诊断 Agent 复核本轮修复时，绕过本机 tsx userInfo 环境故障后运行完整 Studio 测试发现；与 `ISSUE-POSE-003/005` 的生成代码验收分开记录。
- 用户报告：用户要求在修复 Agent 完成后重新诊断；完整回归套件必须能区分真实代码失败和陈旧断言。
- 已确认事实：测试“近景坐姿 OpenPose”直接 spread 当前内存库首格但没有覆盖 camera；该 fixture 实际为 `camera=远景`、`cameraEn=medium shot`，按当前优先级正确得到 full_body，却断言 upper_body。测试“单人全景启用完整四肢”同样继承首格现有 visual/action 状态，当前进入 action-specific `single_action_write_tool_v2` 且 framing=full_body、18 点完整，却仍断言旧的通用 `single_full_body_v1`。
- 高概率原因：数据库迁移后的默认首格内容和 OpenPose v2 的“动作 kind 与 framing 正交”决策已变化，旧测试没有构造自包含 shot，也把完整全身 framing 错当成必须使用通用静态 kind。
- 未验证假设：其他依赖 `getStudioData(1).episode.pages[0].shots[0]` 的测试是否也存在隐式 fixture 漂移尚未全量审计；当前两项已稳定复现。
- 反证或冲突：独立显式 medium/wide 矩阵证明当前 framing 与动作 kind 数据流正确；这两项失败不能用于退回 `ISSUE-POSE-003/005`。
- 复现步骤：以 `STUDIO_DB_PATH=:memory:` 运行 `pnpm test`；检查测试 20 和 45，并打印首格 camera/action/visualSpec。当前完整结果为 54/59，其中这两项属于陈旧测试，另外三项属于 `ISSUE-UMBRELLA-001`。
- 涉及文件：`tests/studio.test.ts` 的“近景坐姿 OpenPose”与“单人全景启用完整四肢 OpenPose 模板”用例，以及测试 fixture 构造。
- 影响范围：回归套件持续红灯，掩盖真实雨伞失败并可能错误退回已经正确的 action-kind/framing 逻辑。
- 建议方案：两个测试都显式构造 camera、action、description、visualSpecConfirmed/visualSpec 和 characterLooks；全景用例断言 `framingMode=full_body`、hiddenJointIndices 为空、18 点与下肢可见，不强制动作镜头使用静态 kind。
- 验收标准：显式近景坐姿得到 upper_body 并隐藏下肢；显式全景静态人物得到 `single_full_body_v1`；显式全景工具动作保留 tool kind 且 framing=full_body、18 点完整。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 实施。
- 解决 Agent 测试：待解决 Agent修正自包含 fixture 后运行完整 Studio 套件。
- 残余风险：数据库默认种子继续变化时，其他非自包含测试也可能漂移；建议逐步清理共享首格依赖。
- 诊断 Agent 复核证据：当前内存首格打印为 `id=6,camera=远景,cameraEn=medium shot,actionEn=natural storytelling action`；测试 20 实际 full_body，测试 45 实际 action-specific kind。显式独立矩阵均通过。
- 诊断 Agent 复核结论：两条回归断言与当前架构决策确定冲突，创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent修正测试 fixture 与断言，不修改已通过的 action-kind/framing 生产逻辑。
- 诊断 Agent 最终复核（2026-08-09）：两项测试现均使用自包含 fixture：近景坐姿显式设置中景/upper-body 且关闭旧 visualSpec，全景静态人物显式设置 full shot、静态动作和干净 characterLooks。当前两项均通过，完整 Studio 套件由 54/59 提升到 56/59；剩余 3 项均稳定归属 `ISSUE-UMBRELLA-001`，不再由 fixture 漂移造成。标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-TOOL-002 工具操作被 hand/work point 文本误路由为 offer/point

- 优先级：P0
- 状态：verified
- 来源问题：用户要求继续诊断；在复核 `ISSUE-TOOL-001` 已修复的腕点几何能否从真实 prompt 链到达时发现。
- 用户报告：工具仍可能缺失、用途错误或呈现成递交/指向姿势，即使单双手腕点映射已经修正。
- 已确认事实：`deriveInteractionContract` 在工具 operate 分支之前执行 `/offer|hand(?:ing)?|give|pass/`；其中 `hand(?:ing)?` 没有单词边界，普通 `right hand`、`left hand`、`hands` 都会命中并把 screwdriver/hammer/scissors/brush 的 purpose 改成 `offer`、gazeMode 改成 `target`。同时 OpenPose v2 的通用 text source 包含 `gazeEn=eyes focused on the work point`，actionRules 的 `\bpoint\b` 会把“工作点”误认为指向动作，且 primaryOrder 让 point 优先于 interaction 补入的 write_tool。
- 高概率原因：交互用途和姿势动作都由跨字段无边界关键词扫描决定，没有优先消费结构化 relation.action/purpose，也没有区分名词 `hand/work point` 与动词 `hand over/point toward`。
- 未验证假设：更多包含 `hand` 或 `point` 的非工具句子是否也会污染 carry/read 等动作尚未全量审计；当前四类工具已稳定复现。
- 反证或冲突：`ISSUE-TOOL-001` 的直接 `purpose=operate` PoseInteractionInput 矩阵确实已修好左右腕点，因此本项是更上游的用途/动作路由新缺陷，不回退该问题的几何结论。
- 复现步骤：分别用 `using a screwdriver/hammer/scissors/brush`，并设置 `right hand` 或 `left hand` handsEn、`eyes focused on the work point` gazeEn 调用 `deriveInteractionContract` 与 `buildRegionalPrompt`。当前均得到 purpose=offer；screwdriver/hammer 得到 point+hold_carry，brush 得到 hold_carry+point，未稳定进入 operate/write_tool。
- 涉及文件：`lib/prompts.ts` 的 interaction purpose 分支，`lib/pose-v2.ts` 的 textForCharacter/actionRules/primaryOrder，相关工具测试。
- 影响范围：螺丝刀、锤子、剪刀、画笔及所有显式写出主动手或工作点视线的单手工具镜头。
- 建议方案：结构化 relation.action/purpose 优先于自由文本；将递交规则改为带边界的 `hand over/handing/give/pass/offer`，不得匹配 hand/hands；point 动作只读取 action/gesture 字段或带动词上下文，gazeTarget/work point 不得产生 point 动作。工具 match 应在通用 offer/carry 文本规则前按 relation 语义分类。
- 验收标准：左右手 screwdriver/hammer/scissors/brush 均得到 purpose=operate、gazeMode=work_point 和对应工具 pose；`work point` 不产生 point 动作，`right hand` 不产生 offer。真实 `handing a tool to another person` 仍分类为 offer/handover。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 实施。
- 解决 Agent 测试：待解决 Agent 增加四工具×左右手×operate/真实递交对照矩阵。
- 残余风险：不同工具仍可能需要 strike/cut/turn/paint 子动作；本项先保证不会被错误路由为递交或指向。
- 诊断 Agent 复核证据：独立纯函数矩阵中 screwdriver/right、hammer/left、scissors/right、brush/right 全部 purpose=offer；pose 分别出现 point/hold_carry，而不是稳定 operate/write_tool。无 hand 文本时 purpose 恢复 operate，但 `work point` 仍让 pose primary kind 变成 point。
- 诊断 Agent 复核结论：工具契约在到达已修复的腕点构建器前被两层词法误分类，创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 修正用途和动作字段的优先级与词边界，并补充真实递交反例。
- 诊断 Agent 最终复核（2026-08-09）：独立四工具×左右手矩阵确认 screwdriver、hammer、scissors、brush 均得到 `purpose=operate`、`gazeMode=work_point`、`kind=single_action_write_tool_v2`，`right/left hand` 不再触发 offer，`work point` 不再触发 point。反向用例 `handing over a screwdriver to another person` 仍得到 `purpose=offer`、`gazeMode=target`、双人 `interactionKind=handover`，说明词边界修复没有破坏真实递交语义。原两层词法误路由已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；具体工具 strike/cut/turn/paint 子动作仍作为产品扩展风险保留。

## ISSUE-PROMPT-002 仅编辑负向提示词时 recipe 仍标记 structured 且丢失编辑溯源

- 优先级：P1
- 状态：verified
- 来源问题：用户要求继续诊断；从 `ISSUE-PROMPT-001` 的 dirty/source 修复继续检查负向编辑分支时发现。
- 用户报告：生成配方需要准确说明用户是否手工修改提示词，不能把人工负向约束伪装成纯结构化生成。
- 已确认事实：单人只修改 `editableNegative` 时，UI 的 `promptDirty=true`，但 `promptEditorialDiff` 基于未改的正向 prompt 得到空字符串；请求因此发送 `promptOverride=""`、修改后的 `negativePromptOverride` 和 `promptMode=manual_override`。route 的 `promptSource` 只检查 `requestedPromptOverride`，结果仍为 `structured`；generationSpec 只保存正向 `promptOverride` trace，没有 requested/applied negative override trace。
- 高概率原因：prompt provenance 设计只围绕正向 editorial layer，负向提示词虽参与实际请求，却没有自己的 dirty diff、source 判定和 recipe 审计结构。
- 未验证假设：多人只修改区域负向提示词时是否还存在额外 source 偏差尚未逐 UI 分支运行；当前单人分支由代码可确定复现。
- 反证或冲突：最终 `effectiveNegativePrompt` 会包含用户文本，所以不是负向内容完全未发送；确定丢失的是来源语义和可审计 requested/accepted diff。
- 复现步骤：单人镜头保持正向提示词不变，仅在负向提示词追加一个合法短语并点击编辑后生成；检查请求与 recipe。当前实际 negative 已变化，但 `promptSource=structured`、`generationSpec.promptOverride=null`，且无 negativeOverride trace。
- 涉及文件：`app/page.tsx` 的 promptDirty/promptEditorialDiff/generateEditedPrompt，`app/api/studio/route.ts` 的 requestedNegativeOverride、promptSource 和 generationSpec recipe。
- 影响范围：所有只修改负向提示词的手工生成；审计、复现、问题排查和后续 UI 展示会误认为未进行人工编辑。
- 建议方案：正向和负向分别计算 dirty/diff；promptSource 由任一 accepted override 决定；recipe 分别保存 positive/negative 的 baseline、requested、accepted、repairs/dropped，并在未变化时保持 structured。
- 验收标准：只改负向时 source=manual_override 且 recipe 保存准确负向差异；只改正向、两者都改和完全未改四种矩阵来源正确，尾部负向编辑不丢失，完整旧负向 prompt 不重复。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增 `buildCanonicalNegativePromptTrace`，正负编辑分别提取差异；负向 recipe 保存 baseline/requested/applied/droppedTerms/accepted，超过 96 个合法编辑词项时 route 返回 422，禁止静默截断。
- 解决 Agent 测试：新增负向编辑 100 词项纯函数断言，确认 accepted=false、droppedTerms=4 且尾项不进入 applied；`tsc --noEmit --incremental false` 通过，完整 Studio 测试受本机 tsx ENOMEM 阻断。
- 残余风险：负向编辑未超过上限时仍需诊断 Agent 核对 API recipe 的 requested/applied 传递；自由负向词与结构化契约的语义冲突仍需人工审批。
- 诊断 Agent 复核证据：UI 与 route 数据流静态推导为 `promptDirty=true → promptEditorialDiff="" → requestedPromptOverride="" → promptSource=structured`，同时 `requestedNegativeOverride` 实际参与 `buildCanonicalNegativePrompt` 但没有进入 provenance trace。
- 诊断 Agent 复核结论：实际请求与 recipe 来源字段确定性不一致，创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 为负向提示词建立独立 diff 与溯源，并让 source 同时消费正负 accepted override。
- 解决 Agent 本轮修改（2026-08-09）：正负 override 均按 compiled baseline 提取差异；只改负向时 source 与 negative requested/applied trace 同步记录。完整测试受本机 `tsx` 的 `uv_os_get_passwd/ENOMEM` 阻断，等待诊断复核。
- 解决 Agent 本轮补修（2026-08-09）：负向 canonical 合并预算由 72 项提升至 140 项，避免长但合法的 editorial diff 被静默截断。
- 诊断 Agent 最终复核（2026-08-09）：route 现以 `negativeOverrideAccepted` 参与 `promptSource`，只改负向时会标为 `manual_override`；recipe 也新增 requested/applied/accepted 记录，原“伪装 structured 且无 trace”已实质修复。但 UI 仍发送整份 `editableNegative`，recipe 的 requested 保存整份旧负向而非准确差异；`buildCanonicalNegativePrompt(..., 72)` 对 72 项合法基线加尾部编辑的纯函数用例稳定丢弃尾部 `oversaturated cyan fog`，没有 dropped/超限告警。未满足准确 diff 与尾部编辑不丢失验收，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最新复核（2026-08-09）：单项负向尾部编辑现会相对 `compiled.negativePrompt` 提取准确 diff；`oversaturated cyan fog` 独立用例只记录该差异、进入 applied negative，并使 source=`manual_override`，原来源与单项溯源缺陷通过。但较长合法编辑仍被 `compactPrompt(...,72)` 静默截断：当前区域负向最多的镜头请求 25 个差异项时只应用 16/17 项，尾部第 25 项丢失，而 recipe 仍统一写 `accepted:true` 且无 dropped/超限信息。预算与 accepted trace 不一致，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-09）：预算由 72 提升到 140 后，上一轮 25 项长编辑矩阵已全部保留；单项 diff/source/recipe 路径继续通过。但 UI/API 没有明确的负向编辑长度或 term 上限，route 也不做超限 422/dropped trace：区域负向最多的当前镜头请求 100 个合法差异项时只应用 84 项，尾部第 100 项丢失，`negativePromptOverride.accepted` 仍固定为 true。提高常量只移动静默截断边界，未消除 accepted 与实际 applied 不一致，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 通用性复核（2026-08-09）：当前 route 仍无负向 override 长度/term 上限、422 或 dropped trace，`generationSpec.negativePromptOverride.accepted` 仍固定写 true；`compactPrompt` 到预算后直接 break。上一轮 100 项输入静默丢失尾项的路径未被修改，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-10）：`buildCanonicalNegativePromptTrace` 先相对结构化 baseline 提取准确 editorial terms，再明确限制为 96 项并返回 requested/applied/droppedTerms/accepted；route 在存在 droppedTerms 时返回 422，未超限时由负向 diff 参与 `promptSource=manual_override`，recipe 保存 baseline、requested、applied、accepted 与 droppedTerms。100 项矩阵稳定得到 dropped=4 且尾项未被伪装为已应用；该用例通过，TypeScript 与 worker/台账测试也通过。原“只改负向仍标 structured”和“静默截断却 accepted”两条路径均已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；自由负向词与结构化契约的语义冲突仍由人工审批承担。

## ISSUE-TEST-002 双人递交测试要求腕点完全重合，与防融合几何约束冲突

- 优先级：P2
- 状态：verified
- 来源问题：诊断 Agent 复核 `ISSUE-UMBRELLA-001` 最新修复并运行完整 Studio 套件时发现；属于测试契约冲突，不与雨伞边缘 mask 的生产代码缺陷混合关闭。
- 用户报告：用户要求继续诊断修复结果；完整测试仍有双人递交失败，需要区分生产逻辑失败与陈旧断言。
- 已确认事实：`tests/studio.test.ts` 的区域递伞用例要求接收腕在递出腕左侧且横向距离 `<0.06`，handoff prompt 同时要求 `clearly separated wrists`、负向排除 `fused hands`；但“ 双人递交和握手的腕部接触点闭合”用例又要求两腕欧氏距离 `<0.001` 且 `contactError===0`。对于 handover，这两组断言无法同时成立：有序分离要求非零距离，后一组要求完全重合。
- 高概率原因：接触安全测试沿用了“接触点必须同点”的旧模板语义，没有随防融合设计改成“双方手腕位于同一交接区且保持小的可读分离”。
- 未验证假设：握手是否仍应允许腕点完全重合可按具体模板单独定义；当前确定冲突发生在 handover，不需要把握手标准一并猜测修改。
- 反证或冲突：当前 target±0.035 的 handover 腕距 0.07 已低于 `validatePosePeople` 的 0.08 安全阈值，但仍超过区域递伞 `<0.06`；这部分生产几何缺口继续归入 `ISSUE-UMBRELLA-001`，不能用测试冲突掩盖。
- 复现步骤：以 `STUDIO_DB_PATH=:memory:` 运行完整 Studio 套件；检查测试 9 与测试 31 的腕点断言。将 handover 腕距设为任意正数可满足左右顺序但失败 `contactError===0`；设为 0 则失败左右顺序。
- 涉及文件：`tests/studio.test.ts` 的 Regional Prompter 递伞断言和“双人递交和握手的腕部接触点闭合”用例；`lib/pose-v2.ts` 的 handover 关节与安全阈值。
- 影响范围：完整回归套件无法在 handover 上形成一致验收，会诱导修复 Agent 在“腕点融合”和“腕点可读分离”之间来回修改。
- 建议方案：把 handover 与 handshake 分开断言；handover 要求腕点有稳定左右顺序、距离处于非零且不超过接触阈值的区间，并与区域递伞用例共用同一阈值；handshake 可按自身模板决定是否允许同点。
- 验收标准：handover 的区域提示词测试、通用双人模板测试和安全校验使用一致的非零接触区间，既不触发融合也不超过闭合阈值；handshake 具有独立断言。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 实施。
- 解决 Agent 测试：待解决 Agent 更新自洽断言后运行完整 Studio 套件。
- 残余风险：ControlNet 对两只手在同一把手附近的实际分离度仍受模型影响，作为产品运行风险保留。
- 诊断 Agent 复核证据：当前测试 9 要求 `receiverWrist.x < giverWrist.x`，测试 31 对同一 handover 要求腕距 `<0.001`/`contactError=0`，逻辑上不可同时满足；当前完整结果 57/59，两项失败均可由这组阈值和 `ISSUE-UMBRELLA-001` 的 0.07 腕距解释。
- 诊断 Agent 复核结论：handover 测试契约存在确定性互斥，创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 统一 handover 非零接触区间并保留 handshake 独立语义。
- 诊断 Agent 最终复核（2026-08-09）：测试已将 handover 与 handshake 分开：handover 要求腕距 `>0 && <.06` 且 safety contactError `<=.08`，handshake 保留完全接触语义。当前生产 handover 腕距 .05，同时满足区域递伞、通用模板和安全阈值；Studio 59/59 通过。互斥断言已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-GAZE-004 看手机目标未驱动头部骨架且正脸身份控制重复压制视线

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-10）：非镜头视线的 gaze inpaint 除身份 ControlNet 外，按 `poseControl` 生成同一人物的姿态 ControlNet，并与 gaze mask 一起发送；`gazeTrace.controlUnits` 与 `passTraces` 记录实际身份/头部控制单元、权重、mask、目标框和请求状态，避免只记录 `headDirection` 文本而未进入采样。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：用户提交最新 `job 404` 效果图并要求彻底排查“看手机动作做不出来、人物一直看镜头”；关联已关闭的 `ISSUE-GAZE-001`、`ISSUE-IDENTITY-001` 和 `ISSUE-PIPELINE-001`，但本项针对最新 OpenPose v2 头部几何与三阶段身份控制之间仍存在的确定性冲突。
- 用户报告：人物没有低头看手机，而是保持正脸并与观众对视；同类现象在连续多次生成中重复出现。
- 已确认事实：`job 404` 的结构化目标为 smartphone `(0.38,0.58)`，pose plan 也记录 `facing=left`、`primaryAction=read_phone`，但实际 COCO 头部点为 nose `(0.50,0.12)`、双眼 `(0.475,0.11)/(0.525,0.11)`、双耳 `(0.455,0.12)/(0.545,0.12)`，是完全对称的正脸。`lib/pose-v2.ts` 的 `facePoints` 永远围绕 nose 对称生成；`facing` 只有 `turn` 分支才会改变 nose，`read_phone` 不消费 target 来生成头部朝向。该任务还因 smile 命中 `head_gesture`，contact 阶段把 nose.y 从 `0.16` 减到 `0.12`，即目标在下方时反而向上移动头点。基础 txt2img、identity inpaint、gaze inpaint 三个阶段均携带同一张正脸身份参考；基础权重 0.8，后两次权重 0.78，control mode 均为 `ControlNet is more important`。最终 PNG 元数据证明 gaze pass 虽写入 `down-left target at 0.38,0.58` 和禁止镜头视线，但仍携带该正脸 face IP-Adapter，成图继续正视观众。
- 高概率原因：文字视线约束在采样时同时受到“完全对称的正脸 OpenPose”和连续三次正脸身份 conditioner 的反向结构信号；最后的 gaze pass 只对白色脸部椭圆做 inpaint，没有方向化头部骨架，也没有重绘颈部、肩部与手机之间的姿态关系，因此很难把已经形成的正脸肖像改成低头阅读动作。
- 未验证假设：正脸 OpenPose、基础身份 reference、identity pass 和 gaze pass 四项各自对最终镜头凝视的量化贡献尚未做 A/B；这不影响“target 未进入头部几何”和“三阶段重复正脸 conditioner”两条代码事实成立。
- 反证或冲突：`gazeMaskGeometry` 已正确记录 face→target 的 `down-left` 向量、目标坐标和实际 crop，最终 prompt/negative 也包含 no eye contact；所以本次不能再归因于“缺少视线文字”“mask 使用了手机中心”或“crop 看不到目标”。
- 复现步骤：读取 `job 404` recipe 与最终 PNG parameters；对任意 left/down/right smartphone target 调用 `buildPoseControlFromPlan`，可由当前 `facePoints(points[0])` 路径静态证明双眼和双耳仍关于 nose 完全对称，且没有 target/facing 参与头部点计算。加入 smile/head_gesture 后，contact 阶段固定执行 nose.y-0.04，与下方目标方向相反。
- 涉及文件：`lib/pose-v2.ts`、`scripts/sd-worker.mjs`、`scripts/sd-worker-logic.mjs`、`tests/studio.test.ts`、`workspace/generated/sd-draft-job-404-6dd58ef2-84f6-4aec-b5e9-84d0c49e8e91.png`、job 404 recipe。
- 影响范围：看手机、阅读、书写、工具工作点、人物对视及所有 target 不在镜头方向的单人动作；带 smile/nod 等 head_gesture 的镜头风险更高。
- 建议方案：让结构化 gaze target/facing 直接生成方向化 nose/eye/ear/neck 几何，并把 head_gesture 作为相对目标方向的叠加量而不是固定上移；基础 pose、identity 与 gaze pass 共享同一 head-direction plan。非镜头视线时应避免三阶段都以 `ControlNet is more important` 重复施加正脸参考，或采用不会覆盖姿态方向的身份权重/时段/区域策略；recipe 保存三个实际 ControlNet unit 与 head-direction trace。
- 验收标准：left/down/right/down-left 四种目标会产生可区分且与目标同向的 nose-neck/face keypoint 几何；read_phone+smile 不得把头部朝远离手机的方向移动；基础、identity、gaze 三个请求中不存在与 off-camera head plan 冲突的正脸控制，最终修改脸部的请求同时保留身份和方向化姿态证据；测试覆盖 target/facing/head_gesture/无 pose 回退矩阵。程序逻辑验收，不生成图片。
- 解决 Agent 修改：OpenPose `headDirection` 消费 target/facing，眼睛和耳点不再围绕鼻点完全对称；`head_gesture` 按目标相对方向叠加。identity/gaze payload 改为非镜头视线的方向化文案，并在 trace 保存 headDirection；连续面部 pass 继续复用同一 face geometry 与 characterId identity reference。
- 解决 Agent 测试：新增看手机下方目标的方向化头部、非对称眼点和 sofa support relation 断言；`tsc --noEmit --incremental false` 通过，未启动 SD。
- 残余风险：模型对方向化 OpenPose 和身份参考的实际服从率仍需诊断 Agent 复核/运行观察；本轮未生成图片。
- 诊断 Agent 复核证据：`job 400` 至 `job 404` 的现有生成图均保持正视观众；`job 404` 是最新代码路径且明确使用结构化 smartphone relation、方向化 gaze prompt 和正确 crop，因此重复失败与上述正脸骨架/身份控制冲突一致。纯函数矩阵运行受本机 `tsx` 的 `uv_os_get_passwd/ENOMEM` 阻断，但实际 recipe 坐标和静态代码路径已提供确定性证据。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；已提供的 job 404 图片仅作为运行失败证据，修复验收以请求与几何数据流为准。
- 后续处理：解决 Agent 先修方向化头部 pose 与 head_gesture 合成，再调整 off-camera 身份 conditioner 的阶段策略并补齐请求 trace。
- 诊断 Agent 通用性复核（2026-08-09）：纯函数对 read_phone、write_tool 与 read_phone+head_gesture 执行 left/right/down/down-left 矩阵，nose/neck 已随 target 产生不同横纵偏移；下方目标叠加 head_gesture 时 nose 继续下移，不再反向抬头。off-camera 的基础、identity、gaze 三阶段身份单元也已降为实际 weight<=.68 且 control mode=Balanced，属于实质修复。但 `requestTrace` 仍只保存 prompt/negative，不保存基础 ControlNet units；identity/gaze trace 记录的是 `faceRefinementPassPlan.identityControl.weight`（最多 .78），而实际 payload 又二次截为 .68，recipe 与真实请求不一致，也没有专门测试覆盖这些新分支。方向几何通过、三阶段审计未闭合，标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent job 405 运行证据（2026-08-09）：最新图中人物已明显低头，recipe nose 从 job 404 的 `(0.50,0.12)` 变为 `(0.4496,0.2808)`，最终 PNG parameters 使用 `direction=down`、target `(0.38,0.58)`、实际 identity weight=.68/Control Mode=Balanced；旧“持续看镜头”的主要运行症状得到改善。由于 recipe 的 face trace 仍写 weight=.78 且基础 control units 仍未记录，状态保持 `partially_fixed`。程序逻辑验收未完全通过，未由 Agent 生成图片或执行视觉效果验收；job 405 仅作为用户提供的运行证据。
- 诊断 Agent job 406 复核（2026-08-10）：用户最新附件 1 精确对应 job 406，人物再次直视观众。PNG 最终参数证明 gaze pass 已发送 down target `(0.38,0.58)`、禁止镜头视线并使用 `.68/Balanced` 身份单元，所以不是文字约束缺失；当前 `gazePayload` 的 ControlNet 仍只有正脸身份 IP-Adapter，没有继承 OpenPose 头部方向或任何眼部方向结构 guide，后序脸部重绘可再次覆盖基础头部几何。recipe 也没有保存 gaze 实际 control units/阶段输出，无法审计哪一阶段回正。方向化基础骨骼有效但最终 pass 数据流仍未闭合，保持 `partially_fixed`。程序逻辑验收未通过，未由 Agent 生成图片或执行视觉效果验收；job 406 仅作用户提供的运行失败证据。
- 诊断 Agent 本轮复核（2026-08-10）：`headDirection`、非对称眼耳点和 off-camera 身份权重调整仍在，但最后一次修改脸部的 `gazePayload` 只在 `alwayson_scripts.ControlNet.args` 中放入 `gazeIdentityUnit`；新记录的 `headDirection` 仅存在于 trace，OpenPose/方向结构图没有进入最终采样。因而最终 gaze inpaint 仍可确定性覆盖基础头向并重新生成镜头眼神，正是 job 406 已出现过的失败分支。该缺口与新增 support/gaze 组合测试中的 framing 失败相互独立，状态保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-10）：方向化 nose/eye/ear/neck 几何继续由结构化 target 驱动，off-camera 身份单元保持降权与 Balanced；最后修改脸部的 `gazePayload` 现同时发送 matching identity unit 与带同一 gaze mask 的 `head_direction_pose` OpenPose unit，实际 args、权重、mask、direction、targetBox 和成功/失败状态均写入 `gazeTrace.controlUnits/passTraces`。最终采样不再只有正脸身份参考，原 job 406 的确定性回正数据流已消除。TypeScript、worker/台账 11/11、worker 语法及相关 gaze 纯逻辑路径通过，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；三人以上无自动 pose 的情况继续按既有人工降级规则处理。

## ISSUE-PROP-003 手机结构未进入基础生成且道具 pass 将协议成功误记为动作完成

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：基础/后置阶段的 `stageOutputs` 现在为初始图、身份、generic prop、gaze、umbrella handoff 持久化独立 PNG，并在 `passTraces.output` 写入相对路径、字节数和 SHA-256；阶段输出不再伪装为最终图的 in-memory 引用。`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-11）：基础与后置道具几何继续共用 relation-level pose target；阶段 trace 增加 in-memory 输出引用，bag/dish 初始 guide 与后置 shape 拓扑一致，避免非矩形道具回退成矩形。`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-10）：基础 guide 增加 `bag` 与 `dish` 的真实轮廓，保持与后置 guide 的 shape 拓扑一致；`passTraces` 增加无 base64 的 in-memory 阶段输出引用、请求状态和控制摘要，可区分 generic prop/gaze/handoff 阶段。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：基础 prop Canny 按 relation 的 shape、surface plane、screen/back/side/three-quarter 结构、接触圆点和深度边界生成 guide；同一请求记录 `controlUnitTrace`，每个 generic prop/gaze/handoff 请求记录 `passTraces`（relationId、实例、mask bounds、控制单元和成功/失败状态），semantic review 按 `propInteractions[]` 汇总。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：用户提交 `job 404` 最新效果图；与已关闭的 `ISSUE-PROP-002` 不同，本项不讨论人工审批门，而是排查“看手机动作为什么生成不出来”的基础生成、局部修复和执行审计链。
- 用户报告：最新图中完全没有手机，双手退化为在裙前交叠，因而不存在“拿手机并阅读”的剧情动作。
- 已确认事实：`job 404` 的结构化 relation、prompt、negative、OpenPose 双腕目标和 prop repair contract 均正确识别 smartphone，故不是关键词或 visualSpec 漏识别。`scripts/sd-worker.mjs` 的基础 txt2img `controlUnits` 只加入身份 reference 与 OpenPose；smartphone 的 portrait Canny guide 不在基础生成中，而是在 identity inpaint 之后才进入单独的 prop img2img。OpenPose 只把两个 wrist 放在 `(0.335,0.58)/(0.425,0.58)`，不表达手机实体、屏幕面、朝向或手指握持。prop 请求只要 HTTP 2xx 且返回任意图片就把 `relationTraces.status` 写成 `completed`；不检查手机是否存在、是否竖持、双手是否接触，也不保存该阶段输出或无 base64 的实际 payload trace。`job 404` 最终没有手机、`postprocessWarnings=[]`、relation 却为 `completed`。
- 高概率原因：基础构图先形成“人物空手/双手靠拢”的局部最优，后置小区域 inpaint 需要同时重建手机、双手、手指和接触拓扑，单次 draft denoise 0.54 即使忽略 Canny 或只重绘衣物也被当作成功；随后的 gaze pass 只改脸，无法补回手机和握持动作。
- 未验证假设：job 404 的 prop 中间图究竟是“完全没有手机”还是后续阶段又抹除手机无法直接确认，因为当前 worker 不保存阶段输出；但 gaze pass 的白色 mask 只覆盖脸部，最终手机缺失更可能已发生在 prop pass，具体阶段归因应由新增 trace 关闭。
- 反证或冲突：prop pass 确实构建 portrait rectangle guide、道具/双手 mask 和强正负提示词，因此“系统完全没有手机约束”不成立；确定缺陷是关键结构约束没有参与基础生成，以及执行状态把传输成功等同于语义完成。
- 复现步骤：读取 `job 404` recipe 和 `scripts/sd-worker.mjs`：初始 `controlUnits` 只有 references/pose；prop Canny 仅在后处理循环创建。核对最终 PNG 可见手机缺失、双手交叠，同时 recipe 为 `relationTraces[0].status=completed`、`postprocessWarnings=[]`。`job 400/401` 也只形成横向黑色物体且人物仍未阅读，说明晚期修补长期不能稳定落实完整关系。
- 涉及文件：`scripts/sd-worker.mjs`、`lib/pose-v2.ts`、`scripts/sd-worker-logic.mjs`、任务 recipe/调试 trace。
- 影响范围：手机、书本、工具及所有需要“对象实体+双手/单手接触+可见表面+视线”联合成立的动作；对象越关键、接触拓扑越复杂，晚期局部重建风险越高。
- 建议方案：让 required prop 的结构 guide 与 hand/object geometry 在基础生成阶段共同参与 conditioning，或把可复现的 object/hand scene plan 合并到首轮 ControlNet；后处理按明确 pass contract 保存输入摘要、mask/guide bounds、输出阶段和状态。`completed` 只表示语义验收通过，协议成功应记录为 `request_succeeded`/`manual_review_required`；没有像素检测器时不得伪造完成，应保留待人工逐项 verdict。
- 验收标准：required smartphone 的基础请求可证明同时包含人物 pose 与 portrait phone/hand-object 结构控制，且腕点、对象框、mask 与 guide 使用同一 target；prop pass trace 区分 request success、semantic pending、completed、failed，保存无 base64 payload 摘要和阶段输出路径；无检测器时不会把返回图片自动标成 relation completed。测试覆盖手机存在/缺失的状态机、单/双手、portrait/landscape 与 repair 异常回退。程序逻辑验收，不生成图片。
- 解决 Agent 修改：初始 txt2img 结构控制从首条 relation 改为全部 required `propInteractions`，每个初始 Canny unit 记录 relationId/objectInstanceId/expectedCount；worker relation trace 区分 `requestStatus=succeeded` 与最终 `semantic_pending`，协议成功不再伪装成动作语义完成。
- 解决 Agent 测试：新增多关系初始结构控制和 semantic_pending 状态路径代码断言；`tsc --noEmit --incremental false` 通过，完整 Studio 测试受本机 tsx ENOMEM 阻断，未启动 SD。
- 残余风险：没有像素检测器时手机是否真的出现、方向是否正确仍需人工语义审批；接触/深度由 ISSUE-PROP-004 继续复核。
- 诊断 Agent 复核证据：job 404 的 `propInteraction.required=true`、`object=smartphone`、`orientation=portrait`、Canny model 存在，但基础 request trace 无 prop control，最终成图无手机而 relation status=`completed`；该状态与实际动作结果确定性不一致。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 将手机/手物结构前移到基础 conditioning，并修正 relation trace 状态语义与可审计证据。
- 诊断 Agent 通用性复核（2026-08-09）：首个 required relation 的结构 guide 已进入基础 ControlNet，后处理状态也改为 `request_succeeded` 后落到 `semantic_pending`，不再伪造语义 completed，属于实质修复。但基础阶段使用 `.find(required)` 只消费第一条关系，且无论 smartphone、tool、umbrella、bag 均只按 orientation 画矩形，不消费后处理已有的 `shape` 几何；多道具和非矩形道具仍未通用覆盖。`requestTrace` 也未保存 initial prop unit、mask/guide 摘要或阶段输出路径。标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent job 405 运行证据（2026-08-09）：手机已按基础 guide 出现在 target `(0.38,0.58)` 且为 portrait，relation status 也诚实保留为 `semantic_pending`，证明前移结构与状态语义修复实际生效；但手机成为前景独立立牌，人物双手未接触。二维位置/朝向命中不能证明 hand-object relation 成立，剩余接触拓扑缺陷另建 `ISSUE-PROP-004`，本项继续保持 `partially_fixed`。
- 诊断 Agent job 406 复核（2026-08-10）：基础 request trace 已明确记录 identity、OpenPose 与首条 smartphone Canny 三个单元，relation 继续诚实停留在 `semantic_pending`，原“未前移/伪 completed”两点已改善。但初始阶段仍只用 `.find(required)` 取第一 relation、按固定全图比例画矩形，且不保存后续 prop pass payload/阶段图；job 406 又出现主手机立牌与第二部手机。保持 `partially_fixed`，实例数量问题另建 `ISSUE-PROP-005`，接触/深度继续由 `ISSUE-PROP-004` 处理。程序逻辑验收未通过，未由 Agent 生成图片或执行视觉效果验收。
- 诊断 Agent 本轮复核（2026-08-10）：基础结构阶段已从 `.find` 改为遍历全部 required relations，初始 request trace 也会列出 relationId/stage，协议成功继续诚实停留在 `semantic_pending`，这两项修复有效。但初始 guide 对 smartphone、tool、bag、umbrella 等仍统一绘制矩形，只按 portrait/非 portrait 改宽高，没有消费后置已有的 `shape`；工具和雨伞会在基础阶段收到错误物体拓扑。request trace 仍不保存 objectInstanceId/expectedCount、mask/guide bounds，后置 prop/gaze 请求也没有无 base64 payload 或阶段输出摘要。结构前移的通用性与阶段审计仍未闭环，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-10）：全部 required relations、phone/tool/umbrella/cylinder 形状、surface plane、接触点与 control/pass trace 已进入基础和后置请求，relation 状态也诚实停留在 semantic_pending，主要缺陷已实质修复。但初始 shape switch 仍未实现 contract 已声明的 `bag` 与 `dish`，两者会回退成普通矩形，与后置 bag/dish guide 不一致；`passTraces` 只记录请求摘要与状态，仍没有验收标准要求的阶段输出路径，无法区分对象是在 prop 阶段缺失还是被后续阶段破坏。通用形状与阶段归因仍有具体缺口，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent job 407 运行证据（2026-08-11）：最终草稿存在腿部附近的横向屏幕对象以及脸前黑色物体，未形成“唯一竖屏手机、双手持握、低头阅读”。generic prop 与 gaze trace 均只记录 `in_memory_image` 且声称 `persistedAtFinalization=true`，实际只保存最终 PNG，无法判断错误对象由基础、prop 还是 gaze 阶段产生，继续证明阶段归因缺口。relation 诚实保留 `semantic_pending`，因此状态仍为 `partially_fixed`。用户图片仅作运行证据，诊断 Agent 未生成图片。
- 诊断 Agent 本轮复核（2026-08-11）：bag/dish 基础轮廓和 semantic pending 状态修复有效；但 generic prop、gaze、umbrella handoff 的 `passTraces.output` 仍只有 `kind=in_memory_image`，并把 `persistedAtFinalization` 写为 true。worker 只在所有后处理结束后保存最终 `response.images[0]`，没有阶段输出路径或内容标识，后续 pass 覆盖后仍无法定位对象在哪一阶段丢失。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-11）：worker 现于 initial、每个 identity refinement、generic prop、gaze 和 umbrella handoff 成功后立即把对应 base64 写入独立 `workspace/generated/stages/*.png`；`passTraces.output` 与 `recipe.stageOutputs` 保存相对路径、字节数和 SHA-256，最终又通过 `payload.recipe={...recipe}` 写回 jobs payload。后序 pass 不再覆盖前序审计证据，原虚假 in-memory 持久化声明已移除；基础多关系结构、bag/dish 拓扑和 semantic_pending 状态保持闭合，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；实际道具服从率继续由人工语义审批承担。

## ISSUE-BUILD-002 relationTargets 读取未声明的 relationId 导致 TypeScript 编译失败

- 优先级：P0
- 状态：verified
- 来源问题：诊断 Agent 通用性复核 `ISSUE-INTERACTION-001` 最新修复并运行完整类型检查时发现。
- 用户报告：用户要求核查修复是否站在通用性角度；当前新增的多关系 pose 数据在静态类型层无法通过项目编译。
- 已确认事实：`lib/pose-v2.ts` 的 `PoseInteractionInput` 只声明 characterId、required、object、purpose、handMode、objectCenter、region 和可选 gazeMode，没有 `relationId`；同文件构建 `relationTargets` 时读取 `relation.relationId`。`npx tsc --noEmit` 稳定报告 `lib/pose-v2.ts(404,128): TS2339 Property 'relationId' does not exist on type 'PoseInteractionInput'`。
- 高概率原因：实现 `relationTargets` 时只扩展了 `PosePersonPlanV2` 输出类型，没有同步扩展 pose 输入接口；运行测试由 tsx 转译且不做完整类型检查，因此 59/59 绿灯未发现该错误。
- 未验证假设：Next build 是否会在当前配置下同样阻断尚未单独运行；TypeScript 检查已足以确认源码契约不一致。
- 反证或冲突：上游 `InteractionContract` 已有稳定 relationId，问题不是运行数据缺失，而是 pose 接口类型未同步。
- 复现步骤：在项目根目录运行 `npx tsc --noEmit`，观察上述 TS2339；或比较 `PoseInteractionInput` 声明与第 404 行读取。
- 涉及文件：`lib/pose-v2.ts`、`lib/prompts.ts`、多关系 pose 测试。
- 影响范围：所有调用 `buildPoseControlV2` 的构建、类型检查和编辑器类型推导；阻断多关系修复的可靠交接。
- 建议方案：在 `PoseInteractionInput` 中声明并贯通可选或必需的 relationId，并确保所有构造点传入稳定 ID；新增类型/运行矩阵，避免仅在输出层保存 relationId。
- 验收标准：`npx tsc --noEmit` 通过；所有 PoseInteractionInput 构造点的 relationId 策略一致，legacy 输入有明确回退；多关系 pose 测试验证 ID 不丢失。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 实施。
- 解决 Agent 测试：待解决 Agent 运行类型检查与多关系 ID 矩阵。
- 残余风险：即使类型通过，`relationTargets` 当前仍未被关节构建消费；该执行缺口继续归入 `ISSUE-INTERACTION-001`，不得用本项关闭。
- 诊断 Agent 复核证据：Studio 59/59、worker 8/8 和台账 3/3 均通过，但随后类型检查稳定失败，证明现有测试缺少编译契约覆盖。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 同步 pose 输入类型与所有调用点；修复后独立复核，但继续保留多关系几何问题。
- 诊断 Agent 最终复核（2026-08-10）：`PoseInteractionInput` 已声明可选 `relationId`，`poseInteractionInput` 与复数关系映射均保留该字段，legacy 输入仍允许无 ID 回退；`node node_modules/typescript/bin/tsc --noEmit --incremental false`、Studio 59/59、worker/台账 11/11 和 worker 语法检查通过。原 TS2339 编译阻断已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；`relationTargets` 未被关节构建消费的执行缺口继续保留在 `ISSUE-INTERACTION-001`。

## ISSUE-PROP-004 道具局部重绘覆盖双手却丢失腕点、接触与深度关系

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：`relation_target_plan` 接触锚点现在进入 `hasPoseContact` 成功路径，geometry source 不再回退到全人物区域，物体宽度继续从关系级腕点/接触跨度推导，并保留同一 relation 的 pose+Canny mask。`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-11）：`propInteractionGeometry` 按 relationId 消费 scene plan 的 relation target/wrist plan，不再从被其他关系改写的最终整张骨架反推当前接触；同一局部 mask 继续同时携带 pose+Canny，并保留冲突与遮挡顺序 trace。`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-10）：`propInteractionGeometry` 接收对应 pose scene plan，按 `relationId` 使用关系级 target/wrist plan，避免从被其他关系改写的最终腕点反推本关系；单手/双手分配与同一 mask 内的 pose+Canny 控制保持一致，冲突显式进入 relation trace。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：generic prop geometry 优先读取对应人物 OpenPose 左/右腕，使用实际腕距计算道具尺寸；geometry 写入 `contactAnchors/depthPlane/occlusionOrder/source`，姿态与 Canny 控制单元共用同一局部 mask，并在 prompt/trace 中明确手在接触锚点前方、道具连续和表面深度顺序。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：用户提交最新 `job 405` 效果图并要求继续诊断；关联 `ISSUE-PROP-003`，但本项针对结构 guide 已成功生成手机后，人物仍未持握且手机变成前景陈列物的新失败机制。
- 用户报告：人物虽然低头了，手机也出现了，但手机独立竖立在画面前景，尺寸和透视像展示牌，双手没有拿手机，仍不是“看手机”的动作。
- 已确认事实：job 405 的 smartphone target 为 `(0.38,0.58)`，OpenPose 双腕为 `(0.335,0.58)/(0.425,0.58)`，最终手机中心与竖向尺寸基本命中基础 Canny guide，说明坐标和 portrait shape 已执行。后置 prop mask 同时覆盖物体矩形和一至两个手部圆区，但 prop img2img 的 ControlNet 只携带物体 Canny guide，不再携带原 OpenPose 人体/腕点控制；draft denoise=.54 会重绘整个手物区。`InteractionContract` 只有 `objectCenter/shape/handMode/orientation/viewerSurface`，没有左右手接触锚点、人物相对尺度、持握深度平面、物体与躯干的遮挡关系。job 405 因此得到二维位置正确、三维关系错误的独立前景手机，relation 正确停留在 `semantic_pending`。
- 高概率原因：基础阶段的 OpenPose 与手机 Canny 只通过相同二维中心松散叠加；后置局部重绘又在覆盖双手的 mask 内仅保留物体轮廓控制，确定丢失腕点约束。提示词还同时要求“人物可读”和“screen surface readable to viewer/通知对观众可见”，在没有深度与接触几何时容易把手机解释为面向观众的前景展示物。
- 未验证假设：手机是在基础阶段已经独立竖立，还是 prop pass 擦除了原有手部接触，当前无法精确归因，因为 worker 不保存各阶段图片和无 base64 payload；两阶段均缺少完整 hand-object-depth plan 是确定事实。
- 反证或冲突：这次不是手机缺失、横竖方向错误、目标坐标错误或视线仍看镜头；这些环节已分别命中。失败点明确收敛为人物—手—物体的接触拓扑、相对尺度与深度平面没有进入结构控制。
- 复现步骤：读取 job 405 recipe 和最终图；核对手机中心/尺寸与 `(0.38,0.58)` guide 一致、腕点也位于两侧但成图无接触。检查 `scripts/sd-worker.mjs` prop payload，mask 包含手区而 `alwayson_scripts.ControlNet.args` 只有 canny 单元，没有 poseImageBase64/OpenPose 单元。
- 涉及文件：`lib/prompts.ts` 的 `InteractionContract`，`lib/pose-v2.ts` 的腕点/target 计划，`scripts/sd-worker.mjs` 的 initial prop 与 prop img2img，recipe pass trace。
- 影响范围：手机、书本、杯子、包、工具等所有必须与手或身体形成物理关系的道具；也影响递交、阅读、操作、饮食和持物场景。二维目标相同但前后景不同的镜头尤其高风险。
- 建议方案：建立共享 `PropInteractionGeometry`，至少包含 object box/scale、depth plane、actor-relative anchor、left/right hand contact anchors、active/support hand 和遮挡顺序；基础 pose、基础 prop guide、后置 mask 与后置 ControlNet 共用它。prop pass 覆盖手区时必须同时携带对应 OpenPose/接触 guide，不能只保留物体 Canny；提示词区分“viewer 可辨认”与“正对观众陈列”。保存每阶段输出和去 base64 的实际控制摘要。
- 验收标准：phone/book/cup/tool/bag 的单手、双手、胸前、膝上、侧方和递交矩阵均生成可审计的 object scale/depth/contact anchors；prop mask 覆盖腕手时 payload 同时包含与同一 relationId 对应的 pose/contact 与 shape control；不同景别的对象尺寸由人物/手部尺度推导，不使用固定全图比例；阶段 trace 可证明基础与修复请求没有丢失接触拓扑。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增 `propInteractionGeometry`，优先读取对应人物 OpenPose 腕点，生成对象 bounds、左右接触锚点、人物相对尺度和 depthPlane；prop mask 同时覆盖对象与实际腕点，pose 与 Canny unit 共享 relationId/objectInstanceId/contactAnchors，提示词禁止前景展示牌解释。
- 解决 Agent 测试：新增多关系/单手/双手 geometry 数据流和控制 unit 摘要路径；`tsc --noEmit --incremental false` 通过，未启动 SD。
- 残余风险：没有真实像素检测器时手指接触和遮挡顺序仍需人工语义审批；模型随机性不作为本轮程序阻塞。
- 诊断 Agent 复核证据：job 405 最终手机位于正确二维 target 且竖向轮廓清楚，但与人物双手完全分离；PNG 最终 gaze pass 已正确看向该目标，排除了视线导致关系失败。worker prop pass 覆盖手物区却只发 Canny，是可复现的程序数据流缺陷。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；用户提供的 job 405 仅作运行失败证据。
- 后续处理：解决 Agent 统一 hand/object/depth 几何并让 prop pass 保留腕点控制，不能再用独立矩形轮廓代替持握关系。
- 诊断 Agent 最终复核（2026-08-10）：prop pass 现会在 Canny 之外重新携带整张 OpenPose，并把两者限制在同一 mask，属于有效的部分修复；job 406 也确认最新代码路径实际执行了 initial identity/OpenPose/phone Canny。但 worker 仍在 pass 内独立用 `objectCenter/orientation/handMode` 重算固定比例对象框与手圆区，没有共享 `PropInteractionGeometry`、人物相对尺度、depth plane、遮挡顺序或左右接触锚点；单手工具的唯一手圆始终放在 `centerX-handOffset`，完全不读取 `activeHand` 或实际腕点。job 406 继续得到与双手分离的前景立牌手机，证明仅附加整图 OpenPose未闭合人物—手—物体关系。标记 `partially_fixed`。程序逻辑验收未通过，未由 Agent 生成图片或执行视觉效果验收；用户附件仅作运行失败证据。
- 诊断 Agent 本轮复核（2026-08-10）：worker 新增 `propInteractionGeometry` 并优先读取人物 OpenPose 腕点，prop pass 同时发送 pose 与 Canny，这消除了“覆盖手区却完全丢腕点”的旧路径。但几何仍只在后置 worker 内重算，基础 guide 使用 contract 固定锚点；`depthPlane` 只是 control unit 元数据和文本，没有 depth/遮挡结构控制。更严重的是，多关系 pose 会先发生腕点覆盖，后置 geometry 随后把已被另一 relation 占用的最终腕点误当成本 relation 接触点；当前 smartphone+screwdriver 矩阵已复现该错误。对象宽高仍由 region 比例与上限常量推导，不是人物/手部尺度。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-10）：基础与 generic prop 现共用 `propInteractionGeometry`，优先读取实际 OpenPose 腕点，以腕距推导尺寸，并在同一 mask 同时发送 pose+Canny；depth boundary、occlusion order 和无 base64 trace 也已补齐。单一关系的主要断点已修复。但 relation contactPoints 未真正覆盖 contract anchor 手别：显式 left-hand relation 在人物全局 hands 没有同词时仍绑定 right wrist；two-hand+right-hand 多关系又会先覆盖 pose 腕点，随后 geometry 把被另一 relation 改写的腕点当成本 relation 接触点。phone/book/cup/tool 的单手与多关系矩阵仍存在确定的错误接触路径，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent job 407 运行证据（2026-08-11）：单关系 contact anchors 与 wristAssignments 已正确落在 `(0.335,0.58)/(0.425,0.58)`，但 `propInteractionGeometry` 将 `relation_target_plan` 排除在 `hasPoseContact` 外，故实际 trace 错记为 `contract_anchors_plus_region_fallback`，并按全宽 character region 推导到上限 `geometryBounds.width=.26`，没有走腕距尺度分支。最终对象横向、偏大且未与双手形成目标接触。该确定性尺寸/来源分支与模型随机性无关，保持 `partially_fixed`。用户图片仅作运行证据，诊断 Agent 未生成图片。
- 诊断 Agent 本轮复核（2026-08-11）：worker 虽按 relationId 找到 `plannedRelation` 并生成 `source=relation_target_plan` 的 contact anchors，但 `hasPoseContact` 仍只接受 `source === "pose_wrist"`。因此所有成功命中关系级计划的请求反而被判为无 pose contact，继续走 region fallback、错误 source 与较宽对象框；job 407 的确定失败分支尚未移除。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-11）：`hasPoseContact` 现同时接受 `pose_wrist` 与 `relation_target_plan`，命中 relationId 后会用该关系的 target/contact span 推导对象宽度，geometry source 也进入 pose-contact 成功路径，不再按全人物 region 扩到 `.26`。基础与后置阶段继续共用该 geometry，同一 relation 的 pose+Canny 使用相同 mask，并保留 depthPlane、occlusionOrder 和 contact anchors。原 job 407 的错误 fallback 分支已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；多关系手别编译的剩余缺陷由 `ISSUE-INTERACTION-001` 独立跟踪。

## ISSUE-POSE-006 复合坐姿动作只改 seated 标签但未应用坐姿基础骨架

- 优先级：P0
- 状态：verified
- 来源问题：用户提交 job 405 后核对人物为何跪在地面而不是坐在视觉规格指定的 sofa；关联已关闭的 `ISSUE-POSE-004/005`，但本项针对 base pose 与 upper-body action 的复合规则。
- 用户报告：场景要求人物坐在沙发看手机，最新图却变成人物跪在地面，recipe 仍显示 `single_action_seated_v1`。
- 已确认事实：job 405 的 actions 为 `[read_phone,seated,hold_carry,head_gesture]`、primaryAction=`read_phone`、kind=`single_action_seated_v1`。`buildSinglePerson` 只有 `plan.primaryAction === "seated"` 才写入坐姿髋膝踝；当 seated 只是复合 actions 成员时保留默认直立下肢。`kindForSingle` 又因 sourceText 含 sofa 直接返回 seated kind，导致标签声称坐姿、实际关节仍非坐姿。纯函数 full-body 矩阵证明 `read_phone+seated` 与 `read_phone_only` 的髋膝踝完全相同，而 `primaryAction=seated` 才得到不同的弯曲坐姿；`write_tool+seated` 同样失败。
- 高概率原因：单个 `primaryAction` 同时承担基础身体状态和上身剧情动作，且 `primaryText` 优先选择 read_phone；后续 actions 虽检测到 seated，却没有独立的 basePose 消费者。kind 标签又使用 sofa 关键词补丁，与真实骨架选择逻辑分裂。
- 未验证假设：job 405 的具体跪姿有多少由隐藏下肢、景别和模型随机性共同造成无法量化；但 recipe falsely labeled seated 和复合坐姿未进入关节构建是确定性程序缺陷。
- 反证或冲突：OpenPose 已正确控制低头和双腕目标，故不能把整个失败归因于 OpenPose 未启用；缺失的是坐姿身体基座，而不是上身手机动作。
- 复现步骤：构造 full-body `actions=[read_phone,seated]`、primary=`read_phone` 与 primary=`seated` 两个 `PoseScenePlanV2`，调用 `buildPoseControlFromPlan`。前者 hips/knees/ankles 与 read_phone-only 完全一致，后者才使用 seated 坐标；两者 kind 都可显示 `single_action_seated_v1`。
- 涉及文件：`lib/pose-v2.ts` 的 primary action 选择、`buildSinglePerson` 与 `kindForSingle`，相关复合动作测试和 recipe/UI 标签。
- 影响范围：坐着看手机、坐着读书、坐着写字、坐着使用工具、坐着吃喝等所有“身体基础姿态 + 上身动作”组合；同类架构风险也适用于 crouch/recline/lie 与上身动作的组合。
- 建议方案：把 `basePose`（standing/seated/crouch/recline/lie）与 `upperBodyActions[]` 分离，先构建身体基座，再叠加手臂、头部和道具动作；kind/source/reason 必须由实际采用的组合计划生成，不得仅凭 sofa 文本改标签。定义冲突优先级和 framing 裁切后的可审计关节。
- 验收标准：seated+phone/book/write/tool/eat 五类组合均保留同一坐姿髋膝骨架并叠加各自上身动作；standing/crouch/recline/lie 组合具有不同基础拓扑；kind、basePose、actions 和最终关节一致，不能出现 seated 标签配直立骨架；close/medium 隐藏下肢时 recipe 仍记录裁切前 base pose 证据。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 实施。
- 解决 Agent 测试：待解决 Agent 增加 basePose×upperBodyAction×framing 组合矩阵。
- 残余风险：近景隐藏下肢后模型仍可能根据环境把坐姿误画为跪姿；应保留人工 pose 复核，但程序必须先提供一致的坐姿基座与标签。
- 诊断 Agent 复核证据：job 405 recipe 明确 actions 含 seated、primary read_phone、kind seated；实际 `people` 使用默认 hips `(0.445/0.555,0.52)`、knees `(0.425/0.575,1.24 after upper-body hiding)`，没有进入 seated 分支。独立 full-body 矩阵进一步排除 framing 干扰。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 解耦基础姿态与上身动作，移除 kind 的 sofa 关键词伪装路径。
- 诊断 Agent 最终复核（2026-08-10）：`PosePersonPlanV2` 已把 `basePose` 与 `primaryAction/actions` 分离，`buildSinglePerson` 先应用 seated/crouch/recline/lie 身体基座，再叠加 read_phone/write_tool 等上身动作；`kindForSingle` 读取实际 `basePose`，job 406 recipe 也记录 `basePose=seated`。TypeScript、Studio 59/59、worker/台账 11/11 和 worker 语法检查通过，原“seated 标签配默认直立基础骨架”缺陷已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；upper-body framing 把座椅接触信号全部裁掉的独立架构缺口另建 `ISSUE-POSE-007`。

## ISSUE-PROP-005 道具缺少唯一实例与表面内容契约，双阶段生成可产生重复手机和展示牌屏幕

- 优先级：P0
- 状态：fixed_pending_review
- 解决 Agent 本轮修复（2026-08-10）：只有 `object_transfer/shared_prop` 才创建 shared instance；普通 use relations 即使有 `ownershipAfter` 也按全局 relation index 保持独立实例。shared ownership actor 列表同时纳入 actor 与 target，闭合交接双方。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：实例键改为共享关系使用 `prop:<slug>:shared`、独立关系使用全局 relation index，ownership 从全局 interactions 计算；screen/back/side/three-quarter/contextual 使用不同法线与可见面，初始和后置 guide 均消费 surface plan，exclusion regions、expectedCount、objectInstanceId、mask bounds 写入 control/pass trace 与语义复核来源。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；mask 外实际重复实例仍保留人工 P0 视觉审核风险，未启动 SD。
- 来源问题：用户提交最新 job 406 效果图并要求覆盖手机、工具和全部组件配合；关联 `ISSUE-PROP-003/004`，但本项针对对象实例数量、表面朝向和屏幕内容结构。
- 用户报告：最新图主手机仍像独立展示牌，画面左下又出现第二部手机；屏幕出现伪文字和通知样式，但人物并未形成真实阅读关系。
- 已确认事实：用户附件 1 精确对应 job 406，主 smartphone 位于结构 target 附近，左下前景桌面另有第二部手机。`InteractionContract` 只有 relationId/object/orientation/viewerSurface，没有 `objectInstanceId/expectedCount/surfacePlane/screenContentLayout`；基础提示词和人物提示词多次重复 smartphone，初始 Canny 只在目标 mask 内约束一个矩形，无法禁止 mask 外再生成同类对象。`duplicated prop` 只在后置局部重绘 negative 中出现，而该 pass 使用 `inpaint_full_res=true` 与局部 mask，无法清除画面其他区域的额外手机。Canny guide 也只有外轮廓，没有三分之四透视面、屏幕法线或通知卡片结构。
- 高概率原因：relation 被当成“要出现某类物体”，没有提升为全镜头唯一对象实例；结构 guide、提示词和局部重绘各自只关心目标区域，缺少全局 cardinality/ownership/surface plan。`screen readable to viewer` 与“人物阅读屏幕”在没有 surface normal 和深度几何时还会把手机推向正对观众的展示牌解释。
- 未验证假设：第二部手机具体在基础 txt2img、身份 pass 或 prop pass 哪一阶段出现仍无法精确归因，因为 worker 不保存阶段图；但现有所有后处理 mask 都无法删除左下区域的重复实例是确定事实。
- 反证或冲突：negative prompt 含泛化 `duplicate`，prop pass 含 `duplicated prop`，说明并非完全没有反重复词；缺陷是这些词没有结构化对象计数，也没有覆盖全画面的对象实例检测或排除区。
- 复现步骤：读取 job 406 成图、recipe 与 worker；确认目标区主手机和左下第二手机。核对 initial prop mask/后置 prop mask 均只覆盖 target 周围，`InteractionContract`/recipe 无 expectedCount 和表面几何，后置 negative 不可能修改 mask 外重复手机。
- 涉及文件：`lib/prompts.ts` 的 `InteractionContract`/提示词编译，`scripts/sd-worker.mjs` 的 initial prop 与 prop img2img，recipe/semantic review contract。
- 影响范围：手机、书、包、杯子、工具、雨伞等所有剧情道具；同一物类作为环境物件时还需要显式区分剧情实例与背景实例。
- 建议方案：为每条关系建立稳定 `objectInstanceId`、expectedCount、ownership、surface normal/visible face、screenContentLayout 与 exclusion regions；基础和后处理共用实例计划。唯一剧情对象的全局 negative/QA 必须按对象名生成，局部 repair 前后保存阶段输出；若需要观众可辨认屏幕，使用透视化 UI/icon overlay 或结构 guide，而不是同时要求正对观众和人物阅读。
- 验收标准：phone/book/cup/tool/bag/umbrella 的单实例与共享实例矩阵均在 recipe 记录 expectedCount/objectInstanceId；同一 shared prop 不因两个 actor 复制，局部 pass 之外的额外实例可被检测并进入 P0 review；screen/back/side/three-quarter 四类表面计划有不同法线和 guide，通知内容使用无伪文字的可审计布局。程序逻辑验收，不生成图片。
- 解决 Agent 修改：InteractionContract/recipe 新增稳定 `objectInstanceId`、`expectedCount=1`、共享 ownership、surfacePlane/normal、screenContentLayout 和 exclusionRegions；基础与后置 pass 共用实例契约，semantic review 明确要求实例计数、表面和无伪文字布局。
- 解决 Agent 测试：新增同人物双关系实例/ownership/pass graph 断言；新增 `prop_cardinality_review_required` P0 逐项人工计数门，要求目标区外无重复实例；TypeScript、worker 语法和逻辑测试通过，未启动 SD。
- 残余风险：未配置像素级实例检测器时，mask 外重复手机只能进入人工 P0 review，不能自动判定；实际屏幕执行率仍是运行风险。
- 诊断 Agent 复核证据：job 406 成图、recipe 的单 relation/双手机现象，以及 worker 局部 mask 与无 cardinality schema 的静态数据流共同复现该问题。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未由 Agent 生成图片或执行视觉效果验收；用户附件仅作运行失败证据。
- 后续处理：解决 Agent 将道具从类别提示升级为全镜头对象实例与表面计划，并与 `ISSUE-PROP-004` 的接触/深度几何共用数据源。
- 诊断 Agent 本轮复核（2026-08-10）：schema/recipe 已新增 objectInstanceId、expectedCount、ownership、surfacePlan、screenContentLayout 与人工 P0 review，属于有效的数据模型扩展；但实例键仍按 `propId/object` 类别生成。两个独立 smartphone relations 的纯逻辑矩阵得到相同 `objectInstanceId=prop:smartphone`，却各自声明 `expectedCount=1`；同类多实例无法区分。共享对象的 ownership 又在“仅当前 actor 的 planned 子集”内计算，两个 actor 不会得到同一份完整 actorCharacterIds。screen/back/side/contextual 的 normal 除 screen 外均为同一常量，worker 也只为 screen 画附加结构，exclusionRegions 未用于全图排除或修复 mask 外重复实例。完整 Studio 多关系用例同时失败（60/62）。标记 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；未配置像素检测器的实际计数继续作为人工审核风险，但本次未通过原因是实例与表面计划本身仍确定性冲突。
- 诊断 Agent 再复核（2026-08-10）：screen/back/side/three-quarter/contextual 法线与 guide、expectedCount、surface/exclusion trace 和人工 P0 review 已补齐，属于有效修复；但实例判定仍错误地把“存在 ownershipBefore/After”本身当作 shared。两个独立 smartphone use relations 各自 `ownershipAfter=actor` 时均得到同一个 `prop:smartphone:shared`，仍无法表达同类双实例。单条 umbrella object_transfer 的 ownership.actorCharacterIds 也只包含 actor，不包含 targetCharacterId，和 ownerAfter 指向接收者的状态不闭合。实例 ID 与 ownership 主路径仍自相矛盾，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收；mask 外实例计数继续由人工 P0 复核承担。
- 解决 Agent 本轮修复（2026-08-12）：保留唯一实例、expectedCount、surface/exclusion trace，并新增统一 `prop_cardinality_review_required` P0 语义门；在没有像素实例检测器时，重复实例只能进入人工 reject/retry，不能被 HTTP 2xx 或普通 prop pass 视为合格。`semanticReviewContract` 逻辑测试、TypeScript 与 worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 后续处理（2026-08-12）：解决 Agent 不能只保存 expectedCount/exclusionRegions。需要增加可执行的全图 cardinality 门：若无可靠像素实例检测器，则所有 required prop 必须保持 P0 manual count review，失败只能 reject/base retry；若实现检测器/定位器，则在 generic prop 前后核对实例框，目标外重复实例生成独立清除 mask，再重跑 prop/hand，并保存检测框、清除区域和 attempt trace。任何 expectedCount 未通过的结果不得进入 final。

## ISSUE-POSE-007 upper-body 裁切抹掉坐姿与座椅接触信号，坐沙发仍可退化为跪地

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：support geometry 按人物 region 缩放座面范围，support guide 新增 torso→pelvis→seat 连线并与人物绑定；confirmed visualSpec 的 raw camera shotSize 优先级加入回归断言，避免旧 wide camera 污染 confirmed medium shot。`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：`normalizeShotSpec` 的 confirmed visual camera 现在优先使用 raw `camera.shotSize`，不再让旧 `shot.cameraEn/camera` 覆盖新视觉规格；后续 framing resolver 与 support Canny 因此消费同一 confirmed 景别。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：已确认 `visualSpec.camera.shotSize` 优先于旧 camera 字段决定 framing；sofa/chair/bed/floor 使用不同接触高度、支持面宽度与形状，support Canny 写入对应 support region 的 `effective_region_mask`、supportKind、surface id，并记录 support control 摘要。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：job 406 对 `ISSUE-POSE-006` 修复后的架构复核；本项不回退 basePose 解耦，而是针对坐姿如何进入实际控制请求。
- 用户报告：视觉规格要求人物坐在沙发看手机，job 405/406 仍均画成人物跪坐或跪在地面/地毯上，沙发只作为旁边背景出现。
- 已确认事实：job 406 recipe 已正确记录 `basePose=seated`，但 framingMode=`upper_body`。`buildSinglePerson` 只在髋、膝、踝 8-13 号点表达 seated，随后 `applyFraming` 把这六点统一移动到 y=1.06/1.24/1.42，SVG 不再绘制任何下肢 limb；相同 read_phone/target 的 seated 与 standing 在实际发送的上身 OpenPose 中没有座面接触区别。计划没有 `supportSurfaceId`、pelvis/seat contact、躯干相对座面锚点或 sofa region；depth/composition 能力又明确 unavailable_manual_required。
- 高概率原因：架构把 base pose 完全等同于下肢拓扑，而 upper-body framing 为避免全身回归又把下肢控制全部删除；场景 prompt 虽写 sofa，人物几何和环境几何没有共享支持面关系，模型只能自由选择地面跪姿。
- 未验证假设：某些 checkpoint 仅凭文本可偶尔画对沙发坐姿，但不改变当前实际结构控制无法区分 seated-on-sofa 与 kneeling-on-floor 的确定性缺口。
- 反证或冲突：`ISSUE-POSE-006` 已修复 full/natural-body 情况下的坐姿基础骨架，不能把本项重新归因于 primaryAction；失败集中在 upper-body 裁切与环境支持面的组合。
- 复现步骤：构造相同 read_phone relation/target 的 seated 与 standing 两个 medium-close 计划，渲染后比较实际 SVG；两者都只有 11 条上身 limb，座椅/髋膝接触不进入请求。读取 job 406 可见 basePose seated、hiddenJointIndices 8-13 与跪地图同时存在。
- 涉及文件：`lib/pose-v2.ts` 的 `buildSinglePerson/applyFraming`，`scripts/sd-worker-logic.mjs` 的 compositionDepthPlan，`scripts/sd-worker.mjs` 控制单元装配，visualSpec scene anchors。
- 影响范围：坐沙发/椅子/床沿看手机、读书、写字、吃喝、操作工具；同类风险也包括倚靠、躺卧和跪姿与家具/地面的支持关系。
- 建议方案：新增 `SupportRelationGeometry`，包含 actor、supportSurfaceId/region、pelvis/torso anchor、contact plane、depth order 和可见支持边缘；upper-body 不发送完整腿，但必须保留能区分坐/跪/站的躯干—骨盆—座面控制或局部 depth/edge/seg guide。recipe 同时保存裁切前 basePose joints 与实际发送的 support control 摘要。
- 验收标准：同一 phone/book/tool 上身动作在 sofa-seated、chair-seated、bed-edge、kneeling-floor、standing 五类输入中产生不同且可审计的 support relation；close/medium 不显示完整腿但仍发送座面/骨盆或等价结构控制，不能只靠 `basePose` 标签；wide/full 与 upper-body 共用 supportSurfaceId。程序逻辑验收，不生成图片。
- 解决 Agent 修改：PoseScenePlanV2 新增 `SupportRelationGeometry`，按 sofa/chair/bed/floor 记录 supportSurfaceId、骨盆/躯干锚点、接触面、深度顺序和可见边缘；upper-body 仍隐藏下肢 limb，但 worker 额外发送支持面 Canny unit，并在 recipe 记录 supportControl 状态。
- 解决 Agent 测试：新增 medium seated-on-sofa 的 supportSurfaceId、pelvis anchor、upper-body framing 和 support control 摘要断言；`tsc --noEmit --incremental false` 通过，未启动 SD。
- 残余风险：无 depth/seg 模型时支持面控制依赖 Canny 可用性；不可用时仍必须人工 P0 审核，实际坐姿服从率保留为运行风险。
- 诊断 Agent 复核证据：job 406 recipe/成图、`applyFraming` 的确定性覆盖以及 SVG 对下肢 limb 的省略共同证明 upper-body 请求丢失座椅接触信号。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未由 Agent 生成图片或执行视觉效果验收；用户附件仅作运行失败证据。
- 后续处理：解决 Agent 在不破坏近景裁切的前提下引入人物—家具支持面几何，不能恢复用越界全身骨骼强推坐姿的旧路径。
- 诊断 Agent 本轮复核（2026-08-10）：`SupportRelationGeometry` 与额外 support Canny unit 已进入 scene plan/基础请求，upper-body 隐藏下肢时不再只剩 basePose 标签，方向正确；但新增验收用例实际失败。当前 `derivePoseFramingModeV2` 在读取已确认 visualSpec.camera.shotSize 前，先用旧 `shot.camera` 决策；项目基准镜头为 `shot.camera=远景`、`cameraEn=medium shot`，即使最新 visualSpec 明确 `medium shot`，仍编译为 `full_body`。此外 sofa 与 chair 使用完全相同的 `.68` 接触线/骨盆几何，support Canny 只有全宽直线和圆点且无 effective region mask，实际结构请求不能区分两类座面。Studio 组合测试因此失败（期望 upper_body，实际 full_body），状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-10）：framing resolver 已让 confirmed visualSpec 优先，sofa/chair/bed/floor 也有不同高度、宽度、shape 和有效 support mask，独立 support 场景可得到 upper_body；但更早的 `normalizeShotSpec` 仍以 `resolved(shot.cameraEn, raw.camera.shotSize)` 让旧镜头覆盖新规格。完整套件先创建 wide-shot 新章节后，明确传入 medium shot 会被规范化为 wide shot，组合测试稳定得到 actual=full_body；单独运行该用例才通过，说明是可复现的状态依赖而非随机失败。Studio 61/62，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent job 407 回归复核（2026-08-11）：最新任务已正确记录 `framingMode=upper_body`、`basePose=seated`、`supportKind=sofa`，并发送 support Canny；但实际草稿人物完整双腿进入画面且坐在独立椅子上，右侧另有沙发。静态代码同时证明 support guide 只画座面边缘和孤立 pelvis 圆点，OpenPose 的髋点已被移出画布，两套控制没有共享可见的 torso→pelvis→seat 连线；support region 又横跨 `x=.04-.96`，无法把人物绑定到同一 sofa。原“upper-body 下支持面关系闭合”结论被运行证据推翻，状态改为 `regression`。程序逻辑验收未通过；本图为用户实际运行证据，诊断 Agent 未生成图片。
- 诊断 Agent 本轮终审（2026-08-11）：`SupportRelationGeometry` 现按人物 region 推导 sofa/chair/bed/floor 的不同高度、宽度与 effective mask；support Canny 明确绘制实际 `torsoAnchor→pelvisAnchor→contactPlaneY` 连线，并与对应座面边缘连成同一可见结构。confirmed visual camera 优先级用例通过，seated-on-sofa 仍为 upper_body 且保留 support relation。原“孤立 pelvis 点、全宽支持面、无可见接触链”的程序缺陷已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；Canny 可用性、模型随机性与真实坐姿服从率保留为产品运行风险。

## ISSUE-UMBRELLA-002 同一雨伞 relation 先走通用 prop pass 又走专用 handoff pass，几何与状态没有仲裁

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：同一 shared umbrella instance 的多个 handoff contract 共用 scene interaction target；worker 按 contract 逐条执行专用 pass，逐条写入 geometry、trace 和状态，单条 HTTP/响应失败只标记当前 relation，不会把其他 relation 伪记成功。`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过；未启动 SD。
- 解决 Agent 本轮修复（2026-08-10）：handoff worker 改为逐个 `handoffContract` 顺序执行，每个 relation 独立计算 objectCenter/umbrella geometry、mask、控制单元、pass trace 与 request/semantic 状态；不再用首条 contract 的几何给全部关系伪记成功。多条 handoff 中单条失败会只更新对应 relation，并保留其他 relation 的状态。`tsc --noEmit --incremental false`、worker 语法检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 解决 Agent 本轮修复（2026-08-10）：基础 umbrella relation 与专用 handoff 共同消费 `scenePlan.interactionTarget + umbrellaGeometry`，使用同一 `objectInstanceId/sharedGeometryKey` 生成 canopy、shaft、mask 与 trace；handoff actor/receiver 按 `handoffContract.relationId/characterId/targetCharacterId` 选择，不再取首个 handover `.find(...)`。passGraph 明确 `geometrySource`，generic prop loop 跳过 specialized executor，专用请求记录控制单元与请求状态。`tsc --noEmit --incremental false`、worker 语法检查和台账检查通过；未启动 SD，未进行图片生成或视觉效果验收。
- 来源问题：用户要求重新覆盖雨伞、手机和所有工具的组件配合；关联已关闭的 `ISSUE-UMBRELLA-001`，但本项针对 pass graph 与 relation ownership，而不是专用雨伞 mask 内部几何。
- 用户报告：雨伞类工具容易重复、断柄、交接关系不稳定，需要检查所有组件是否对同一对象协同工作。
- 已确认事实：`buildRegionalPrompt` 对雨伞交接同时输出 `repairPasses.handoff=true` 和 required umbrella `propInteractions[]`。worker 先在逐 relation 通用循环中用 actor-local `objectCenter`、通用 umbrella shape/mask 执行 prop img2img 和 gaze，再在循环后进入专用 handoff 分支，改用 `scenePlan.interactionTarget/umbrellaGeometry` 执行第二次雨伞重绘。两套中心、轮廓、mask、prompt 和状态互不共享，也没有 pass arbitration 或“专用 executor 已接管该 relation”的标记。
- 高概率原因：专用 handoff 能力是后来叠加在通用 prop pipeline 后面的旁路，recipe 只记录布尔 handoff 与关系数组，没有将 relationId 映射到唯一 executor/pass graph；后序专用 mask无法保证清除前序 mask 外生成的伞面或伞柄。
- 未验证假设：现有用户图片中是否已出现双伞尚无最新运行证据；不影响同一 required relation 被两个独立几何执行器连续修改的确定性程序路径。
- 反证或冲突：`ISSUE-UMBRELLA-001` 已证明专用 handoff 自身的边缘裁切、mask/guide 覆盖、双腕接触和 actor 左右映射闭合；本项不回退这些结论，只指出专用 pass 前仍有冲突的通用 pass。
- 复现步骤：构造双人 object_transfer/umbrella 视觉规格并调用 `buildRegionalPrompt`；确认 `handoff=true` 且 `propInteractions` 含 umbrella。顺序阅读 worker：先执行 421 行附近通用 relation 循环，再执行 539 行附近 handoff 分支；比较 generic objectCenter 与 scene interactionTarget、两套 mask/guide。
- 涉及文件：`lib/prompts.ts` 的 repairPasses 编译，`scripts/sd-worker.mjs` 的 prop loop/handoff branch，recipe relationTraces/pass trace。
- 影响范围：雨伞递交/接收/共同持伞；未来任何同时有通用 prop repair 和专用动作 repair 的长柄或共享道具也会复制此冲突。
- 建议方案：建立按 relationId 编译的显式 pass graph/executor；umbrella handoff 由唯一 specialized executor 接管，或让基础、通用和专用阶段共享同一 `PropInteractionGeometry` 并声明输入/输出依赖。每阶段保存无 base64 payload 摘要、stage image 和 relation status，不允许两个执行器各自推导对象中心。
- 验收标准：umbrella handover recipe 对同一 relationId 只有一个最终几何真源和明确 pass graph；若多阶段协作，所有阶段共用 object instance、canopy/shaft/handle/contact anchors，后序能证明覆盖前序修改区；普通单人撑伞只走通用或相应专用路径，不误触 handoff。程序逻辑验收，不生成图片。
- 解决 Agent 修改：雨伞 object_transfer relation 编译为唯一 `umbrella_handoff` executor 和显式 passGraph；worker 通用 prop loop 跳过该 executor，专用 handoff 复用同一 relation/object instance 并更新 executing/request/semantic trace，普通持伞仍走 generic_prop。
- 解决 Agent 测试：新增雨伞 executor/pass graph 静态路径与 relation trace 代码核对；`tsc --noEmit --incremental false` 通过，未启动 SD。
- 残余风险：雨伞专用请求的模型实际边缘、伞柄和手部服从率仍需诊断 Agent 复核；本轮不进行图片生成。
- 诊断 Agent 复核证据：Regional repair recipe 与 worker 的确定执行顺序已足以复现双 executor 数据流；无需启动 SD 或生成测试图。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 将 specialized handoff 纳入 relation pass graph，避免在通用 prop loop 后无条件再次重绘同一雨伞。
- 诊断 Agent 本轮复核（2026-08-10）：通用 post-prop 循环现会跳过 `executor=umbrella_handoff`，专用 relation trace 也会进入 executing/request_succeeded/semantic_pending，旧的两次后置 img2img 执行已被消除。但 passGraph 仍声明 `base_structure→umbrella_handoff`，基础阶段却把该 umbrella relation 当通用矩形并使用 actor-local objectCenter，专用阶段再用 `scenePlan.interactionTarget→umbrellaGeometry` 推导 canopy/shaft/handle；两阶段没有共享同一雨伞几何。专用分支还用 visualSpec interactions 的首个 handover `.find(...)` 决定 giver/receiver，而不是按 handoff contract/relationId 回查，存在“同镜头另有交接关系时绑定错 actor”的确定性路径。保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 再复核（2026-08-10）：单个 umbrella handoff 的基础与专用阶段现共用 `scenePlan.interactionTarget+umbrellaGeometry`、objectInstanceId/sharedGeometryKey、canopy/shaft/mask，generic loop 会跳过 specialized executor，giver/receiver 也按 umbrella contract 匹配，原双执行器冲突已实质修复。但 worker 仍只取 `handoffContracts[0]` 构建一次专用 pass，却把全部 handoffRelationIds 同时标为 executing/succeeded；同镜头两个雨伞交接关系时第二条没有自己的几何与请求却会被伪记成功。复数 specialized relation 的仲裁与状态仍不诚实，保持 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 续诊复核（2026-08-11）：`ISSUE-UMBRELLA-002` 已遍历全部 handoff contract 并独立计算几何，但循环内 `postJson`、HTTP 错误、JSON 解析及空图检查没有 relation 级异常边界；任一请求失败会跳到 worker 外层 catch，中止后续 relation，故仍为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-11）：worker 继续按全部 `handoffContracts` 逐条建立 geometry、mask、control 与 trace；每条 contract 的 `postJson`、非 2xx、JSON 解析和空图检查现均位于 relation 级 `try/catch` 内。失败只把当前 relation/trace 标为 failed 并保留上一阶段图，循环随后继续；成功关系独立进入 request_succeeded/semantic_pending。generic prop 对 specialized executor 的跳过和共享雨伞几何仍在，原双执行器、首条伪成功及单条失败中止后续关系三条路径均闭合，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

### 诊断 Agent 续诊汇总（2026-08-11）

- `ISSUE-INTERACTION-001`：`fixed_pending_review`。显式 contactPoints 已在独立 relation contract 中决定 activeHand，双手优先分配与 relation-level 目标接触均已闭合；待诊断 Agent 复核。
- `ISSUE-PROP-003`：`fixed_pending_review`。阶段输出现在落盘并在 pass trace 中记录路径、字节数和 SHA-256，可区分初始、prop、gaze、handoff 阶段；待诊断 Agent 复核。
- `ISSUE-PROP-004`：`fixed_pending_review`。relation_target_plan 已计入有效 pose contact，几何不再走 region fallback，关系级腕点、pose+Canny 与 mask 继续共用；待诊断 Agent 复核。
- `ISSUE-PROP-005`：`verified`。独立同类 use 关系生成不同实例键，shared 仅限 transfer/shared_prop，transfer ownership 同时包含 actor 与 target；程序逻辑验收通过，未进行图片生成或视觉效果验收。
- `ISSUE-POSE-007`：2026-08-11 由 job 407 运行证据改为 `regression`；support guide 与隐藏髋点的 OpenPose 没有共享可见接触链，人物仍会坐到独立椅子并生成完整双腿。

## ISSUE-FRAMING-002 upper_body 只隐藏腿部关节却不建立近景人物尺度，缺失关节不能约束裁切

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-11）：景别几何改为先匹配 `medium close-up` 再匹配宽泛 `close-up`；upper-body 可见关节按 `visibleBoundsTarget` 做边界拟合；双人 handover/shared_prop/handshake/guide_pull 在缩放后恢复原始共享腕点，避免各自绕鼻点缩放造成接触断裂。新增景别尺度与可见框断言；`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过；完整 Studio 套件受 Node `uv_os_get_passwd ENOMEM` 阻断，未启动 SD。
- 解决 Agent 本轮修复（2026-08-11）：`PoseScenePlanV2` 新增按 close/medium-close/medium/waist-up 推导的 `framingGeometry.scale/visibleBoundsTarget/source`；upper-body 在隐藏下肢前对可见头肩肘腕做景别级放大，并恢复 relation wrist target，worker 追加 `upper_body_composition_scale` Canny guide、effective mask 与 recipe framing trace。新增 confirmed camera 优先级和尺度断言；`tsc --noEmit --incremental false`、worker 语法检查和台账测试通过，未启动 SD。
- 来源问题：用户提交最新 job 407 草稿并询问“为什么 OpenPose 骨架没有腿，这能否正确生成人物动作”；关联 `ISSUE-POSE-001`、`ISSUE-FRAMING-001` 与 `ISSUE-POSE-007`，但本项针对 upper-body 骨架的尺度与裁切约束，不重复旧的越界腿线或 prompt 分裂问题。
- 用户报告：视觉规格与实际 prompt 均要求 close shot/chest-up/no legs，最新草稿仍显示完整双腿、鞋和大面积房间，人物只占画面中央小区域；用户观察到 OpenPose 骨架均没有腿并质疑动作控制是否有效。
- 已确认事实：job 407 的 `visualSpec.camera.shotSize=close shot`，实际 prompt 包含 `chest-up framing`、`strict crop at the waist`、`no legs or full bodies`，negative 包含 `full body/visible legs/visible shoes`；`poseControl.framingMode=upper_body` 且隐藏 8-13 号髋膝踝点。当前 `applyFraming` 对 upper-body 唯一操作是把 8-13 号点移到 y=1.06/1.24/1.42，不放大或重新定位头、肩、肘、腕，仍沿用全身模板的小尺度上身坐标。job 407 的肩约在 y=.29、双腕 y=.58、横向肩宽约 .18，骨架只占画布较小区域；最终 PNG 生成了完整人物和无结构约束的双腿。
- 高概率原因：OpenPose 是正向关节条件，缺少腿点只代表腿部没有姿态约束，并不构成“禁止生成腿”的负向裁切信号。仅删除下肢 limb、但不给上身骨架建立 close/medium 对应的占屏比例和边界，会给模型留下足够空间自行补全全身；一旦 prompt 服从失败，腿部动作完全不受控。
- 未验证假设：support Canny、方形画布和大面积环境描述各自对人物缩小的相对贡献尚未量化；不影响 `applyFraming` 只隐藏而不缩放、缺失关节不是负向约束的代码事实。
- 反证或冲突：job 407 的实际 prompt/negative 已正确携带近景契约，OpenPose 也没有旧版 neck-to-offscreen-hip 长线，因此不能继续归因于 `ISSUE-FRAMING-001` 的 prompt 分裂或 `ISSUE-POSE-001` 的越界 limb；当前缺陷是没有独立的结构化构图尺度控制。
- 复现步骤：读取 job 407 recipe，确认 close shot + upper_body + hiddenJointIndices 8-13；检查 `lib/pose-v2.ts::applyFraming` 仅重写六个下肢 y 值；计算可见上身 bbox/肩宽并与 full-body 模板比较，可见 upper-body 未按景别放大。对照最终 `sd-draft-job-407-*.png`，人物完整双腿进入画面。
- 涉及文件：`lib/pose-v2.ts` 的 `applyFraming/buildPoseControlFromPlan`、`scripts/sd-worker.mjs` 的初始 OpenPose/支持面控制装配、job 407 recipe。
- 影响范围：所有 close、medium-close、medium、waist-up 的单人动作，尤其坐姿、弯腰、持物、饮食、写字与需要下肢决定身体基座的动作；模型一旦生成画外本应不存在的下半身，其腿部姿态没有控制。
- 建议方案：为每类 framing 定义可审计的上身坐标变换和占屏目标，把头、肩、肘、腕及动作 target 按 close/medium 重新缩放和平移；增加人物 bbox/脸部占比/肩宽安全门。需要显示髋腿的构图必须切换 full/natural-body skeleton，不能用“无腿 upper-body”控制全身。必要时增加独立 composition/seg/depth crop guide，使缺失腿点之外还有正向的近景边界信号。
- 验收标准：close、medium-close、medium、waist-up、wide/full × seated/standing/tool/read_phone 的纯逻辑矩阵产生不同且可审计的可见关节 bbox、肩宽、脸部位置与动作 target；upper-body 不只是删除 8-13 点，其可见上身必须占据对应景别的目标区域；任何允许髋腿进入画面的模式必须发送完整且与 basePose 一致的髋膝踝结构。程序逻辑验收，不生成图片。
- 解决 Agent 修改：待解决 Agent 填写。
- 解决 Agent 测试：待解决 Agent 填写。
- 残余风险：即使结构尺度闭合，checkpoint 对精确裁切仍存在随机性；实际视觉执行率继续进入人工 P0 framing review，不作为代码验收的唯一条件。
- 诊断 Agent 复核证据：job 407 recipe、最终用户草稿与 `applyFraming` 静态数据流共同证明：无腿骨架没有放大上身，也不能阻止模型补全无约束双腿。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过；用户图片仅作实际运行证据，诊断 Agent 未启动 SD、未生成测试图。
- 后续处理：解决 Agent 增加景别级上身缩放/边界控制，并与 `ISSUE-POSE-007` 的 torso-pelvis-support 接触链共同修复，避免一个修裁切、另一个再次丢失坐姿。
- 诊断 Agent 本轮回归复核（2026-08-11）：单人上身确已按 scale 放大，并新增 framing Canny，方向有效；但 `applyFraming` 对双人分别绕各自 nose 缩放已经闭合的共同腕点，medium-shot 握手因此从同一点被拉开，`validatePosePeople` 报接触超阈值，完整 Studio 套件中的双人通用模板与 Regional 递伞相关断言回归失败。另有两个确定缺口：`medium close-up` 会先命中更宽泛的 `close-up` 正则而错误取 1.5，且 `visibleBoundsTarget` 仅写入 trace，没有参与坐标拟合或安全门。状态改为 `regression`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 本轮终审（2026-08-11）：景别解析已先匹配 `medium close-up=1.36`，再匹配 `close-up=1.5`；upper-body 先按景别放大可见关节，再依据 `visibleBoundsTarget` 校正越界偏移，worker 继续发送对应 composition Canny 和有效区域。双人 handover/shared_prop/handshake/guide_pull 会在缩放后恢复原共同腕点，通用双人模板、Regional 递伞及腕部闭合测试全部恢复通过；close/medium-close/medium × 多动作矩阵也得到独立 scale/target。标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；模型对精确裁切的服从率保留为产品运行风险。

## ISSUE-POSE-008 locomotion 步态粒度、上身镜头适配与模板覆盖状态不一致

- 优先级：P0
- 状态：verified
- 来源问题：用户检查“移动·行走／跑动”OpenPose 预览，指出骨架没有腿、预览不像行走，且页面同时显示旧 `hold_carry` 推荐原因与新的 locomotion 类型。
- 用户报告：行走模板在上身裁切下没有可见腿部，画面中的腿由模型自由发挥；当前预览也缺少自然步态，整套 OpenPose 骨架设计粒度与状态同步不够严谨。
- 已确认事实：`single_walk_run_v2` 将步行与跑步合并；`buildSinglePerson` 的 locomotion 分支只改两个腕点及膝踝横向步幅，不表达骨盆位移、肩髋反向旋转、躯干倾斜、支撑腿/摆动腿和落脚阶段。`applyFraming` 在 upper-body 模式隐藏 8-13 号髋膝踝后，主要步态证据被删除。模板 override 只替换 `primaryAction/actions/templateId`，继续保留自动计划的 `selectorReason`、sourceText 与部分动作上下文，所以 UI 可同时显示新 locomotion kind 和旧 hold_carry 原因。
- 高概率原因：动作模板、景别裁切和 UI 审计字段分别演进，没有共享一个覆盖后的 locomotion 计划；步态 phase 仍沿用通用 anticipation/contact/follow_through，未形成可复现的 gait phase。
- 未验证假设：当前 SD checkpoint 对上身反向摆臂和躯干倾斜的实际服从率仍受模型随机性影响；不影响当前控制图缺少对应几何的确定性事实。
- 反证或冲突：upper-body 隐藏腿部本身是正确的近景裁切策略，不能为了显示“行走”而重新发送完整越界腿线；应当提供可辨识的上身步态代理，并明确下肢未受控制。wide/full 则必须发送完整且按阶段变化的下肢。
- 复现步骤：以 `hold_carry` 自动计划的 medium/upper-body 镜头选择 `single_walk_run_v2`；检查页面仍显示 hold_carry selector reason，骨架隐藏 8-13 号点。再对 wide shot 的 walk/run × 三阶段比较关节，只能看到单一粗粒度步幅，缺少走跑和落脚阶段契约。
- 涉及文件：`lib/pose-v2.ts` 的 locomotion 计划、几何、override 与 framing；`app/page.tsx` 的姿势说明；`lib/pose-display.ts`；`tests/studio.test.ts`。
- 影响范围：所有走路、快走、跑动、进入/离开场景动作；尤其是 upper-body 镜头、由其他动作模板人工切换到 locomotion，以及依赖 recipe/UI 复现覆盖状态的任务。
- 建议方案：引入结构化 locomotion mode、gait phase、lead side、支撑脚/摆动脚、步幅、躯干倾角、肩髋反向摆动；walk/run 使用不同几何档位。upper-body 保留明确的躯干位移和反向摆臂，同时记录 lowerBodyControl=`hidden_by_framing` 与人工复核警告；wide/full 发送完整下肢。override 后重算 selector reason、action family、控制档位和审计摘要，不得保留旧动作原因。
- 验收标准：walk/run × anticipation/contact/follow-through × upper-body/full-body 纯逻辑矩阵具有确定且不同的肩、腕、髋、膝、踝几何；upper-body 不发送腿但仍能从上身几何区分 locomotion，并明确记录下肢未受控制；模板从 hold_carry 切到 locomotion 后 kind、selectorReason、scenePlan、controlProfile、UI 文案与最终 recipe 一致。程序逻辑验收，不生成图片。
- 解决 Agent 修改：2026-08-11 拆分 `single_walk_v2` 与 `single_run_v2`，新增结构化 locomotion plan，记录 heel-strike/mid-stance/toe-off、lead/support/swing side、步幅、躯干倾斜、反向摆臂和 lowerBodyControl。全身/自然景别发送阶段化髋膝踝，upper-body 保持统一隐藏下肢但通过头颈肩与双臂的不对称步态表达移动，并写入显式 framing warning。走/跑分别使用 walk/run × upper/full ControlNet 档位。人工模板覆盖会同步重建 basePose、locomotion、selectorReason、confidence、kind、presetId 和 controlProfile；旧 `single_walk_run_v2` 兼容映射到 walk。UI 改为展示 effective 当前计划、人工覆盖状态、步态阶段、支撑脚/摆动脚和下肢控制警告，不再把旧自动 `hold_carry` 原因当成当前状态。
- 解决 Agent 测试：2026-08-11 新增 walk/run × 三步态阶段 × upper/full 的纯逻辑矩阵，覆盖走跑几何差异、阶段关节差异、上身反向摆臂、下肢隐藏警告、专用 ControlNet 档位、hold_carry→walk/run 覆盖状态同步及旧模板兼容。locomotion 定向测试 1/1、`tsc --noEmit --incremental false`、worker 语法和台账检查通过；完整 Studio 套件在本机被既有测试进程遗留句柄阻塞，未取得完整结果。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：COCO-18 只到踝点，脚掌朝向和接地细节仍属于后续 BODY_25/足部增强能力；本问题先确保现有格式下的步态和审计闭环。
- 诊断 Agent 复核证据：用户截图与 `buildSinglePerson/applyFraming/applyPoseControlOverride` 静态数据流共同证明该缺陷。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过；用户截图仅作运行证据，诊断 Agent 未启动 SD、未生成测试图。
- 诊断 Agent 最终复核（2026-08-11）：独立核对 `deriveLocomotionPlan`、`buildSinglePerson`、`applyFraming`、`profileForPlan`、`applyPoseControlOverride` 与 UI effective plan 数据流。walk/run 已拆分为独立模板和控制档位；anticipation/contact/follow-through 确定映射为 heel-strike/mid-stance/toe-off，并驱动不同的躯干、反向摆臂与髋膝踝几何；upper-body 统一隐藏 8-13 号点，同时记录 `lowerBodyControl=hidden_by_framing` 和人工复核警告；full/natural 保留完整下肢。hold_carry 覆盖为 locomotion 后会重建 basePose、locomotion、selectorReason、confidence、presetId 与 controlProfile，UI 展示同一 effective plan，不再沿用旧推荐原因；旧 `single_walk_run_v2` 明确兼容映射为 walk。`.\\node_modules\\.bin\\tsc.cmd --noEmit --incremental false` 通过。完整与定向 Studio 测试均在进入用例前被本机 Node `uv_os_get_passwd ENOMEM` 阻断，未出现断言失败；该环境故障不构成已知程序缺陷。标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；COCO-18 缺少足部朝向及模型实际服从率保留为产品运行风险。
- 后续处理：关闭；后续若出现新的可复现 locomotion 几何或覆盖状态错误，以新证据创建回归问题。COCO-18 足部细节和模型视觉服从率继续作为产品运行风险跟踪。

## ISSUE-POSE-009 人工动作模板覆盖后保留冲突的支持面关系

- 优先级：P0
- 状态：verified
- 解决 Agent 本轮修复（2026-08-12）：将“基础姿态变化”与“明确剧情姿态冲突”分开。`PoseScenePlanV2` 记录 `visualSpecConfirmed`；仅当 confirmed visualSpec 的人物文本明确包含原姿态且未提交 `confirmPoseContract` 时生成 P0 conflict。未确认/无明确姿态契约的合法模板切换会重建 support 并允许继续；confirmed 场景可通过结构化 `confirmPoseContract` 或 UI“确认覆盖已确认剧情姿态”后重建 support、warnings 与审计。新增 API/override 字段贯通；`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过，未启动 SD。
- 解决 Agent 本轮修复（2026-08-12）：override-support 仲裁不再只检查 sofa/chair/bed→standing；现在记录模板覆盖前后的 `basePose`，任何明确基础姿态变化（standing↔seated/recline/lie、crouch_kneel→point 等）都会写入 `overrideConflicts`、生成 P0 safety error，并由 API 422 阻断。支持关系仍会按覆盖后的姿态重建为 floor/furniture/unknown，避免互斥 support Canny 留在 recipe。新增 seated→point、standing→seated、recline→point、kneeling→point 矩阵断言；`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过，未启动 SD。
- 解决 Agent 本轮修复（2026-08-12）：`applyPoseControlOverride` 现在在模板改变基础姿态后重新仲裁 `supportRelation`/`supportRelations`；站立或蹲跪不再继承 sofa/chair/bed 支持面，改为 floor/人工复核支持描述。若原明确支持面与新模板互斥，scenePlan 写入 `overrideConflicts`、warnings，`validatePosePeople` 生成 P0 error，studio API 返回 `422 POSE_OVERRIDE_SUPPORT_CONFLICT`，阻止互斥 pose/support Canny 进入 recipe。新增 seated-sofa→point 纯逻辑断言；`tsc --noEmit --incremental false`、worker 语法检查、台账测试通过，未启动 SD。
- 来源问题：用户提交的最新草稿图，对应 job 409；关联已关闭的 `ISSUE-POSE-007`，但本项针对人工 pose override 与 support relation 的一致性，而不是自动坐姿支持链。
- 用户报告：最新草稿要求人物坐在沙发上双手看手机，实际人物跪在沙发前，完整下半身进入 close shot，手机缺失并出现蓝色袋状物。
- 已确认事实：job 409 的 confirmed visualSpec 明确 `Xiao Fen is seated indoors on a sofa, holding a smartphone with both hands`，camera 为 `close shot`；请求同时带有人工 `poseControlOverride.templateId=single_point_v2`。`applyPoseControlOverride` 将人物改成 `primaryAction=point`、`basePose=standing`、`presetId=single_point_v2`，但没有重算、移除或拒绝原 `supportRelation=support:sofa:primary`。最终 recipe 因此同时记录 standing/point 与 seated-on-sofa support，worker 仍发送 sofa support Canny；`selectorReason`、`confidence=high`、`safety.valid=true`、warnings 为空，未暴露冲突。最终草稿确实退化为沙发前跪姿，且违反 close/chest-up/no-legs 契约。
- 高概率原因：人工模板覆盖只重建动作 family、basePose、关节和 controlProfile，support relation 仍继承自动计划；`validatePosePeople` 只检查关节/接触距离，没有校验 basePose 与 supportKind、visualSpec visibleFacts 的姿态契约是否兼容。
- 未验证假设：手机缺失、蓝色袋状物及视线未落实可能受到 point override 的错误腕部拓扑和模型随机性共同影响；generic prop/gaze 请求均返回成功并处于 semantic pending，尚无独立程序证据证明后处理协议本身新增回归。
- 反证或冲突：若用户明确选择 point 模板，系统可以允许覆盖剧情动作，但必须同步删除不兼容的 seated support，或明确阻断/警告该覆盖；不能同时发送两套互斥几何并声称高置信安全。`ISSUE-POSE-007` 已闭合自动 seated upper-body 的 torso→pelvis→seat 支持链，本问题不推翻该结论。
- 复现步骤：使用 confirmed visualSpec 的 seated-on-sofa/read-phone 镜头，自动计划保留 sofa support；提交 `poseControlOverride={schemaVersion:'pose-override-v1',templateId:'single_point_v2',editMode:'parameter_edit'}`。检查输出 scenePlan：人物变为 standing/point，但 supportRelations 仍含 sofa，且 safety.valid=true、warnings=[]；job 409 即为实际 recipe 证据。
- 涉及文件：`lib/pose-v2.ts` 的 `applyPoseControlOverride/buildPoseControlFromPlan/validatePosePeople`，`app/page.tsx` 的模板覆盖 UI，`app/api/studio/route.ts` 的生成请求编译，`scripts/sd-worker.mjs` 的 support control 装配。
- 影响范围：任何从 seated/recline/lie/kneeling 等支持姿态人工切换到 standing/point/locomotion，或反向切换却未重建 support 的镜头；会造成 OpenPose、支持面 Canny、提示词、UI 审计和 semantic review 互相矛盾。
- 建议方案：为 pose override 增加结构化兼容性仲裁。模板改变 basePose 时从 visualSpec 重新推导 support relation；若 override 与明确剧情姿态冲突，默认产生 P0 validation error 并阻止生成，或要求用户显式确认“覆盖剧情姿态”后同步重写/移除 support。scenePlan、supportControls、selectorReason、warnings 与 semantic review 必须消费仲裁后的同一计划。
- 验收标准：seated-sofa/read-phone→point、seated→walk、standing→seated、bed/recline→standing、kneeling-floor→point 的纯逻辑矩阵中，不得出现 basePose 与 support relation 互斥却 safety.valid=true 的结果；拒绝路径提供明确 P0 原因，允许路径则同步重建 support、visible facts 审计和 worker control units。程序逻辑验收，不生成图片。
- 解决 Agent 修改：新增 override-support 兼容性仲裁、support relation 重建、P0 safety error 与 API 422 阻断；互斥计划不会再以 `safety.valid=true` 进入生成 recipe。
- 解决 Agent 测试：矩阵覆盖 confirmed visualSpec 的 seated/recline/kneel/standing 互斥切换、未确认 visualSpec 的合法切换放行，以及 `confirmPoseContract=true` 的显式覆盖放行；断言 conflict、P0 safety、support 重建和确认 warning。`tsc --noEmit --incremental false`、`node --check scripts/sd-worker.mjs`、`pnpm test:issues` 通过。完整 Studio 套件仍受 Node `uv_os_get_passwd ENOMEM` 环境错误阻断；未启动 SD。
- 残余风险：即使控制契约一致，模型仍可能不服从 close shot、手持手机或视线要求；继续由现有逐项人工 P0 semantic review 拦截，不作为本代码问题关闭条件。
- 诊断 Agent 复核证据：job 409 payload、最终用户草稿，以及 `applyPoseControlOverride` 保留 `person.supportRelation` 的静态数据流共同构成可复现证据。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过；用户图片仅作实际运行证据，诊断 Agent 未启动 SD、未生成测试图。
- 诊断 Agent 本轮复核（2026-08-12）：job 409 的原始 sofa-seated→point 路径已实质阻断：模板覆盖后 support 会改为 floor，原 sofa 与 standing 的互斥关系写入 `overrideConflicts`，`validatePosePeople` 产生 P0 error，Studio API 对带冲突的结构化 override 返回 `422 POSE_OVERRIDE_SUPPORT_CONFLICT`，不会把互斥 OpenPose/support Canny 送入 worker；类型检查、worker 语法和台账测试通过，Studio 定向用例在进入测试前被本机 Node `uv_os_get_passwd ENOMEM` 阻断。通用验收矩阵仍未闭合：当前 `incompatiblePreviousSurface` 仅识别 sofa/chair/bed→standing/crouch_kneel；standing/floor→seated/recline/lie 以及 kneeling-floor→point 不会产生 override conflict、P0 safety error 或显式剧情姿态覆盖确认，仍会被标为 `confidence=high`。这会让人工模板静默改写明确的站立/跪姿剧情，或为 seated/recline/lie 生成 unknown/furniture 文本推导支持面而不经兼容性仲裁。状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-12）：`applyPoseControlOverride` 现保存覆盖前 `basePose`，模板覆盖后只要基础姿态发生明确变化，seated→standing/locomotion、standing→seated/recline/lie、recline/bed→standing、crouch_kneel/floor→point 均写入 `overrideConflicts` 并由 `validatePosePeople` 生成 P0 safety error；基础姿态未变化时仍额外检查 sofa/chair/bed 与 standing/crouch 的固有支持面冲突。support relation 同步按新姿态重建，scene plan、warnings、safety 与 API 共用同一仲裁结果；Studio API 对冲突请求返回 `422 POSE_OVERRIDE_SUPPORT_CONFLICT`，worker 不会收到互斥 OpenPose/support Canny。矩阵测试覆盖四类前后姿态；TypeScript、worker 语法和台账测试通过，Studio 定向用例仍在进入测试前被本机 Node `uv_os_get_passwd ENOMEM` 阻断，未出现断言失败。原确定性冲突数据流已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收；模型对景别、手机、手部和视线的实际服从率继续由逐项人工 P0 semantic review 承担。
- 诊断 Agent 纠正复核（2026-08-12）：用户指出“一切基础姿态变化均产生 P0”本身会阻断合法人工编辑，复查代码确认属实。当前 `basePoseChanged` 不判断 confirmed visualSpec 是否明确约束原姿态，也没有“用户确认覆盖剧情姿态”字段；因此普通 standing→seated、seated→recline、kneeling→standing 等有意模板切换都会无条件进入 `overrideConflicts`，API 统一返回 422。此前修复消除了互斥控制下发，却引入人工模板无法改变基础姿态的过度阻断回归，状态改为 `regression`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 诊断 Agent 最终复核（2026-08-12）：当前 `PoseScenePlanV2` 已记录 `visualSpecConfirmed`，姿态覆盖仲裁同时检查确认规格、人物源文本中的明确姿态语义和结构化 `confirmPoseContract`。confirmed visualSpec 明确 seated/standing/recline/lie/kneel/walk 等基础姿态时，未确认覆盖会产生 P0 conflict；显式确认后会重建 support relation 并写入覆盖 warning；未确认视觉规格或无明确剧情姿态时，合法模板切换会直接重建支持面而不一律 422。`parsePoseControlOverride`、UI 与 API 已贯通 `confirmPoseContract`。`pnpm issue:check`、`pnpm test:issues` 和 TypeScript 检查通过；完整 Studio 测试仍在进入用例前被本机 Node `uv_os_get_passwd ENOMEM` 阻断，未出现断言失败。原过度阻断回归及旧 support 继承路径均已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 将“几何不兼容”与“有意姿态覆盖”分开：confirmed visualSpec 明确姿态且用户未确认覆盖时 P0 阻断；用户显式确认后同步重建 visual pose/support 审计并允许生成；未确认视觉规格或不存在明确剧情姿态时，合法模板切换直接重建 support，不得一律 422。

## ISSUE-POSE-010 upper-body 非移动姿态把已隐藏下肢误记为不适用

- 优先级：P0
- 状态：verified
- 来源问题：用户提交最新草稿图，对应 job 410，并追问 OpenPose 骨骼是否应当四肢完整；关联 `ISSUE-POSE-001/007/008`，但本项针对下肢控制审计与警告，而不是恢复近景腿骨。
- 用户报告：OpenPose 预览长期看不到腿；最新 close shot 草稿虽然要求 chest-up/no legs，最终仍出现大面积裸腿、坐姿退化和肢体异常。
- 已确认事实：job 410 的 confirmed visualSpec 为 `close shot`，prompt 明确 `chest-up`、`strict crop at the waist`、`no legs or full bodies`；pose plan 为 `basePose=seated`、`framingMode=upper_body`，正确隐藏 8-13 号髋膝踝，support Canny 和 upper-body composition Canny 均已发送。可是 `buildPoseControlFromPlan` 只在 `primaryAction=locomotion` 时计算 `lowerBodyControl`，因此该 seated 镜头被记录为 `lowerBodyControl=not_applicable`、`framingWarnings=[]`。实际上坐姿是否成立依赖骨盆、髋腿和支持面，下肢只是因景别被裁掉，并非“不适用”。最终草稿出现右侧大面积腿部与扭曲坐姿，现有 recipe 没有对应“下肢未受 OpenPose 控制”的审计警告。
- 高概率原因：`lowerBodyControl` 和 framing warning 是为 locomotion 单独引入的，未推广到 seated/recline/lie/crouch_kneel、站立工具操作等所有依赖下肢的基础姿态；UI/recipe 因而把“被裁切、需人工检查”错误表述为“不适用”。
- 未验证假设：增加警告或自动景别仲裁不能保证 checkpoint 在像素层服从裁切；job 410 的具体腿部畸形仍属于模型执行失败，必须由现有 P0 framing/pose/anatomy/support 人工复核拒绝。
- 反证或冲突：近景/中景隐藏腿骨本身符合既定“动作拓扑与景别裁切解耦”决策，不能为解决本问题直接恢复完整腿线，否则会重新诱导近景生成全身；wide/full 则必须继续发送完整髋膝踝。
- 复现步骤：构造 close/medium 的 seated、recline、lie、crouch_kneel 与 standing 镜头，调用 `buildPoseControlV2`；可见 `hiddenJointIndices=[8..13]`，但除 locomotion 外均得到 `lowerBodyControl=not_applicable` 且无 framing warning。job 410 是 seated 实际 recipe 证据。
- 涉及文件：`lib/pose-v2.ts` 的 `buildPoseControlFromPlan`，`lib/pose-display.ts`、`app/page.tsx` 的 OpenPose 展示，generation recipe 与 semantic review 来源。
- 影响范围：所有 upper-body 的坐、靠、卧、跪、站立及工具/持物动作；用户无法从骨架预览和 recipe 区分“无需腿部”与“腿部已被景别裁掉、若成图出现腿则不受控”。
- 建议方案：依据 `basePose` 与动作族统一计算 lower-body dependency。upper-body 一律记录 `hidden_by_framing`（或更细的 `support_only`），并生成包含 basePose、hidden joints、support control 状态和“成图若出现髋腿必须 P0 复核”的警告；full/natural-body 记录 `full`。UI 明确解释近景无腿是主动裁切，不是四肢不全。不要把完整腿骨重新塞回 close/medium ControlNet。
- 验收标准：close、medium-close、medium、waist-up、wide/full × seated/standing/recline/lie/crouch_kneel/locomotion/tool/read_phone 的纯逻辑矩阵中，upper-body 均审计为下肢被景别隐藏并列出 8-13 号点；wide/full 均发送完整且与 basePose 一致的髋膝踝。UI、recipe、semantic review 对同一状态使用一致文案，不能再把 seated upper-body 写成 `not_applicable`。程序逻辑验收，不生成图片。
- 解决 Agent 修改：`buildPoseControlFromPlan` 统一按 framingMode 记录 upper-body 为 `hidden_by_framing`，wide/full 为 `full`，并为所有上身姿态写入下肢裁切 P0 复核警告。
- 解决 Agent 测试：TypeScript 与 worker 语法检查通过；完整出图链复核确认视觉规格、prompt、recipe、Pose/ControlNet、各局部 pass、语义审批和候选回写共享该状态。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：即使程序审计与控制图一致，模型仍可能生成画外腿或异常肢体；实际视觉执行率继续由逐项人工 P0 审批承担。
- 诊断 Agent 复核证据：job 410 recipe 的 `basePose=seated`、`framingMode=upper_body`、`hiddenJointIndices=[8..13]` 与 `lowerBodyControl=not_applicable/framingWarnings=[]` 构成确定性矛盾；用户图片仅作运行失败证据。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 修正所有基础姿态的下肢控制状态与 UI/recipe/QA 审计，不改变现有近景隐藏腿骨的正确裁切策略。
- 诊断 Agent 最终复核（2026-08-12）：`buildPoseControlFromPlan` 现直接以统一 `framingMode` 决定下肢状态：upper-body 一律为 `hidden_by_framing` 并生成“髋膝踝未进入 OpenPose、成图若出现下肢必须 P0 复核”的 warning；full-body 一律为 `full` 且不产生该警告。`hiddenJointIndices=[8..13]` 与既有 framing pass 保持一致，没有恢复近景腿线；wide/full 继续保留完整下肢。该状态随 poseControl 进入 recipe/UI 和现有 pose/framing/anatomy 人工复核链。原 seated upper-body 被误记为 `not_applicable` 的确定性路径已消除，标记 `verified`。程序逻辑验收通过，未进行图片生成或视觉效果验收。

## ISSUE-POSE-011 双手持物的关系腕点在 framing 后被恢复到同一坐标

- 优先级：P0
- 状态：fixed_pending_review
- 来源问题：用户要求继续拆解 job 410 的严重手部和手机问题；关联 `ISSUE-TOOL-001` 与多关系链路，但本项针对单一 two-hand relation 在最终 OpenPose 中自相融合。
- 用户报告：最新草稿双手、手机和黑色块状物互相粘连，无法形成自然的双手竖持手机动作。
- 已确认事实：job 410 的 smartphone contract 为 `handMode=two`，prop geometry/contactAnchors 明确把左手放在 x=.335、右手放在 x=.425，手机位于 x=.38；但 `PosePersonPlanV2.relationTargets[0].wristAssignments` 把左腕 joint 7 和右腕 joint 4 都存成完全相同的 `(x=.38,y=.58)`。`buildPoseControlFromPlan` 在 upper-body framing 后又无条件用这些 assignment 覆盖已缩放的腕点，最终 `poseControl.people` 的 joints 4/7 均为 `(0.38,.58)`。基础 OpenPose ControlNet 因而要求双腕融合，initial/generic prop Canny 却要求两手分居手机左右，两个实际控制单元提供互斥几何；`safety.valid=true`、`relationConflicts=[]`、`postprocessWarnings=[]` 未检测该冲突。
- 高概率原因：关系级 `wristAssignments` 把“道具中心 target”误当作每只手的接触锚点；two-hand 左右偏移只在 worker 的 `propInteractionGeometry` 中重算，没有回写 pose plan。framing 后恢复逻辑又让错误中心点覆盖了 `buildSinglePerson` 原本可能存在的双腕间距。
- 未验证假设：最终黑色块与手机畸形受模型随机性影响，但 OpenPose 融合腕点与 prop Canny 分离锚点的请求体冲突是确定事实。
- 反证或冲突：prop contract 已能计算左右 contact anchors，说明修复不需要新增道具特例；应让 pose、Canny、mask、QA 共用同一 relation geometry。
- 复现步骤：构造 upper-body 的 two-hand phone/book relation，读取最终 `poseControl.people[0][4/7]` 与 `propInteraction.contactAnchors`；当前 job 410 前者距离为 0，后者水平距离约 .09。检查 safety 和 warnings 仍无冲突。
- 涉及文件：`lib/pose-v2.ts` 的 relationTargets/wristAssignments、`buildPoseControlFromPlan` framing 后恢复逻辑，`scripts/sd-worker.mjs` 的 `propInteractionGeometry` 与 ControlNet 装配。
- 影响范围：双手持手机、书本、平板、盒子及所有 two-hand 道具；尤其是 upper-body framing，因为后置腕点恢复会覆盖已生成的动作几何。
- 建议方案：在唯一共享的 relation geometry 中生成左右手接触锚点，two-hand 必须保留非零、有序且围绕对象表面的腕距；framing 后只恢复共享 contact anchors，不得恢复到单一 object center。新增跨控制安全校验，拒绝 pose wrist 与 prop anchors 超阈值或左右腕融合但契约要求分离的请求。
- 验收标准：phone/book/tablet/box × close/medium/wide 的 two-hand 矩阵中，左右腕保持稳定非零间距、分别接触对象两侧；OpenPose、prop Canny、mask、recipe trace 使用同一锚点。one-hand 工具路径不受影响；互斥几何不得 `safety.valid=true`。程序逻辑验收，不生成图片。
- 解决 Agent 修改：关系计划携带共享 `contactAnchors`，双手 `wristAssignments` 优先使用左右锚点并保持非零间距，framing 后恢复同一锚点而非 object center。
- 解决 Agent 测试：补齐 `PoseInteractionInput.contactAnchors` 类型和 `poseInteractionInput` 传递；TypeScript、worker 语法和逻辑测试通过。完整出图链复核确认 Pose、prop Canny、mask、recipe trace 共用关系锚点，one-hand 与失败阻断路径未被覆盖。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：COCO-18 不表达手指，细粒度握持仍由局部修复和人工 P0 审批承担。
- 诊断 Agent 复核证据：job 410 最终腕点 joint4=joint7=(.38,.58)，而同 relation 的 worker contact anchors 为 (.335,.58)/(.425,.58)，实际请求的 OpenPose 与 Canny 几何确定性冲突。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 统一 pose 与 prop 的 relation contact geometry，并增加跨控制冲突安全门。
- 诊断 Agent 复核（2026-08-12）：实现方向有效：relationTargets 会保存 contract contactAnchors，two-hand wristAssignments 优先按 hand 取左右锚点，upper-body framing 后恢复的也是这组 assignment，不再必然恢复到同一 object center；worker `propInteractionGeometry` 同样优先消费 interaction contactAnchors。但源码接口没有闭合：`PoseInteractionInput` 未声明 `contactAnchors`，当前 TypeScript 稳定报 `TS2339`，锚点 map 参数同时报 `TS7006`。解决 Agent 所写“TypeScript 通过”与实际结果冲突；新增实现无法作为可构建代码交付。状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。

## ISSUE-VISUALSPEC-003 人物位置文字与结构化 region 冲突时仍进入高置信生成

- 优先级：P0
- 状态：fixed_pending_review
- 来源问题：job 410 全链审查；本项针对视觉规格位置语义、区域坐标和 OpenPose anchor 的一致性。
- 用户报告：最新草稿主体构图、身体占比和前景关系严重失控，与预期的单人左侧近景不一致。
- 已确认事实：job 410 的 confirmed visualSpec 对同一人物同时记录 `position="left side of the frame"` 与 `region={xStart:0,xEnd:1}`。Regional prompt 使用文字位置“left side”，而 `derivePoseScenePlanV2` 用 region 中点生成 `anchor.x=.5`；support region 也据此扩展为 x=.08..92。最终 pose nose 约 x=.45，几何控制接近中部。系统没有把 position/region 不一致写入 visualSpec conflicts、pose warnings 或 safety，仍记录 `confidence=high`、`warnings=[]`。
- 高概率原因：position 是自由文本，region 是独立字段；规范化和校验只检查字段存在/范围，不执行位置词到区域的兼容性仲裁，也没有规定哪一个是唯一事实源。
- 未验证假设：job 410 的全部主体比例失败还受到 checkpoint 和 framing 执行率影响；这里确认的是 prompt 左侧与 pose/support 中部的确定性控制冲突。
- 反证或冲突：单人 region 可以合法占满全宽，但此时 position 不应再声明 left；若用户明确选择 left，region/anchor/support 应共同落在左侧，不能两套事实并存。
- 复现步骤：confirmed visualSpec 输入 `position=left side`、`region=0..1`，编译 generationSpec；检查 prompt 含 left side、pose anchor=.5、support 横跨近全宽，且 conflicts/warnings 为空。right/center 与窄/全宽 region 可构造同类矩阵。
- 涉及文件：`lib/visual-planning.ts` 的 normalize/validate，`lib/prompts.ts` 的人物区域提示，`lib/pose-v2.ts` 的 anchor/support 推导，UI 视觉规格编辑器。
- 影响范围：所有人物左/中/右构图，多人物分区、支持面绑定、脸部 mask 回退、Regional 控制和道具位置均可能消费不同事实。
- 建议方案：建立结构化 position-region 仲裁：region 作为唯一几何事实，position 由 region 派生或保存时同步更新；confirmed spec 出现明显冲突时 P0 阻断并要求修正。prompt、pose anchor、support、mask 与 UI 只消费仲裁后的同一区域。
- 验收标准：left/center/right × full/narrow region 的矩阵中，不一致输入被规范化为同一事实或明确阻断；prompt、pose anchor、support region、道具/脸部回退坐标和 UI 展示一致，不得在 warnings 为空时发送相反控制。程序逻辑验收，不生成图片。
- 解决 Agent 修改：视觉校验增加 position 与 region 的左右/中心兼容性 P0 冲突，阻断相反事实进入生成。
- 解决 Agent 测试：position 与 region 的冲突阈值覆盖 full-width left/right 原始复现，并加入 `position_region_conflict` failure 类型；TypeScript、worker 语法和逻辑测试通过。完整出图链复核确认 prompt、Pose anchor、support、mask、UI/recipe 均继续消费同一 region，冲突不再发送生成请求。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：即使区域契约一致，实际主体比例仍受模型服从率影响，由 framing/composition 人工复核承担。
- 诊断 Agent 复核证据：job 410 visualSpec、prompt、scenePlan anchor/support 与空 conflicts/warnings 共同证明位置事实分裂。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 统一 position/region 的保存、校验和所有下游消费。
- 诊断 Agent 复核（2026-08-12）：新增 position-region P0 failure 的方向正确，但原 job 410 输入仍未被阻断。当前仅在 left 的 region center `> .62`、right `< .38`、center 超出 `.3..7` 时判冲突；`position="left side" + region=0..1` 的 center=.5 会继续通过，正是本 ISSUE 的原始复现。实现也未将 position 从 region 派生，prompt 仍可能写 left、几何仍按全宽中点。并且 `position_region_conflict` 未加入 VisualValidationResult failure code 联合类型，TypeScript 稳定报 `TS2322`。原根因只覆盖“完全落在相反侧”的子集，状态改为 `partially_fixed`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。

## ISSUE-QA-005 人工语义质检遗漏人物数量、全身解剖与剧情表情检查

- 优先级：P0
- 状态：verified
- 来源问题：job 410 最新草稿与 `semanticReviewContract` 对照；关联 `ISSUE-QA-003/004`，但本项针对仍未生成的独立检查维度。
- 用户报告：最新草稿疑似出现额外/重复下肢、身体扭曲、手臂粘连，且人物没有呈现看见取件通知后的期待笑容；这些问题远超手机和腿部裁切。
- 已确认事实：job 410 recipe 明确 `characterCount=1`，negative prompt 排除 `extra person/duplicate/deformed limbs/extra or missing limbs`；visualSpec character 明确 `expression=happy`，prompt 进一步要求 `genuine happy anticipation, warm open smile`。但 semantic review 的 11 项只有 interaction、gaze、framing、pose、identity、outfit、hands、prop、support、composition、lighting，没有人物数量、额外肢体/全身解剖或表情/情绪检查项。现有 `hands_review_required` 只覆盖手指、握持和手物接触，`pose_review_required` 只要求关节方向与剧情一致，均不能等价审计额外腿、身体融合、人物重复或情绪错误。
- 高概率原因：`semanticReviewContract` 从 repairPasses、identity、outfit、camera 和 environment 增量扩展，但未消费 `generationSpec.characterCount/qualityGate count invariant`，也未消费 visualSpec.characters[].expression/expressionReason。
- 未验证假设：图中右侧裸腿究竟是同一人物的畸形肢体还是隐含第二人物需要视觉判断；无论分类如何，当前清单都没有对应必审项是确定缺口。
- 反证或冲突：negative prompt 已声明这些禁止项，说明它们是正式生成契约的一部分；不能只依赖 reviewer 自发从“pose”项联想到人物数量、全身解剖和表情。
- 复现步骤：对 job 410 调用 `semanticReviewContract`，比较 characterCount、negative anatomy/count invariants、visualSpec expression 与返回 items；三类来源均没有对应 item。构造无道具单人静态表情镜头也不会生成这些检查。
- 涉及文件：`scripts/sd-worker-logic.mjs` 的 `semanticReviewContract`，`scripts/sd-worker.mjs`、UI 逐项审批和 final worker approval 校验。
- 影响范围：全部单人/多人镜头、全身与近景、复杂姿态以及依赖剧情情绪的镜头；审核者可能逐项全通过现有清单却漏掉额外人物、额外肢体或错误表情。
- 建议方案：从实际 generationSpec 生成 `character_count_review_required`、`anatomy_review_required` 和 `expression_review_required`。人物数量/严重额外肢体为 P0；全身解剖为 P0；明确剧情表情为 P1 或按剧情关键性提升 P0。逐项 expectation 必须包含期望人数、禁止的额外/缺失肢体以及目标表情与原因，并被 UI/API/final worker 共用。
- 验收标准：job 410 式单人坐姿看手机镜头生成 count、anatomy、expression 三项；双人、无明确表情、仅手部入镜、静态环境等矩阵不误报或具有合理范围。任何 required 新项未通过时不能批准正式生成。程序逻辑验收，不生成图片。
- 解决 Agent 修改：`semanticReviewContract` 新增人物数量、全身解剖/额外肢体、剧情表情三项必审契约，并沿现有审批门禁消费。
- 解决 Agent 测试：TypeScript 与 worker 语法检查通过；完整出图链复核确认生成规格、recipe、semanticQa、UI/API approval 与 final worker 共用逐项 required verdict，HTTP 成功不会绕过语义门。未启动 SD，未进行图片生成或视觉效果验收。
- 残余风险：未配置像素语义检测器时仍由人工判断实际像素，但检查项必须完整、可审计，不能省略契约。
- 诊断 Agent 复核证据：job 410 generationSpec/negative/visualSpec 与 semanticQa.items 的集合差异，以及当前 `semanticReviewContract` 数据源共同证明缺口。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 扩展统一语义复核契约并贯通逐项审批门禁。
- 诊断 Agent 最终复核（2026-08-12）：`semanticReviewContract` 现从 visualSpec.characters 生成 `character_count_review_required` 与 `anatomy_review_required` 两个 P0 项，并对非 unknown/默认自然表情生成 `expression_review_required` P1 项；job 410 的单人、额外肢体风险与 happy 表情均会形成独立 required verdict。现有 UI/API/数据库/final worker 对 semantic contract items 采用通用逐项校验，因此新增项无需旁路即可被同一 approval 覆盖，缺项或 fail 均不能进入 final。worker 逻辑测试 8/8 通过。程序逻辑验收通过，未进行图片生成或视觉效果验收，标记 `verified`；人工误判与模型执行率继续作为产品运行风险。

## ISSUE-POSE-012 V3 关节点编辑应用后重新自动投影，导致用户画布姿态缩小或位移

- 优先级：P1
- 状态：fixed_pending_review
- 来源问题：2026-09-12 用户提交骨骼编辑器应用前后截图并询问为何“应用到本格”后由大幅完整骨架变成居中小骨架。
- 用户报告：在“直接编辑当前骨骼”弹窗中拖动完成的骨架占据画布大部分区域；点击“应用到本格”后，单元格 OpenPose 预览中的骨架明显缩小、位置改变，且关节点外观与编辑器不同。
- 已确认事实：`app/page.tsx` 的编辑器直接读取并修改 `effectivePoseControl.people`，这些坐标已经是 V3 `ProjectionPlanV3` 投影后的画布坐标；`applyEditedPose` 将其原样保存为 `poseControlOverride.people`。随后 `applyPoseControlOverrideV3` 先用旧 projection 对这些点做逆投影，再调用 V2 override 重建 `fullPeople`，最后对编辑结果重新执行 `chooseProjectionV3`，允许重新选择 composition、scale 与 translate。因而“关节点直接编辑”不是画布坐标的所见即所得保存，而会触发第二次自动构图；骨架包围盒变化时可选择较小 scale 并重新居中。预览外观差异另由两个 renderer 导致：编辑器使用 `circle r=8`、白色描边，V3 control SVG 使用 `circle r=4`、无白色描边；这只解释节点样式，不解释骨架相对画布缩小。
- 高概率原因：V3 override 没有区分 `parameter_edit`（应重建完整骨架并重新投影）与 `joint_edit`（用户已经直接编辑最终画布坐标，应锁定或显式更新投影），两种编辑模式共用同一自动重投影路径。
- 未验证假设：用户本格的具体旧/新 projection scale、composition 和 hash 尚未从运行时 recipe 提取；但静态数据流已经确定 `joint_edit` 会重新运行自动构图，足以解释截图中的非所见即所得变化。
- 反证或冲突：右侧单元格固定显示为 150×150 CSS 缩略图，只会改变整张 SVG 的显示尺寸，不会改变骨架相对黑色画布的占比；图2中相对画布占比也明显下降，因此不能仅归因于预览框较小。节点白边消失属于展示 renderer 不一致，不是坐标变小的根因。
- 复现步骤：创建任意 V3 单人 pose；取 `base.people` 作为编辑器坐标，扩大或移动若干关节后以 `{schemaVersion:"pose-override-v1", people, editMode:"joint_edit"}` 调用 `applyPoseControlOverrideV3`；比较输入画布坐标与返回 `people`、projection scale/translate/hash，可见函数重新选择投影且返回坐标不保证等于编辑输入。现有 `tests/pose-v3.test.ts` 无 joint-edit 坐标保持断言。
- 涉及文件：`app/page.tsx` 的 `editablePosePeople/applyEditedPose/posePreview`；`lib/pose-v3/planner.ts` 的 `applyPoseControlOverrideV3`；`lib/pose-v3/projection.ts` 的 `chooseProjectionV3`；`lib/pose-v3/render.ts` 与 `app/globals.css` 的预览样式。
- 影响范围：所有新建 V3 单人/多人关节点直接编辑，尤其用户改变人物占屏、中心位置、四肢外扩或接近画布边缘时；参数编辑仍应允许自动重算构图，不应与 joint edit 一并禁用。
- 建议方案：为 override 明确坐标空间和构图意图。`joint_edit` 保存最终 projected canvas coordinates，并锁定当前 projection 或从编辑结果生成 user-locked projection，应用后必须逐点保持可见关节坐标；`parameter_edit` 才重新构建 full pose 并运行自动/偏好投影。recipe、payload、UI 同步记录 coordinateSpace、projection source/hash 和 editMode。若控制 SVG 与编辑器需要视觉一致，再共用同一 renderer 配置，但不能把装饰性白边发送给 ControlNet。
- 验收标准：V3 单/双人、不同 composition、人物区域、动作/道具及边界关节矩阵中，joint edit 应用前后的可见关节画布坐标在浮点容差内一致，人物 bbox/中心/占屏不变；parameter edit 仍可产生新的 projection；隐藏关节、关系锚点、support/prop 几何与 pose 使用同一投影；recipe/payload/ControlNet 和 UI 显示同一 projection。程序逻辑验收，不启动 SD、不生成图片。
- 解决 Agent 修改：2026-09-12 将 V3 override 分为独立语义路径。`joint_edit` 现在把 `people` 明确作为 `projected_canvas` 最终画布坐标，沿用当前 scale/translate/composition，生成 `source=user_locked` 的 projection，不再调用 `chooseProjectionV3`；仅为保存完整骨架而按同一锁定 projection 逆变换，ControlNet 再投影后与编辑输入一致。`parameter_edit`/模板编辑保持重建 full pose 并重新自动投影。`PoseControlOverrideV1`、UI state、resolved pose/recipe 新增 `coordinateSpace` 与 `projectionIntent`，V3 control 保存实际 override、锁定 projection hash 和审计原因。
- 解决 Agent 测试：新增 V3 单人 joint-edit 用例，移动头与腕后断言返回 `people` 逐点等于编辑画布坐标、projection scale/translate 不变、source=user_locked、override 元数据完整；同用例确认 parameter edit 仍产生新 projection hash。`tsc --noEmit --incremental false` 通过；定向 `tsx --test tests/pose-v3.test.ts` 在进入用例前被本机 `uv_os_get_passwd ENOMEM` 阻断，无断言失败。完整出图业务链冲突复核：剧情/人工参数编辑仍可重算视觉构图；直接关节点编辑的画布坐标经 override→API→recipe/payload→OpenPose SVG 使用同一锁定 projection，人物数量、region、隐藏点可见性与 fullPeople 逆变换保持对应；relation、prop、support 几何沿用同一未变 scale/translate，不发生第二次缩放位移；identity/服装/道具/视线 pass、自动质量门、草稿整体确认与正式候选回写状态机均未被改动。程序逻辑验收完成，未启动 SD、未生成图片或执行视觉效果验收。
- 残余风险：编辑关节后若主动破坏既有手物接触或支持关系，现有跨控制 safety/语义门仍需负责阻断；编辑器节点白边与 ControlNet 无装饰节点仍是刻意的展示差异。即使坐标保存所见即所得，ControlNet 对最终像素姿态与比例的执行率仍受模型随机性影响。
- 诊断 Agent 复核证据：上述 UI 状态流、V3 逆投影与 `chooseProjectionV3` 重跑路径，以及编辑器/control SVG 的 renderer 差异。
- 诊断 Agent 复核结论：创建为 `open`。程序逻辑验收未通过，未进行图片生成或视觉效果验收。
- 后续处理：解决 Agent 拆分 joint edit 与 parameter edit 的投影语义，并补充画布坐标保持和全链路一致性测试。

## job 410 跨问题完整解决方案（诊断 Agent，2026-08-12）

> 本节是 `ISSUE-POSE-010`、`ISSUE-POSE-011`、`ISSUE-VISUALSPEC-003`、`ISSUE-QA-005` 的联合实施契约，不新增重复 ISSUE。解决 Agent 必须按同一数据流实现并分别把证据写回对应问题，不能只修一个局部函数后交接。

### 1. 视觉规格与唯一事实源

- confirmed visualSpec 保存前必须统一 `characters[].position` 与 `characters[].region`；region 是几何唯一事实，position 由 region 派生。明显冲突返回 P0 validation error，禁止进入 recipe。
- camera shotSize 编译为唯一 `framingMode/framingGeometry`；close、medium-close、medium、waist-up 统一为 upper-body，wide/full 为 full-body。prompt、negative、Pose、support、composition、UI 使用同一结果。
- 每个 required interaction 必须生成稳定 `relationId/objectInstanceId`，并建立唯一 `PropInteractionGeometry`：object center/bounds/scale/orientation/surface plane、左右 contact anchors、active/support hand、depth plane、occlusion order、character region、actor-relative anchor 与 exclusion regions。

### 2. Pose 与支持面

- OpenPose 先生成完整 basePose+action 拓扑，再应用 framing；upper-body 隐藏 8-13 号髋膝踝，wide/full 保留完整下肢。不得为了近景显示“完整骨架”恢复越界腿线。
- 所有 upper-body 基础姿态都记录 `lowerBodyControl=hidden_by_framing`，并列出 hidden joints、basePose、support control 和 P0 人工复核警告；wide/full 记录 `full`。
- two-hand relation 的左右腕必须直接使用共享 PropInteractionGeometry 的两个不同 contact anchors；禁止两个腕恢复到 object center。framing 后恢复腕点时只恢复共享锚点。
- seated/recline/lie/kneel 必须保留可见 torso→pelvis→support contact chain；supportSurfaceId、人物 region、contact plane 和 depth order 与共享人物区域一致。

### 3. 生成前跨控制安全门

- 新增统一 `GenerationControlValidator`，在 API 创建 job 前验证 prompt/recipe/所有 ControlNet 单元的事实一致性。
- two-hand 必须满足左右腕非零间距、稳定左右顺序、各自落入对象接触带；one-hand 只能占用声明主动手。
- Pose wrists、prop contact anchors、object bounds、support geometry、framing visible bounds 必须在容差内一致；同一事实由不同控制单元给出相反坐标时返回 P0 422，不发送 SD。
- close/medium 中 required 手机、脸和动作手必须落入可见范围；任何允许髋腿进入画面的模式必须同时有完整下肢骨架，否则阻断。
- validator 输出结构化 conflicts/warnings，并写入 visualSpec、scenePlan、recipe、UI；不得出现 conflict 存在却 `safety.valid=true`。

### 4. 基础生成控制

- required smartphone 必须从第一轮 txt2img 同时进入：身份、方向化 OpenPose、手机 portrait/surface Canny、双手接触 guide、support geometry 与 upper-body composition control。
- 手机 guide 不能只有外框；至少包含手机外轮廓、屏幕内框、三分之四角度/表面法线、通知卡片和图标的抽象布局、左右接触带。不得要求可读文字。
- 所有控制单元共用 relationId/objectInstanceId/geometry version，并在 requestTrace 保存无 base64 摘要、权重、时段、mask/guide bounds 和共享几何哈希。

### 5. 分阶段修复与不可破坏约束

- pass graph 固定为：base → identity → prop/hand → gaze；每个 pass 声明输入事实、允许修改区域、必须继承的控制和输出状态。
- identity pass 只修改脸部身份区域并保留 headDirection、framing、pose；不得改变手物或构图。
- prop/hand pass 的 mask 覆盖手机和必要手部，但必须同时携带共享 contact OpenPose/guide、手机 surface Canny、身份保护及当前 framing；不得从最终整张骨架重新反推腕点。
- gaze pass 只对白色脸眼 mask 重绘，目标手机只进入 crop 上下文/方向计划，不进入实际重绘 mask；同时继承 identity 与 head-direction pose，禁止修改手机、手、服装和构图。
- 每阶段立即保存独立 PNG、输入摘要、输出 SHA-256、实际控制单元和状态；后序阶段不得覆盖前序证据。

### 6. 请求状态与失败处理

- HTTP 2xx 只写 `request_succeeded`；无像素检测器时 relation 必须保持 `semantic_pending/manual_required`，不得标成 completed/applied。
- 技术失败保留上一阶段诊断图，写 `postprocessWarnings` 并阻断正式候选；语义失败保留草稿但只允许 reject/retry，不得批准进入 final。
- retry 必须按失败项选择范围：手机缺失/变形重跑 prop/hand，视线错误重跑 gaze，身份错误重跑 identity，景别/额外肢体/支持面错误回到 base；不得用后序小 mask 修复全局构图或解剖问题。
- 每次 retry 使用新 pass attempt 记录输入 stage、失败标签和输出，不覆盖旧 attempt；设置有限次数，耗尽后标记 blocked/manual redesign，不无限循环。

### 7. 完整人工语义门禁

- semantic-review 契约必须至少包含：character count、anatomy、identity、outfit、expression、interaction、hands/contact、prop count/shape/surface、gaze、pose、support、framing、composition、lighting。
- P0：人数、额外/缺失肢体、严重解剖、关键道具存在/唯一、手物接触、视线、姿势、支持面、景别。P1：身份、服装、明确剧情表情。P2：构图和光照。
- job 410 的手机必须满足：恰好一个 smartphone；portrait；位于躯干前；左右手分别接触两侧；无黑色融合物或第二设备；屏幕面可辨认且有抽象通知卡片；人物头眼看向屏幕。
- 任一 required verdict 缺失或 fail，API、数据库 approval 和 final worker 三层均拒绝；只有全部 required items pass 才生成正式任务。

### 8. 正式候选回写

- final worker 必须重新验证当前 semantic approval 的 version、items 快照、geometry hash 和 generationSpec hash；任一输入在批准后变化则审批失效，回到草稿复核。
- final 阶段继续复用批准时的唯一几何和控制契约；任一技术 pass 失败、hash 不一致、P0 warning 或 relation 非 approved 状态均不得写入正式候选。
- 正式候选保存完整 lineage：draft job、approval、final job、各 stage outputs、relation attempts、实际 request/control 摘要与最终 quality state。

### 9. 联合程序验收矩阵

- 景别：close、medium-close、medium、waist-up、wide/full。
- 姿态：seated、standing、recline、lie、crouch_kneel、locomotion。
- 道具：phone、book、tablet、box 的 two-hand；tool/cup/bag 的 one-hand；无道具静态镜头。
- 区域：left、center、right；单人和双人；sofa/chair/bed/floor 支持面。
- 断言：position/region 一致；upper-body 下肢状态真实；wide/full 完整腿骨；左右腕与 prop anchors 一致；手机结构进入基础和 prop pass；各 pass 不丢身份/姿态/服装/构图；冲突请求 422；HTTP success 不等于 semantic complete；失败审批不能生成 final；批准后 spec/hash 变化使审批失效。
- 验收仅检查纯函数、结构化数据、SVG/mask/guide 坐标、payload、状态机、数据库门禁和 trace；不启动 SD、不生成测试图。模型随机性和实际视觉执行率保留为产品运行风险，但任何失败图必须被门禁阻断。


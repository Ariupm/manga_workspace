# 漫画工作台项目记忆

最后更新：2026-08-02（Asia/Shanghai）

- 2026-08-09：新增 `PROJECT_ACTIVE_ISSUE.md` 作为解决 Agent 当前任务指针。用户激活问题后，新开的解决 Agent 只需读取项目协作文件并声明身份，即可从活动指针定位问题；切换问题使用 `pnpm issue:activate -- ISSUE-ID`。若活动指针无效或台账状态不允许解决，Agent 不得猜测任务。
- 2026-08-09：解决 Agent 默认采用 `ALL_OPEN_ISSUES` 模式。用户只声明身份而未指定 ISSUE 时，按 P0 → P1 → P2 及台账顺序连续处理全部 `open`/`in_progress` 问题；每项独立提交到 `fixed_pending_review`，单项受阻不影响继续处理其他问题。只有用户明确指定 ISSUE ID 时才进入单问题模式。
- 2026-08-09：解决队列的可行动状态扩展为 `open`、`in_progress`、`partially_fixed`、`regression`，避免诊断 Agent 标记“部分修复”后解决 Agent 误判队列为空。新增 `issue:queue` 完成门禁：解决 Agent 最终答复前必须运行，队列非空时不得停止；`fixed_pending_review` 只等待诊断 Agent 复核，不由解决 Agent 重复处理。
- 2026-08-09：诊断 Agent 复核后必须直接更新 `PROJECT_ISSUES.md`：通过项标记 `verified`，部分通过标记 `partially_fixed`，未解决标记 `open`，回归标记 `regression`；诊断发现的可复现新问题必须建立新 ISSUE 并标记 `open`，不能只留在对话总结。解决 Agent 通过 `issue:queue` 自动识别新增与未完成任务，并跳过已验证或等待复核的问题。
- 2026-08-09：图片生成类问题统一采用程序逻辑验收。解决 Agent 和诊断 Agent 不启动 SD、不生成测试图、不等待真实图片，也不以视觉效果作为关闭条件。解决 Agent 只验证代码修改和程序链路；诊断 Agent 从不同人物、区域、动作、道具、景别的通用性复核根因、数据流、提示词编译、recipe/payload、mask/坐标、控制参数、状态机和失败分支。程序证据充分即可标记 `verified`，结论注明“程序逻辑验收通过，未进行图片生成或视觉效果验收”；模型随机性与实际视觉执行率作为运行风险，不阻塞代码问题关闭。
- 2026-08-09：图片生成问题不强制新增自动化测试。静态代码审查、类型检查、纯函数或请求体推导和完整数据流核对可以作为程序验收证据；诊断 Agent 不得仅因“没有测试”“逻辑内嵌 worker”或“没有真实图”判定未通过，必须指出具体仍存在的代码缺陷。最新工作区规则优先于问题条目中遗留的成图、视觉检测、同 seed 或强制自动测试标准。

- 2026-08-08：修复手机用途分类误判。旧逻辑用裸 `/ear/` 识别通话，会把 `wearing` 误命中为 `call`；任务 304 因而把“双手胸前查看手机、视线落屏、取件通知”错误编译成单手举到耳边。新逻辑优先采用通知/消息/阅读、屏幕视线和双手胸前操作证据推导 `read`/`inspect`，并只在明确的 phone call 或手机靠耳表达下推导 `call`；回归测试同时覆盖任务 304 场景和真实通话。

- 2026-08-08：新增质量诊断原则：用户对生成结果、提示词或方案架构的判断必须先与代码、任务 recipe、实际请求 payload 和生成日志核对；不能因为用户的描述听起来合理就直接当作事实。若证据与用户判断不一致，必须明确指出冲突、给出代码/数据证据，并区分“已证实原因”“高概率原因”和“尚未验证假设”。任何“已修复”“已启用”“必然生效”的结论都必须有对应实现路径或运行证据。
- 2026-08-08：眼神与工具交互问题诊断：当前代码确实会在基础提示词、Regional 人物区和部分负面词中加入“不看镜头、看动作目标”的语义约束（`lib/prompts.ts` 的 `inferGazeFromAction`、`deriveInteractionContract`、`buildRegionalPrompt`）；但这不能证明最终图片会执行。已确认的高风险缺陷是：`scripts/sd-worker.mjs` 的道具视线修复阶段使用道具中心 `centerX` 作为脸部 mask 的横坐标，而不是按 `reference.region` 计算人物脸部中心；当手机/工具位于躯干侧面时，视线修复 mask 会偏离脸部，因而无法可靠改变眼睛。另一个风险是身份精修统一追加 `both eyes fully visible, unobstructed face`，可能把原本低头/侧脸的姿态拉回正面，但它本身不是“必然看镜头”的充分证据。工具偶尔不出现也有代码路径依据：`deriveInteractionContract` 依赖英文/中英混合关键词命中 `interactionObjects`，只有命中后 `repairPasses.propInteraction.required` 才会触发工具/手部局部修复；未命中时只保留通用动作提示词和负面词。后续必须优先检查任务 recipe 中的 `generationSpec.repairPasses.propInteraction`、实际 `requestPayload.prompt/negative_prompt`、ControlNet 脚本和 worker 的 `postprocessWarnings`，再判断是识别未命中、recipe 未固化、修复失败还是模型执行失败。

- 2026-08-02：提示词编译新增通用“角色—动作—道具—手部接触—视线”交互契约。系统从已确认视觉事实、人物动作、动作对象、手部和视线中识别手机、书/文件、饮品容器、包裹、雨伞、包和食物容器等可交互道具，强制道具可见、手与道具发生物理接触、头眼瞳孔指向道具，并排除空手、双手交叠、抱手及手放腿上等冲突姿势。交互契约携带人物横向区域、按道具用途推导的相对中心、基础轮廓类型和明确视线；SD worker 按该空间信息动态建立高清手部/道具遮罩，并在 Canny 可用时以手机竖矩形、书/包裹横向矩形、杯子圆柱、雨伞、包或餐具轮廓提供结构引导，完成后再用独立脸部遮罩低强度校正视线。各阶段失败均保留上一阶段图片。单人 Regional 提示已移除双人构图、双方脸部、交接居中及“另一位女性”等模板残留。
- 2026-08-02：单人交互镜头不再只依赖提示词。编译器会依据坐姿、站姿、移动状态、人物区域、单/双手操作和道具相对中心程序化生成 OpenPose，手腕节点与道具轮廓对齐；中景使用动作骨架而非强制完整站立模板，全景保留膝踝约束。通用手持工具（锤、螺丝刀、扳手、钳、剪刀、笔、刷子、刀等）纳入交互契约，使用单手握柄和长条工具轮廓引导。
- 2026-08-02：内置 OpenPose 编辑器在每次打开时强制从当前编译模板重新装载节点，避免 React 早期空状态造成只有黑底；画布 viewBox、坐标和显示比例跟随模板实际宽高，支持 512×512 与 512×768。标题和辅助文案按单人/多人动态显示，不再固定写“双人递伞”。
- 2026-08-02：交互姿态分类同时读取已确认 visibleFacts 与人物位置，避免“坐在沙发”被编译为站姿。手部/道具遮罩缩小为紧贴操作区域；Canny 可用时草稿/成品道具重绘强度提高到 0.54/0.42，视线校正提高到 0.36/0.28。手机交互不再要求所有手指无遮挡，而是让手机实体遮挡大部分手指，仅保留双拇指与外侧轮廓，降低 SD1.5 手指拓扑难度。
- 2026-08-02：手部/道具 inpaint 遮罩从会污染腹部和服装的大椭圆改为“道具主体矩形＋单/双手腕小圆”的组合遮罩。手机契约明确竖屏、长边竖直、顶部朝脸、屏幕朝人物且观众看到背壳，并排除横屏、屏幕朝观众、游戏手柄和超大设备。仅写 looking toward phone 的模糊视线会自动展开为低头、瞳孔向下且无镜头眼神。
- 2026-08-02：交互契约从“按道具写死姿态”升级为用途驱动结构，固化 purpose、orientation、viewerSurface、handMode、gazeMode、位置和轮廓。支持 inspect/read/watch/capture/scan/call/drink/carry/operate/offer/place；同一手机在读消息、横屏视频、拍摄、扫码和通话时会得到不同的横竖方向、可见面、手数、位置及视线规则。SD worker只读取这些参数生成遮罩、Canny轮廓和局部提示，不再包含手机专项剧情分支；独立视线修复仅在 gazeMode 非 independent 时运行。

这是供后续 Codex 新对话接手项目使用的长期交接文件。开始工作前先核对代码和当前数据库状态，因为运行中的任务和用户数据可能在本文件更新后发生变化。

## 1. 项目定位

项目是一个本地优先、可视化、可干预、面向长期连载的 AI 漫画制作工作台。

核心生产关系：

```text
作品
→ 章节
→ 每章通常 5–7 张漫画页
→ 每页按剧情动态规划分格（通常 6 格以上）
→ 每格多个无文字候选版本
→ 独立文字图层排版
→ PNG/PDF 导出
```

基本原则：

- AI 负责分析、脚本、分镜和候选生产，用户负责关键选择。
- 图片模型只生成无文字画面，对白、旁白和拟声词后期叠加。
- 新剧情默认创建独立作品，只有用户主动选择时才加入已有作品。
- 新分镜没有候选图时必须显示空白状态，不能填充旧项目图片。
- 每个候选、布局、任务和选中状态必须持久化，局部重生成不能覆盖旧版本。

## 2. 技术栈与目录

- 项目目录：`D:\codex\设计\漫画工作台`
- 前端/后端：Next.js + TypeScript
- 数据库：Node `node:sqlite`，文件为 `data/studio.db`
- 图片与任务输出：`workspace/`
- 角色原始资产：主要位于 `D:\codex\设计\角色资产`
- 本地地址：`http://localhost:3210`
- SD WebUI：`D:\stable-diffusion-webui-master`
- SD API：`http://127.0.0.1:7860`
- 当前机器检测到 AMD Radeon 780M，没有可用的 NVIDIA/CUDA；`webui-user.bat` 因此使用 `--use-cpu all`。512×512、IP-Adapter、多候选任务可能需要数小时，WebUI 给出的 ETA 可能非常大；这属于当前硬件运行模式，不是网页队列卡死。

主要文件：

- `app/page.tsx`：主工作台界面和主要交互。
- `app/api/studio/route.ts`：工作台写操作和 SD 生图入口。
- `app/api/generation-progress/route.ts`：任务进度、失联识别、暂停、恢复、重试和取消。
- `app/api/codex-executor/route.ts`：经用户确认后启动 Codex CLI worker。
- `app/api/job-log/route.ts`：读取单个 Codex 任务的真实 JSONL 日志。
- `lib/db.ts`：SQLite schema、迁移和数据操作。
- `lib/prompts.ts`：英文生图提示词构建与中文校验。
- `scripts/codex-worker.mjs`：Codex CLI 队列执行器。
- `scripts/sd-worker.mjs`：脱离 Next.js 请求生命周期运行的 SD 队列执行器。
- `tests/studio.test.ts`：内存 SQLite 下的分析、分镜、迁移、提示词和归属校验测试。

## 3. 启动方式

漫画工作台：

```powershell
cd "D:\codex\设计\漫画工作台"
pnpm install
pnpm dev
```

Stable Diffusion WebUI（只启动一套）：

```powershell
cd "D:\stable-diffusion-webui-master"
.\webui-user.bat --api
```

工作台只读取自己的配置：

```text
D:\codex\设计\漫画工作台\.env.local
```

当前使用的变量：

```env
IMAGE_PROVIDER=sd-webui
SD_WEBUI_URL=http://127.0.0.1:7860
SD_WIDTH=512
SD_HEIGHT=512
SD_STEPS=16
SD_CFG_SCALE=6.5
SD_CONTROLNET_MODEL_DIR=D:\stable-diffusion-webui-master\extensions\sd-webui-controlnet\models
```

修改 `.env.local` 后必须重启 Next.js。曾出现同时启动两套 SD 的情况；实际占用 7860 端口的进程才会接收请求，另一个终端不会显示生成日志。

## 4. 当前已实现能力

- 生成设置已加入 DeepSeek 剧情分析模型配置：支持启用状态、API 地址、`deepseek-v4-pro` / `deepseek-v4-flash` / 自定义模型、连接测试和删除密钥。密钥使用 Windows 当前用户级 DPAPI 加密保存在未跟踪的 `data/deepseek-config.json`，前端只获取是否配置和末四位。
- 新增两阶段视觉规划：章节级 `ChapterVisualPlan` 保存场景、天气、光线、人物和道具连续性；分格级 `ShotVisualSpec` 保存可见事实、主体—动作—受体、表情原因、视线、手部、区域、交互与镜头。两类结果必须人工确认后才影响提示词。
- DeepSeek 通过服务端 JSON Output 调用并最多重试一次，输出经过角色/资产 ID 白名单验证；未配置或失败时不阻断现有规则模式。
- SD 配方会固化已确认视觉规格、规格版本及 `sd15-visual-spec-v1` 编译器版本。多人 Regional Prompter 比例可按视觉规格人物区域生成，不再只能固定等分。
- 新人物资产负面词不再无条件排除粉发、粉棕瞳或“小粉”，避免与合法新角色设定冲突。

- 项目首页、作品切换和生产状态概览。
- 剧情输入、本地规则分析、独立作品/已有连载分流。
- 大纲、脚本、分页、动态分镜和连续性数据。
- 项目、章节、页面、分格、候选版本、资产、文字图层、布局、时间线和任务的 SQLite 持久化。
- 每章 5–7 页、每页通常 6 格以上的结构生成。
- 单格候选选择、锁定、历史版本、导入图片和独立重生成。
- 表情、动作、镜头、服装局部修改面板。
- 全英文模型提示词；提交前阻止中文视觉字段；对白不进入生图提示词。
- 对白气泡、旁白框、拟声词的独立文字图层。
- 页面比例、模板、间距、边距和文字图层属性保存。
- PNG 和多页 PDF 导出基础能力。
- 小粉角色以及服装、鞋履资产库；新人物五类基准包向导。
- 角色资产页采用缩略图目录 + 详情预览结构，支持按人物/服装/鞋履筛选、名称/编号/标签搜索和待处理质量筛选；目录与详情顶部对齐，常见笔记本宽度下不会横向溢出。
- “创建人物”是角色资产页一级入口：先建立人物名称、中文设定、英文生图外观和不可变特征，再继续补齐正脸、三视图、表情表、基础服装、基础鞋履五类基准图；英文外观是启用创建按钮的必填项。
- SD WebUI 配置/API/ControlNet 检测。
- SD 任务单独取消、失联任务识别、真实进度同步。
- Codex 当前页队列、用户确认后启动 CLI、任务列表和每任务实时日志抽屉。
- Codex 失败任务可按原 payload 复制为新任务重新入队，旧失败记录保留。
- Codex 每格只能附带该格绑定人物的身份图、当前服装和当前鞋履；不能按 `character_id` 把人物名下全部服装/鞋履传入。Codex CLI worker 使用独立任务目录和全新会话，避免读取项目指令、累积超长上下文及触发 Windows workspace sandbox 初始化错误。Codex 队列严格逐格串行执行，每个任务只生成 1 张候选；任务队列不提供批量确认，必须在每条任务上点击“确认并生成此图”，其余任务继续等待。
- SD 使用 CPU 优先两阶段：每格先按目标比例生成最长边 384 的构图草稿，人工确认后再以草稿为 img2img 初始图生成所选尺寸的单张正式候选；草稿不会写入 `candidates`。
- SD 提示词已改为“场景先行”：地点类型、具体空间、前中后景、纵深、天气、可见时间、主光、环境光、色温和气氛先于人物块；中远景动态排除空白背景，特写只保留可辨识环境线索。
- 每格通过 `characterLooks` 为每个出场人物分别保存服装、鞋履、发色、发型、瞳色、位置、动作、表情、视线和手部；人物档案通过 `visualTraits` 保存默认发色、发型和瞳色。
- 单格制作右侧改为“分镜 / 人物造型 / 画面环境”固定高度标签检查器，完整正负提示词移到画布下方的宽版工作区。
- 快捷修改现在只保存差异，不再自动创建候选；用户连续完成修改后再点击独立生成按钮。
- 每张候选和当前大图均可导出原始文件；导出接口按项目和候选 ID 校验归属。
- 任务队列改为服务端分页，每页 20 条，任务卡显示作品、章节、页、格和任务编号；详细日志仍显示最近真实输出，不分页。
- 分格可绑定多个角色；提示词、Codex 参考图和 SD 身份参考按 `character_ids` 解析。
- 作品侧栏可切换历史章节；`getStudioData` 支持指定 `episodeId`。
- “长篇素材”保存到 `story_materials`，不再创建完整章节。
- 连载记忆按钮会将章节时间线写入 `series_memory`。
- 分镜与章节文本使用合并式 debounce 保存，避免同一记录的旧请求覆盖新字段。
- 页面排版已增加图片裁切焦点/缩放、文字字体/颜色/层级/锁定/越界提示。
- 快捷修改确认后会自动创建新候选任务；服装可应用到当前格、当前页或后续章节分格。
- 新增 `tests/studio.test.ts`，测试使用内存 SQLite。
- SD 生成已迁移到 `scripts/sd-worker.mjs` 独立进程，网页/API 重启不会清除任务身份。
- SD worker 会在阻塞的 txt2img 请求期间独立轮询 WebUI 并持久化进度；采样步数尚未出现时显示“加载模型或预处理参考图”，运行中最低显示 1%，不再长期停留在虚假的 0%。
- SD/Codex 任务支持暂停、恢复、取消和保留旧记录的原配方重试。
- 任务列表直接展示 SD 实际 Seed。
- 自动分镜改为建立镜头、动作推进、人物反应、物件信息、结果承接等叙事任务，不再写重复占位句。
- 动态页面中的分格支持拖动改变阅读顺序，并可从右下角拖动改变横纵跨度。
- 文字图层右下角提供持久化拖拽缩放手柄。
- 新人物基准包支持正脸、三视图、表情表、基础服装和基础鞋履上传，五项齐全后自动启用。
- 角色资产页已升级为全局通用人物资产生成器：新人物只需名称、中文概念和可选备注，Codex CLI 先按 JSON Schema 草拟结构化英文人物档案，用户确认后才能进入图片生成。
- 角色图片生成使用独立的 `character_asset_jobs` / `character_asset_candidates`，不依赖漫画分格任务。正脸一次生成 3 个候选，其余类别生成 2 个；页面刷新或应用重启后仍可查看状态、候选、错误并逐项重生。
- 标准正脸是唯一身份母版。三视图、表情、基础服装和基础鞋履必须在正脸确认后生成，并固化 `master_reference_id`；更换正脸会把依赖旧母版的派生参考标为未确认。
- 角色资产图片优先由 `scripts/character-asset-worker.mjs` 调用 Codex imagegen 生成，不自动降级到本机 CPU SD；失败任务保留错误，五类均继续支持手工上传兜底。
- 角色名称可编辑但稳定角色 ID 永不改变；全局角色库允许同名并在创建时提示。现有 `character_story_1785412662713_1` 已原地从“陌生女孩”改名为“小泠”，27 个分格绑定保持不变。
- 角色资产页的人物卡同时充当资产归属筛选器；下方人物、服装、鞋履目录以及分类数量只展示当前选中人物，避免不同人物资产混排。
- 角色资产“重新生成”在已有正式参考时仍会展示最新任务的真实阶段和本次未确认候选；同一人物只允许一个角色资产任务处于 queued/running，防止连续点击并行启动多条 Codex imagegen 任务。
- 角色 imagegen worker 使用全局文件锁串行执行不同人物的任务，并优先采用当前 Codex 调用明确返回的图片路径；只有返回路径无效时才扫描新文件，避免并行任务从共享 `generated_images` 目录互相拾取图片造成正脸/三视图/表情错位。历史错位候选保留文件和记录但标记为 `misclassified`，不再进入任何五类候选区。
- 小泠当前基础职业装为白色雪纺系带衬衫、浅粉高腰修身及膝上铅笔裙与玫粉尖头细高跟鞋；服装负面词排除斗篷、长袍、盔甲、深蓝长裙、裤装和外套等旧造型。小泠的一次性命名/初始档案迁移只在旧名称仍为“陌生女孩”时执行，禁止应用热重载覆盖用户后续编辑。
- 每个人物的“基础服装”资产卡提供“参考图转提示词”：用户上传 PNG/JPEG/WebP 后，API 临时保存图片并调用 Codex 视觉分析，按 `scripts/outfit-prompt.schema.json` 返回中文摘要、英文服装正向词、鞋履词和服装负向词。结果必须在可编辑弹窗中人工确认，确认后只局部更新 `profile_json` 的服装字段，不修改或作废人物身份资产；临时上传图分析结束即删除。
- 确认“参考图转提示词”后会自动创建基础服装生成任务；不同资产类型允许同时入队并由 imagegen 全局锁串行执行，同一人物同一资产类型禁止重复排队。基础服装卡可展开查看当前正向/负向提示词，避免提示词已更新但界面没有反馈。
- 修正旧资产写入规则：三视图不再覆盖 `assets` 中供漫画身份参考使用的标准正脸，SD/Codex 分格生成继续只取确认的 `face`。
- 一次性迁移已合并同名重复作品，并将不足 5 页的旧章节扩展为 5 页；迁移前备份保存在 `data/studio.db.before-full-migration-20260730-200544.bak`。
- 所有时间统一按 Asia/Shanghai 显示；数据库时间仍是 UTC。
- 任务列表不展示 mock 数据；取消状态由 SQLite 持久化，应用初始化时清理已取消记录。

## 5. Stable Diffusion 当前生成约定

固定/默认参数：

- Checkpoint：运行时从 `/sdapi/v1/options` 读取并固化到任务。
- 当前曾检测到：`meinaunreal_v5.safetensors [f5beb7b5ac]`
- VAE：运行时读取；曾检测到 `vaeFinalPruneVAE_v10.pt`
- Sampler：`DPM++ 2M`
- Schedule type：`Karras`
- 草稿：最长边 384、保持目标宽高比、12 steps、CFG `5.5`、batch `1`。
- 成品：默认 `512 × 512`，可选 `512 × 768`、`768 × 512` 或 384–1024 范围内的 64 倍数自定义尺寸；宽高比限制为 2:3–3:2。18 steps、CFG `6`、batch `1`、img2img denoise `0.35`。
- Seed：默认 `-1`；响应返回实际 seed 后写回任务配方。
- 图片提示词必须全英文、无对白、无文字。

新建 SD 任务会把以下内容固化在 `jobs.payload.recipe`：

- 模型、VAE、Clip skip
- Sampler、Schedule type、Steps、CFG
- 尺寸、Seed、Batch
- 完整正向/负向提示词
- 实际使用的参考资产、ControlNet module/model/weight/path
- IP-Adapter 启用/降级状态和原因
- 完成后写入 `actualSeed` / `actualSeeds`

任务队列中的“任务详情”用于查看上述配方。旧任务创建时没有完整 recipe，只能显示当时保存的提示词。

### 当前一致性策略

SD 请求会在每次创建任务时同时检查 ControlNet 模型列表和本地模型文件大小。有效时：

- 草稿只使用每个人物单独、已确认的 `face` 正脸参考；小粉固定使用 `../角色资产/小粉/00-原始参考图.png`，禁止把三视图、表情表或拼贴图直接作为 Face IP-Adapter 输入。
- 草稿身份参考使用 `ip-adapter_clip_h` + `ip-adapter-plus-face_sd15`，weight `0.65`。
- 成品身份参考 weight `0.70`，当前服装参考使用 `ip-adapter-plus_sd15`，weight `0.35`，减少身份、服装与构图竞争。
- 鞋履仍主要使用英文视觉描述，避免局部鞋图破坏中景构图。
- 缺失或文件小于 1 MB 时降级为 `reference_only`，原因写入 `recipe.adapterStatus`。

### IP-Adapter 状态

ControlNet API能看到：

- `ip-adapter-plus-face_sd15.safetensors`
- `ip-adapter-plus_sd15.safetensors`

2026-07-30 检测时两个文件均约 98 MB，ControlNet API 也已列出对应模型。目录：

```text
D:\stable-diffusion-webui-master\extensions\sd-webui-controlnet\models
```

官方来源：

```text
https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus-face_sd15.safetensors
https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter-plus_sd15.safetensors
```

模型已经接入生成请求。后续如果增加姿势参考，再考虑 OpenPose/Depth；不要在没有姿势资产时强行启用。

### SD 独立 worker

1. `app/api/studio` 先执行结构化提示词质量检查。质量检查是风险提示而不是唯一硬阻断：普通请求发现空泛字段会返回 422 和修正建议，但用户可通过自动修正、手工编辑提示词或明确忽略建议三条路径继续。
2. API 以 detached 方式启动 `scripts/sd-worker.mjs <jobId>`。
3. 草稿 worker 生成单张草稿并把路径写入 job payload，状态变为 `awaiting_draft_approval`，不写入正式候选。
4. 用户批准后同一个 job 转为 `final_queued`，worker 使用 `/sdapi/v1/img2img` 和批准草稿生成单张正式候选；放弃则变为 `draft_rejected`。
5. 阶段状态为 `draft_queued/draft_running/awaiting_draft_approval/final_queued/final_running/completed`；页面关闭或 Next.js 重启不会丢失审批状态。
6. 日志写入 `workspace/sd-jobs/job-<id>.log`，页面轮询使用 SQLite job ID。
7. 暂停运行中的 SD 任务会调用 `/sdapi/v1/interrupt`；恢复和失败重试会从 recipe 的 phase 恢复正确阶段。

### 结构化提示词门禁

- 顺序固定为：质量、精确人数、身份、景别、单一动作、表情与视线、手部、服装、场景、构图、光线、硬约束。
- 单人强制 `1girl, solo, single person, one adult woman`，负面词强制排除多人、重复、拼贴、character sheet 和 turnaround sheet。
- 多人按实际人数写入明确计数，并排除额外人物、复制人物、融合身体、融合脸和串服装；仍需人工重点检查串脸。
- `natural storytelling action`、`coherent story environment`、`clear storytelling composition`、`gentle, natural expression` 等占位文本不可生成。
- 特写与全身、坐姿与站姿、单人与多人等冲突会在提交前拦截。
- 单格页的正向和负向 SD 提示词必须可直接编辑，并提供“恢复系统版本”；手工编辑内容通过 `promptOverride/negativePromptOverride` 提交。
- 旧数据存在空泛占位词时，`suggestPromptFixes` 会按镜头、人数和中文场景上下文补全具体动作、表情/视线、场景和构图。“自动修正并生成草稿”会先保存这些结构化字段，再以修正后的完整提示词创建任务。
- 用户选择“忽略建议，仍然生成”时必须二次确认；任务 recipe 用 `promptSource` 记录 `auto_repaired`、`manual_override` 或 `forced_structured`，便于复现和审计。
- 场景编译顺序固定早于人物：质量/风格 → 景别/人数 → 场景空间/时间/光线 → 各人物独立造型与动作 → 构图/硬约束。
- `environmentScore` 检查地点、至少两个环境锚点、空间层次、时间和光线；环境强调可选 low/balanced/high，中远景使用约 1.12–1.22 权重，特写不机械强化背景。
- 目标尺寸、环境快照和每个人物约束必须固化到 recipe；草稿批准后通过 `targetWidth/targetHeight` 恢复成品尺寸，禁止重新硬编码为方图。

注意：代码、构建和语法已经验证，但尚未在本轮消耗额度执行一次新的真实 SD 任务。

## 6. Codex CLI 队列现状

工作流：

1. 用户在当前页加入 Codex 队列。
2. 任务保存英文提示词和角色/服装/鞋履参考图。
3. 用户在任务页面确认一次。
4. `app/api/codex-executor` 启动 `scripts/codex-worker.mjs`。
5. worker 按项目维护 Codex session，顺序处理任务。
6. 每格目标生成 2 个候选并回写。

已修复的问题：

- `--image` 是可变参数，曾吞掉最后的 prompt，CLI 卡在等待 stdin。
- 现已在 prompt 前加入 `--`，并关闭 stdin。
- Codex CLI没有可信的图像采样百分比，UI不再显示假 5%，改为真实阶段。
- worker 流式解析 `thread.started`、`turn.started`、`item.started/completed` 等 JSONL 事件。
- 每个任务可查看独立实时日志，每 2 秒刷新。

### Codex 结果回写

Codex 内置 imagegen 的图片默认生成在：

```text
C:\Users\<user>\.codex\generated_images
```

worker 现在会在每个任务调用前后对该目录做快照，查找本次新增的有效 PNG，由 worker 自身复制为：

```text
workspace/generated/codex-job-<id>-candidate-1.png
workspace/generated/codex-job-<id>-candidate-2.png
```

复制前后均校验 PNG 签名和最小文件尺寸；Codex 不再负责执行跨沙箱复制命令。旧失败任务可在任务列表按原配方复制为新任务重新入队。

## 7. 角色与资产约定

小粉的固定角色 ID（其他人物使用各自独立 ID）：

```text
character_xiaofen
```

资产至少包含：

- 标准身份参考/三视图
- 表情
- 服装
- 鞋履
- 英文视觉描述
- confirmed 状态

分格中的服装和鞋履编号只用于解析资产，不能原样放进模型提示词。模型看到的是英文视觉描述和真实参考图。

资产已有 `quality_status`，当前会区分 `complete_identity`、`complete_outfit`、`partial_outfit`、`partial_footwear`、`not_generation_ready` 和 `unknown`。`not_generation_ready` 不进入生成参考。现有部分服装仍是旧裁切，状态只是迁移推断，后续需要人工复核和重新裁切。

新人物先保存英文视觉设定和不可变特征，再上传标准正脸、三视图、表情表、基础服装和基础鞋履。五类参考全部确认后自动标记为 `ready`，身份/服装/鞋履同时写入可生成资产。

## 8. 数据迁移与备份

2026-07-30 已实际执行一次性迁移：

- 合并同名重复作品，章节归并到保留的作品 ID。
- 将不足 5 页的旧章节扩展为 5 页，新增页使用明确的“兼容迁移”空白分镜。
- 为旧资产推断初始 `quality_status`。
- 迁移后检查：重复作品数为 0，所有现有章节均为 5 页或以上。

迁移前备份：

```text
data/studio.db.before-full-migration-20260730-200544.bak
```

自动化测试必须设置：

```env
STUDIO_DB_PATH=:memory:
```

`package.json` 的 `test` 脚本已包含该隔离变量。不要直接在缺少此变量的命令中运行会创建章节的数据库测试。

## 9. 数据与安全约定

- 不删除 `data/studio.db`。
- 不删除 `workspace/generated`、`workspace/assets` 或已有候选图。
- 不跨项目自动复用图片。
- 不把失败任务伪装为成功。
- 不使用模拟任务或模拟百分比。
- SD实际无任务但数据库长期显示运行时，应标记为失联并保留错误说明。
- 所有生成请求应保存完整可复现配方。
- 不把 API Key、登录凭据或本机隐私写进此文件。

## 10. 当前高优先级缺陷

按优先级排序：

1. 用用户确认的真实任务分别验证 Codex 和 SD 独立 worker 的生成、暂停、恢复、取消和候选回写。
2. 气泡仍缺少可视化尾巴方向和说话人绑定控件；数据库已有 `shot_id`，但界面不够明确。
3. 资产质量状态已建立，但仍缺少人工修改状态和重新裁切界面。
4. 分格支持拖动排序和跨度调整，但不是任意像素级边界编辑；复杂跨格布局仍需增强碰撞和溢出处理。
5. 补浏览器端整章 PDF/PNG 导出快照测试和端到端测试。
6. 为 SD 最终响应继续保存模型 hash、完整 ControlNet 响应元数据；当前已保存请求配方、适配器状态和实际 seed。
7. 人工复核旧服装资产，将仅上衣、仅下装和不完整鞋履标记为准确质量状态。

## 11. 接手时建议先执行

```powershell
cd "D:\codex\设计\漫画工作台"
npx tsc --noEmit
npm run test
npm run build
```

2026-07-30 最近一次验证结果：

- TypeScript 编译通过。
- `scripts/sd-worker.mjs` 和 `scripts/codex-worker.mjs` 语法检查通过。
- 14 项内存 SQLite 自动化测试通过，包含场景词序、夜间可见光源、特写环境策略、人数约束、自动补全、尺寸继承、候选归属和任务分页。
- Next.js 生产构建通过。
- 浏览器验收确认单格页会展示提示词质量检查和三种处理路径；正向/负向提示词均可编辑，旧占位词可一键自动修正并生成，不再以禁用按钮强迫用户手工修字段。
- 未在本轮执行会消耗额度的真实 SD/Codex 生图。

然后检查：

```powershell
# 工作台是否运行
Invoke-WebRequest http://localhost:3210

# SD API是否可达及是否正在执行任务
Invoke-RestMethod http://127.0.0.1:7860/sdapi/v1/progress

# 7860端口实际由哪个进程占用
Get-NetTCPConnection -LocalPort 7860

# IP-Adapter文件是否有效
Get-Item `
  "D:\stable-diffusion-webui-master\extensions\sd-webui-controlnet\models\ip-adapter-plus-face_sd15.safetensors", `
  "D:\stable-diffusion-webui-master\extensions\sd-webui-controlnet\models\ip-adapter-plus_sd15.safetensors" |
  Select-Object Name,Length
```

如有运行中的 Codex 任务，再查看：

```text
workspace/codex-jobs/worker.log
workspace/codex-jobs/job-<id>.jsonl
```

如有运行中的 SD 任务，再查看：

```text
workspace/sd-jobs/job-<id>.log
```

不要在不了解当前 worker 状态时直接重启服务或批量修改任务状态。

## 12. 单格制作页布局约束（2026-08-01）

- 单格页采用“分格导航 + 主内容列 + 画面检查器”结构；主内容列内部依次为主画布、候选胶片栏和提示词工作台。提示词必须紧跟候选栏，不能放在等待右侧长检查器结束的外层 Grid 下一行。
- 画面检查器不得使用会跨网格行覆盖后续内容的 `position: sticky`；检查器与提示词区域必须保持零重叠。
- 页面只保留一套可编辑的正向/负向提示词工作台，禁止在右侧检查器中再次嵌入重复提示词编辑器。
- 检查器不使用独立纵向滚动条；单格编辑默认只有页面级纵向滚动，避免内外双滚动。
- 正向和负向提示词默认等宽展示，生成草稿主入口放在提示词工作台标题区，折叠编辑器后仍可见。
- 候选区保持紧凑单行胶片栏，不应与主画布争夺过多垂直空间。
- 主画布在纵向 Flex 中必须禁用收缩；工作台大图默认使用 `object-fit: contain`，以完整展示人物和原始画面为最高优先级，宽幅画布允许出现留白，禁止为铺满画布而裁掉人物身体。候选栏不得压缩或遮挡主画布；主画布、候选栏和提示词之间保持明确且一致的间距。
- 主图 `<img>` 必须绝对定位到 `.current-image` 的明确边界（`position:absolute; inset:0; width:100%; height:100%`）。不要在纵向 Flex 子项中用普通流的百分比高度实现预览；浏览器可能按图片固有宽高比把 512 方图计算成画布宽度对应的方形，再被父容器 `overflow:hidden` 截掉下半部分。
- 响应式布局必须按扣除左侧导航后的真实内容宽度设计；在中等桌面宽度下，检查器和提示词依次落到主画布下方，禁止横向溢出。

## 13. Next.js 运行与构建隔离（2026-08-01）

- 3210 端口开发服务运行时，禁止直接执行会复用同一 `.next` 目录的 `next build`；生产构建会覆盖开发分块，导致 HTML 仍可访问但 `main-app.js`、`app-pages-internals.js`、`app/page.js` 等资源返回 404。
- 如必须验证生产构建，应先停止开发服务，或为构建配置独立的输出目录；构建完成后重新启动开发服务。
- 遇到首页 200 但 `/_next/static/chunks/*` 大量 404 时，清理项目内可重建的 `.next` 缓存并重启 3210 开发服务，然后逐项验证 HTML 引用的静态资源均返回 200。

## 14. SD 人物身份与人数门禁（2026-08-01）

- SD 人数不能只信任 `shot.characterIds`。编译前必须同时检查剧情标题、说明、对白和场景中的已知人物姓名及“两个/两人/她们/陌生女孩”等多人信号。
- 多人剧情缺少人物绑定属于不可强制绕过的阻断错误；即使前端提交 `force` 或手工提示词，也必须由 API 返回 `CHARACTER_BINDING_REQUIRED`，禁止静默编译成 `1girl, solo`。
- 旧章节迁移会根据章节分析中的人物名单、明确姓名和两人剧情信号补齐分格人物绑定；当前“陌生女孩递伞”和“两个人并肩走”相关分格已绑定小粉与陌生女孩。
- 提示词顺序采用：质量与人数 → 镜头 → 精简场景核心（地点/天气/时间）→ 每个人物身份与造型 → 环境细节与光线 → 构图和硬性质量约束。环境不能在人物身份之前占用过长文本。
- 发型、发色、瞳色、脸部身份和当前服装使用适度权重；负向词必须包含 identity drift、inconsistent face、wrong hair/eye color，并按逗号词项去重。
- 多人提示词必须为每个人物生成独立的位置、外观、服装、动作、表情、视线和手部块；人数规则使用精确的 `Ngirls, exactly N distinct adult women`，并继续提示 SD1.5 多人串脸风险。
- 多人使用多个 Face IP-Adapter 时禁止把所有参考作为无区域的全局条件。当前本机 ControlNet 支持 `effective_region_mask`；按照人物顺序为身份参考生成左右/分区遮罩，并允许少量区域重叠，使每张正脸只约束对应人物。
- 多人草稿 Face IP-Adapter 权重使用约 0.8，成品约 0.82；单人分别约 0.72/0.75。草稿仍是低分辨率构图检查，但不能接受明显错误发色或完全错误身份。
- 资产必须校验 `asset.characterId` 与对应人物一致。配角不得回退或继承小粉的服装、鞋履和服装 IP-Adapter；没有自己的确认资产时使用文字描述并显示资产待补充状态。
- 多人提示词不得残留 `one woman centered`、`single woman`、`solo`、`1girl` 等单人构图词；发现冲突时质量门禁报错，编译输出使用“人物分区且保持可读间距”的多人构图。
- 已创建任务的 recipe、Seed 和参考配置是不可变快照。修复工作流后，旧草稿不会自动套用新遮罩；应放弃旧草稿并重新创建任务。
- 2026-08-01 已安装并启用 `sd-webui-regional-prompter`，SD API 的 txt2img/img2img 脚本列表均包含 `regional prompter`。
- 多人物任务优先使用 Regional Prompter Matrix/Horizontal：公共场景作为 Base Prompt（base ratio 0.35），完整保留地点、前中后景、纵深、天气、时间、光线、镜头和精确人数，各人物专属提示词按画面从左到右用 `BREAK` 分区，默认等比 `1,1`；同时保留 Face IP-Adapter 的 `effective_region_mask` 身份区域遮罩。
- Regional 人物分区不得写 `1girl, solo` 或重复全局质量词；每区只写该人物自己的位置、外观、发色/发型、瞳色、服装、动作、表情、视线和手部，并明确与另一人物互动，避免把左右区分别生成人像海报。
- 多人 Regional Prompter 使用 Common Prompt 将完整公共场景条件加入每个人物区，避免低权重 Base Prompt 导致雨天、时间和地点被模型忽略；人物身份遮罩严格按等分边界、不再重叠，草稿/成品 Face IP-Adapter 权重为 0.9/0.92。
- “放松站立、手不入镜”“看向故事焦点”等旧自动占位动作视为待修复内容；递伞剧情会按人物顺序生成接伞/递伞、相互视线、可见手部和对应表情，禁止双方继续共享同一通用站姿。
- 跨分区互动不能只分别写进左右人物区。递伞等联合动作还必须作为不含发色、瞳色和服装的公共动作骨架写入 Common Prompt，明确交互物位置、双方手部关系、动作发生阶段及需要排除的错误姿态；人物区继续只负责各自身份和局部动作。
- 多人草稿最长边提升到 512、16 steps，给两张脸和手部交互保留足够像素；单人草稿仍使用最长边 384、12 steps。Regional 人物区对外观、发色/发型和瞳色分别使用约 1.2/1.35/1.25 权重。
- Regional Prompter 能稳定分区但不能单独保证 SD1.5 多人身份。多人初次构图后按左右人物上方约 62% 区域顺序执行低降噪身份校正，继续使用各自 Face IP-Adapter 和人物专属提示词；草稿/成品 denoise 约 0.28/0.22、8/10 steps、mask blur 12。该校正不覆盖下半身和大部分环境，目的是修复脸型、发色和发型，不重新设计动作构图。
- Regional Prompter 可用时采用质量优先的受限局部校正：先完成双人分区构图，再分别校正左右人物上半区身份/服装，最后对中央手部与交互物做紧凑遮罩校正；所有局部步骤使用低降噪，禁止重新覆盖整个人物或整幅环境。
- Regional Base Prompt 禁止包含具体发色、瞳色和服装；这些只能出现在对应人物的区域提示词中，防止全局文字条件造成双人同发色、串服装。
- 景别以界面中文 `camera` 选择为权威来源并同步 `camera_en`；中景严格编译为腰部以上构图，禁止双人模板再无条件追加 `knee-up`，避免旧英文景别或固定模板覆盖用户选择。
- 服装解析不再从人物名下任取第一条已确认服装/鞋履；仅采用本格明确选择、旧格明确绑定或命名明确的基础资产。人物区域提示词强化选定服装的类别、剪裁、层次和颜色，并带入人物档案服装负面词。
- 多人服装 IP-Adapter 草稿/成品权重提升为约 0.48/0.52（单人约 0.42/0.46），仍低于正脸身份参考，但不再弱到容易被通用审美提示覆盖。

## 16. 人脸清晰度与分阶段身份精修（2026-08-02）

- 含人物的 SD 构图草稿最长边统一为 512；不再让单人全身镜头先以 384 草稿消耗过少的人脸像素。
- 任务创建会估算当前尺寸和景别的人脸宽度。预计低于 48px 时返回 `FACE_RESOLUTION_TOO_LOW`，用户需要提高尺寸、拉近景别，或仅对纯环境镜头明确忽略风险；recipe 同时保存 64px 可读下限和 96px 表情建议值。
- 单人和多人都启用独立人脸精修。worker 按人物区域生成紧凑椭圆脸部蒙版，使用 `inpaint_full_res`、48px padding 和角色标准正脸 Face IP-Adapter，把遮罩裁切按高分辨率处理后融合回原图。
- 人脸精修不再加载服装 IP-Adapter，避免服装参考图中的人物、站姿和构图污染五官身份；中近景首轮也不加载全身服装参考。远景/全景只有带 `isolated-garment`、`去人脸服装参考` 或 `纯服装参考` 标签的资产才允许进入服装 IP-Adapter，其余拼贴/完整人物服装图只采用结构化文字并在 recipe 记录警告。
- 人脸精修草稿/成品 denoise 默认约 0.38/0.32、12/16 steps，提示词只负责身份、五官、发型、瞳色、表情、正面补光和无遮挡，不再重绘大面积上半身、服装、雨伞与背景。
- 雨伞互动公共提示词改为精简场景锚点，并加入双眼可见、柔和正面补光、伞沿位于头部后上方、眼部无深重阴影等遮挡规则；中景同时强制腰部裁切，禁止全身/OpenPose/环境词把镜头拉远。
- `XF-WORK-01` 的持久化英文描述已修正为白色短袖衬衫、灰粉 A 字中长裙、棕色腰带、裸粉低跟鞋和棕色单肩包，不再错误描述为粉色连衣裙。启动迁移会同步修正已有数据库记录。
- 视觉规格标准化时，DeepSeek/人工草案中明确给出的服装和鞋履 ID 优先于旧分格默认值，确保人工选择能进入白名单校验而不是被静默覆盖。

## 17. 逐格叙事状态与 Regional 英文兜底（2026-08-02）

- 新章节不再使用“同一 beat + 本格任务”的五句循环占位说明。每个剧情节点按建立状态、动作启动、即时反应、关键信息、结果承接生成不同的逐格说明，明确人物位置、可见变化、视线/表情/手部反应、道具或环境信息以及下一格方向。
- 旧数据中仍含“本格任务：”的系统模板说明会通过 `panel_narrative_states_v2` 一次性迁移；只更新可明确识别的旧模板，不覆盖用户已经手工编辑的剧情说明。
- 界面字段从“剧情说明（不提交模型）”更名为“剧情说明（用于视觉规划）”。它不会原样进入 SD，但会参与人物绑定、场景/天气识别、DeepSeek 细化和结构化提示词编译。
- Regional 公共区、人物区、负面词以及高级编辑覆盖值都会经过 `sanitizeEnglishPrompt`。混入中文的独立提示词片段由系统剔除，并使用已有英文动作、表情、视线和手部回退；用户不再需要寻找隐藏字段来修复 `REGIONAL_PROMPT_NOT_ENGLISH`。
- 修复人脸精修 worker 残留引用旧变量 `regionalIdentityPass` 导致任务 126–128 在基础采样后失败、草稿不落盘的问题。人脸精修现在使用统一阶段文案；任何局部精修失败都会记录在 `recipe.postprocessWarnings` 并保留基础生成图，不再让整张草稿消失。

## 18. 大模型剧情制作与全身完整性（2026-08-02）

- `/api/analyze` 在 DeepSeek 已启用时优先要求结构化生成素材判断、剧情大纲、逐场漫画脚本和 5–7 页逐格分镜。每格必须包含唯一可见变化、主体—动作—对象、表情、视线、手部、道具归属、景别和与前后格的状态承接；调用失败或未启用时返回带明确警告的本地规则结果。
- 创建章节会直接采用分析结果中的 `outline`、`script` 和 `panels`，不再把整篇原始素材塞进开场大纲并用固定句填满后续页面。分析卡明确显示 `DEEPSEEK STORY ANALYSIS` 或 `LOCAL RULE FALLBACK`。
- 单人远景/全景在用户仍选择默认 512 方图时自动改用 512×768 成品，提示词强制人物从头到脚完整入镜、脚下留白、双手与躯干分离。全身单人镜头自动加载 `single_full_body_v1` OpenPose 模板，给肩肘腕、髋膝踝和双脚提供结构约束；中近景不强求不可见的脚部。
- 连续性规划和单镜头视觉规格现在要求除稳定 ID 外的所有描述、警告和备注均为英文；服务端检测到中文会自动重试一次，避免中文进入 SD/Regional 提示词。
- DeepSeek 不再被要求用 `unknown` 占位。非剧情关键的视觉空白允许结合人物档案、相邻镜头、场景和类型合理发挥，但不得新增剧情事件或虚构资产 ID。服务端会继续为地点、时间、天气、光线、人物位置、动作对象、表情原因、视线、手部、遮挡、外观状态和镜头字段提供生产级英文回填；相邻已确认镜头优先于通用回填。
- `update-shot-spec` 人工保存入口同样执行语言门禁。已有规格或人工编辑内容只要包含中文或 `unknown`，保存时会调用 DeepSeek 保持剧情含义、ID、镜头和人工决定不变地转换为完整英文规格，随后再做结构和资产白名单验证；前端用返回的英文规格立即替换编辑草稿并提示转换成功。
- 人物视线属于逐人物表演状态，不再写入公共构图字段。DeepSeek 逐格 `gazeEn` 会持久化到 `character_looks_json`；手机、书页/文件、道具交接和移动动作分别推断屏幕、页面、交互点和运动方向，同时生成头部朝向、瞳孔方向与“禁止镜头对视”的成对约束。
- 删除通用修复中的 `looking slightly toward the viewer`。只有剧情明确要求看镜头时才允许 camera gaze；否则基础提示词、Regional 人物区和人脸局部精修都追加 `looking at viewer / eye contact with camera / front-facing portrait gaze` 负面词。旧系统默认视线通过 `action_target_gaze_v2` 一次性迁移，用户明确设置的镜头眼神不覆盖。

## 15. 多人互动镜头质量优先工作流（2026-08-01）

- `buildRegionalPrompt` 同时产出公共场景与互动、逐人物区域、分类负面词、资产绑定/警告、自动姿势模板和局部校正规格；单格工作台直接编辑这些实际提交块，不再只展示一段不会被 Regional 使用的全局正向词。
- 多人公共区使用“精确前景主角人数 + 稀疏模糊匿名远景行人”，避免 `exactly N women` 与街景行人冲突。雨景必须写明可见雨线、伞面水珠、飞溅、涟漪、屋檐排水和潮湿空气，并负向排除只有湿地面但没有落雨。
- 递伞公共动作固定描述动作阶段与物体归属：右侧人物仍是雨伞唯一持有者并递出伞柄，左侧人物伸手准备接取，双方手靠近同一伞柄但不牵手；负向排除并肩散步、挽手、共撑伞、已经完成交接和面对镜头摆拍。
- 本机已安装 `control_sd15_openpose.pth` 和 3D OpenPose Editor。系统生成可编辑的 `umbrella_handover_v1` 双人模板，用户可从工作台打开编辑器并上传导出的姿势 PNG；自动或上传结果都会固化进任务 recipe。
- 3D OpenPose 独立扩展以 WebUI 标签和 `/file=.../pages/index.html` 资源方式运行，不提供旧版 ControlNet 的 `/openpose_editor_index` 路由。工作台通过 `/api/openpose-editor` 检查 WebUI、解析本机扩展目录并附带 `downloads/config.json` 打开真实编辑器；缺少本机扩展文件时才回退到 WebUI 的 `3D Openpose` 标签。
- 独立 3D OpenPose 扩展不能把双人 OpenPose PNG 无损反解为两个可编辑 3D 骨架；它的图片检测是单人 MediaPipe。工作台因此内置双人 2D 骨骼编辑器，打开即加载本格结构化模板，允许直接拖动全部关节点，应用时转换为 512 PNG 并通过 `poseImageOverride` 固化到任务；外部 3D 编辑器仅作为可选高级入口。
- 本机 `control_net_unit_count=3`，首轮构图固定使用两张区域 Face IP-Adapter + OpenPose。服装 IP-Adapter 不与首轮争抢单元，而在逐人物身份校正时与该人物 Face IP-Adapter 成对加载；因此草稿和成品都会使用已选服装参考，且不会超过 ControlNet 上限。
- 资产解析顺序固定为：本格选定且确认的同人物资产 → 人物档案基础服装/鞋履文字 → 通用兜底。缺失不阻断生成，但必须在人物区和任务详情展示警告并把实际来源写入 `generationSpec.assetBindings`。
- 人物造型下拉框必须提供显式的“人物档案文字兜底”空选项，禁止在实际 ID 为空时由浏览器视觉上显示第一条资产造成假选中。有已确认的同人物基础服装/鞋履资产时，编译器会自动解析其 ID；旧基础资产描述若仍是 `character-specific ...` 通用占位词，图片继续用于 IP-Adapter，文字提示改用人物档案中的详细基础款描述。
- 递伞镜头在身份校正后增加中央椭圆遮罩手部/伞柄校正：草稿/成品约 10/12 steps、denoise 0.34/0.26，必要时在遮罩内复用 OpenPose；负向重点排除融合手、缺指、多指、断腕、双人同时握杆和伞柄断开。
- Regional Prompter API 参数必须按当前扩展的完整 20 项顺序提交；主分割值使用 `Columns/Rows`，polymask 必须传 `null`，禁止少传参数导致空字符串被扩展误读为遮罩图片。
- IP-Adapter 启动前同时校验 `annotator/downloads/clip_vision/clip_h.pth` 完整体积（当前官方文件 2,528,481,905 bytes）；缺失或不足 2GB 时返回 `CLIP_VISION_INVALID` 并阻止任务，不能让 ControlNet 报错后仍把无资产控制的图片当成功候选。
- 递伞中央局部校正现在同时使用 OpenPose 与 Canny：Canny 引导图提供连续伞面弧线和从伞面到交互手部的直伞柄，弥补人体骨骼无法表达道具连接关系的问题；仍保持低分辨率、局部遮罩，适合 CPU 模式。

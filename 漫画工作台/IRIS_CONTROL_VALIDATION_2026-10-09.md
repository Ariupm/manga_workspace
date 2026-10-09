# 通用眼部控制可行性验证（2026-10-09）

## 结论

用户要求先验证，并明确流程必须适用于不同场景、人物和目标，不能针对某一格硬编码。本轮实际执行了四次SD局部生成（两组同图同seed对照）。结论：当前DreamShaper 8 + SD1.5 MediaPipe Face控制模型 + 眼部局部重绘参数下，向下和向右视线均没有明确、可靠改善，暂不作为生产默认流程。不能把模型实际加载或接口成功解释为视觉目标达成，也不能由两组失败断言所有模型/参数都无效。

本轮新增的是可复用实验脚本，没有修改工作台的生产recipe、生成默认值、已有任务或候选。关联ISSUE-GAZE-011后续可行性研究；没有足够依据把模型执行不足新建为已确认程序缺陷。

## 实际模型与检测

- 使用已安装SD Python环境的MediaPipe 0.10.9。
- 官方模型：https://huggingface.co/CrucibleAI/ControlNetMediaPipeFace 。下载的是SD1.5 safetensors及对应yaml，不使用SD2.1。
- 固定仓库revision f6ed75cc495674bea8bf7409ef3d0e5bfb7d8c90。文件SHA256 5be501156709895f0b14a7ec76faae7cf0a105f76895252a2c69db541629628f，与官方X-Linked-ETag一致。
- 模型安装在本机SD扩展models，WebUI识别control_v2p_sd15_mediapipe_face [9c7784a9]。实际SD返回info确认启用了该控制模型。未替换基础checkpoint。
- 读书job561、手机job551、包裹job555的现存图均检出1张脸、478个关键点。双人全景job74整图检测0张；使用OpenPose粗脸框（仅作裁剪提示）再放大检测后，两人分别获得478点。但原始图眼部跨度小于本实验10px下限，均跳过重绘。放大检测不等于原图拥有足够细节。

## 通用设计与实际覆盖边界

实验几何函数仅接受检测关键点、所属人物区域、可选鼻点、眼睛状态、目标类别、已解析方向、图像尺寸。不读取分镜ID、人物姓名、书/手机等字符串，也不把down当默认方向。每个瞳孔位置按自身眼角/眼睑坐标计算，倾斜眼睛采用局部轴。

| 项目 | 验证方式与结果 |
|---|---|
| 八方向、不同人物位置与正方形/横竖画幅 | 程序用例通过；不是八方向均实测生图 |
| 双人区域与归属歧义 | 程序用例验证独立选择、跨区域/重叠/歧义跳过，不串改他人 |
| 闭眼、看镜头、未知目标 | 程序用例跳过该重定向实验，不强套向下；未做真实闭眼成图实验 |
| 头部倾斜 | 局部眼轴变换程序用例通过 |
| 小脸、眼部遮挡/退化、非法坐标 | 明确skipped；不伪造控制已应用 |
| 三个单人场景 × 八方向 | 24个实际检测坐标的几何规划prepared |
| 双人全景两个人 × 八方向 | 16个几何规划因eyes_too_small跳过 |
| 实际视觉效果 | 读书向下、手机向右，两组共四次真实SD请求，均未达到明确方向效果 |

通用计算能力不等于所有场景都支持有效修复。侧脸只见一眼、极小脸、强遮挡，以及动漫虹膜定位误差仍有限制。目标到三维注视的标定、上游目标绑定到新眼部控制的正式接线尚未实施；本次实验方向为显式测试输入，不能声称已验证整条生产链的虹膜控制。

## 严格对照设置

同组原图、裁剪、双眼mask、提示词、seed610011、DPM++ 2M/Karras、16 steps、CFG6.4、denoise .55相同。唯一请求差异为ControlNet单元：baseline无控制；control使用上述模型、weight1、guidance0..1、Balanced、预渲染none。正脸IP-Adapter及粗OpenPose都不加入这两组实验。

控制图复用本机扩展的官方MediaPipe绘制拓扑/颜色；只移动468/473瞳孔点，其余关键点不变。目标点位于眼部局部坐标约72%向下/70%向右，这是待标定实验值，不是普适三维注视解。结果仅通过双眼附近mask回贴。

读书组baseline耗时约97秒、control约140秒；手机组baseline约106秒、control约142秒。耗时只是本机这四次测量，不代表通用性能。

## 结果与证据

- 两组视觉上仍偏向前方/镜头，没有可靠的下看或右看效果。
- 检测回读仅作为辅助：读书组眼内垂直比率baseline约.392/.437，control约.392/.435，未向目标.72靠拢；手机组水平比率baseline约.473/.417，control约.482/.423，变化很小且远离目标.70。MediaPipe回读不是精确三维视线真值，也未作为产品门禁。
- 四幅结果眼部mask外改变像素均为0。改变像素分别685/688/677/676；不能仅由像素变化推定注视成功。
- 9项实验几何与既有local-gaze用例通过，脚本语法检查通过。

运行证据位于workspace/gaze-iris-validation：
- book-down/、phone-right/：init、control-map、mask、baseline/control结果、实际请求和SD audit。
- *-landmarks.json、multi74-openpose.json：实际检测数据。
- geometry-matrix.json、pixel-audit.json、landmark-comparison.json、program-tests.log：几何/像素/程序结果。

控制图与结果使用不同文件名；像素比较只读取已完成请求的输出，避免将临时控制图误当生成结果。

## 业务链冲突复核与后续

剧情/人工选择→视觉规格→提示词/交互契约→recipe/payload→Regional/ControlNet→基础及各局部pass→展示/草稿整体确认→正式候选：生产节点均未改动，实验不导入历史图片作为新作品候选、不自动批准草稿、不覆盖已选图片。人物/服装/道具/手/环境像素在实验mask外均保留。失败/不适用只记录实验结果，没有新增生产质量门或自动重试。

当前不具备把该模型全面启用的效果证据。后续如果继续，应先小规模验证更强眼部控制或专门的视线重定向方法，并再次做跨场景对照；不靠当前两组实验宣称通用于所有场景的视觉成功。

复用命令：使用SD环境先准备normalized MediaPipe landmarks JSON（source、width、height、faces、可选region/subjectPrompt/stylePrompt），再运行node scripts/validate-iris-control.mjs <landmarks.json> <new-output-directory> <direction>。脚本只在显式调用时向SD发请求；不由工作台或测试自动触发。SD_PYTHON、SD_WEBUI_ROOT和SD_WEBUI_URL可覆盖本机默认路径。

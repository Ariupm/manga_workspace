# 动作真实出图对照

本轮实际生成图片；以下为全部基线结果，不选优。DreamShaper 8，512×512，12步，CFG5.5，DPM++2M/Karras，无ControlNet或人物参考。另有8张手部归属修前/修后配对，全部已生成并查看，见下方。

## 写字

|种子710101：嘴部与笔错误接触|种子710102：重复笔杆，另一手扶头|
|---|---|
|![写字710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/write-710101.png)|![写字710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/write-710102.png)|

## 杯沿饮水

|种子710101：杯沿未贴嘴，类似吸管|种子710102：仍使用吸管，额外杯|
|---|---|
|![杯沿饮水710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/drink-710101.png)|![杯沿饮水710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/drink-710102.png)|

## 倒水

|种子710101：缺水壶和倒水关系|种子710102：水流未进入接收杯|
|---|---|
|![倒水710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/pour-710101.png)|![倒水710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/pour-710102.png)|

## 剪纸

|种子710101：工具像笔|种子710102：刀刃与纸边关系不清|
|---|---|
|![剪纸710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/cut-paper-710101.png)|![剪纸710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/cut-paper-710102.png)|

## 剪胶带

|种子710101：工具在脸旁|种子710102：开箱姿态，缺剪刀|
|---|---|
|![剪胶带710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/cut-tape-710101.png)|![剪胶带710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/cut-tape-710102.png)|

## 向上取杯

|种子710101：多余手臂|种子710102：抬臂成功，目光与阶段不符|
|---|---|
|![向上取杯710101](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/reach-cup-710101.png)|![向上取杯710102](D:/codex/设计/漫画工作台/workspace/sd15-action-matrix-2026-10-11/reach-cup-710102.png)|

## 提示词手部归属修复：写字

仅将双手接触笔改为右手接触笔，其余请求完全一致。两组都没有可确认的动作改善。

|710101 修复前|710101 修复后|
|---|---|
|![修前](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/write-before-710101.png)|![修后](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/write-after-710101.png)|

|710102 修复前|710102 修复后|
|---|---|
|![修前](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/write-before-710102.png)|![修后](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/write-after-710102.png)|

## 提示词手部归属修复：剪纸

两个种子的修前/修后动作基本一致，均未形成剪刀夹住纸边的关系。

|710101 修复前|710101 修复后|
|---|---|
|![修前](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/cut-paper-before-710101.png)|![修后](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/cut-paper-after-710101.png)|

|710102 修复前|710102 修复后|
|---|---|
|![修前](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/cut-paper-before-710102.png)|![修后](D:/codex/设计/漫画工作台/workspace/sd15-prompt-architecture-2026-10-11/cut-paper-after-710102.png)|


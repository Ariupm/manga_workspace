# 本地中译英

DeepSeek 的视觉分析指令要求所有描述用英文。第一次返回仍含中文时，程序提取中文文本字段，使用 Python Argos Translate 中译英；已有英文、ID、数量、坐标和 JSON 结构不交给翻译器修改。纯英文不启动 Python。翻译失败保留候选并报错，不再次请求 DeepSeek 翻译。

Windows 安装（项目目录）：

```powershell
python -m venv workspace/translation-venv
workspace/translation-venv/Scripts/python.exe -m pip install -r scripts/translation-requirements.txt
workspace/translation-venv/Scripts/python.exe scripts/install-translation-model.py
```

虚拟环境在被 Git 忽略的 workspace 中；模型存放在 Argos 用户数据目录。安装需要联网，已安装模型的翻译在 CPU 本地执行。其他 Python 环境可通过 STUDIO_TRANSLATION_PYTHON 指定。Linux 默认使用 workspace/translation-venv/bin/python。

适用于单格细化、章节规划、失败候选再编译和中文规格编辑。翻译后仍检查英文与业务结构；翻译器不负责修复对象数量、动作枚举或引用错误。完整句子的翻译质量属于运行风险，不能声称任意语句都必然准确。

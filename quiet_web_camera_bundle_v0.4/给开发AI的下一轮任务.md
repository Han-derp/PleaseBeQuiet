# 第一轮真机联调任务（给编程 AI）

我已有用户试玩通过的 `quiet_web_starter` 网页版本。此次增加了 B 的原始 `mini-camp-main` 文件夹以及唯一协议适配层 `vision_adapter.js`；**不要重写识别算法，也不要推翻场景状态机。** 先检查本包文件，再分步验证实际 Windows 摄像头。

1. 查看 `mini-camp-main/INTERFACE.md` 和 `camera_worker.py`，以实际文件为准。正式入口是 `camera_worker.py`，不是 `gesture_demo.py` 或 `main.py`。识别进程独占摄像头；浏览器不能调用 getUserMedia。
2. 检查 B 已经可以运行的虚拟环境，以及 `models/gesture_recognizer.task` 的真实路径；不必为了重建网页重复安装已经可用的环境。先在 PowerShell 单独运行 worker 观察真实 JSONL，成功后退出它。
3. 使用本包的 `start_windows.ps1` 或显式 `--vision-cwd/--vision` 指令，让游戏在用户点击“同意并启动摄像头”以后才启动 worker；在页面上实测 `GESTURE PALM/GOOD`、`PALM x/y`、`WAVE`、`SILENCE_STATE` 和 `TWO_HAND_POSE CUPPED_HANDS`。
4. 同时保留明确标识的模拟/辅助操作作为回退，不得把键盘触发的视频当成真实视觉识别结果。
5. 先修复真机的事件错误或启动错误，不做任何新场景、美术绘图、大规模重构。当前 `vision_adapter.js` 是协议映射唯一入口；如果真实输出与文档不同，先打印实际 JSONL 证据，再最小修改此文件或浏览器处理。
6. 验证断流、NO_HAND、暂停、场景切换、终局重新累计 STILL，以及捧鱼仅作为 P1 可选功能。
7. 交付测试结果：启动命令，真实输出节选（仅动作事件、不附摄像头图像），实际出现的问题和修复文件列表。未能实测的内容请标为“未验证”。

本包的自动化测试使用 `tests/replay_worker_v1.py`，它只模拟协议格式，不足以证明真机识别成功。

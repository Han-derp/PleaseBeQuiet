# 《请勿喧哗》网页原型 v0.2 · 已按 B 的实际 JSONL 协议接入

这是在用户已试玩通过的 v0.1 上做的**增量集成版**，不是重新做整个游戏。原始 `mini-camp-main` 代码原样放在同级目录；浏览器只负责游戏，不额外抢占摄像头。**此次没有可访问的实物摄像头，无法声称已完成 Windows 真机联调**；已用与 B 正式接口一致的 v1 JSONL 回放测试过消息链路。可随时使用纯模拟输入回退。

## 一、需要的软件

- Windows 10/11；Chrome 或 Edge；VS Code 可选。
- **优先使用 B 原来已经运行成功的 Python 3.12 / `.venv`**，不要为了网页随便升级 Mediapipe。
- `mini-camp-main` 所需 Python 库：`mediapipe`、`opencv-python`、`numpy`，详见它自己的 `requirements.txt`。
- 模型 `models/gesture_recognizer.task` **未包含在 ZIP 中**，必须从 B 已运行的工程复制或按其原先获取方式准备。只跑本地服务和模拟游戏则无须它。
- 不需要 Qt、npm、Flask、React，也不需要第二个摄像头程序。

## 二、先运行模拟游戏，验证增量版没破坏原有流程

打开 PowerShell，在本压缩包解压的根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start_sim_windows.ps1
```

在本机浏览器打开 `http://127.0.0.1:8765`，点“进入体验”→“继续：无视觉模块（模拟）”。`P` 张掌，`G` 竖大拇指，`W` 挥手，`S` 切换模拟静止，`C` 模拟双手轻捧；`N` 模拟手离开。下方开发工具和场景跳转始终标记为辅助/模拟，不可用作实际摄像头演示证明。

## 三、启动 B 的真实 worker（建议用 B 原来稳定的虚拟环境）

假如 B 原来**已经有可以直接运行** `camera_worker.py` 的独立工程，可先不要重装：

```powershell
python .\quiet_web_starter\server.py --vision-cwd "D:\项目\mini-camp-main" --vision "D:\项目\mini-camp-main\.venv\Scripts\python.exe" camera_worker.py
```

**把两处 `D:\项目\mini-camp-main` 替换成你电脑上的真实绝对路径。** 此路径必须包含 `camera_worker.py`，并且在 `models\gesture_recognizer.task` 中具有 B 的模型文件。

如果本包内的 `mini-camp-main` 就是你要用的副本，且需要重新建立环境：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1
```

把 B 原工程的 `models\gesture_recognizer.task` 复制进本包 `mini-camp-main\models\`，然后：

```powershell
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
```

浏览器进入 `http://127.0.0.1:8765`，点击“进入体验”→**“同意并启动摄像头”**。只有用户点击后才启动 Python worker。不要同时开 `gesture_demo.py`、`camera_worker.py --preview` 或 Qt 旧程序，以免抢占摄像头。正常退出使用游戏右上角“退出”，或终端 `Ctrl+C`。

如果页面只能显示模拟选项，请检查是否使用带 `--vision` 的启动命令，检查浏览器控制台和服务端 stderr。

## 四、这次真正接通的协议（`mini-camp-main/INTERFACE.md`）

| B 的 JSONL | 游戏处理 | 重要限制 |
|---|---|---|
| `CAMERA_STATE.available` | 摄像头健康状态 | false 时清空有效手势/静止 |
| `GESTURE.gesture:PALM / GOOD / NONE` | 病房回应和可选鼓励、结尾回应 | **仅变化时发送**，已补场景防误触窗口和必要的二次张掌提示 |
| `PALM.x/y` | 水纹中心／捧鱼位置 | 这是连续**坐标**，不是每0.1秒自动成功的张掌手势 |
| `WAVE` | 水流增强／鱼群逃离 | 一次性事件，实时运动另看 SILENCE_STATE |
| `SILENCE_STATE` | 运动和连续静止 | NO_HAND 不算静止；失联不计时 |
| `SILENCE_REACHED` | 事件已接收 | **不直接推进深海/终局**；终局进入等待阶段后重新计时 |
| `TWO_HAND_POSE.pose:CUPPED_HANDS / NONE` | **可选轻捧小鱼** | B 的正式代码已包含；进入姿势触发一次、退出一次；目前仅基本网页特效和提示 |

注意：虽然仓库里有独立 `main.py` 人脸演示，**正式 `camera_worker.py` 并不输出面捕事件**。镜子章节保留预制动画/可跳过，不应宣传为已经接入实时面捕。

## 五、测试顺序和回退方案

1. 先执行上方的模拟启动，确保 v0.1 的全流程仍能通关。
2. 在 B 目录单独运行原 worker，确认能够看到 `CAMERA_STATE available:true`、`GESTURE PALM`、`WAVE`、`SILENCE_STATE` 与 `TWO_HAND_POSE`；然后停止它。
3. 使用上方真实接入启动命令，只让网页触发摄像头启动。病房 `PALM` 和 `GOOD`，深海挥手→鱼散→有效静止→鱼聚→再次挥手，先逐项检查。
4. 聚鱼成功后保持一会儿，再轻轻捧起双手，检查 P1 提示和小鱼是否靠近；此功能**不是通关条件**。测试者不需要看到新姿势就立即碰鱼，先等待小鱼有靠近的意愿。
5. 进入终局，在妹妹放下双手后重新静止约2秒，不得靠进入之前的一次 `SILENCE_REACHED` 自动推进。
6. 摄像头丢失、手出画面、暂停再继续、转到新场景，都不能意外推进剧情。

自动化（不需要摄像头）：如果电脑装有 Node.js 和 Python，可运行：

```powershell
node .\quiet_web_starter\tests\test_vision_adapter.js
python .\quiet_web_starter\tests\test_server.py
```

注意 Node 仅为测试所需，游戏运行本身完全不需要安装 Node。

**已知未完成：** 正式鱼群透明 PNG 尚须按 D 的分层交付替换 Emoji；窗户入海转场还只有普通淡入；护士回应和妹妹伸手仍以局部符号/字幕占位；正式配乐可逐步加入。不要让这些美术空缺阻挡本次真机摄像头联调。

Windows installation fix v0.2.1

This package fixes TWO different problems in v0.2:
1. Windows PowerShell 5.1 parses UTF-8 scripts without BOM incorrectly when they contain Chinese text. The launch scripts are now ASCII-only.
2. Your `py` launcher still points at deleted D:\software\python.exe. The fixed setup avoids the py launcher completely and uses the actual Python 3.12 executable instead.

You DO NOT need to remove Python 3.14.

QUICK START (open PowerShell inside the unpacked quiet_web_camera_bundle_v0.2 folder):
  winget install -e --id Python.Python.3.12
Close and reopen PowerShell after installing Python.

Check that the Python 3.12 executable exists:
  & "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" --version
If you installed Python in a custom folder, set:
  $env:PYTHON312_PATH = "C:\YOUR_ACTUAL_PATH\python.exe"
  & $env:PYTHON312_PATH --version

Prepare B worker dependencies:
  powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1

The original ZIP does not contain gesture_recognizer.task. Copy the model from B's working environment to:
  mini-camp-main\models\gesture_recognizer.task

Run the game with the camera:
  powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
Open http://127.0.0.1:8765 and explicitly consent to start the camera.

Run without camera:
  powershell -ExecutionPolicy Bypass -File .\start_sim_windows.ps1

If B already has a working virtualenv, you can skip setup and run:
  & "PATH_TO_B_WORKING_VENV\Scripts\python.exe" .\quiet_web_starter\server.py --vision-cwd "PATH_TO_B_PROJECT" --vision "PATH_TO_B_WORKING_VENV\Scripts\python.exe" camera_worker.py

If `py` is still broken, do not waste time repairing it now. The fixed scripts never invoke it.

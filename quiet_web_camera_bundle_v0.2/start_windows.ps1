# Use the dedicated B worker environment, never the system-wide Python 3.14.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vision = Join-Path $root 'mini-camp-main'
$web = Join-Path $root 'quiet_web_starter'
$python = Join-Path $vision '.venv\Scripts\python.exe'
$model = Join-Path $vision 'models\gesture_recognizer.task'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Missing Python virtual environment. Run .\setup_windows.ps1 first.'
}
if (-not (Test-Path -LiteralPath $model)) {
    throw 'Missing mini-camp-main\models\gesture_recognizer.task. Copy it from the working B project.'
}
Write-Host 'Open http://127.0.0.1:8765 in Chrome or Edge, then click the camera consent button.'
& $python (Join-Path $web 'server.py') --vision-cwd $vision --vision $python camera_worker.py

# Use the dedicated B worker environment, never the system-wide Python 3.14.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vision = Join-Path $root 'mini-camp-main'
$web = Join-Path $root 'quiet_web_starter'
$model = Join-Path $vision 'models\gesture_recognizer.task'

# Locate a usable Python 3.12 virtualenv, in order:
# 1) inside this package, 2) the original dev project next to this package,
# 3) a known absolute location of the dev project.
$venvCandidates = @(
    (Join-Path $vision '.venv\Scripts\python.exe'),
    (Join-Path $root '..\quiet_web_camera_bundle_v0.4\mini-camp-main\.venv\Scripts\python.exe'),
    'C:\Users\19362\Desktop\quiet_web_camera_bundle_v0.4\mini-camp-main\.venv\Scripts\python.exe'
)
$python = $null
foreach ($candidate in $venvCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { $python = $candidate; break }
}

if (-not $python) {
    Write-Host 'Python virtual environment not found. Trying automatic setup (needs Python 3.12 and internet, takes a few minutes)...'
    $setup = Join-Path $root 'setup_windows.ps1'
    if (Test-Path -LiteralPath $setup) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $setup
        if ($LASTEXITCODE -ne 0) { throw 'Automatic setup failed. Run .\setup_windows.ps1 manually and check the error message.' }
        $python = Join-Path $vision '.venv\Scripts\python.exe'
    } else {
        throw 'Missing Python virtual environment and no setup script found. Run setup on a working copy first.'
    }
}
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Missing Python virtual environment. Run .\setup_windows.ps1 first.'
}

# MediaPipe loads the model through a C++ file API that cannot open paths
# containing non-ASCII characters (e.g. a Chinese folder name). Mirror the
# B worker sources into an ASCII-safe location when the package path has any.
if ($vision -match '[^\x00-\x7F]') {
    $visionMirror = Join-Path $env:LOCALAPPDATA 'qwxc_vision'
    Write-Host 'Package path contains non-ASCII characters. Mirroring vision sources to an ASCII-safe location...'
    robocopy $vision $visionMirror /MIR /XD .venv __pycache__ /XF *.pyc /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'Failed to mirror vision sources to an ASCII-safe location.' }
    $vision = $visionMirror
    Write-Host "Vision sources mirrored to: $visionMirror"
}

if (-not (Test-Path -LiteralPath $model)) {
    throw 'Missing mini-camp-main\models\gesture_recognizer.task. Copy it from the working B project.'
}
Write-Host "Vision python: $python"
Write-Host 'Open http://127.0.0.1:8765 in Chrome or Edge, then click the camera consent button.'
& $python (Join-Path $web 'server.py') --vision-cwd $vision --vision $python camera_worker.py

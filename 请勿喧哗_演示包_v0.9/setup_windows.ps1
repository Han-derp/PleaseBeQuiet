# Windows PowerShell 5.1-safe setup. Python 3.12 may coexist with Python 3.14.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vision = Join-Path $root 'mini-camp-main'
$venvDir = Join-Path $vision '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'

# Do not use the 'py' launcher: a stale launcher may reference a deleted Python.
$candidates = @()
if ($env:PYTHON312_PATH) { $candidates += $env:PYTHON312_PATH }
if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
}
$candidates += 'C:\Program Files\Python312\python.exe'
$basePython = $null
foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
        $versionText = (& $candidate --version 2>&1 | Out-String).Trim()
        if ($versionText -match '^Python 3\.12\.') {
            $basePython = $candidate
            break
        }
    }
}
if (-not $basePython) {
    throw 'Python 3.12 not found. Install Python 3.12 alongside 3.14. If in a custom location, set $env:PYTHON312_PATH to the full python.exe path, then rerun.'
}
Write-Host "Using: $basePython"

if (Test-Path -LiteralPath $venvPython) {
    $venvVersion = (& $venvPython --version 2>&1 | Out-String).Trim()
    if ($venvVersion -notmatch '^Python 3\.12\.') {
        throw 'Existing mini-camp-main\.venv has the wrong Python version. Back it up or rename it to .venv_old and rerun setup.'
    }
} else {
    & $basePython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.12 virtual environment.' }
}
Write-Host 'Installing B worker dependencies...'
& $venvPython -m pip install -r (Join-Path $vision 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed. Copy the full error message.' }
$model = Join-Path $vision 'models\gesture_recognizer.task'
if (-not (Test-Path -LiteralPath $model)) {
    New-Item -ItemType Directory -Force (Join-Path $vision 'models') | Out-Null
    Write-Warning 'Model file missing: copy gesture_recognizer.task from the working B project into mini-camp-main\models\.'
} else {
    Write-Host 'Gesture recognition model found.'
}
Write-Host 'Setup done. Run .\start_windows.ps1 next.'

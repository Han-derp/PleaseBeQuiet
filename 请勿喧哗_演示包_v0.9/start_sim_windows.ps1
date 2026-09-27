# Simulated web demo uses only Python standard library.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerPython = Join-Path $root 'mini-camp-main\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $workerPython) {
    & $workerPython (Join-Path $root 'quiet_web_starter\server.py')
} else {
    # Python 3.14 is fine for the standard-library-only simulated demo.
    & python (Join-Path $root 'quiet_web_starter\server.py')
}

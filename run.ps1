# Chronicles of Eldoria - Unified Startup Script
# This script sets up the Python virtual environment, installs dependencies, and starts both the FastAPI backend and Vite frontend.

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   Starting Chronicles of Eldoria Launcher   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Ensure Python is installed
Write-Host "[1/4] Checking Python installation..." -ForegroundColor Yellow
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command "py" -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} else {
    Write-Error "Python is not installed or not in your PATH. Please install Python 3.10+ to run the backend server."
    Exit
}
$pyVersion = & $pythonCmd --version
Write-Host "Found: $pyVersion" -ForegroundColor Green

# 2. Set up Virtual Environment
$venvPath = Join-Path $PSScriptRoot "backend\venv"
Write-Host "[2/4] Verifying Python Virtual Environment at $venvPath..." -ForegroundColor Yellow

if (-not (Test-Path $venvPath)) {
    Write-Host "Virtual environment not found. Creating a new one..." -ForegroundColor Cyan
    & $pythonCmd -m venv $venvPath
    Write-Host "Virtual environment created." -ForegroundColor Green
}

$pipPath = Join-Path $venvPath "Scripts\pip.exe"
$pythonExec = Join-Path $venvPath "Scripts\python.exe"

# Install requirements
Write-Host "Installing/Verifying Python dependencies..." -ForegroundColor Cyan
& $pipPath install -r (Join-Path $PSScriptRoot "backend\requirements.txt")
Write-Host "Python dependencies verified successfully!" -ForegroundColor Green

# 3. Verify Node.js/NPM dependencies
Write-Host "[3/4] Verifying Frontend (Node.js) dependencies..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Host "node_modules folder not found. Running npm install..." -ForegroundColor Cyan
    npm install
    Write-Host "Frontend dependencies installed." -ForegroundColor Green
} else {
    Write-Host "Frontend dependencies found." -ForegroundColor Green
}

# 4. Start Servers
Write-Host "[4/4] Launching servers..." -ForegroundColor Yellow

# Launch backend in a separate terminal window so you can monitor logs easily
Write-Host "Launching FastAPI backend on http://127.0.0.1:8000 in a new window..." -ForegroundColor Cyan
$backendCommand = "cd '$PSScriptRoot\backend'; & '.\venv\Scripts\python.exe' -m app.main"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCommand

# Launch frontend in the current terminal window
Write-Host "Launching Vite frontend on http://localhost:3000..." -ForegroundColor Cyan
npm run dev

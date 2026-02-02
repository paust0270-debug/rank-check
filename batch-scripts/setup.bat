@echo off
echo ================================
echo  Naver Rank Checker - Setup
echo ================================
echo.

echo [1/7] Checking administrator privileges...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Administrator privileges required.
    echo Please right-click this file and select "Run as administrator"
    pause
    exit /b 1
)
echo OK: Administrator confirmed
echo.

echo [2/7] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install from https://nodejs.org
    start https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo OK: Node.js %NODE_VERSION%
echo.

echo [3/7] Installing pnpm...
call npm install -g pnpm
if %errorlevel% neq 0 (
    echo ERROR: pnpm installation failed
    pause
    exit /b 1
)
echo OK: pnpm installed
echo.

echo [4/7] Navigating to project directory...
cd /d "%~dp0"
cd ..
echo OK: %CD%
echo.

echo [5/7] Checking .env file...

if exist .env (
    echo OK: .env file already exists
    echo     (Delete .env to recreate from template)
    goto skip_env
)

echo Creating .env file...
powershell -ExecutionPolicy Bypass -File "batch-scripts\create-env.ps1"
if not exist .env (
    echo ERROR: Failed to create .env
    pause
    exit /b 1
)

echo OK: .env created

:skip_env
echo.

echo [6/7] Checking dependencies...

if exist "node_modules\" (
    echo OK: node_modules exists, skipping installation
    echo     (Delete node_modules folder to reinstall)
    goto skip_install
)

echo Installing dependencies...
echo This may take several minutes
echo.

call pnpm install
if %errorlevel% neq 0 (
    echo ERROR: Dependency installation failed
    pause
    exit /b 1
)
echo OK: Dependencies installed

:skip_install
echo.

echo [6.1/7] Chromium download (optional)...
echo You can skip this - it will download on first run
echo Press Ctrl+C to skip, or wait...
echo.

call npx puppeteer browsers install chrome
if %errorlevel% neq 0 (
    echo WARNING: Chromium download failed or skipped
    echo Will download automatically on first run
    echo.
)

echo [7/7] Initial test...
echo.

call npx tsx rank-check/batch/check-batch-keywords.ts --limit=1
if %errorlevel% neq 0 (
    echo WARNING: Test failed
    echo Check errors above
    pause
    exit /b 1
)

echo.
echo ================================
echo SUCCESS: Setup completed!
echo ================================
echo.
echo Next steps:
echo 1. Run run-rank-check.bat
echo 2. Check README.txt for scheduling
echo.
pause

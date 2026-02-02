@echo off
echo ================================
echo Testing Setup Steps
echo ================================
echo.

echo [1] Checking Node.js...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found
    exit /b 1
)
echo OK
echo.

echo [2] Checking pnpm...
pnpm --version
if %errorlevel% neq 0 (
    echo pnpm not installed, will need to install
) else (
    echo OK: pnpm already installed
)
echo.

echo [3] Checking directory...
cd /d "%~dp0.."
echo Current directory: %CD%
echo.

echo [4] Checking .env file...
if exist .env (
    echo OK: .env file exists
) else (
    echo WARNING: .env file not found
)
echo.

echo ================================
echo All basic checks passed!
echo ================================
pause

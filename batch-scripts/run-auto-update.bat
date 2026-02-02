@echo off
chcp 65001 >nul
setlocal

echo ================================
echo  Naver Rank Checker - Auto Update Launcher
echo ================================

cd /d "%~dp0\.."

if not exist ".env" (
    echo ERROR: .env file not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

echo Starting launcher...
echo (Press Ctrl+C to stop)
echo.

call npx tsx rank-check/launcher/auto-update-launcher.ts

pause

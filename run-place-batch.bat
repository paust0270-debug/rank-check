@echo off
chcp 65001 >nul
title Place Rank Batch

cd /d "%~dp0"

echo ==================================================
echo   Place Rank Batch (keywords_place)
echo ==================================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [WARN] .env file not found.
    echo Run batch-scripts\create-env.ps1 or setup.bat first.
    pause
    exit /b 1
)

echo Running: npm run place-batch %*
echo.

call npm run place-batch %*

echo.
pause
exit /b %errorlevel%

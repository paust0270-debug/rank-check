@echo off
chcp 65001 >nul 2>&1
title Naver Shopping Rank Checker

echo ==================================================
echo   Naver Shopping Rank Checker
echo ==================================================
echo.

cd /d "%~dp0"

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please install Node.js first.
    pause
    exit /b 1
)

REM Check .env file
if not exist ".env" (
    echo WARNING: .env file not found.
    echo Please run batch-scripts\setup.bat to configure.
    echo.
    pause
    exit /b 1
)

REM Check node_modules
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Package installation failed
        pause
        exit /b 1
    )
    echo.
)

echo Starting program...
echo.
echo Features:
echo    - Get tasks from traffic-navershopping-app table
echo    - Process by slot_id + keyword + link_url + slot_sequence
echo    - Delete completed tasks
echo.
echo Press Ctrl+C to stop
echo.
echo ==================================================
echo.

call npx tsx rank-check/batch/check-batch-worker-pool.ts

echo.
echo ==================================================
echo   Program finished
echo ==================================================
pause

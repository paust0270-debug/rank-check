@echo off
chcp 65001 >nul 2>&1
title 네이버 플레이스 순위 체크기

echo ==================================================
echo   네이버 플레이스 순위 체크기
echo ==================================================
echo.

cd /d "%~dp0"

REM Node.js 확인
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

REM node_modules 확인
if not exist "node_modules" (
    echo 의존성 설치 중...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: 패키지 설치 실패
        pause
        exit /b 1
    )
    echo.
)

echo 플레이스 순위 체크 실행...
echo.

call run-place-check.bat

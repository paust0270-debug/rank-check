@echo off
chcp 65001 >nul
title 네이버 쇼핑 순위 체크기 - 초기 설정

echo ==================================================
echo   네이버 쇼핑 순위 체크기 초기 설정
echo ==================================================
echo.

cd /d "%~dp0"

REM Node.js 확인
echo 🔍 Node.js 확인 중...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js가 설치되어 있지 않습니다.
    echo.
    echo    Node.js를 설치해주세요:
    echo    https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js 버전: %NODE_VERSION%
echo.

REM npm 확인
echo 🔍 npm 확인 중...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm이 설치되어 있지 않습니다.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm 버전: %NPM_VERSION%
echo.

REM .env 파일 확인
if exist ".env" (
    echo ⚠️  .env 파일이 이미 존재합니다.
    echo    기존 파일을 덮어쓰시겠습니까? (Y/N)
    set /p OVERWRITE=
    if /i not "%OVERWRITE%"=="Y" (
        echo 설정을 건너뜁니다.
        goto :install
    )
)

REM .env 파일 생성
echo 📝 .env 파일 생성 중...
if not exist "batch-scripts\create-env.ps1" (
    echo ❌ batch-scripts\create-env.ps1 파일을 찾을 수 없습니다.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File batch-scripts\create-env.ps1
if %errorlevel% neq 0 (
    echo ❌ .env 파일 생성 실패
    pause
    exit /b 1
)

echo ✅ .env 파일 생성 완료
echo.

:install
REM 의존성 설치
echo 📦 의존성 패키지 설치 중...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 패키지 설치 실패
    pause
    exit /b 1
)

echo.
echo ==================================================
echo   ✅ 설정 완료!
echo ==================================================
echo.
echo 다음 단계:
echo   1. .env 파일을 열어서 Supabase 설정을 확인하세요
echo   2. start.bat을 실행하여 프로그램을 시작하세요
echo.
pause



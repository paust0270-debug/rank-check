@echo off
chcp 65001 >nul
title 네이버 쇼핑 순위 체크기 - 연결 테스트

echo ==================================================
echo   Supabase 연결 테스트
echo ==================================================
echo.

cd /d "%~dp0"

REM Node.js 확인
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

REM .env 파일 확인
if not exist ".env" (
    echo ⚠️  .env 파일이 없습니다.
    echo    setup.bat을 실행하여 설정하세요.
    pause
    exit /b 1
)

echo 🔍 연결 테스트 실행 중...
echo.

REM 테스트 스크립트가 있는지 확인
if exist "src\test-connection.ts" (
    call npx tsx src/test-connection.ts
) else if exist "rank-check\test\check-table-status.ts" (
    call npx tsx rank-check/test/check-table-status.ts
) else (
    echo ⚠️  테스트 스크립트를 찾을 수 없습니다.
    echo    직접 Supabase 연결을 확인해주세요.
)

echo.
pause

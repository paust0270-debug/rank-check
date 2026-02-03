@echo off
chcp 65001 >nul
title 네이버 플레이스 순위 체크기

echo ==================================================
echo   네이버 플레이스 순위 체크 실행
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

REM .env 파일 확인 (선택)
if not exist ".env" (
    echo ⚠️  .env 파일이 없습니다. (선택사항)
    echo    batch-scripts\setup.bat을 실행하여 설정하세요.
    echo.
)

REM 로그 디렉토리 생성
if not exist "batch-scripts\logs" mkdir batch-scripts\logs

REM 타임스탬프 생성
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do (
    set YEAR=%%a
    set MONTH=%%b
    set DAY=%%c
)
for /f "tokens=1-2 delims=:. " %%a in ('time /t') do (
    set HOUR=%%a
    set MINUTE=%%b
)

set HOUR=%HOUR: =0%
set MINUTE=%MINUTE: =0%
set TIMESTAMP=%YEAR%%MONTH%%DAY%-%HOUR%%MINUTE%
set LOG_FILE=place-check-%TIMESTAMP%.log

echo 시작 시간: %date% %time%
echo 로그 파일: batch-scripts\logs\%LOG_FILE%
echo ==================================================
echo.

call npx tsx place-check/check-place-rank.ts %* 2>&1 | powershell -Command "$input | Tee-Object -FilePath 'batch-scripts\logs\%LOG_FILE%'"

set EXIT_CODE=%errorlevel%

echo.
echo ==================================================
if %EXIT_CODE% equ 0 (
    echo ✅ 성공
) else (
    echo ❌ 오류: 종료 코드 %EXIT_CODE%
)
echo ==================================================
echo 종료 시간: %date% %time%
echo 로그 파일: batch-scripts\logs\%LOG_FILE%
echo ==================================================
echo.

pause
exit /b %EXIT_CODE%

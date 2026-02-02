@echo off
setlocal enabledelayedexpansion

echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

echo Changing to script directory...
cd /d "%~dp0"
cd ..

echo Current directory: %CD%
echo.

if not exist ".env" (
    echo ERROR: .env file not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "batch-scripts\logs" mkdir batch-scripts\logs

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
set LOG_FILE=rank-check-%TIMESTAMP%.log

echo ================================
echo  Naver Rank Checker
echo ================================
echo Start: %date% %time%
echo Log: batch-scripts\logs\%LOG_FILE%
echo ================================
echo.

call npx tsx rank-check/batch/check-batch-keywords.ts %* 2>&1

set EXIT_CODE=%errorlevel%

echo.
echo ================================
if %EXIT_CODE% equ 0 (
    echo SUCCESS
) else (
    echo ERROR: Exit code %EXIT_CODE%
)
echo ================================
echo End: %date% %time%
echo Log: batch-scripts\logs\%LOG_FILE%
echo ================================
echo.

if "%1"=="" pause

exit /b %EXIT_CODE%

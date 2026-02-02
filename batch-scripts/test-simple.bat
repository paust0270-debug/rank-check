@echo off
echo Test Start
echo.

echo Checking Node.js...
node --version
if %errorlevel% neq 0 (
    echo Node.js not found!
    pause
    exit /b 1
)
echo Node.js found!

echo.
echo Checking directory...
cd /d "%~dp0.."
echo Current dir: %CD%

echo.
echo Test completed!
pause

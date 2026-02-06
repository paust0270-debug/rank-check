@echo off
chcp 65001 >nul
title Migration - add place review columns

cd /d "%~dp0"

if not exist ".env" (
    echo [WARN] .env file not found.
    echo Run batch-scripts\create-env.ps1 first.
    echo.
    echo Or run SQL manually in Supabase SQL Editor:
    type docs\migrations\add_place_review_columns.sql
    echo.
    pause
    exit /b 1
)

echo Running migration...
call npm run migrate-place
pause

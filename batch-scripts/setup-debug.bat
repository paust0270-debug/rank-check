@echo off
echo ================================
echo  디버그 모드 - 초기 설정
echo ================================
echo.
echo 시작합니다...
pause

REM UTF-8 설정 (에러 무시)
echo.
echo [DEBUG] UTF-8 인코딩 설정 중...
chcp 65001 > nul 2>&1
echo UTF-8 설정 완료 (에러 무시됨)
pause

REM 관리자 권한 체크
echo.
echo [1/7] 관리자 권한 확인 중...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ 관리자 권한이 필요합니다.
    echo.
    echo 👉 이 파일에서 마우스 우클릭 ^> "관리자 권한으로 실행"을 선택하세요.
    echo.
    echo [DEBUG] errorlevel = %errorlevel%
    pause
    exit /b 1
)
echo ✅ 관리자 권한 확인 완료
pause

REM Node.js 설치 확인
echo.
echo [2/7] Node.js 설치 확인 중...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ Node.js가 설치되지 않았습니다.
    echo.
    echo 👉 https://nodejs.org에서 LTS 버전을 다운로드하여 설치하세요.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION% 설치 확인
pause

echo.
echo [DEBUG] 여기까지 성공!
echo 계속하려면 아무 키나 누르세요...
pause

echo.
echo ================================
echo ✅ 디버그 완료!
echo ================================
echo.
echo 위에서 에러가 발생한 단계를 확인하세요.
echo.
pause

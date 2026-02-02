# Windows에서 USB 디버깅을 통한 Frida 후킹 실행 가이드

> **환경**: Windows 10/11 + CMD/PowerShell
> **연결 방식**: USB 디버깅
> **작성일**: 2025-01-15

---

## 📋 체크리스트

실행 전 확인:
- [ ] Android 디바이스 (Root 권한 있음)
- [ ] USB 케이블
- [ ] Python 3.8 이상 설치됨
- [ ] 디바이스 USB 디버깅 활성화됨

---

## Step 1: ADB 설치 및 연결 확인

### 1.1 ADB 설치

#### 방법 A: Android SDK Platform Tools (권장)

```powershell
# PowerShell에서 실행

# 1. 다운로드 폴더로 이동
cd $env:USERPROFILE\Downloads

# 2. Platform Tools 다운로드 (수동)
# https://developer.android.com/studio/releases/platform-tools 에서
# platform-tools-latest-windows.zip 다운로드

# 3. 압축 해제
Expand-Archive -Path platform-tools-latest-windows.zip -DestinationPath C:\platform-tools

# 4. 환경 변수에 추가
$env:Path += ";C:\platform-tools"
[Environment]::SetEnvironmentVariable("Path", $env:Path, [EnvironmentVariableTarget]::User)

# 5. ADB 버전 확인
adb version
```

#### 방법 B: Chocolatey로 설치

```powershell
# Chocolatey 설치 (관리자 권한 PowerShell)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# ADB 설치
choco install adb -y

# 버전 확인
adb version
```

### 1.2 디바이스 USB 디버깅 활성화

Android 디바이스에서:

1. **설정** → **휴대전화 정보** → **빌드 번호** 7번 탭 (개발자 옵션 활성화)
2. **설정** → **개발자 옵션** → **USB 디버깅** 활성화
3. USB 케이블로 PC와 연결
4. "USB 디버깅 허용하시겠습니까?" 팝업에서 **확인** 선택

### 1.3 연결 확인

```powershell
# 연결된 디바이스 확인
adb devices

# 출력 예시:
# List of devices attached
# RF8M12345678    device
```

**문제 해결**:
- "unauthorized" 표시 시 → 디바이스에서 USB 디버깅 허용
- 디바이스가 안 보일 시 → USB 드라이버 설치 필요 (제조사 홈페이지)

---

## Step 2: Python 및 Frida Tools 설치

### 2.1 Python 설치 확인

```powershell
# Python 버전 확인
python --version

# 출력 예시: Python 3.11.0
```

Python이 없다면: https://www.python.org/downloads/ 에서 설치

### 2.2 Frida Tools 설치

```powershell
# pip 업그레이드
python -m pip install --upgrade pip

# Frida Tools 설치
pip install frida-tools

# 설치 확인
frida --version

# 출력 예시: 16.1.10
```

---

## Step 3: 디바이스 아키텍처 확인 및 Frida Server 설치

### 3.1 디바이스 아키텍처 확인

```powershell
# 아키텍처 확인
adb shell getprop ro.product.cpu.abi

# 출력 예시:
# arm64-v8a      → frida-server-*-android-arm64 사용
# armeabi-v7a    → frida-server-*-android-arm 사용
# x86_64         → frida-server-*-android-x86_64 사용
```

### 3.2 Frida Server 다운로드

```powershell
# 현재 Frida 버전 확인
$fridaVersion = frida --version
Write-Host "Frida Version: $fridaVersion"

# 브라우저로 다운로드:
# https://github.com/frida/frida/releases
# 버전에 맞는 frida-server-<버전>-android-<아키텍처>.xz 다운로드
```

### 3.3 압축 해제

```powershell
# 다운로드 폴더로 이동
cd $env:USERPROFILE\Downloads

# 7-Zip으로 압축 해제 (수동)
# 또는 PowerShell에서 (7-Zip 설치 시):
& "C:\Program Files\7-Zip\7z.exe" x frida-server-16.1.10-android-arm64.xz
& "C:\Program Files\7-Zip\7z.exe" x frida-server-16.1.10-android-arm64

# 파일명을 frida-server로 변경
Rename-Item -Path frida-server-16.1.10-android-arm64 -NewName frida-server
```

**7-Zip 없을 시**:
- https://www.7-zip.org/ 에서 설치
- 또는 수동으로 압축 해제

### 3.4 Frida Server 디바이스로 전송

```powershell
# frida-server 파일을 디바이스로 전송
adb push frida-server /data/local/tmp/

# 실행 권한 부여
adb shell "chmod 755 /data/local/tmp/frida-server"

# 확인
adb shell "ls -l /data/local/tmp/frida-server"
```

### 3.5 Frida Server 실행

```powershell
# Root 권한으로 Frida Server 백그라운드 실행
adb shell "su -c /data/local/tmp/frida-server &"
```

**참고**: `su: not found` 에러 발생 시 → 디바이스에 Root 권한 없음 (Magisk 등으로 Root 필요)

### 3.6 Frida Server 실행 확인

```powershell
# 프로세스 확인
adb shell "ps | grep frida"

# 또는
frida-ps -U

# 출력 예시: 디바이스의 프로세스 목록이 나타나면 성공!
```

---

## Step 4: 네이버 쇼핑 앱 패키지명 확인

```powershell
# 네이버 관련 패키지 검색
adb shell pm list packages | Select-String -Pattern "naver"

# 쇼핑 관련 패키지 검색
adb shell pm list packages | Select-String -Pattern "shopping"

# 예상 출력:
# package:com.nhn.android.shopping
# 또는
# package:com.naver.shopping
```

**패키지명 기록**: `____________________` (여기에 적어두기)

---

## Step 5: 로그 폴더 생성

```powershell
# 프로젝트 루트로 이동
cd D:\adpang

# logs 폴더 생성
New-Item -ItemType Directory -Path logs -Force
```

---

## Step 6: 첫 번째 Frida 후킹 실행 (OkHttp Interceptor)

### 6.1 앱이 실행 중이지 않은 경우

```powershell
# 앱 재시작하면서 후킹
frida -U -f com.nhn.android.shopping -l src\frida\hook_okhttp_interceptor.js --no-pause

# 로그 저장하면서 실행
frida -U -f com.nhn.android.shopping -l src\frida\hook_okhttp_interceptor.js --no-pause 2>&1 | Tee-Object -FilePath logs\okhttp_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

### 6.2 앱이 이미 실행 중인 경우

```powershell
# 실행 중인 앱에 Attach
frida -U -n "네이버 쇼핑" -l src\frida\hook_okhttp_interceptor.js

# 또는 패키지명으로
frida -U -n com.nhn.android.shopping -l src\frida\hook_okhttp_interceptor.js
```

### 6.3 실행 후 확인

스크립트가 실행되면 다음과 같은 메시지가 나타납니다:

```
[+] OkHttp Interceptor Hook Started
[+] Targeting Naver Shopping API traffic...

[+] OkHttp3 classes loaded successfully
[+] Interceptor.intercept() hooked successfully

[+] All OkHttp hooks installed successfully
[+] Waiting for HTTP traffic...
```

**이제 앱에서 검색 또는 상품 조회를 해보세요!**

---

## Step 7: 나머지 스크립트 순차 실행

### 7.1 DTO 클래스 후킹 (10개 변수 세트 추출)

```powershell
# 새 PowerShell 창 열어서 실행
cd D:\adpang

frida -U -f com.nhn.android.shopping -l src\frida\hook_dto_classes.js --no-pause 2>&1 | Tee-Object -FilePath logs\dto_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

### 7.2 Crypto API 후킹

```powershell
frida -U -f com.nhn.android.shopping -l src\frida\hook_crypto_apis.js --no-pause 2>&1 | Tee-Object -FilePath logs\crypto_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

### 7.3 GraphQL 클라이언트 후킹

```powershell
frida -U -f com.nhn.android.shopping -l src\frida\hook_graphql_client.js --no-pause 2>&1 | Tee-Object -FilePath logs\graphql_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

### 7.4 Retrofit 서비스 후킹

```powershell
frida -U -f com.nhn.android.shopping -l src\frida\hook_retrofit_services.js --no-pause 2>&1 | Tee-Object -FilePath logs\retrofit_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

### 7.5 Signature 함수 후킹

```powershell
frida -U -f com.nhn.android.shopping -l src\frida\hook_signature_functions.js --no-pause 2>&1 | Tee-Object -FilePath logs\signature_$(Get-Date -Format 'yyyyMMdd_HHmmss').log
```

---

## Step 8: 로그 분석

### 8.1 로그 파일 확인

```powershell
# logs 폴더의 파일 목록
Get-ChildItem -Path logs

# 최신 로그 파일 확인
Get-Content logs\okhttp_*.log | Select-Object -Last 50
```

### 8.2 특정 키워드 검색

```powershell
# GraphQL 요청 찾기
Select-String -Path logs\okhttp_*.log -Pattern "graphql"

# x-wtm-graphql 헤더 찾기
Select-String -Path logs\okhttp_*.log -Pattern "x-wtm-graphql"

# 10개 변수 중 하나 찾기
Select-String -Path logs\dto_*.log -Pattern "ua_change"
```

### 8.3 JSON 로그 파싱 (선택)

```powershell
# PowerShell에서 JSON 로그 파싱 예시
$logContent = Get-Content logs\okhttp_*.log -Raw
$jsonLines = $logContent -split "`n" | Where-Object { $_ -match "^\[REQUEST\]" }

foreach ($line in $jsonLines) {
    $json = $line -replace "^\[REQUEST\]\s*", "" | ConvertFrom-Json
    Write-Host "URL: $($json.url)"
    Write-Host "Method: $($json.method)"
}
```

---

## 🔧 트러블슈팅

### 문제 1: "frida-server가 실행되지 않음"

```powershell
# Frida Server 재시작
adb shell "su -c killall frida-server"
adb shell "su -c /data/local/tmp/frida-server &"

# 확인
frida-ps -U
```

### 문제 2: "Failed to spawn: unable to find application"

```powershell
# 정확한 패키지명 다시 확인
adb shell pm list packages | Select-String -Pattern "shopping"

# 앱이 설치되어 있는지 확인
adb shell pm path com.nhn.android.shopping
```

### 문제 3: SELinux 권한 오류

```powershell
# SELinux Permissive 모드로 변경 (임시)
adb shell "su -c setenforce 0"

# 확인
adb shell getenforce
# 출력: Permissive
```

### 문제 4: SSL Pinning으로 HTTPS 트래픽 안 보임

```powershell
# SSL Unpinning 스크립트 추가 실행
frida -U -f com.nhn.android.shopping --codeshare pcipolloni/universal-android-ssl-pinning-bypass-with-frida --no-pause
```

### 문제 5: 로그가 한글 깨짐

```powershell
# PowerShell 인코딩 UTF-8로 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001
```

---

## 📊 분석 워크플로우

### 1단계: HTTP 트래픽 수집
```powershell
# OkHttp 후킹으로 모든 API 호출 기록
frida -U -f com.nhn.android.shopping -l src\frida\hook_okhttp_interceptor.js --no-pause 2>&1 | Tee-Object logs\http_traffic.log
```

**앱에서 작업**:
- 검색창에 "무선 이어폰" 검색
- 상품 클릭
- 리뷰 조회
- 장바구니 추가

**로그 분석**:
```powershell
# GraphQL API 호출 추출
Select-String -Path logs\http_traffic.log -Pattern "msearch.shopping.naver.com/api/graphql" -Context 5,5
```

### 2단계: 10개 변수 세트 추출
```powershell
# DTO 후킹 실행
frida -U -f com.nhn.android.shopping -l src\frida\hook_dto_classes.js --no-pause 2>&1 | Tee-Object logs\dto_extraction.log
```

**로그에서 변수 찾기**:
```powershell
Select-String -Path logs\dto_extraction.log -Pattern "ua_change|cookie_home_mode|shop_home|use_nid|use_image|work_type|random_click_count|work_more|sec_fetch_site_mode|low_delay"
```

### 3단계: 암호화 분석
```powershell
# Crypto API 후킹
frida -U -f com.nhn.android.shopping -l src\frida\hook_crypto_apis.js --no-pause 2>&1 | Tee-Object logs\crypto_analysis.log
```

**로그에서 서명 찾기**:
```powershell
Select-String -Path logs\crypto_analysis.log -Pattern "HMAC|SHA256"
```

---

## 다음 단계

로그 수집 후:

1. **데이터 정리**
   - 로그를 JSON 파일로 정리 (`docs/reverse_engineering/findings/`)

2. **API 명세서 작성**
   - GraphQL API 스키마 문서화
   - Zero 서버 API 엔드포인트 문서화

3. **재현 코드 작성**
   - Python으로 서명 생성 로직 구현
   - API 호출 테스트

자세한 내용은 `@docs/prd/reverse_engineering_requirements.md` 참조.

---

**작성자**: Reverse Engineer
**Windows 버전**: 1.0

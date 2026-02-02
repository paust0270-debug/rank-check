# Frida 환경 설정 가이드

> **작성일**: 2025-01-15
> **대상**: 네이버 쇼핑 앱 (Android)
> **담당**: Reverse Engineer

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [Frida Server 설치](#2-frida-server-설치)
3. [Frida Tools 설치](#3-frida-tools-설치)
4. [네이버 쇼핑 앱 준비](#4-네이버-쇼핑-앱-준비)
5. [후킹 스크립트 실행](#5-후킹-스크립트-실행)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. 사전 준비

### 1.1 필요한 환경

- **Android 디바이스** 또는 **에뮬레이터** (Root 권한 필수)
- **PC** (Windows/Mac/Linux)
- **USB 케이블** (실제 디바이스 사용 시)

### 1.2 권장 환경

#### 실제 디바이스
- Android 7.0 (Nougat) 이상
- Root 권한 획득 (Magisk 권장)
- USB 디버깅 활성화

#### 에뮬레이터
- **Genymotion** (권장)
  - 빠른 성능
  - 기본 Root 권한 제공
  - Android 버전 선택 가능
- **Android Studio Emulator** (AVD)
  - Google Play 없는 이미지 사용 (Root 가능)
  - `avd.ini` 수정으로 Root 권한 획득

### 1.3 Python 환경

```bash
# Python 3.8 이상 권장
python --version

# pip 업데이트
pip install --upgrade pip
```

---

## 2. Frida Server 설치

### 2.1 디바이스 아키텍처 확인

```bash
# USB 연결 후 ADB로 확인
adb shell getprop ro.product.cpu.abi

# 출력 예시:
# arm64-v8a      → frida-server-*-android-arm64 사용
# armeabi-v7a    → frida-server-*-android-arm 사용
# x86_64         → frida-server-*-android-x86_64 사용
# x86            → frida-server-*-android-x86 사용
```

### 2.2 Frida Server 다운로드

1. Frida GitHub Releases 방문: https://github.com/frida/frida/releases
2. 최신 버전의 `frida-server-*-android-<아키텍처>.xz` 다운로드
   - 예: `frida-server-16.1.10-android-arm64.xz`

### 2.3 디바이스에 설치

#### Windows

```powershell
# 압축 해제 (7-Zip 등 사용)
# frida-server-16.1.10-android-arm64.xz → frida-server

# 디바이스로 전송
adb push frida-server /data/local/tmp/

# 실행 권한 부여
adb shell "chmod 755 /data/local/tmp/frida-server"

# Frida Server 실행
adb shell "su -c /data/local/tmp/frida-server &"
```

#### Linux/Mac

```bash
# 압축 해제
unxz frida-server-16.1.10-android-arm64.xz
mv frida-server-16.1.10-android-arm64 frida-server

# 디바이스로 전송
adb push frida-server /data/local/tmp/

# 실행 권한 부여
adb shell "chmod 755 /data/local/tmp/frida-server"

# Frida Server 실행
adb shell "su -c /data/local/tmp/frida-server &"
```

### 2.4 Frida Server 확인

```bash
# 프로세스 확인
adb shell "ps | grep frida"

# 출력 예시:
# root     12345  1234  1234567 12345 poll_schedule_timeout 0 S frida-server
```

---

## 3. Frida Tools 설치

### 3.1 설치

```bash
# Frida Tools 설치
pip install frida-tools

# 버전 확인
frida --version

# 출력 예시: 16.1.10
```

**중요**: Frida Tools 버전과 Frida Server 버전이 일치해야 합니다!

### 3.2 버전 불일치 시 해결

```bash
# 특정 버전 설치
pip install frida-tools==16.1.10

# 또는 Frida Server 버전에 맞춰 재설치
pip uninstall frida-tools
pip install frida-tools==<버전>
```

### 3.3 연결 테스트

```bash
# USB 연결된 디바이스의 프로세스 목록 확인
frida-ps -U

# 출력 예시:
#  PID  Name
# -----  --------------------------------------------------
#  1234  com.android.systemui
#  5678  com.nhn.android.shopping
# ...
```

성공하면 Frida 환경 설정 완료!

---

## 4. 네이버 쇼핑 앱 준비

### 4.1 패키지명 확인

네이버 쇼핑 앱의 정확한 패키지명을 확인합니다.

```bash
# 모든 패키지 검색
adb shell pm list packages | grep -i naver

# 또는
adb shell pm list packages | grep -i shopping

# 예상 출력:
# com.nhn.android.shopping
# com.naver.shopping
```

### 4.2 앱 설치 확인

```bash
# 앱이 설치되어 있는지 확인
adb shell pm path com.nhn.android.shopping

# 출력 예시:
# package:/data/app/com.nhn.android.shopping-xxxxx/base.apk
```

### 4.3 앱 실행

```bash
# 앱 실행
adb shell monkey -p com.nhn.android.shopping -c android.intent.category.LAUNCHER 1

# 또는 수동으로 디바이스에서 앱 실행
```

---

## 5. 후킹 스크립트 실행

### 5.1 스크립트 파일 위치

프로젝트의 `@src/frida/` 폴더에 다음 스크립트들이 있습니다:

1. `hook_okhttp_interceptor.js` - HTTP 트래픽 후킹
2. `hook_dto_classes.js` - DTO 클래스 후킹
3. `hook_crypto_apis.js` - 암호화 API 후킹
4. `hook_graphql_client.js` - GraphQL 클라이언트 후킹
5. `hook_retrofit_services.js` - Retrofit 서비스 후킹
6. `hook_signature_functions.js` - 서명 함수 후킹

### 5.2 단일 스크립트 실행

#### 방법 1: 앱 실행 후 Attach

```bash
# 앱이 이미 실행 중인 경우
frida -U -n "네이버 쇼핑" -l src/frida/hook_okhttp_interceptor.js

# 또는 패키지명으로
frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js --no-pause
```

#### 방법 2: 앱 재시작 후 Attach

```bash
# 앱을 재시작하면서 스크립트 주입
frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js
```

### 5.3 여러 스크립트 동시 실행

#### 통합 스크립트 생성

`src/frida/hook_all.js` 파일 생성:

```javascript
// 모든 후킹 스크립트 로드
Java.perform(function() {
    console.log("[+] Loading all hooks...\n");
});

// 각 스크립트의 내용을 여기에 포함
// (또는 Node.js require 사용)
```

#### 실행

```bash
frida -U -f com.nhn.android.shopping -l src/frida/hook_all.js --no-pause
```

### 5.4 로그 저장

```bash
# 로그를 파일로 저장
frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js --no-pause > logs/frida_output.log 2>&1

# 실시간 로그 보기 + 파일 저장
frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js --no-pause 2>&1 | tee logs/frida_output.log
```

### 5.5 권장 실행 순서

**Step 1**: HTTP 트래픽 기본 분석
```bash
frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js --no-pause
```

**Step 2**: DTO 클래스 분석 (10개 변수 세트 추출)
```bash
frida -U -f com.nhn.android.shopping -l src/frida/hook_dto_classes.js --no-pause
```

**Step 3**: 암호화 연산 분석
```bash
frida -U -f com.nhn.android.shopping -l src/frida/hook_crypto_apis.js --no-pause
```

**Step 4**: 서명 함수 분석
```bash
frida -U -f com.nhn.android.shopping -l src/frida/hook_signature_functions.js --no-pause
```

---

## 6. 트러블슈팅

### 6.1 "Failed to spawn: unable to find process with name 'frida-server'"

**원인**: Frida Server가 실행되지 않음

**해결**:
```bash
# Frida Server 재시작
adb shell "su -c killall frida-server"
adb shell "su -c /data/local/tmp/frida-server &"
```

### 6.2 "Failed to attach: unable to access process with pid <PID>"

**원인**: SELinux 정책 또는 권한 문제

**해결**:
```bash
# SELinux Permissive 모드로 변경 (임시)
adb shell "su -c setenforce 0"

# 확인
adb shell getenforce
# 출력: Permissive
```

### 6.3 "Failed to load script: SyntaxError"

**원인**: JavaScript 문법 오류

**해결**:
- 스크립트 파일의 문법 확인
- UTF-8 인코딩 확인
- 줄바꿈 문자 확인 (LF 권장)

### 6.4 "unable to find application with identifier 'com.nhn.android.shopping'"

**원인**: 패키지명이 다르거나 앱이 설치되지 않음

**해결**:
```bash
# 정확한 패키지명 확인
adb shell pm list packages | grep -i shopping

# 정확한 이름으로 재시도
frida -U -f <실제_패키지명> -l script.js --no-pause
```

### 6.5 SSL Pinning 우회 필요 시

네이버 앱이 SSL Pinning을 사용하는 경우:

```bash
# Frida CodeShare의 SSL Unpinning 스크립트 사용
frida -U -f com.nhn.android.shopping --codeshare pcipolloni/universal-android-ssl-pinning-bypass-with-frida --no-pause
```

또는 커스텀 스크립트:

```javascript
// src/frida/ssl_unpinning.js
Java.perform(function() {
    // OkHttp3 CertificatePinner 우회
    var CertificatePinner = Java.use("okhttp3.CertificatePinner");
    CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function() {
        console.log("[+] SSL Pinning bypassed!");
    };
});
```

### 6.6 앱 크래시 또는 멈춤

**원인**: 후킹이 앱 동작을 방해

**해결**:
- 스크립트를 하나씩 테스트
- try-catch 블록 추가
- 특정 클래스/메서드만 선택적으로 후킹

### 6.7 로그가 너무 많이 출력됨

**해결**:
```javascript
// 필터링 조건 추가
if (url.indexOf("naver.com") !== -1 && url.indexOf("graphql") !== -1) {
    // 로그 출력
}
```

---

## 7. 실전 분석 워크플로우

### 7.1 기본 워크플로우

1. **Frida Server 실행**
   ```bash
   adb shell "su -c /data/local/tmp/frida-server &"
   ```

2. **OkHttp 후킹으로 트래픽 확인**
   ```bash
   frida -U -f com.nhn.android.shopping -l src/frida/hook_okhttp_interceptor.js --no-pause 2>&1 | tee logs/http_traffic.log
   ```

3. **앱에서 작업 수행** (검색, 상품 클릭 등)

4. **로그 분석**
   ```bash
   cat logs/http_traffic.log | grep "graphql"
   cat logs/http_traffic.log | grep "x-wtm-graphql"
   ```

5. **특정 API 집중 분석**
   - GraphQL API → `hook_graphql_client.js` 사용
   - 암호화 → `hook_crypto_apis.js` 사용
   - 서명 → `hook_signature_functions.js` 사용

### 7.2 10개 변수 세트 추출 워크플로우

1. **DTO 후킹 실행**
   ```bash
   frida -U -f com.nhn.android.shopping -l src/frida/hook_dto_classes.js --no-pause 2>&1 | tee logs/dto_classes.log
   ```

2. **Zero 서버 API 호출 유도**
   - 앱에서 작업 시작 또는 키워드 조회

3. **로그에서 10개 변수 추출**
   ```bash
   cat logs/dto_classes.log | grep -E "ua_change|cookie_home_mode|shop_home|use_nid|use_image|work_type|random_click_count|work_more|sec_fetch_site_mode|low_delay"
   ```

4. **JSON 파일로 저장**
   - `@docs/reverse_engineering/findings/zero_server_response.json`

---

## 8. 다음 단계

Frida 후킹으로 데이터를 수집한 후:

1. **API 명세서 작성** → `@docs/reverse_engineering/api_specs/`
2. **암호화 분석 문서 작성** → `@docs/reverse_engineering/crypto_analysis/`
3. **재현 코드 작성** → `@src/automation/naver_signature.py`

자세한 내용은 `@docs/prd/reverse_engineering_requirements.md` 참조.

---

**작성자**: Reverse Engineer
**검토**: Orchestrator
**버전**: 1.0

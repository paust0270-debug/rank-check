# PRD: 역공학 레이어 - Frida 후킹 및 API 분석

> **문서 버전**: 1.0
> **작성일**: 2025-01-15
> **담당 에이전트**: Reverse Engineer
> **우선순위**: 🔴 최우선 (P0)

---

## 1. 목표 및 배경

### 1.1 목표

네이버 쇼핑 앱/웹의 내부 동작을 완전히 이해하고, 랭킹 실험에 필요한 트래픽을 재현 가능한 형태로 만들기 위해:

1. **10개 변수 세트**의 정확한 구조와 값 추출
2. **주요 API 엔드포인트**의 요청/응답 구조 100% 문서화
3. **토큰/시그니처 생성 로직** 분석 및 재현 코드 작성

### 1.2 배경

- 네이버 쇼핑 검색 순위는 다양한 행동 신호(클릭, 체류시간, 리뷰 조회 등)를 종합하여 결정됨
- 이러한 행동을 시뮬레이션하려면 앱 내부 로직과 API 구조를 정확히 파악해야 함
- Frida를 활용한 동적 분석으로 앱의 실시간 동작을 관찰하고 재현

### 1.3 범위

**포함 (In-Scope)**:
- 네이버 쇼핑 앱 (Android) 분석
- Zero 서버와의 통신 분석
- OkHttp / Retrofit 레벨 HTTP 트래픽 후킹
- javax.crypto 레벨 암호화/서명 후킹
- 주요 API 5개 이상 완전 분석

**제외 (Out-of-Scope)**:
- iOS 앱 분석 (Phase 1에서는 제외, 추후 필요시 추가)
- 네이버 쇼핑 웹 분석 (Phase 1에서는 제외)
- 앱 내부 난독화 해제 (필요한 경우에만)

---

## 2. 기능 요구사항

### 2.1 10개 변수 세트 수집

#### FR-1.1: Zero 서버 응답 캡처

**설명**: Zero 서버에서 전달하는 작업 설정(10개 변수 세트)을 JSON 원본 그대로 캡처

**요구사항**:
- [ ] `/zero/api/v1/mobile/keywords/naver/{login_id}` 응답 전체 저장
- [ ] 각 변수의 이름, 타입, 값 추출
  - `ua_change` (boolean)
  - `cookie_home_mode` (string)
  - `shop_home` (boolean)
  - `use_nid` (boolean)
  - `use_image` (boolean)
  - `work_type` (string/enum)
  - `random_click_count` (int)
  - `work_more` (boolean)
  - `sec_fetch_site_mode` (string)
  - `low_delay` (boolean)
- [ ] 타임스탬프 및 `login_id`, `keywordId`, `task_id` 연결

**산출물**:
- `@docs/reverse_engineering/findings/zero_server_response.json`
- `@docs/reverse_engineering/api_specs/zero_api_spec.md`

#### FR-1.2: DTO/Model 클래스 식별

**설명**: 안드로이드 앱 내부에서 10개 변수를 담는 데이터 클래스 찾기

**요구사항**:
- [ ] Frida로 클래스 이름, 필드 이름, 타입 로깅
- [ ] 예상 클래스: `KeywordItem`, `TaskItem`, `WorkConfig`, `TrafficConfig` 등
- [ ] 각 필드의 getter/setter 후킹하여 실제 값 기록

**산출물**:
- `@docs/reverse_engineering/findings/dto_classes_analysis.md`
- Frida 스크립트: `@src/frida/hook_dto_classes.js`

---

### 2.2 HTTP 요청/응답 구조 분석

#### FR-2.1: 주요 엔드포인트 식별 및 후킹

**설명**: 네이버 쇼핑 및 Zero 서버의 주요 API 엔드포인트 완전 분석

**우선순위 엔드포인트** (순서대로):

1. **GraphQL API** (최우선)
   - URL: `https://msearch.shopping.naver.com/api/graphql`
   - Method: POST
   - 용도: 검색 결과 조회, 상품 상세 조회

2. **Zero 키워드 조회 API**
   - URL: `/zero/api/v1/mobile/keywords/naver/{login_id}`
   - Method: GET
   - 용도: 작업 대상 키워드 및 설정 조회

3. **Zero 순위 체크 API**
   - URL: `/zero/api/v1/mobile/keywords/naver/rank2`
   - Method: POST
   - 용도: 현재 순위 확인

4. **Zero 쿠키 조회 API**
   - URL: `/zero/api/v1/mobile/data/naver/cookie`
   - Method: GET
   - 용도: `sus_val` 등 쿠키 데이터 조회

5. **Zero UA 조회 API**
   - URL: `/zero/api/v1/mobile/data/ua`
   - Method: GET
   - 용도: User-Agent 설정 조회

**요구사항** (각 엔드포인트마다):
- [ ] URL 및 querystring 전체 기록
- [ ] Method (GET/POST/PUT 등)
- [ ] Headers 전체 (특히 중요한 헤더 식별)
  - `User-Agent`
  - `sec-ch-ua-*` 시리즈
  - `Sec-Fetch-*` 시리즈
  - `Cookie` (특히 `sus_val`, `NID_AUT`, `NID_SES`)
  - `x-wtm-graphql` (GraphQL 서명 헤더)
- [ ] Request Body (JSON/form)
- [ ] Response Status
- [ ] Response Headers (특히 `set-cookie`)
- [ ] Response Body (JSON 전체)

**산출물**:
- `@docs/reverse_engineering/api_specs/graphql_api_spec.md`
- `@docs/reverse_engineering/api_specs/zero_apis_spec.md`
- Frida 스크립트: `@src/frida/hook_okhttp_interceptor.js`
- 샘플 데이터: `@docs/reverse_engineering/findings/api_samples/`

#### FR-2.2: OkHttp Interceptor 후킹

**설명**: OkHttp 레벨에서 모든 HTTP 트래픽 인터셉트

**요구사항**:
- [ ] `OkHttp3.Interceptor.intercept()` 후킹
- [ ] Request 객체에서 URL, Headers, Body 추출
- [ ] Response 객체에서 Status, Headers, Body 추출
- [ ] 네이버 도메인 트래픽만 필터링
- [ ] 타임스탬프 및 request-response 매칭

**산출물**:
- Frida 스크립트: `@src/frida/hook_okhttp_interceptor.js`
- 로그 파일: `@docs/reverse_engineering/findings/http_traffic_log.json`

#### FR-2.3: Retrofit Service 인터페이스 식별

**설명**: 앱에서 사용하는 Retrofit 서비스 인터페이스 찾기

**요구사항**:
- [ ] Retrofit 서비스 인터페이스 클래스 이름 추출
- [ ] 각 API 메서드 시그니처 기록
- [ ] 파라미터 타입 및 어노테이션 기록 (`@GET`, `@POST`, `@Query`, `@Body` 등)

**산출물**:
- `@docs/reverse_engineering/findings/retrofit_services.md`

---

### 2.3 인증/시그니처 로직 분석

#### FR-3.1: 토큰/시그니처 종류 식별

**설명**: 네이버 쇼핑 API에서 사용하는 인증 메커니즘 파악

**알려진 토큰/시그니처**:
1. `sus_val` (쿠키): 네이버 보안 토큰
2. `x-wtm-graphql` (헤더): GraphQL 요청 서명
3. `NID_AUT`, `NID_SES` (쿠키): 네이버 로그인 세션

**요구사항**:
- [ ] 각 토큰의 생성 시점 파악
- [ ] 토큰의 구조 분석 (base64, hex, JWT 등)
- [ ] 토큰의 유효 기간 및 갱신 시점 파악

**산출물**:
- `@docs/reverse_engineering/crypto_analysis/token_analysis.md`

#### FR-3.2: 시그니처 생성 함수 후킹

**설명**: 헤더 및 바디 서명 로직 추적

**타겟 함수**:
- `HttpEngine.genHeader(...)` 또는 유사 함수
- `GraphqlClient.buildRequestBody(...)` 또는 유사 함수
- Custom 서명 클래스/메서드

**요구사항**:
- [ ] 함수 입력값 (body, timestamp, login_id 등) 기록
- [ ] 함수 출력값 (서명 문자열) 기록
- [ ] 서명 알고리즘 추정 (HMAC-SHA256, SHA-256 등)

**산출물**:
- `@docs/reverse_engineering/crypto_analysis/signature_generation.md`
- Frida 스크립트: `@src/frida/hook_signature_functions.js`

#### FR-3.3: Crypto API 후킹

**설명**: javax.crypto 및 java.security API 후킹하여 암호화 연산 추적

**타겟 클래스/메서드**:
- `javax.crypto.Mac.doFinal([B)`
- `javax.crypto.Mac.init(Key)`
- `java.security.MessageDigest.digest([B)`
- `java.security.MessageDigest.update([B)`

**요구사항**:
- [ ] 입력 데이터 (byte array) hex dump
- [ ] 사용된 알고리즘 (HMAC-SHA256, SHA-256 등)
- [ ] Secret key (가능한 경우)
- [ ] 출력 해시/서명 hex dump
- [ ] 호출 스택 추적 (어디서 호출했는지)

**산출물**:
- Frida 스크립트: `@src/frida/hook_crypto_apis.js`
- `@docs/reverse_engineering/crypto_analysis/crypto_operations_log.json`

#### FR-3.4: 시그니처 재현 코드 작성

**설명**: 분석한 시그니처 로직을 Python으로 재현

**요구사항**:
- [ ] base string 구성 규칙 문서화
- [ ] secret key 또는 key derivation 방식 추정
- [ ] Python 함수로 서명 생성 구현
- [ ] 실제 앱과 동일한 서명 생성 검증

**산출물**:
- Python 모듈: `@src/automation/naver_signature.py`
- 검증 스크립트: `@docs/tests/unit/test_signature_generation.py`
- `@docs/reverse_engineering/crypto_analysis/signature_reproduction.md`

---

## 3. 기술 요구사항

### 3.1 Frida 환경 설정

**TR-1.1: Frida Server 설치**

- [ ] Android 디바이스 또는 에뮬레이터에 Frida Server 설치
- [ ] 버전 호환성 확인 (Frida Server ↔ Frida Tools)
- [ ] Root 권한 확보 (필수)

**TR-1.2: Frida Tools 설치**

- [ ] PC에 `frida-tools` 패키지 설치
- [ ] `frida-ps`, `frida-trace` 명령어 동작 확인
- [ ] USB 연결 및 `frida-ps -U` 테스트

**TR-1.3: 네이버 쇼핑 앱 준비**

- [ ] 네이버 쇼핑 앱 최신 버전 설치
- [ ] 앱 패키지명 확인 (`com.nhn.android.shopping` 또는 유사)
- [ ] Zero 연동 앱 또는 별도 자동화 앱 준비 (필요시)

**산출물**:
- `@docs/reverse_engineering/setup_guide.md` (Frida 환경 설정 가이드)

### 3.2 스크립트 개발 표준

**TR-2.1: Frida 스크립트 구조**

모든 Frida 스크립트는 다음 구조를 따라야 함:

```javascript
/**
 * [스크립트 이름]
 * 목적: [후킹 타겟 및 목적 설명]
 * 작성일: YYYY-MM-DD
 * 에이전트: Reverse Engineer
 */

Java.perform(function() {
    console.log("[+] Script started");

    // 후킹 로직

    console.log("[+] Hooks installed");
});
```

**TR-2.2: 로그 포맷**

- 모든 로그는 JSON 형식으로 출력 (파싱 용이)
- 타임스탬프 필수 포함
- 민감 정보 (비밀번호 등) 마스킹

**TR-2.3: 에러 핸들링**

- 클래스/메서드 찾지 못한 경우 graceful degradation
- 앱 크래시 방지 (try-catch 사용)

---

## 4. 산출물 정의

### 4.1 Frida 스크립트 (필수)

| 스크립트 이름 | 경로 | 목적 |
|--------------|------|------|
| `hook_dto_classes.js` | `@src/frida/` | DTO 클래스 필드 값 추출 |
| `hook_okhttp_interceptor.js` | `@src/frida/` | HTTP 트래픽 인터셉트 |
| `hook_retrofit_services.js` | `@src/frida/` | Retrofit 서비스 메서드 후킹 |
| `hook_signature_functions.js` | `@src/frida/` | 커스텀 서명 함수 후킹 |
| `hook_crypto_apis.js` | `@src/frida/` | javax.crypto API 후킹 |
| `hook_graphql_client.js` | `@src/frida/` | GraphQL 클라이언트 후킹 |

### 4.2 API 명세서 (필수)

| 문서 이름 | 경로 | 내용 |
|----------|------|------|
| `graphql_api_spec.md` | `@docs/reverse_engineering/api_specs/` | GraphQL API 완전 명세 |
| `zero_apis_spec.md` | `@docs/reverse_engineering/api_specs/` | Zero 서버 API 명세 |
| `api_endpoints_summary.md` | `@docs/reverse_engineering/api_specs/` | 전체 엔드포인트 요약 |

### 4.3 암호화 분석 문서 (필수)

| 문서 이름 | 경로 | 내용 |
|----------|------|------|
| `token_analysis.md` | `@docs/reverse_engineering/crypto_analysis/` | 토큰 구조 및 생성 분석 |
| `signature_generation.md` | `@docs/reverse_engineering/crypto_analysis/` | 서명 생성 로직 |
| `signature_reproduction.md` | `@docs/reverse_engineering/crypto_analysis/` | 재현 방법 및 코드 |

### 4.4 발견사항 문서 (선택)

| 문서 이름 | 경로 | 내용 |
|----------|------|------|
| `zero_server_response.json` | `@docs/reverse_engineering/findings/` | Zero 서버 응답 샘플 |
| `dto_classes_analysis.md` | `@docs/reverse_engineering/findings/` | DTO 클래스 분석 |
| `retrofit_services.md` | `@docs/reverse_engineering/findings/` | Retrofit 서비스 분석 |
| `http_traffic_log.json` | `@docs/reverse_engineering/findings/` | HTTP 트래픽 로그 샘플 |

---

## 5. 성공 기준

### 5.1 최소 성공 기준 (MVP)

- [x] Frida 환경 설정 완료
- [ ] OkHttp Interceptor 후킹 성공
- [ ] GraphQL API 요청/응답 1개 이상 완전 캡처
- [ ] Zero 서버 API 2개 이상 완전 캡처
- [ ] `sus_val` 또는 `x-wtm-graphql` 중 1개 이상 생성 로직 파악

### 5.2 목표 성공 기준

- [ ] 모든 우선순위 엔드포인트(5개) 완전 분석
- [ ] 10개 변수 세트 전체 추출 및 문서화
- [ ] 주요 토큰/시그니처 2개 이상 재현 코드 작성
- [ ] API 명세서 100% 완성 (요청/응답 스키마 포함)

### 5.3 우수 성공 기준

- [ ] Crypto API 후킹 성공 (secret key 추출)
- [ ] 모든 토큰/시그니처 재현 가능
- [ ] Python으로 완전한 API 클라이언트 구현
- [ ] 재현 코드로 실제 API 호출 성공 (200 OK)

---

## 6. 타임라인

### Week 1

- Day 1-2: Frida 환경 설정
- Day 3-4: OkHttp/Retrofit 후킹 스크립트 작성
- Day 5-7: GraphQL API 분석 및 문서화

### Week 2

- Day 1-3: Zero 서버 API 분석
- Day 4-5: Crypto API 후킹 및 시그니처 분석
- Day 6-7: 재현 코드 작성 및 검증

---

## 7. 의존성 및 블로커

### 의존성

- Android 디바이스 또는 에뮬레이터 (Root 권한 필수)
- 네이버 쇼핑 앱 설치 가능
- USB 디버깅 활성화

### 잠재적 블로커

- **앱 보안 기능**: Anti-debugging, SSL Pinning 등
  - 완화 방법: Frida의 SSL Unpinning 스크립트 사용
- **난독화**: 클래스/메서드명이 난독화된 경우
  - 완화 방법: 동적 분석으로 우회 가능
- **앱 업데이트**: API 구조 변경 가능성
  - 완화 방법: 특정 버전 고정, 변경 사항 모니터링

---

## 8. 참고 자료

- Frida 공식 문서: https://frida.re/docs/
- Frida 코드셰어: https://codeshare.frida.re/
- OkHttp Interceptor 가이드: https://square.github.io/okhttp/interceptors/
- Android Crypto API: https://developer.android.com/reference/javax/crypto/package-summary

---

## 9. 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 1.0 | 2025-01-15 | 초기 문서 작성 | Orchestrator |

---

**문서 소유자**: Reverse Engineer
**검토자**: Orchestrator
**승인 상태**: ✅ 승인됨

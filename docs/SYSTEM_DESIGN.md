# Turafic 네이버 순위 체크 시스템 - 전체 설계 문서

**버전**: 1.0
**작성일**: 2025-11-20
**프로젝트**: Turafic Naver Rank Checker

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [컴포넌트 상세](#3-컴포넌트-상세)
4. [데이터 흐름](#4-데이터-흐름)
5. [변수 시스템](#5-변수-시스템)
6. [API 명세](#6-api-명세)
7. [배포 구조](#7-배포-구조)

---

## 1. 시스템 개요

### 1.1 목적

Turafic은 **네이버 쇼핑 검색 순위를 자동으로 체크하고 최적화하는 AI 기반 시스템**입니다.

- **자동화**: 24/7 무인 순위 체크
- **분산 처리**: 다수의 Android 봇 동시 운영
- **변수 최적화**: 12개 변수 조합을 통한 최적화
- **실시간 모니터링**: 순위 변동 추적 및 알림

### 1.2 핵심 가치

| 기능 | 설명 |
|------|------|
| **완전 자동화** | 사람 개입 없이 순위 체크 및 최적화 |
| **대규모 확장** | 수백 대의 봇 동시 운영 가능 |
| **지능형 최적화** | AI Agent가 자동으로 변수 조합 최적화 |
| **실시간 분석** | 순위 변동 패턴 분석 및 예측 |

### 1.3 기술 스택

```
Frontend:  React + TailwindCSS + tRPC Client
Backend:   Node.js + tRPC + PostgreSQL + Drizzle ORM
Mobile:    Android Native (Kotlin) + WebView
AI:        Claude AI Agentic System (5 Agents)
Infra:     AWS (Zero API Server)
```

---

## 2. 전체 아키텍처

### 2.1 시스템 구조도

```
┌─────────────────────────────────────────────────────────────┐
│                  Turafic Web Dashboard                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React UI (캠페인 관리, 순위 조회, 통계)              │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │ tRPC                              │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│               Turafic Server (Node.js + tRPC)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  tRPC Routers                                        │   │
│  │  - rankCheck      (순위 체크 API)                    │   │
│  │  - campaign       (캠페인 관리)                      │   │
│  │  - bot            (봇 관리)                          │   │
│  │  - variable       (변수 최적화)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Services                                            │   │
│  │  - rankCheckService.ts   (순위 체크 로직)           │   │
│  │  - botManager.ts         (봇 네트워크 관리)         │   │
│  │  - variableConverter.ts  (변수 변환)                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database (PostgreSQL + Drizzle ORM)                 │   │
│  │  - campaigns      (캠페인)                           │   │
│  │  - bots           (봇 정보)                          │   │
│  │  - rankings       (순위 기록)                        │   │
│  │  - variable_combinations  (변수 조합)                │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼─────────┐ ┌───▼──────────┐ ┌──▼─────────────┐
│   Android Bot 1   │ │ Android Bot 2│ │ Android Bot N  │
│  ┌─────────────┐  │ │  ┌──────────┐│ │  ┌──────────┐  │
│  │MainActivity │  │ │  │MainActivity││ │  │MainActivity│  │
│  ├─────────────┤  │ │  ├──────────┤│ │  ├──────────┤  │
│  │TuraficApiClient│ │  │TuraficApiClient││TuraficApiClient│
│  ├─────────────┤  │ │  ├──────────┤│ │  ├──────────┤  │
│  │WebViewManager│ │  │WebViewManager││WebViewManager│
│  ├─────────────┤  │ │  ├──────────┤│ │  ├──────────┤  │
│  │NaverRankChecker││ │NaverRankChecker││NaverRankChecker│
│  └─────────────┘  │ │  └──────────┘│ │  └──────────┘  │
└───────┬───────────┘ └──────┬───────┘ └────────┬───────┘
        │                    │                   │
        └────────────────────┼───────────────────┘
                             │ WebView
┌────────────────────────────▼───────────────────────────────┐
│              Naver Shopping Search Results                 │
│  https://msearch.shopping.naver.com/search/all             │
│  (JavaScript 인젝션으로 상품 정보 추출)                    │
└────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
1. 사용자가 캠페인 생성 (Web Dashboard)
   ↓
2. Turafic 서버가 캠페인 정보 DB 저장
   ↓
3. Android Bot이 작업 요청 (rankCheck.getTask)
   ↓
4. 서버가 변수 조합 선택 및 작업 생성
   ↓
5. Bot이 WebView로 네이버 쇼핑 접속
   ↓
6. JavaScript 인젝션으로 상품 순위 추출
   ↓
7. Bot이 순위 결과 보고 (rankCheck.reportRank)
   ↓
8. 서버가 순위 정보 DB 저장
   ↓
9. AI Agent가 순위 분석 및 변수 최적화
   ↓
10. 최적화된 변수로 다음 작업 생성
```

---

## 3. 컴포넌트 상세

### 3.1 Turafic Server (Node.js)

#### 3.1.1 tRPC API 라우터

**rankCheck Router** (`server/routers.ts`)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `rankCheck.registerBot` | POST | 새 봇 등록 |
| `rankCheck.getTask` | GET | 순위 체크 작업 요청 |
| `rankCheck.reportRank` | POST | 순위 결과 보고 |
| `rankCheck.finishTask` | POST | 작업 완료 표시 |
| `rankCheck.updateBotStatus` | POST | 봇 상태 업데이트 |

#### 3.1.2 핵심 서비스

**rankCheckService.ts** (400+ 줄)

```typescript
// 주요 함수
- assignTask(): Zero API에서 작업 요청 및 변수 변환
- reportRank(): 순위 결과 DB 저장
- finishTask(): 작업 완료 처리
- convertVariables(): 10개 변수 → 5개 변수 변환
```

**변수 변환 로직**:

```typescript
10개 변수 (Zero API)         →   5개 변수 (Rank Check)
─────────────────────────────────────────────────────
ua_change                   →   userAgent
cookie_home_mode + use_nid  →   cookieStrategy
shop_home                   →   referer
sec_fetch_site_mode         →   secFetchSite
cookie_home_mode            →   cookies (NNB, NID_AUT, NID_SES)
```

### 3.2 Android APK (Kotlin)

#### 3.2.1 아키텍처

```
MainActivity (진입점)
    ↓
TuraficApiClient (네트워크 통신)
    ↓
WebViewManager (WebView 설정 및 쿠키 관리)
    ↓
NaverRankChecker (순위 체크 로직)
```

#### 3.2.2 핵심 클래스

**MainActivity.kt** (248줄)

```kotlin
// 주요 기능
- onCreate(): 앱 시작 시 봇 등록
- startRankCheck(): 순위 체크 작업 시작
- performRankCheck(): 순위 체크 실행
- updateStatus(): UI 상태 업데이트
```

**TuraficApiClient.kt** (285줄)

```kotlin
// HTTP 통신
- Ktor Client 사용
- Exponential Backoff 재시도 (1s → 2s → 4s)
- JSON 직렬화/역직렬화
```

**WebViewManager.kt** (165줄)

```kotlin
// WebView 관리
- User-Agent 설정
- 쿠키 주입 (NNB, NID_AUT, NID_SES)
- JavaScript 인터페이스 등록
- 페이지 로드 대기
```

**NaverRankChecker.kt** (220줄)

```kotlin
// 순위 체크 알고리즘
1. 검색 URL 생성: https://msearch.shopping.naver.com/search/all?query={keyword}
2. 페이지 로드 대기
3. JavaScript로 상품 목록 추출
4. 상품 ID 매칭 (최대 400개 확인)
5. 순위 계산: (page - 1) * 40 + index + 1
```

### 3.3 Database Schema

#### 3.3.1 주요 테이블

**campaigns** (캠페인)

```sql
id              SERIAL PRIMARY KEY
name            VARCHAR(255)
keyword         VARCHAR(255)
product_id      VARCHAR(255)
platform        VARCHAR(50)  -- 'naver' or 'coupang'
status          VARCHAR(50)  -- 'active', 'paused', 'completed'
created_at      TIMESTAMP
```

**bots** (봇 정보)

```sql
id              SERIAL PRIMARY KEY
device_id       VARCHAR(255) UNIQUE
device_model    VARCHAR(255)
status          VARCHAR(50)  -- 'online', 'offline', 'error'
last_seen_at    TIMESTAMP
created_at      TIMESTAMP
```

**rankings** (순위 기록)

```sql
id              SERIAL PRIMARY KEY
campaign_id     INTEGER REFERENCES campaigns(id)
bot_id          INTEGER REFERENCES bots(id)
rank            INTEGER
total_products  INTEGER
page_number     INTEGER
success         BOOLEAN
error_message   TEXT
created_at      TIMESTAMP
```

**variable_combinations** (변수 조합)

```sql
id              SERIAL PRIMARY KEY
generation      INTEGER
chromosome_id   INTEGER
variables       JSONB  -- 12개 변수 저장
performance_score FLOAT
fitness         FLOAT
created_at      TIMESTAMP
```

---

## 4. 데이터 흐름

### 4.1 봇 등록 흐름

```
Android Bot                  Turafic Server              Database
    │                              │                        │
    ├─ registerBot() ─────────────>│                        │
    │  {deviceId, deviceModel}     │                        │
    │                              ├─ INSERT INTO bots ─────>│
    │                              │                        │
    │                              │<─ botId ────────────────┤
    │<─ botId ─────────────────────┤                        │
    │                              │                        │
```

### 4.2 순위 체크 흐름

```
Android Bot                  Turafic Server              Database
    │                              │                        │
    ├─ getTask() ─────────────────>│                        │
    │  {botId, loginId, imei}      │                        │
    │                              ├─ SELECT campaign ──────>│
    │                              │<─ campaign data ────────┤
    │                              │                        │
    │                              ├─ SELECT variables ─────>│
    │                              │<─ best combination ─────┤
    │                              │                        │
    │<─ RankCheckTask ─────────────┤                        │
    │  {taskId, keyword,            │                        │
    │   productId, variables}      │                        │
    │                              │                        │
    ├─ [WebView에서 순위 체크]      │                        │
    │                              │                        │
    ├─ reportRank() ──────────────>│                        │
    │  {taskId, rank, success}     │                        │
    │                              ├─ INSERT INTO rankings ─>│
    │                              │                        │
    │<─ success ───────────────────┤                        │
    │                              │                        │
    ├─ finishTask() ───────────────>│                        │
    │  {taskId, botId}             │                        │
    │                              ├─ UPDATE campaign ──────>│
    │                              │                        │
    │<─ success ───────────────────┤                        │
    │                              │                        │
```

### 4.3 순위 체크 상세 (WebView)

```
NaverRankChecker                 WebView                  Naver Shopping
    │                              │                            │
    ├─ initialize(task) ──────────>│                            │
    │  - Set User-Agent             │                            │
    │  - Set Cookies                │                            │
    │                              │                            │
    ├─ loadUrl(searchUrl) ────────>│                            │
    │                              ├─ HTTP GET ────────────────>│
    │                              │                            │
    │                              │<─ HTML Response ───────────┤
    │                              │                            │
    ├─ waitForPageLoad() ─────────>│                            │
    │                              │                            │
    ├─ evaluateJavaScript() ──────>│                            │
    │  "document.querySelectorAll  │                            │
    │   ('[data-product-id]')"     │                            │
    │                              │                            │
    │<─ JSON Product List ──────────┤                            │
    │  [{mid1: "123", index: 0},   │                            │
    │   {mid1: "456", index: 1}]   │                            │
    │                              │                            │
    ├─ Match productId ────────────┤                            │
    │  Found at index 15           │                            │
    │                              │                            │
    ├─ Calculate Rank ─────────────┤                            │
    │  rank = (page-1)*40 + 15 + 1 │                            │
    │  rank = 16                   │                            │
    │                              │                            │
    └─ Return rank ────────────────┘                            │
```

---

## 5. 변수 시스템

### 5.1 12개 변수 (Turafic 전체)

| 변수명 | 타입 | 설명 | 값 범위 |
|--------|------|------|---------|
| `user_agent` | string | User-Agent 헤더 | 58, 67, 71 (Android 버전) |
| `cw_mode` | string | CW 설정 | 'CW해제', 'CW유지' |
| `entry_point` | string | 진입 경로 | '쇼핑DI', '광고DI', '통합검색' |
| `cookie_strategy` | string | 쿠키 전략 | '로그인쿠키', '비로그인쿠키' |
| `image_loading` | string | 이미지 로딩 | '이미지패스', '이미지로드' |
| `input_method` | string | 입력 방식 | '복붙', '타이핑' |
| `random_clicks` | number | 랜덤 클릭 횟수 | 0, 3, 6 |
| `more_button` | string | 더보기 클릭 | '더보기패스', '더보기클릭' |
| `x_with_header` | string | X-With 헤더 | 'x-with삼성', 'x-with갤럭시' |
| `delay_mode` | string | 딜레이 모드 | '딜레이감소', '딜레이정상' |
| `work_type` | string | 작업 타입 | '검색만', '검색+클릭', '검색+클릭+체류', '리뷰조회' |
| `sec_fetch_site_mode` | string | Sec-Fetch-Site | 'same-origin', 'same-site', 'cross-site', 'none' |

### 5.2 순위 체크용 5개 변수

순위 체크는 트래픽이 적고 단순하므로 **5개 핵심 변수만** 사용:

| 순위 체크 변수 | 원본 변수 |
|---------------|-----------|
| `userAgent` | `user_agent` |
| `cookieStrategy` | `cookie_strategy` |
| `referer` | `entry_point` → 변환 |
| `secFetchSite` | `sec_fetch_site_mode` |
| `cookies` | `cookie_strategy` → NNB, NID_AUT, NID_SES |

### 5.3 변수 변환 예시

```typescript
// Turafic 변수
{
  user_agent: "UA67",
  entry_point: "쇼핑DI",
  cookie_strategy: "로그인쿠키",
  sec_fetch_site_mode: "same-origin"
}

// ↓ 변환

// 순위 체크 변수
{
  userAgent: "Mozilla/5.0 (Linux; Android 10; SM-G973N) AppleWebKit/537.36",
  referer: "https://msearch.shopping.naver.com/",
  cookieStrategy: "login",
  secFetchSite: "same-origin",
  cookies: {
    NNB: "IJETDRGUTUMGS",
    NID_AUT: "...",
    NID_SES: "..."
  }
}
```

---

## 6. API 명세

### 6.1 rankCheck.registerBot

**요청**:
```typescript
POST /trpc/rankCheck.registerBot

{
  "deviceId": "android-uuid",
  "deviceModel": "Samsung Galaxy S21"
}
```

**응답**:
```typescript
{
  "result": {
    "data": 123  // botId
  }
}
```

### 6.2 rankCheck.getTask

**요청**:
```typescript
GET /trpc/rankCheck.getTask?input={"botId":123,"loginId":"test","imei":"123456"}
```

**응답**:
```typescript
{
  "result": {
    "data": {
      "taskId": "task-abc-123",
      "campaignId": 1,
      "keyword": "갤럭시 S24",
      "productId": "12345678",
      "platform": "naver",
      "variables": {
        "userAgent": "Mozilla/5.0 ...",
        "cookieStrategy": "login",
        "referer": "https://msearch.shopping.naver.com/",
        "secFetchSite": "same-origin",
        "cookies": {
          "NNB": "IJETDRGUTUMGS",
          "NID_AUT": "...",
          "NID_SES": "..."
        }
      }
    }
  }
}
```

### 6.3 rankCheck.reportRank

**요청**:
```typescript
POST /trpc/rankCheck.reportRank

{
  "taskId": "task-abc-123",
  "campaignId": 1,
  "rank": 15,
  "success": true,
  "totalProducts": 400,
  "pageNumber": 1,
  "errorMessage": null
}
```

**응답**:
```typescript
{
  "result": {
    "data": true  // success
  }
}
```

---

## 7. 배포 구조

### 7.1 개발 환경

```
Turafic Server:    localhost:5000
PostgreSQL:        localhost:5432
Android Emulator:  10.0.2.2:5000 (호스트 머신)
```

### 7.2 프로덕션 환경 (예상)

```
┌─────────────────────────────────────┐
│  AWS ELB (Load Balancer)            │
│  api.turafic.com                    │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼─────────┐
     │                   │
┌────▼────┐        ┌────▼────┐
│ Server 1│        │ Server 2│
│ (Node.js│        │ (Node.js│
└────┬────┘        └────┬────┘
     │                   │
     └─────────┬─────────┘
               │
      ┌────────▼─────────┐
      │  PostgreSQL RDS  │
      │  (Master/Replica)│
      └──────────────────┘

┌─────────────────────────────────────┐
│  Android Bots (100+ devices)        │
│  - AWS Device Farm                  │
│  - 또는 실제 디바이스 팜             │
└─────────────────────────────────────┘
```

### 7.3 확장성

- **수평 확장**: Turafic Server 인스턴스 추가
- **데이터베이스**: PostgreSQL Read Replica
- **캐싱**: Redis (작업 큐, 세션 관리)
- **로드 밸런싱**: AWS ELB/ALB
- **봇 네트워크**: 최대 1,000대 이상 동시 운영 가능

---

## 8. 성능 지표

### 8.1 목표 성능

| 지표 | 목표 |
|------|------|
| 순위 체크 속도 | 10~20초/키워드 |
| 봇 처리량 | 100 작업/시간/봇 |
| API 응답 시간 | < 500ms |
| 데이터베이스 쿼리 | < 100ms |

### 8.2 제약사항

- 네이버 Rate Limit: 알 수 없음 (실험 필요)
- WebView 메모리: 디바이스당 최대 500MB
- 동시 접속 봇: 1,000대 (서버 성능 의존)

---

## 9. 보안 고려사항

### 9.1 네이버 차단 회피

1. **User-Agent 로테이션**: 다양한 Android 버전 사용
2. **쿠키 관리**: 실제 사용자 쿠키 주기적 갱신
3. **IP 로테이션**: 프록시 또는 VPN 사용
4. **행동 패턴**: 사람처럼 보이는 랜덤 클릭 및 딜레이

### 9.2 데이터 보안

- 쿠키 암호화 저장
- API 토큰 인증
- HTTPS 통신
- SQL Injection 방어 (Drizzle ORM)

---

## 10. 향후 개선 계획

### 10.1 단기 (1개월)

- [ ] 쿠팡 순위 체크 지원
- [ ] 실시간 대시보드 개선
- [ ] 봇 자동 복구 시스템

### 10.2 중기 (3개월)

- [ ] AI Agent 성능 최적화
- [ ] 변수 조합 자동 학습
- [ ] 멀티 플랫폼 지원 (11번가, 위메프)

### 10.3 장기 (6개월)

- [ ] 예측 분석 기능
- [ ] 경쟁사 순위 추적
- [ ] API 서비스 제공

---

**작성자**: Claude Code
**최종 업데이트**: 2025-11-20

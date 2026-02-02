# 네이버 순위 체크 APK - 종합 PRD (Product Requirements Document)

**문서 버전**: 1.0  
**작성일**: 2025-11-16  
**작성자**: Manus AI  
**프로젝트명**: 네이버 쇼핑 순위 체크 자동화 시스템 (Naver Shopping Rank Checker)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [기술 사양](#3-기술-사양)
4. [핵심 기능 요구사항](#4-핵심-기능-요구사항)
5. [데이터 모델](#5-데이터-모델)
6. [HTTP 통신 프로토콜](#6-http-통신-프로토콜)
7. [순위 체크 알고리즘](#7-순위-체크-알고리즘)
8. [보안 및 차단 회피](#8-보안-및-차단-회피)
9. [성능 요구사항](#9-성능-요구사항)
10. [테스트 계획](#10-테스트-계획)
11. [배포 및 운영](#11-배포-및-운영)
12. [부록](#12-부록)

---

## 1. 프로젝트 개요

### 1.1 목적 및 배경

본 프로젝트는 **제로순위 Updater APK (zru12)** 리버스 엔지니어링 분석을 기반으로, 네이버 쇼핑에서 특정 상품의 검색 순위를 자동으로 체크하고 보고하는 안드로이드 애플리케이션을 개발하기 위한 종합 요구사항 문서입니다.

기존 시스템은 실제 안드로이드 디바이스에서 삼성 인터넷 브라우저를 통해 네이버 쇼핑을 자동화하여 순위를 체크하는 방식으로 작동합니다. 본 문서는 이러한 기존 시스템의 동작 원리를 완전히 분석하고, 개선된 형태로 재구현하기 위한 기술적 요구사항을 정의합니다.

### 1.2 핵심 가치 제안

**기존 시스템 대비 개선 사항**:

- **확장성**: 클라우드 기반 아키텍처로 무한 확장 가능
- **자동화**: 24/7 무인 운영 지원
- **유연성**: 사용자 정의 변수 제어 및 캠페인 관리
- **안정성**: 자동 재시도 및 에러 복구 메커니즘
- **보안성**: 프록시 및 User-Agent 로테이션을 통한 차단 회피
- **분석**: 실시간 통계 및 순위 변동 추적

### 1.3 타겟 사용자

- **네이버 쇼핑 셀러**: 자사 상품의 검색 순위 모니터링
- **마케팅 에이전시**: 클라이언트 상품의 순위 추적 및 보고
- **SEO 전문가**: 키워드 순위 분석 및 최적화

### 1.4 주요 기능

1. **작업 요청 및 관리**: 서버로부터 순위 체크 작업 수신
2. **자동 순위 체크**: 네이버 쇼핑 검색 결과에서 상품 순위 자동 탐색
3. **순위 보고**: 체크된 순위를 서버로 전송
4. **10개 변수 시스템**: 동적 HTTP 헤더 생성 및 행동 패턴 제어
5. **쿠키 관리**: 네이버 쿠키 자동 적용 및 로테이션
6. **에러 처리**: 자동 재시도 및 상세 로그 기록

---

## 2. 시스템 아키텍처

### 2.1 전체 아키텍처 개요

본 시스템은 **클라이언트-서버 아키텍처**를 기반으로 하며, 안드로이드 APK는 클라이언트 역할을 수행합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                      Zero API Server                        │
│  (http://api-daae8ace959079d5.elb.ap-northeast-2.amazonaws) │
└─────────────────────────────────────────────────────────────┘
                            ▲ │
                            │ │ HTTP/REST
                            │ ▼
┌─────────────────────────────────────────────────────────────┐
│                   Android APK (Client)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          NetworkEngine (Retrofit + OkHttp)            │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         ActivityMCloud (Main Controller)              │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      WebViewManager (Samsung Internet Bridge)         │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   NaverShopRankAction (Rank Check Logic)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲ │
                            │ │ JavaScript Injection
                            │ ▼
┌─────────────────────────────────────────────────────────────┐
│              Samsung Internet (WebView)                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Naver Shopping Search Results                 │  │
│  │  (https://msearch.shopping.naver.com/search/all)      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 컴포넌트

#### 2.2.1 NetworkEngine

**역할**: Zero API 서버와의 HTTP 통신 담당

**기술 스택**:
- Retrofit 2.x (HTTP 클라이언트)
- OkHttp 3.x (HTTP 엔진)
- Gson (JSON 직렬화/역직렬화)

**주요 메서드**:

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `getKeywordsForRankCheck()` | `POST /v1/mobile/keywords/naver/rank_check` | 작업 요청 |
| `updateKeywordRank()` | `POST /v1/mobile/keyword/naver/{keywordId}/rank` | 순위 보고 |
| `updateProductInfo()` | `POST /v1/mobile/keyword/naver/{keywordId}/product_info` | 상품 정보 업데이트 |
| `finishKeyword()` | `POST /v1/mobile/keyword/{keywordId}/finish` | 작업 완료 |

**Retrofit 설정**:

```java
OkHttpClient okHttpClient = new OkHttpClient()
    .newBuilder()
    .connectTimeout(5L, TimeUnit.SECONDS)
    .readTimeout(20L, TimeUnit.SECONDS)
    .writeTimeout(20L, TimeUnit.SECONDS)
    .build();

Retrofit retrofit = new Retrofit.Builder()
    .baseUrl("http://api-daae8ace959079d5.elb.ap-northeast-2.amazonaws.com/zero/api/")
    .client(okHttpClient)
    .addConverterFactory(GsonConverterFactory.create())
    .build();
```

#### 2.2.2 ActivityMCloud

**역할**: 메인 컨트롤러, 작업 흐름 관리

**주요 책임**:
1. Zero API로부터 작업 수신 (`getKeywordsForRankCheck`)
2. KeywordData 처리 (`processKeywordData`)
3. WebView 초기화 및 제어
4. 순위 체크 결과 처리
5. 작업 완료 보고

**프로세스 흐름**:

```
1. 앱 시작
   ↓
2. getKeywordsForRankCheck() 호출
   ↓
3. KeywordData 수신
   ↓
4. processKeywordData() 실행
   ↓
5. WebView 초기화 (쿠키, User-Agent 설정)
   ↓
6. 네이버 쇼핑 검색 페이지 로드
   ↓
7. NaverShopRankAction.start() 실행
   ↓
8. 순위 체크 완료
   ↓
9. updateKeywordRank() 호출 (순위 보고)
   ↓
10. finishKeyword() 호출 (작업 완료)
    ↓
11. 다음 작업 요청 (2번으로 돌아감)
```

#### 2.2.3 WebViewManager

**역할**: 삼성 인터넷 WebView 관리 및 JavaScript 인젝션

**주요 기능**:
1. WebView 초기화 및 설정
2. User-Agent 설정
3. 쿠키 주입
4. JavaScript 인터페이스 등록
5. 페이지 로드 이벤트 처리

**WebView 설정**:

```java
WebSettings settings = webView.getSettings();
settings.setJavaScriptEnabled(true);
settings.setDomStorageEnabled(true);
settings.setUserAgentString(userAgent);
settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
```

**쿠키 설정**:

```java
CookieManager cookieManager = CookieManager.getInstance();
cookieManager.setAcceptCookie(true);
cookieManager.setCookie(".naver.com", "NNB=" + nnb);
cookieManager.setCookie(".naver.com", "sus_val=" + susVal);
if (useNid == 1) {
    cookieManager.setCookie(".naver.com", "NID_AUT=" + nidAut);
    cookieManager.setCookie(".naver.com", "NID_SES=" + nidSes);
}
```

#### 2.2.4 NaverShopRankAction

**역할**: 네이버 쇼핑 검색 결과에서 상품 순위 체크

**주요 기능**:
1. 검색 결과 페이지 파싱
2. 상품 ID (MID1) 매칭
3. 페이지 스크롤 및 다음 페이지 이동
4. 순위 계산 및 반환

**순위 체크 로직**:

```
1. 검색 URL 생성
   https://msearch.shopping.naver.com/search/all?query={keyword}&pagingIndex={page}
   
2. 페이지 로드 대기
   
3. JavaScript 인젝션으로 상품 목록 추출
   document.querySelectorAll('[data-product-id]')
   
4. 각 상품의 MID1과 타겟 MID1 비교
   
5. 매칭되면 순위 계산 (페이지 번호 × 40 + 상품 인덱스)
   
6. 매칭 안되면 다음 페이지로 이동 (최대 10페이지)
   
7. 순위 반환 (찾으면 순위, 못 찾으면 -1)
```

### 2.3 프로세스 상태 다이어그램

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │ getKeywordsForRankCheck()
       ▼
┌─────────────┐
│  FETCHING   │
│   TASK      │
└──────┬──────┘
       │ KeywordData 수신
       ▼
┌─────────────┐
│ PROCESSING  │
│   DATA      │
└──────┬──────┘
       │ processKeywordData()
       ▼
┌─────────────┐
│ INITIALIZING│
│   WEBVIEW   │
└──────┬──────┘
       │ WebView 설정 완료
       ▼
┌─────────────┐
│  LOADING    │
│    PAGE     │
└──────┬──────┘
       │ 페이지 로드 완료
       ▼
┌─────────────┐
│  CHECKING   │
│    RANK     │
└──────┬──────┘
       │ 순위 찾음 또는 최대 페이지 도달
       ▼
┌─────────────┐
│  REPORTING  │
│    RANK     │
└──────┬──────┘
       │ updateKeywordRank() 완료
       ▼
┌─────────────┐
│ FINISHING   │
│    TASK     │
└──────┬──────┘
       │ finishKeyword() 완료
       ▼
┌─────────────┐
│   IDLE      │ (다음 작업 대기)
└─────────────┘
```

---

## 3. 기술 사양

### 3.1 개발 환경

| 항목 | 사양 |
|------|------|
| **언어** | Java 8+ |
| **플랫폼** | Android 8.0 (API 26) 이상 |
| **빌드 도구** | Gradle 7.x |
| **IDE** | Android Studio Arctic Fox 이상 |
| **최소 SDK** | API 26 (Android 8.0) |
| **타겟 SDK** | API 33 (Android 13) |

### 3.2 핵심 라이브러리

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| Retrofit | 2.9.0 | HTTP 클라이언트 |
| OkHttp | 3.14.9 | HTTP 엔진 |
| Gson | 2.8.9 | JSON 직렬화 |
| Samsung Internet | - | WebView 엔진 |

### 3.3 외부 의존성

**Zero API Server**:
- Base URL: `http://api-daae8ace959079d5.elb.ap-northeast-2.amazonaws.com/zero/api/`
- 인증: `login_id` + `imei` (토큰 없음)
- 응답 형식: JSON

**Naver Shopping API**:
- Search URL: `https://msearch.shopping.naver.com/search/all`
- GraphQL URL: `https://msearch.shopping.naver.com/api/graphql`

---

## 4. 핵심 기능 요구사항

### 4.1 필수 기능 (MVP)

#### 4.1.1 작업 요청 및 수신

**요구사항**:
- Zero API 서버로부터 순위 체크 작업을 요청하고 수신해야 합니다.
- 작업 요청 시 `login_id`와 `imei`를 전송해야 합니다.
- 응답으로 `KeywordData` 객체를 수신하고 파싱해야 합니다.

**API 명세**:

```
POST /v1/mobile/keywords/naver/rank_check
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}

Response:
{
  "status": 0,
  "data": [
    {
      "keyword_id": 896912,
      "search": "자전거 장갑",
      "product_id": "48270522934",
      "traffic_id": 67890,
      "ua_change": 1,
      "cookie_home_mode": 1,
      "shop_home": 1,
      "use_nid": 0,
      "use_image": 1,
      "work_type": 3,
      "random_click_count": 2,
      "work_more": 1,
      "sec_fetch_site_mode": 1,
      "low_delay": 2,
      "ad_query": "자전거 장갑",
      "orig_query": "자전거 장갑",
      "sort": "rel",
      "view_type": "list",
      "product_set": "total"
    }
  ],
  "user_agent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K) ...",
  "device_ip": "123.456.789.012",
  "naver_cookie": {
    "nnb": "IJETDRGUTUMGS"
  },
  "naver_login_cookie": {
    "nnb": "IJETDRGUTUMGS",
    "nid_aut": "...",
    "nid_ses": "...",
    "nid_jkl": "..."
  }
}
```

**검증 기준**:
- 응답 `status`가 0이면 성공
- `data` 배열에 최소 1개 이상의 작업 포함
- 모든 필수 필드 존재 확인

#### 4.1.2 10개 변수 시스템

**요구사항**:
- 서버로부터 수신한 10개 변수를 기반으로 HTTP 헤더 및 행동 패턴을 동적으로 생성해야 합니다.
- 각 변수는 특정 동작을 제어하며, 정확히 매핑되어야 합니다.

**10개 변수 상세 명세**:

| 변수명 | 타입 | 설명 | 가능한 값 | 영향 범위 |
|--------|------|------|-----------|-----------|
| `ua_change` | int | User-Agent 변경 여부 | 0 = 기본 UA 사용<br>1 = 서버 제공 UA 사용 | HTTP 헤더 |
| `cookie_home_mode` | int | 쿠키 홈 모드 | 0 = 쿠키 미사용<br>1 = 서버 제공 쿠키 사용 | HTTP 헤더 (Cookie) |
| `shop_home` | int | Referer 설정 | 0 = `https://m.naver.com/`<br>1 = `https://msearch.shopping.naver.com/`<br>3 = `https://msearch.shopping.naver.com/di/`<br>4 = `https://search.naver.com/search.naver` | HTTP 헤더 (Referer) |
| `use_nid` | int | 네이버 로그인 쿠키 사용 | 0 = 미로그인 상태<br>1 = 로그인 쿠키 사용 (NID_AUT, NID_SES) | HTTP 헤더 (Cookie) |
| `use_image` | int | 이미지 로딩 | 0 = 이미지 비활성화<br>1 = 이미지 활성화 | WebView 설정 |
| `work_type` | int | 작업 타입 (입력 방식) | 1 = 직접 입력<br>2 = 복사/붙여넣기<br>3 = 자동 완성 | 행동 패턴 |
| `random_click_count` | int | 랜덤 클릭 횟수 | 0~5 | 행동 패턴 |
| `work_more` | int | 더보기 클릭 | 0 = 클릭 안함<br>1 = 클릭함 | 행동 패턴 |
| `sec_fetch_site_mode` | int | Sec-Fetch-Site 헤더 | 0 = `none`<br>1 = `same-site`<br>2 = `same-origin` | HTTP 헤더 |
| `low_delay` | int | 딜레이 시간 (초) | 1~10 | 행동 패턴 |

**HTTP 헤더 생성 로직**:

```java
public Map<String, String> generateHeaders(KeywordItem task) {
    Map<String, String> headers = new HashMap<>();
    
    // 1. User-Agent
    if (task.uaChange == 1) {
        headers.put("User-Agent", task.userAgent);
    } else {
        headers.put("User-Agent", DEFAULT_USER_AGENT);
    }
    
    // 2. Referer
    String[] referers = {
        "https://m.naver.com/",
        "https://msearch.shopping.naver.com/",
        null, // 인덱스 2는 사용 안함
        "https://msearch.shopping.naver.com/di/",
        "https://search.naver.com/search.naver"
    };
    headers.put("Referer", referers[task.shopHome]);
    
    // 3. Sec-Fetch-Site
    String[] secFetchSites = {"none", "same-site", "same-origin"};
    headers.put("Sec-Fetch-Site", secFetchSites[task.secFetchSiteMode]);
    
    // 4. 기타 고정 헤더
    headers.put("Sec-Fetch-Mode", "navigate");
    headers.put("Sec-Fetch-Dest", "document");
    headers.put("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    headers.put("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
    
    return headers;
}
```

**검증 기준**:
- 각 변수가 올바른 HTTP 헤더로 변환되어야 합니다.
- Logcat 또는 Frida 후킹으로 실제 전송 헤더 확인 필요

#### 4.1.3 순위 체크 알고리즘

**요구사항**:
- 네이버 쇼핑 검색 결과에서 타겟 상품의 순위를 자동으로 찾아야 합니다.
- 최대 10페이지까지 검색해야 합니다.
- 각 페이지는 최대 40개 상품을 포함합니다.

**알고리즘 흐름**:

```
Input: keyword (검색 키워드), productId (타겟 상품 ID)
Output: rank (순위, 못 찾으면 -1)

1. currentPage = 1
2. WHILE currentPage <= 10:
     a. URL 생성: https://msearch.shopping.naver.com/search/all?query={keyword}&pagingIndex={currentPage}
     b. WebView로 페이지 로드
     c. 페이지 로드 완료 대기
     d. JavaScript 인젝션으로 상품 목록 추출:
        products = document.querySelectorAll('[data-product-id]')
     e. FOR EACH product IN products:
          i. 상품 ID 추출: mid1 = product.getAttribute('data-product-id')
          ii. IF mid1 == productId:
                rank = (currentPage - 1) * 40 + productIndex + 1
                RETURN rank
     f. 페이지 하단까지 스크롤
     g. currentPage++
3. RETURN -1 (순위 못 찾음)
```

**JavaScript 인젝션 예시**:

```javascript
(function() {
    var products = document.querySelectorAll('[data-product-id]');
    var result = [];
    for (var i = 0; i < products.length; i++) {
        var mid1 = products[i].getAttribute('data-product-id');
        result.push({
            index: i,
            mid1: mid1
        });
    }
    return JSON.stringify(result);
})();
```

**검증 기준**:
- 실제 네이버 쇼핑에서 수동 검색 결과와 일치해야 합니다.
- 순위 오차 범위: ±0 (정확히 일치)

#### 4.1.4 순위 보고

**요구사항**:
- 순위 체크 완료 후 결과를 Zero API 서버로 전송해야 합니다.
- 순위를 찾은 경우와 못 찾은 경우 모두 보고해야 합니다.

**API 명세**:

```
POST /v1/mobile/keyword/naver/{keywordId}/rank
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
  rank={rank}
  sub_rank={sub_rank}  // 옵션, 광고 순위

Response:
{
  "status": 0,
  "message": "success"
}
```

**검증 기준**:
- 응답 `status`가 0이면 성공
- 순위 보고 실패 시 재시도 (최대 3회)

#### 4.1.5 작업 완료 보고

**요구사항**:
- 모든 작업 완료 후 서버에 완료 상태를 보고해야 합니다.

**API 명세**:

```
POST /v1/mobile/keyword/{keywordId}/finish
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
  traffic_id={traffic_id}

Response:
{
  "status": 0,
  "message": "success"
}
```

### 4.2 선택 기능 (Phase 2)

#### 4.2.1 로컬 통계

**요구사항**:
- 작업 이력을 로컬 데이터베이스에 저장
- 일별/주별 순위 변동 그래프
- 작업 성공률 통계

#### 4.2.2 알림 시스템

**요구사항**:
- 순위 변동 시 푸시 알림
- 작업 실패 시 알림
- 일일 요약 알림

#### 4.2.3 설정 화면

**요구사항**:
- `login_id` 및 `imei` 설정
- 자동 시작 설정
- 알림 설정

---

## 5. 데이터 모델

### 5.1 KeywordItem

**설명**: 단일 순위 체크 작업을 나타내는 모델

**Java 클래스**:

```java
public class KeywordItem {
    @SerializedName("keyword_id")
    public int keywordId;
    
    @SerializedName("search")
    public String search;  // 검색 키워드
    
    @SerializedName("product_id")
    public String productId;  // 타겟 상품 ID (MID1)
    
    @SerializedName("traffic_id")
    public int trafficId;
    
    // 10개 변수
    @SerializedName("ua_change")
    public int uaChange;
    
    @SerializedName("cookie_home_mode")
    public int cookieHomeMode;
    
    @SerializedName("shop_home")
    public int shopHome;
    
    @SerializedName("use_nid")
    public int useNid;
    
    @SerializedName("use_image")
    public int useImage;
    
    @SerializedName("work_type")
    public int workType;
    
    @SerializedName("random_click_count")
    public int randomClickCount;
    
    @SerializedName("work_more")
    public int workMore;
    
    @SerializedName("sec_fetch_site_mode")
    public int secFetchSiteMode;
    
    @SerializedName("low_delay")
    public int lowDelay;
    
    // 추가 정보
    @SerializedName("ad_query")
    public String adQuery;
    
    @SerializedName("orig_query")
    public String origQuery;
    
    @SerializedName("sort")
    public String sort;  // "rel", "price_asc", "price_desc", "review", "sale"
    
    @SerializedName("view_type")
    public String viewType;  // "list", "image"
    
    @SerializedName("product_set")
    public String productSet;  // "total", "catalog", "overseas"
}
```

### 5.2 KeywordData

**설명**: Zero API 응답 래퍼

**Java 클래스**:

```java
public class KeywordData {
    @SerializedName("status")
    public int status;
    
    @SerializedName("data")
    public List<KeywordItem> data;
    
    @SerializedName("user_agent")
    public String userAgent;
    
    @SerializedName("device_ip")
    public String deviceIp;
    
    @SerializedName("naver_cookie")
    public NaverCookieData naverCookie;
    
    @SerializedName("naver_login_cookie")
    public NaverLoginCookieData naverLoginCookie;
    
    public static class NaverCookieData {
        @SerializedName("nnb")
        public String nnb;
    }
    
    public static class NaverLoginCookieData {
        @SerializedName("nnb")
        public String nnb;
        
        @SerializedName("nid_aut")
        public String nidAut;
        
        @SerializedName("nid_ses")
        public String nidSes;
        
        @SerializedName("nid_jkl")
        public String nidJkl;
    }
}
```

### 5.3 RankResult

**설명**: 순위 체크 결과

**Java 클래스**:

```java
public class RankResult {
    public int keywordId;
    public int rank;  // -1이면 순위 못 찾음
    public int subRank;  // 광고 순위 (옵션)
    public long timestamp;
    public boolean success;
    public String errorMessage;
}
```

---

## 6. HTTP 통신 프로토콜

### 6.1 Zero API 엔드포인트

**Base URL**: `http://api-daae8ace959079d5.elb.ap-northeast-2.amazonaws.com/zero/api/`

#### 6.1.1 작업 요청

```
POST /v1/mobile/keywords/naver/rank_check
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
```

**응답 예시**:

```json
{
  "status": 0,
  "data": [
    {
      "keyword_id": 896912,
      "search": "자전거 장갑",
      "product_id": "48270522934",
      "traffic_id": 67890,
      "ua_change": 1,
      "cookie_home_mode": 1,
      "shop_home": 1,
      "use_nid": 0,
      "use_image": 1,
      "work_type": 3,
      "random_click_count": 2,
      "work_more": 1,
      "sec_fetch_site_mode": 1,
      "low_delay": 2
    }
  ],
  "user_agent": "Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K Build/R16NW; wv) AppleWebKit/537.36",
  "naver_cookie": {
    "nnb": "IJETDRGUTUMGS"
  }
}
```

#### 6.1.2 순위 보고

```
POST /v1/mobile/keyword/naver/{keywordId}/rank
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
  rank={rank}
  sub_rank={sub_rank}
```

#### 6.1.3 상품 정보 업데이트

```
POST /v1/mobile/keyword/naver/{keywordId}/product_info
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
  product_name={product_name}
  price={price}
  image_url={image_url}
```

#### 6.1.4 작업 완료

```
POST /v1/mobile/keyword/{keywordId}/finish
Content-Type: application/x-www-form-urlencoded

Body:
  login_id={login_id}
  imei={imei}
  traffic_id={traffic_id}
```

### 6.2 네이버 쇼핑 API

#### 6.2.1 검색 API

**URL**: `https://msearch.shopping.naver.com/search/all`

**파라미터**:

| 파라미터 | 타입 | 필수 | 설명 | 예시 |
|----------|------|------|------|------|
| `query` | string | Y | 검색 키워드 | "자전거 장갑" |
| `pagingIndex` | int | N | 페이지 번호 (1부터 시작) | 1 |
| `sort` | string | N | 정렬 방식 | "rel" (관련도순) |
| `viewType` | string | N | 뷰 타입 | "list" |
| `productSet` | string | N | 상품 세트 | "total" |

**예시 URL**:

```
https://msearch.shopping.naver.com/search/all?query=자전거+장갑&pagingIndex=1&sort=rel&viewType=list&productSet=total
```

**응답 형식**: HTML (JavaScript로 파싱 필요)

#### 6.2.2 GraphQL API

**URL**: `https://msearch.shopping.naver.com/api/graphql`

**설명**: 네이버 쇼핑 내부 API (선택 사항)

### 6.3 HTTP 헤더 생성

**Logcat 분석 결과 기반 실제 헤더**:

```
User-Agent: Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K Build/R16NW; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/92.0.4515.131 Mobile Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7
Referer: https://msearch.shopping.naver.com/
Sec-Fetch-Site: same-site
Sec-Fetch-Mode: navigate
Sec-Fetch-Dest: document
Cookie: NNB=IJETDRGUTUMGS; sus_val=i/DMeSSl8QvYVkq3GLngDk2v
```

**헤더 생성 Java 코드**:

```java
public class HttpHeaderGenerator {
    
    public static Map<String, String> generate(KeywordItem task, KeywordData data) {
        Map<String, String> headers = new HashMap<>();
        
        // User-Agent
        if (task.uaChange == 1 && data.userAgent != null) {
            headers.put("User-Agent", data.userAgent);
        } else {
            headers.put("User-Agent", getDefaultUserAgent());
        }
        
        // Accept
        headers.put("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        
        // Accept-Language
        headers.put("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
        
        // Referer
        String[] referers = {
            "https://m.naver.com/",
            "https://msearch.shopping.naver.com/",
            null,
            "https://msearch.shopping.naver.com/di/",
            "https://search.naver.com/search.naver"
        };
        if (task.shopHome >= 0 && task.shopHome < referers.length && referers[task.shopHome] != null) {
            headers.put("Referer", referers[task.shopHome]);
        }
        
        // Sec-Fetch-*
        String[] secFetchSites = {"none", "same-site", "same-origin"};
        if (task.secFetchSiteMode >= 0 && task.secFetchSiteMode < secFetchSites.length) {
            headers.put("Sec-Fetch-Site", secFetchSites[task.secFetchSiteMode]);
        }
        headers.put("Sec-Fetch-Mode", "navigate");
        headers.put("Sec-Fetch-Dest", "document");
        
        return headers;
    }
    
    private static String getDefaultUserAgent() {
        return "Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K Build/R16NW; wv) " +
               "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
               "Chrome/92.0.4515.131 Mobile Safari/537.36";
    }
}
```

### 6.4 쿠키 관리

**Logcat 분석 결과 기반 실제 쿠키**:

```
NNB=IJETDRGUTUMGS
sus_val=i/DMeSSl8QvYVkq3GLngDk2v
```

**쿠키 설정 Java 코드**:

```java
public class CookieManager {
    
    public static void setCookies(WebView webView, KeywordData data, KeywordItem task) {
        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        
        // NNB 쿠키 (필수)
        if (data.naverCookie != null && data.naverCookie.nnb != null) {
            cookieManager.setCookie(".naver.com", "NNB=" + data.naverCookie.nnb);
        }
        
        // sus_val 쿠키 (선택, 있으면 설정)
        // 참고: sus_val은 Logcat에서 확인되었지만 API 응답에는 없음
        // 실제 구현 시 별도 관리 필요
        
        // 로그인 쿠키 (use_nid == 1일 때만)
        if (task.useNid == 1 && data.naverLoginCookie != null) {
            if (data.naverLoginCookie.nidAut != null) {
                cookieManager.setCookie(".naver.com", "NID_AUT=" + data.naverLoginCookie.nidAut);
            }
            if (data.naverLoginCookie.nidSes != null) {
                cookieManager.setCookie(".naver.com", "NID_SES=" + data.naverLoginCookie.nidSes);
            }
            if (data.naverLoginCookie.nidJkl != null) {
                cookieManager.setCookie(".naver.com", "NID_JKL=" + data.naverLoginCookie.nidJkl);
            }
        }
        
        cookieManager.flush();
    }
}
```

---

## 7. 순위 체크 알고리즘

### 7.1 알고리즘 개요

**목표**: 네이버 쇼핑 검색 결과에서 타겟 상품의 순위를 찾습니다.

**입력**:
- `keyword`: 검색 키워드 (예: "자전거 장갑")
- `productId`: 타겟 상품 ID (MID1, 예: "48270522934")
- `maxPages`: 최대 검색 페이지 수 (기본값: 10)

**출력**:
- `rank`: 순위 (1부터 시작, 못 찾으면 -1)

### 7.2 상세 알고리즘

**Pseudocode**:

```
FUNCTION checkRank(keyword, productId, maxPages):
    FOR page FROM 1 TO maxPages:
        // 1. URL 생성
        url = buildSearchUrl(keyword, page)
        
        // 2. 페이지 로드
        loadPage(url)
        waitForPageLoad()
        
        // 3. 상품 목록 추출
        products = extractProducts()
        
        // 4. 타겟 상품 찾기
        FOR index, product IN products:
            IF product.mid1 == productId:
                rank = (page - 1) * 40 + index + 1
                RETURN rank
        
        // 5. 페이지 하단까지 스크롤
        scrollToBottom()
        
        // 6. 딜레이
        sleep(lowDelay)
    
    // 못 찾음
    RETURN -1
```

**Java 구현**:

```java
public class NaverShopRankChecker {
    
    private static final int PRODUCTS_PER_PAGE = 40;
    private static final int MAX_PAGES = 10;
    
    public int checkRank(String keyword, String productId, int lowDelay) {
        for (int page = 1; page <= MAX_PAGES; page++) {
            String url = buildSearchUrl(keyword, page);
            
            // WebView로 페이지 로드
            webView.loadUrl(url);
            waitForPageLoad();
            
            // JavaScript 인젝션으로 상품 목록 추출
            String productsJson = extractProducts();
            List<Product> products = parseProducts(productsJson);
            
            // 타겟 상품 찾기
            for (int i = 0; i < products.size(); i++) {
                if (products.get(i).mid1.equals(productId)) {
                    int rank = (page - 1) * PRODUCTS_PER_PAGE + i + 1;
                    Log.d("RankChecker", "Found at rank: " + rank);
                    return rank;
                }
            }
            
            // 페이지 하단까지 스크롤
            scrollToBottom();
            
            // 딜레이
            try {
                Thread.sleep(lowDelay * 1000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
        
        Log.d("RankChecker", "Rank not found");
        return -1;
    }
    
    private String buildSearchUrl(String keyword, int page) {
        return "https://msearch.shopping.naver.com/search/all" +
               "?query=" + URLEncoder.encode(keyword, "UTF-8") +
               "&pagingIndex=" + page +
               "&sort=rel" +
               "&viewType=list" +
               "&productSet=total";
    }
    
    private String extractProducts() {
        String js = 
            "(function() {" +
            "  var products = document.querySelectorAll('[data-product-id]');" +
            "  var result = [];" +
            "  for (var i = 0; i < products.length; i++) {" +
            "    var mid1 = products[i].getAttribute('data-product-id');" +
            "    result.push({ index: i, mid1: mid1 });" +
            "  }" +
            "  return JSON.stringify(result);" +
            "})();";
        
        // WebView에서 JavaScript 실행 및 결과 반환
        return evaluateJavaScript(js);
    }
    
    private void scrollToBottom() {
        String js = "window.scrollTo(0, document.body.scrollHeight);";
        webView.evaluateJavascript(js, null);
    }
}
```

### 7.3 Logcat 분석 결과

**실제 동작 로그**:

```
11-16 02:02:54.902 30263 30369 D NaverShopRankAction: - 단일상품 순위 검사 2페이지: 48270522934
11-16 02:02:54.902 30263 30369 D NaverShopRankAction: - 단일상품 순위 검사 total: 40
11-16 02:02:55.019 30263 30369 D NaverRankAction: rank: 0, nodes: 7
11-16 02:02:55.019 30263 30369 D NaverRankPatternMessage: # 순위를 못찾아서 다음으로.. 3
```

**분석**:
- 페이지당 40개 상품 검사
- 순위를 못 찾으면 다음 페이지로 이동
- 최대 10페이지까지 검색

### 7.4 에지 케이스 처리

**케이스 1: 광고 상품**

**문제**: 광고 상품과 일반 상품이 섞여 있음

**해결책**:
- 광고 상품은 별도 카운트 (`sub_rank`)
- 일반 상품만 순위 계산

**케이스 2: 동적 로딩**

**문제**: 스크롤 시 추가 상품 로드

**해결책**:
- 페이지 하단까지 스크롤 후 대기
- 모든 상품 로드 완료 확인

**케이스 3: 네트워크 지연**

**문제**: 페이지 로드 실패

**해결책**:
- 타임아웃 설정 (20초)
- 재시도 메커니즘 (최대 3회)

---

## 8. 보안 및 차단 회피

### 8.1 User-Agent 로테이션

**목적**: 동일한 User-Agent 반복 사용으로 인한 차단 방지

**구현 방안**:

```java
public class UserAgentPool {
    private static final String[] USER_AGENTS = {
        "Mozilla/5.0 (Linux; Android 8.0.0; SM-G930K Build/R16NW; wv) AppleWebKit/537.36",
        "Mozilla/5.0 (Linux; Android 9.0; SM-G960N Build/PPR1.180610.011; wv) AppleWebKit/537.36",
        "Mozilla/5.0 (Linux; Android 10; SM-G973N Build/QP1A.190711.020; wv) AppleWebKit/537.36",
        "Mozilla/5.0 (Linux; Android 11; SM-G991N Build/RP1A.200720.012; wv) AppleWebKit/537.36",
        // ... 더 많은 UA
    };
    
    private Random random = new Random();
    
    public String getRandomUserAgent() {
        return USER_AGENTS[random.nextInt(USER_AGENTS.length)];
    }
}
```

### 8.2 쿠키 관리

**목적**: 쿠키 차단 방지 및 로테이션

**구현 방안**:
- 서버로부터 여러 개의 쿠키 수신
- 작업마다 다른 쿠키 사용
- 쿠키 유효성 검사 (차단된 쿠키 제거)

### 8.3 랜덤 행동 패턴

**목적**: 봇 탐지 회피

**구현 방안**:

```java
public class BehaviorSimulator {
    
    public void simulateHumanBehavior(KeywordItem task) {
        // 1. 랜덤 클릭
        for (int i = 0; i < task.randomClickCount; i++) {
            clickRandomElement();
            sleep(randomDelay(500, 2000));
        }
        
        // 2. 랜덤 스크롤
        int scrollCount = random.nextInt(3) + 1;
        for (int i = 0; i < scrollCount; i++) {
            scrollRandomAmount();
            sleep(randomDelay(1000, 3000));
        }
        
        // 3. 더보기 클릭 (work_more == 1)
        if (task.workMore == 1) {
            clickMoreButton();
            sleep(randomDelay(1000, 2000));
        }
    }
    
    private int randomDelay(int min, int max) {
        return random.nextInt(max - min) + min;
    }
}
```

### 8.4 딜레이 조정

**목적**: 요청 속도 제한 및 자연스러운 행동 패턴

**구현 방안**:
- `low_delay` 변수 사용 (서버에서 제어)
- 추가 랜덤 딜레이 (±20%)

```java
public void applyDelay(int lowDelay) {
    int baseDelay = lowDelay * 1000;  // 초 → 밀리초
    int randomOffset = (int) (baseDelay * 0.2 * (random.nextDouble() - 0.5));
    int finalDelay = baseDelay + randomOffset;
    
    try {
        Thread.sleep(finalDelay);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}
```

### 8.5 프록시 사용 (선택 사항)

**목적**: IP 차단 방지

**구현 방안**:
- OkHttp에 프록시 설정
- 프록시 로테이션

```java
Proxy proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("proxy.example.com", 8080));

OkHttpClient client = new OkHttpClient.Builder()
    .proxy(proxy)
    .build();
```

---

## 9. 성능 요구사항

### 9.1 응답 시간

| 작업 | 목표 시간 | 최대 시간 |
|------|-----------|-----------|
| 작업 요청 (getKeywordsForRankCheck) | < 2초 | 5초 |
| 페이지 로드 | < 3초 | 10초 |
| 순위 체크 (1페이지) | < 5초 | 15초 |
| 순위 체크 (10페이지) | < 50초 | 120초 |
| 순위 보고 (updateKeywordRank) | < 2초 | 5초 |

### 9.2 처리량

| 지표 | 목표 |
|------|------|
| 시간당 작업 처리 수 | 10개 이상 |
| 일일 작업 처리 수 | 200개 이상 |
| 동시 작업 수 | 1개 (단일 디바이스) |

### 9.3 리소스 사용

| 리소스 | 제한 |
|--------|------|
| 메모리 | < 200MB |
| CPU | < 30% (평균) |
| 네트워크 | < 10MB/작업 |
| 배터리 | < 5%/시간 |

### 9.4 안정성

| 지표 | 목표 |
|------|------|
| 작업 성공률 | > 95% |
| 앱 크래시율 | < 1% |
| 에러 복구율 | > 90% |

---

## 10. 테스트 계획

### 10.1 단위 테스트

**테스트 대상**:
- HttpHeaderGenerator
- CookieManager
- NaverShopRankChecker
- BehaviorSimulator

**테스트 케이스 예시**:

```java
@Test
public void testHttpHeaderGeneration() {
    KeywordItem task = new KeywordItem();
    task.uaChange = 1;
    task.shopHome = 1;
    task.secFetchSiteMode = 1;
    
    KeywordData data = new KeywordData();
    data.userAgent = "Test UA";
    
    Map<String, String> headers = HttpHeaderGenerator.generate(task, data);
    
    assertEquals("Test UA", headers.get("User-Agent"));
    assertEquals("https://msearch.shopping.naver.com/", headers.get("Referer"));
    assertEquals("same-site", headers.get("Sec-Fetch-Site"));
}
```

### 10.2 통합 테스트

**테스트 시나리오**:

1. **정상 작업 흐름**
   - 작업 요청 → 순위 체크 → 순위 보고 → 작업 완료
   - 예상 결과: 모든 단계 성공

2. **순위 못 찾음**
   - 작업 요청 → 순위 체크 (10페이지 검색) → 순위 못 찾음 → 순위 보고 (rank=-1)
   - 예상 결과: rank=-1로 보고

3. **네트워크 에러**
   - 작업 요청 → 네트워크 에러 → 재시도 → 성공
   - 예상 결과: 재시도 후 성공

4. **10개 변수 조합**
   - 다양한 변수 조합으로 작업 실행
   - 예상 결과: 각 변수가 올바르게 적용됨

### 10.3 실제 환경 테스트

**테스트 환경**:
- 실제 안드로이드 디바이스 (Samsung Galaxy S7, Android 8.0)
- 실제 Zero API 서버
- 실제 네이버 쇼핑

**테스트 케이스**:

| 케이스 | 키워드 | 상품 ID | 예상 순위 | 실제 순위 | 결과 |
|--------|--------|---------|-----------|-----------|------|
| 1 | "자전거 장갑" | "48270522934" | 1~40 | ? | ? |
| 2 | "블루투스 키보드" | "83811414103" | 41~80 | ? | ? |
| 3 | "무선 마우스" | "12345678901" | -1 (없음) | ? | ? |

**검증 기준**:
- 실제 순위와 일치 (±0)
- 작업 성공률 > 95%

### 10.4 성능 테스트

**테스트 시나리오**:
- 100개 작업 연속 실행
- 메모리 사용량 모니터링
- CPU 사용량 모니터링
- 배터리 소모량 측정

**검증 기준**:
- 메모리 < 200MB
- CPU < 30% (평균)
- 배터리 < 5%/시간

### 10.5 보안 테스트

**테스트 시나리오**:
- 동일한 User-Agent 100회 사용 → 차단 여부 확인
- 동일한 쿠키 100회 사용 → 차단 여부 확인
- 짧은 딜레이 (1초) 사용 → 차단 여부 확인

**검증 기준**:
- 차단율 < 5%

---

## 11. 배포 및 운영

### 11.1 빌드 설정

**build.gradle**:

```gradle
android {
    compileSdkVersion 33
    
    defaultConfig {
        applicationId "com.zero.updater.rank"
        minSdkVersion 26
        targetSdkVersion 33
        versionCode 1
        versionName "1.0.0"
    }
    
    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:okhttp:3.14.9'
    implementation 'com.google.code.gson:gson:2.8.9'
}
```

### 11.2 ProGuard 설정

**proguard-rules.pro**:

```
# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# Gson
-keep class com.google.gson.** { *; }
-keep class com.zero.updater.rank.models.** { *; }

# OkHttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
```

### 11.3 배포 방법

**옵션 1: APK 직접 배포**
- APK 파일 생성 (Build → Build Bundle(s) / APK(s) → Build APK(s))
- APK 파일 다운로드 링크 제공

**옵션 2: Google Play Store**
- 개발자 계정 필요
- 앱 심사 과정 필요

**옵션 3: 사내 배포**
- MDM (Mobile Device Management) 사용
- 직접 설치

### 11.4 모니터링

**로그 수집**:
- Logcat 로그 수집
- 에러 로그 서버 전송

**지표 수집**:
- 작업 성공률
- 평균 순위 체크 시간
- 에러 발생 빈도

**알림**:
- 작업 실패 시 알림
- 에러율 임계값 초과 시 알림

---

## 12. 부록

### 12.1 Frida 후킹 스크립트

**목적**: 실제 HTTP 요청/응답 및 10개 변수 캡처

**스크립트**: `hook_keyword_data.js`

```javascript
Java.perform(function() {
    console.log("\n🎯 KeywordData Capture Hook Starting...\n");
    
    // processKeywordData 후킹
    var ActivityMCloud = Java.use("com.sec.android.app.sbrowser.ActivityMCloud");
    
    ActivityMCloud.processKeywordData.implementation = function(data) {
        console.log("\n" + "=".repeat(80));
        console.log("🎯 processKeywordData 호출! (Zero API 응답)");
        console.log("=".repeat(80));
        
        try {
            // User-Agent
            var userAgent = data.userAgent.value;
            console.log("\n🌐 User-Agent:");
            console.log("  " + userAgent);
            
            // 작업 목록
            var dataList = data.data.value;
            console.log("\n📦 작업 목록 (" + dataList.size() + "개):");
            console.log("-".repeat(80));
            
            for (var i = 0; i < dataList.size(); i++) {
                var item = dataList.get(i);
                
                console.log("\n  [작업 #" + (i + 1) + "]");
                console.log("  ├─ keyword_id: " + item.keywordId.value);
                console.log("  ├─ search (키워드): " + item.search.value);
                console.log("  ├─ product_id (MID1): " + item.productId.value);
                console.log("  ├─ traffic_id: " + item.trafficId.value);
                
                console.log("\n  🎯 10개 변수:");
                console.log("  ├─ [1] ua_change: " + item.uaChange.value);
                console.log("  ├─ [2] cookie_home_mode: " + item.cookieHomeMode.value);
                console.log("  ├─ [3] shop_home: " + item.shopHome.value);
                console.log("  ├─ [4] use_nid: " + item.useNid.value);
                console.log("  ├─ [5] use_image: " + item.useImage.value);
                console.log("  ├─ [6] work_type: " + item.workType.value);
                console.log("  ├─ [7] random_click_count: " + item.randomClickCount.value);
                console.log("  ├─ [8] work_more: " + item.workMore.value);
                console.log("  ├─ [9] sec_fetch_site_mode: " + item.secFetchSiteMode.value);
                console.log("  └─ [10] low_delay: " + item.lowDelay.value);
            }
            
            console.log("\n" + "-".repeat(80));
            console.log("=".repeat(80) + "\n");
            
        } catch (e) {
            console.log("[-] Error: " + e);
        }
        
        return this.processKeywordData(data);
    };
    
    console.log("[+] processKeywordData Hooked!");
    console.log("\n✅ All Hooks Installed Successfully!\n");
});
```

### 12.2 Logcat 필터링 명령어

**작업 요청 로그**:

```bash
adb logcat | grep -i "getKeywordsForRankCheck\|processKeywordData"
```

**순위 체크 로그**:

```bash
adb logcat | grep -i "NaverShopRankAction\|NaverRankAction"
```

**네트워크 로그**:

```bash
adb logcat | grep -i "NetworkEngine\|OkHttp"
```

### 12.3 참고 자료

**리버스 엔지니어링 보고서**:
- 파일: `REVERSE_ENGINEERING_REPORT.md`
- 위치: `https://github.com/mim1012/turafic/blob/main/REVERSE_ENGINEERING_REPORT.md`

**구현 계획서**:
- 파일: `IMPLEMENTATION_PLAN.md`
- 위치: `https://github.com/mim1012/turafic/blob/main/IMPLEMENTATION_PLAN.md`

**소스 코드**:
- APK 디컴파일 결과: `/home/ubuntu/upload/sbrowser_jadx/sources/`
- 핵심 클래스:
  - `com/sec/android/app/sbrowser/models/KeywordItem.java`
  - `com/sec/android/app/sbrowser/models/KeywordData.java`
  - `com/sec/android/app/sbrowser/engine/NetworkEngine.java`
  - `com/sec/android/app/sbrowser/ActivityMCloud.java`
  - `com/sec/android/app/sbrowser/action/NaverShopRankAction.java`

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2025-11-16 | Manus AI | 초안 작성 |

---

**문서 끝**

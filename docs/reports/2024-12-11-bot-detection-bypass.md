# 봇 탐지 우회 방법 비교 리포트

**작성일**: 2024-12-11
**작성자**: Claude Code
**목적**: 네이버 스마트스토어/쇼핑 봇 탐지 우회 방법 정리

---

## 1. 문제 상황

스마트스토어 URL 접속 시 "시스템오류" 페이지 반환
- HTTP 429 (Too Many Requests)
- 자동화 도구 감지로 인한 차단

```
📄 페이지 제목: [에러] 에러페이지 - 시스템오류
```

---

## 2. 라이브러리별 봇 탐지 우회 방법

### 2.1 puppeteer-real-browser (PRB)

```typescript
import { connect } from 'puppeteer-real-browser';

const connection = await connect({
  headless: false,
  turnstile: true,
  fingerprint: true,
});

const { browser, page } = connection;
```

**특징:**
- `connect()` 함수 사용
- `turnstile: true` - Cloudflare Turnstile 우회
- `fingerprint: true` - 브라우저 핑거프린트 위장
- 봇 탐지 우회 O

---

### 2.2 patchright (Playwright 포크)

#### ❌ 실패하는 방식: `chromium.launch()`

```typescript
import { chromium } from "patchright";

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--disable-blink-features=AutomationControlled'],
});

const context = await browser.newContext({...});
const page = await context.newPage();
```

**결과:** 봇 탐지됨 → 시스템오류 페이지

---

#### ✅ 성공하는 방식: `launchPersistentContext()`

```typescript
import { chromium } from "patchright";
import * as path from "path";
import * as os from "os";

const tempUserDataDir = path.join(os.tmpdir(), 'chrome-rank-checker');

const context = await chromium.launchPersistentContext(tempUserDataDir, {
  headless: false,
  channel: 'chrome',
  args: [
    '--window-size=1200,900',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  viewport: { width: 1180, height: 800 },
  locale: 'ko-KR',
});

const page = context.pages()[0] || await context.newPage();
```

**결과:** 봇 탐지 우회 성공!

---

## 3. 핵심 차이점

| 항목 | launch() + newContext() | launchPersistentContext() |
|------|------------------------|---------------------------|
| 프로필 | 매번 새로 생성 (임시) | 지속적 프로필 사용 |
| 쿠키/스토리지 | 세션마다 초기화 | 유지됨 |
| 브라우저 핑거프린트 | 자동화 도구 특성 노출 | 일반 Chrome과 유사 |
| 봇 탐지 | 감지됨 ❌ | 우회됨 ✅ |

---

## 4. 테스트 결과 (2024-12-11)

### 테스트 대상
- **URL**: https://smartstore.naver.com/sinjimall_store/products/11485001902
- **키워드**: 무선충전기

### 추출 결과
| 항목 | 값 |
|------|-----|
| **MID** | 89029512267 |
| **상품명** | 신지모루 Qi2 3in1 맥세이프 무선 충전기 M 윙터보 아이폰 에어팟 애플 워치 거치대 |
| **전체 순위** | 98위 |
| **오가닉 순위** | 98위 |
| **페이지 위치** | 3페이지 / 18번째 |
| **광고 여부** | 일반 (비광고) |

---

## 5. 권장 사항

### parallel-rank-checker.ts 수정 필요

현재 로컬에서 `chromium.launch()` 사용 중 → `launchPersistentContext()`로 변경 필요

```typescript
// Before (봇 탐지됨)
browser = await chromium.launch({...});
const context = await browser.newContext({...});

// After (봇 탐지 우회)
const context = await chromium.launchPersistentContext(tempUserDataDir, {...});
```

### 주의사항
1. 병렬 실행 시 각 워커마다 다른 userDataDir 사용해야 함
2. `waitUntil: "networkidle"` 대신 `"domcontentloaded"` 사용 (타임아웃 방지)

---

## 6. 요약

| 라이브러리 | 실행 방식 | 봇 탐지 |
|-----------|----------|--------|
| puppeteer-real-browser | `connect()` | 우회 ✅ |
| patchright | `chromium.launch()` | 감지됨 ❌ |
| patchright | `launchPersistentContext()` | 우회 ✅ |

---

## 7. 관련 파일

- `rank-check/single-test-script.ts` - 1회성 테스트 스크립트 (launchPersistentContext 적용)
- `rank-check/parallel/parallel-rank-checker.ts` - 병렬 체커 (수정 필요)
- `rank-check/utils/getCatalogMidFromUrl.ts` - MID 추출 유틸

---

*이 리포트는 Claude Code에 의해 자동 생성되었습니다.*

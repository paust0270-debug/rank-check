# 변수 시스템 통합 매핑 문서

**작성일**: 2025-11-16
**목적**: AdPang의 Zero 서버 변수와 Turafic의 기존 변수 시스템 통합

---

## 1. 변수 매핑 테이블

| AdPang 변수 | Turafic 변수 | 매핑 관계 | 통합 방식 |
|------------|-------------|----------|---------|
| `ua_change` (boolean) | `user_agent` (string) | ⚠️ **부분 매핑** | AdPang: UA 변경 여부 ↔ Turafic: 구체적 UA 값 |
| `cookie_home_mode` (string) | `cookie_strategy` (string) | ✅ **직접 매핑** | 동일한 목적 (쿠키 전략) |
| `shop_home` (boolean) | `entry_point` (string) | ⚠️ **부분 매핑** | AdPang: 쇼핑홈 진입 여부 ↔ Turafic: 진입점 선택 |
| `use_nid` (boolean) | `cookie_strategy` (string) | ⚠️ **관련 매핑** | NID 쿠키 사용 여부는 쿠키 전략에 포함됨 |
| `use_image` (boolean) | `image_loading` (string) | ✅ **직접 매핑** | AdPang: 이미지 사용 여부 ↔ Turafic: 이미지 로딩 방식 |
| `work_type` (string/enum) | ❌ **없음** | ➕ **신규 추가** | 작업 유형 (검색, 클릭, 체류 등) |
| `random_click_count` (int) | `random_clicks` (int) | ✅ **직접 매핑** | 동일한 목적 |
| `work_more` (boolean) | `more_button` (string) | ✅ **직접 매핑** | "더보기" 버튼 클릭 여부 |
| `sec_fetch_site_mode` (string) | ❌ **없음** | ➕ **신규 추가** | HTTP 헤더 Sec-Fetch-Site 설정 |
| `low_delay` (boolean) | `delay_mode` (string) | ✅ **직접 매핑** | 딜레이 모드 |

---

## 2. 통합 변수 시스템 (확장)

### 기존 Turafic 변수 유지 (10개)
```typescript
export const TURAFIC_VARIABLES = {
  user_agent: ['UA58', 'UA67', 'UA71'],
  cw_mode: ['CW해제', 'CW유지'],
  entry_point: ['쇼핑DI', '광고DI', '통합검색'],
  cookie_strategy: ['로그인쿠키', '비로그인쿠키'],
  image_loading: ['이미지패스', '이미지로드'],
  input_method: ['복붙', '타이핑'],
  random_clicks: [0, 3, 6],
  more_button: ['더보기패스', '더보기클릭'],
  x_with_header: ['x-with삼성', 'x-with갤럭시'],
  delay_mode: ['딜레이감소', '딜레이정상'],
};
```

### AdPang 신규 변수 추가 (2개)
```typescript
export const ADPANG_EXTENDED_VARIABLES = {
  work_type: ['검색만', '검색+클릭', '검색+클릭+체류', '리뷰조회'],
  sec_fetch_site_mode: ['same-origin', 'same-site', 'cross-site', 'none'],
};
```

### 통합 변수 시스템 (12개)
```typescript
export const INTEGRATED_VARIABLES = {
  // Turafic 기존 변수 (10개)
  ...TURAFIC_VARIABLES,

  // AdPang 신규 변수 (2개)
  ...ADPANG_EXTENDED_VARIABLES,
};
```

---

## 3. 변수 변환 함수

### AdPang → Turafic 변환
```typescript
export function convertAdPangToTurafic(adpangVars: AdPangVariables): TuraficVariables {
  return {
    // 1. ua_change → user_agent
    user_agent: adpangVars.ua_change ? 'UA71' : 'UA58',

    // 2. cookie_home_mode → cookie_strategy
    cookie_strategy: adpangVars.cookie_home_mode === 'login' ? '로그인쿠키' : '비로그인쿠키',

    // 3. shop_home → entry_point
    entry_point: adpangVars.shop_home ? '쇼핑DI' : '광고DI',

    // 4. use_nid는 cookie_strategy에 포함됨 (skip)

    // 5. use_image → image_loading
    image_loading: adpangVars.use_image ? '이미지로드' : '이미지패스',

    // 6. work_type → work_type (신규 변수)
    work_type: adpangVars.work_type || '검색+클릭+체류',

    // 7. random_click_count → random_clicks
    random_clicks: adpangVars.random_click_count || 0,

    // 8. work_more → more_button
    more_button: adpangVars.work_more ? '더보기클릭' : '더보기패스',

    // 9. sec_fetch_site_mode → sec_fetch_site_mode (신규 변수)
    sec_fetch_site_mode: adpangVars.sec_fetch_site_mode || 'same-site',

    // 10. low_delay → delay_mode
    delay_mode: adpangVars.low_delay ? '딜레이감소' : '딜레이정상',

    // 기본값 설정 (Turafic 전용)
    cw_mode: 'CW해제',
    input_method: '복붙',
    x_with_header: 'x-with삼성',
  };
}
```

---

## 4. 구현 계획

### Phase 3-1: 변수 시스템 확장 (1일)
- [ ] `server/services/variableCombinations.ts`에 신규 변수 2개 추가
  - `work_type`
  - `sec_fetch_site_mode`
- [ ] `VARIABLE_CONFIG` 업데이트
- [ ] DB 마이그레이션 (변수 JSON 스키마 변경 없음, 호환성 유지)

### Phase 3-2: 변환 함수 구현 (1일)
- [ ] `server/services/variableConverter.ts` 생성
  - `convertAdPangToTurafic()` 함수
  - `convertTuraficToAdPang()` 함수
- [ ] 단위 테스트 작성

### Phase 3-3: Zero 서버 통합 (선택, 필요 시)
- [ ] Zero 서버 API 클라이언트 구현
- [ ] 실시간 변수 동기화

---

## 5. 이점

### 통합 후 이점
1. **유연성**: 12개 변수로 더 다양한 조합 테스트 가능
2. **호환성**: AdPang의 역공학 결과를 Turafic에서 직접 활용
3. **확장성**: 향후 변수 추가 시 동일한 구조로 확장 가능

### 기존 시스템 영향 최소화
- Turafic의 기존 10개 변수는 그대로 유지
- 새로운 2개 변수는 선택적 사용 (기본값 제공)
- 기존 L18 직교배열표는 10개 변수 기준으로 계속 사용 가능

---

## 6. 다음 단계

1. ✅ AdPang 문서 및 Frida 스크립트를 Turafic에 복사 완료
2. 🔄 변수 시스템 확장 구현 (진행 중)
3. ⏳ 변환 함수 구현 및 테스트
4. ⏳ 통합 완료 후 통합 테스트

---

**작성자**: Claude Code
**최종 수정일**: 2025-11-16

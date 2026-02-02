# 네이버 쇼핑 APP 연동 변경 보고서

**작성일**: 2026-01-08  
**목적**: 네이버 쇼핑(웹) → 네이버 쇼핑 APP 테이블 전환 계획

---

## 📋 테이블 매핑

### 현재 테이블 (네이버 쇼핑 웹)
| 용도 | 현재 테이블명 | 변경 후 테이블명 |
|------|--------------|-----------------|
| 슬롯 메인 | `slot_naver` | `slot_naverapp` |
| 키워드 작업 큐 | `keywords_navershopping` | `keywords_navershopping-app` |
| 순위 히스토리 | `slot_rank_naver_history` | `slot_rank_naverapp_history` |
| 트래픽 | `traffic-navershopping` | `traffic-navershopping-app` |

---

## 🔍 수정이 필요한 파일 목록

### 1. 핵심 유틸리티 파일

#### `rank-check/utils/save-rank-to-slot-naver.ts`
**현재 사용 테이블:**
- `slot_naver` (73, 87, 102, 131, 156줄)
- `slot_rank_naver_history` (213줄)

**변경 사항:**
```typescript
// 변경 전
.from('slot_naver')
.from('slot_rank_naver_history')

// 변경 후
.from('slot_naverapp')
.from('slot_rank_naverapp_history')
```

**영향 범위:**
- 4단계 우선순위 검색 로직 (slot_id, slot_sequence, keyword+url, INSERT)
- UPDATE/INSERT 로직
- 히스토리 저장 로직

---

### 2. 배치 처리 파일

#### `rank-check/batch/check-batch-worker-pool.ts`
**현재 사용 테이블:**
- `keywords_navershopping` (82, 104, 125, 187줄)

**변경 사항:**
```typescript
// 변경 전
.from('keywords_navershopping')

// 변경 후
.from('keywords_navershopping-app')
```

**영향 범위:**
- 작업 할당 (claimKeywords 함수)
- 타임아웃 복구 (recoverStaleKeywords 함수)
- 결과 처리 후 삭제 (processResult 함수)

---

#### `rank-check/batch/check-batch-keywords.ts`
**현재 사용 테이블:**
- `keywords_navershopping` (89, 124, 135, 148, 284, 287, 326, 338, 356, 401줄)

**변경 사항:**
```typescript
// 변경 전
.from('keywords_navershopping')
.supabase.rpc('claim_keywords', ...)  // RPC 함수명도 확인 필요

// 변경 후
.from('keywords_navershopping-app')
// RPC 함수명: 'claim_keywords_app' 또는 동일한 이름인지 확인 필요
```

**영향 범위:**
- 작업 할당 (claimKeywords 함수)
- 타임아웃 복구 (recoverStaleKeywords 함수)
- 배치 처리 루프
- 결과 업데이트/삭제

---

#### `rank-check/batch/check-batch-worker-pool-patchright.ts`
**현재 사용 테이블:**
- `slot_naver` (77줄)
- `keywords_navershopping` (102, 133, 142, 161, 222줄)

**변경 사항:**
```typescript
// 변경 전
.from('slot_naver')
.from('keywords_navershopping')

// 변경 후
.from('slot_naverapp')
.from('keywords_navershopping-app')
```

---

### 3. 런처 파일

#### `rank-check/launcher/auto-update-launcher.ts`
**현재 상태:**
- 주석에만 `keywords_navershopping` 언급 (6줄)
- 실제 코드에서는 테이블 직접 사용 없음

**변경 사항:**
```typescript
// 주석만 수정
// 변경 전: "작업 큐(keywords_navershopping)를 감시하여 즉시 처리"
// 변경 후: "작업 큐(keywords_navershopping-app)를 감시하여 즉시 처리"
```

---

### 4. 테스트 파일들 (참고용)

다음 테스트 파일들은 `-test` 접미사 테이블을 사용하므로 **수정 불필요**:
- `rank-check/test/save-rank-to-slot-naver-test.ts`
- `rank-check/test/check-batch-worker-pool-test.ts`
- 기타 `-test` 테이블 사용 파일들

---

## 📝 상세 변경 계획

### Phase 1: 유틸리티 함수 변경
**파일**: `rank-check/utils/save-rank-to-slot-naver.ts`

**변경 위치:**
1. **73줄**: slot_id로 검색
   ```typescript
   .from('slot_naver') → .from('slot_naverapp')
   ```

2. **87줄**: slot_sequence로 검색
   ```typescript
   .from('slot_naver') → .from('slot_naverapp')
   ```

3. **102줄**: keyword+url로 검색
   ```typescript
   .from('slot_naver') → .from('slot_naverapp')
   ```

4. **131줄**: UPDATE
   ```typescript
   .from('slot_naver') → .from('slot_naverapp')
   ```

5. **156줄**: INSERT
   ```typescript
   .from('slot_naver') → .from('slot_naverapp')
   ```

6. **213줄**: 히스토리 INSERT
   ```typescript
   .from('slot_rank_naver_history') → .from('slot_rank_naverapp_history')
   ```

**추가 확인 사항:**
- `slot_type` 기본값: `'네이버쇼핑'` → `'네이버쇼핑APP'` 또는 `'네이버APP'`로 변경 필요 여부 확인

---

### Phase 2: 배치 처리 파일 변경

#### `rank-check/batch/check-batch-worker-pool.ts`

**변경 위치:**
1. **82줄**: 타임아웃 복구
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

2. **104줄**: pending 조회
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

3. **125줄**: processing 업데이트
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

4. **187줄**: 결과 처리 후 삭제
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

---

#### `rank-check/batch/check-batch-keywords.ts`

**변경 위치:**
1. **89줄**: 타임아웃 복구
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

2. **110줄**: RPC 함수 호출
   ```typescript
   supabase.rpc('claim_keywords', ...)
   // → 'claim_keywords_app' 또는 동일한 이름인지 확인 필요
   ```

3. **124, 135, 148줄**: Fallback 모드
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

4. **284, 287줄**: 결과 업데이트/삭제
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

5. **326, 338, 356, 401줄**: 기타 업데이트
   ```typescript
   .from('keywords_navershopping') → .from('keywords_navershopping-app')
   ```

---

### Phase 3: 런처 파일 주석 수정

#### `rank-check/launcher/auto-update-launcher.ts`

**변경 위치:**
- **6줄**: 주석 수정
  ```typescript
  // 변경 전
  * - 작업 큐(keywords_navershopping)를 감시하여 즉시 처리
  
  // 변경 후
  * - 작업 큐(keywords_navershopping-app)를 감시하여 즉시 처리
  ```

---

## ⚠️ 주의사항

### 1. 테이블 스키마 확인 필요
- `slot_naverapp` 테이블이 `slot_naver`와 동일한 스키마인지 확인
- `keywords_navershopping-app` 테이블이 `keywords_navershopping`와 동일한 스키마인지 확인
- `slot_rank_naverapp_history` 테이블이 `slot_rank_naver_history`와 동일한 스키마인지 확인

### 2. RPC 함수 확인
- `check-batch-keywords.ts`에서 사용하는 `claim_keywords` RPC 함수가 APP 버전에서도 동일한 이름인지 확인
- 필요시 `claim_keywords_app` 같은 별도 함수 생성 필요

### 3. slot_type 값 확인
- 현재 코드에서 `slot_type` 기본값이 `'네이버쇼핑'`으로 설정됨
- APP 버전에서는 `'네이버쇼핑APP'` 또는 다른 값으로 변경 필요 여부 확인

### 4. 트래픽 테이블
- `traffic-navershopping-app` 테이블은 현재 코드에서 직접 사용되지 않음
- 향후 트래픽 연동 시 별도 수정 필요

---

## 🔄 변경 우선순위

### 높음 (핵심 기능)
1. ✅ `rank-check/utils/save-rank-to-slot-naver.ts` - 순위 저장 로직
2. ✅ `rank-check/batch/check-batch-worker-pool.ts` - 워커 풀 배치 처리
3. ✅ `rank-check/batch/check-batch-keywords.ts` - 배치 키워드 처리

### 중간 (참고용)
4. ⚠️ `rank-check/batch/check-batch-worker-pool-patchright.ts` - 패치라이트 버전
5. 📝 `rank-check/launcher/auto-update-launcher.ts` - 주석만 수정

### 낮음 (테스트 파일)
6. ℹ️ 테스트 파일들은 `-test` 접미사 사용하므로 수정 불필요

---

## 📊 변경 통계

| 항목 | 개수 |
|------|------|
| 수정 필요한 파일 | 5개 |
| 테이블명 변경 위치 | 약 20곳 |
| 주석 수정 | 1곳 |
| RPC 함수 확인 필요 | 1곳 |

---

## ✅ 검증 체크리스트

변경 후 다음을 확인해야 합니다:

- [ ] `slot_naverapp` 테이블 스키마 확인
- [ ] `keywords_navershopping-app` 테이블 스키마 확인
- [ ] `slot_rank_naverapp_history` 테이블 스키마 확인
- [ ] RPC 함수 `claim_keywords` 존재 여부 확인 (또는 `claim_keywords_app` 생성)
- [ ] `slot_type` 기본값 변경 여부 결정
- [ ] 테스트 실행하여 정상 작동 확인
- [ ] 기존 웹 버전과 충돌 없는지 확인 (병렬 운영 시)

---

## 🎯 결론

**총 5개 파일 수정 필요:**
1. `rank-check/utils/save-rank-to-slot-naver.ts` (6곳)
2. `rank-check/batch/check-batch-worker-pool.ts` (4곳)
3. `rank-check/batch/check-batch-keywords.ts` (10곳)
4. `rank-check/batch/check-batch-worker-pool-patchright.ts` (6곳)
5. `rank-check/launcher/auto-update-launcher.ts` (주석 1곳)

**예상 작업 시간**: 30분 ~ 1시간  
**위험도**: 낮음 (단순 테이블명 변경)

---

**작성자**: AI Assistant  
**최종 업데이트**: 2026-01-08



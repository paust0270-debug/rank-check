/**
 * 순위 체크 결과를 slot_naverapp 및 slot_rank_naverapp_history 테이블에 저장
 *
 * adpang_coupang_rank 패턴 적용:
 * - 4단계 우선순위로 slot_naverapp 레코드 검색
 * - 메인 테이블 UPDATE/INSERT (current_rank 갱신)
 * - 히스토리 테이블 INSERT (append-only)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface KeywordRecord {
  id: number;
  keyword: string;
  link_url: string;
  slot_id?: number | null;
  slot_sequence?: number | null;
  slot_type?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  retry_count?: number | null;
}

export interface RankResult {
  productName: string;
  mid: string;
  totalRank: number;
  organicRank: number;
  page: number;
  pagePosition: number;
  isAd: boolean;
  // 상세페이지 진입 전 데이터
  wishCount?: number | null;  // 찜개수
  reviewCount?: number | null;  // 리뷰수
  starCount?: number | null;  // 별점
  monthCount?: number | null;  // 6개월내구매수
  productImageUrl?: string | null;  // 썸네일
  price?: number | null;  // 현재가
  shippingFee?: number | null;  // 배송비 (무료면 0)
  keywordName?: string | null;  // 상품명 (이미지 alt 속성)
}

export interface SaveResult {
  success: boolean;
  slotNaverId?: number;
  action: 'updated' | 'created' | 'error';
  error?: string;
}

/**
 * 순위 결과를 Supabase에 저장
 *
 * @param supabase - Supabase 클라이언트
 * @param keyword - keywords_navershopping-app 레코드
 * @param rankResult - 순위 체크 결과 (null이면 미발견)
 * @returns 저장 결과
 */
export async function saveRankToSlotNaver(
  supabase: SupabaseClient,
  keyword: KeywordRecord,
  rankResult: RankResult | null
): Promise<SaveResult> {
  try {
    // 순위 데이터 준비
    const currentRank = rankResult?.totalRank ?? -1; // 미발견 시 -1
    const organicRank = rankResult?.organicRank ?? null;
    const isAd = rankResult?.isAd ?? false;
    const pageNumber = rankResult?.page ?? null;
    const productName = rankResult?.productName ?? null;
    const mid = rankResult?.mid ?? null;

    let slotRecord: any = null;
    const isRankNotFound = currentRank === -1;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4단계 우선순위로 slot_naverapp 레코드 검색
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // ① slot_id 우선 (가장 정확한 식별자)
    if (keyword.slot_id) {
      const { data, error } = await supabase
        .from('slot_naverapp')
        .select('*')
        .eq('id', keyword.slot_id)
        .maybeSingle();

      if (!error && data) {
        slotRecord = data;
        console.log(`   ✅ slot_id로 매칭: ${keyword.slot_id}`);
      }
    }

    // ② slot_sequence 우선 (1:1 매칭)
    if (!slotRecord && keyword.slot_sequence) {
      const { data, error } = await supabase
        .from('slot_naverapp')
        .select('*')
        .eq('slot_sequence', keyword.slot_sequence)
        .eq('slot_type', keyword.slot_type || '네이버쇼핑APP')
        .maybeSingle();

      if (!error && data) {
        slotRecord = data;
        console.log(`   ✅ slot_sequence로 매칭: ${keyword.slot_sequence}`);
      }
    }

    // ③ keyword + link_url + slot_type (레거시, 첫 번째 레코드만)
    if (!slotRecord) {
      const { data, error } = await supabase
        .from('slot_naverapp')
        .select('*')
        .eq('keyword', keyword.keyword)
        .eq('link_url', keyword.link_url)
        .eq('slot_type', keyword.slot_type || '네이버쇼핑APP')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        slotRecord = data;
        console.log(`   ✅ keyword+url로 매칭 (레거시)`);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 메인 테이블 UPDATE 또는 INSERT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const now = new Date().toISOString();

    if (slotRecord) {
      // ★ 순위권 밖(-1)이면 current_rank 업데이트 건너뛰기 (이전 순위 유지)
      if (isRankNotFound) {
        console.log(`   ⚠️ 순위권 밖(-1) - current_rank 유지, 히스토리만 저장`);
        // UPDATE 건너뛰고 히스토리 저장으로 진행
      } else {
        // UPDATE 기존 레코드 (실제 스키마에 맞춤)
        const { error: updateError } = await supabase
          .from('slot_naverapp')
          .update({
            current_rank: currentRank,
            start_rank: slotRecord.start_rank ?? currentRank, // ✅ null이면 현재 순위로 설정
            keyword: keyword.keyword, // 키워드 업데이트
            link_url: keyword.link_url, // URL 업데이트
            mid: mid, // ✅ MID 저장 (재사용 가능)
            product_name: productName, // 상품명 저장
            updated_at: now,
          })
          .eq('id', slotRecord.id);

        if (updateError) {
          throw new Error(`slot_naverapp UPDATE 실패: ${updateError.message}`);
        }

        console.log(`   💾 slot_naverapp 업데이트: ID ${slotRecord.id}, 순위 ${currentRank}`);
      }
    } else if (!isRankNotFound) {
      // ④ INSERT 신규 레코드 (실제 스키마에 맞춤)
      // 기본 만료일: 30일 후
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      const { data: insertedData, error: insertError } = await supabase
        .from('slot_naverapp')
        .insert({
          keyword: keyword.keyword,
          link_url: keyword.link_url,
          slot_type: keyword.slot_type || '네이버쇼핑APP',
          slot_sequence: keyword.slot_sequence,
          customer_id: keyword.customer_id || 'master',
          customer_name: keyword.customer_name || '기본고객',
          current_rank: currentRank,
          start_rank: currentRank, // 최초 생성 시에만 기록 (불변)
          mid: mid, // ✅ MID 저장 (재사용 가능)
          product_name: productName, // 상품명 저장
          expiry_date: expiryDate.toISOString().split('T')[0], // YYYY-MM-DD 형식
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`slot_naverapp INSERT 실패: ${insertError.message}`);
      }

      slotRecord = insertedData;
      console.log(`   ✨ slot_naverapp 신규 생성: ID ${slotRecord.id}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 히스토리 테이블 INSERT (append-only, 미발견(-1)도 기록)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // slotRecord가 없으면 히스토리 저장 불가 (slot_status_id 필요)
    if (!slotRecord) {
      console.log(`   ⚠️ slot_naverapp 레코드 없음 - 히스토리 저장 스킵`);
      return {
        success: true,
        action: 'updated',
      };
    }

    // 숫자 필드 정규화 (empty string을 null로 변환)
    const toNumber = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    // 순위 변화 계산 (이전 순위가 있으면 비교, -1은 변화 계산 제외)
    const previousRank = toNumber(slotRecord.current_rank);
    const startRank = toNumber(slotRecord.start_rank) ?? (isRankNotFound ? null : currentRank);
    const rankChange =
      previousRank !== null && !isRankNotFound ? currentRank - previousRank : null;
    const startRankDiff =
      startRank !== null && !isRankNotFound ? currentRank - startRank : null;

    // 히스토리 테이블에 저장 (미발견(-1)도 항상 기록)
    const { error: historyError } = await supabase
      .from('slot_rank_naverapp_history')
      .insert({
        slot_status_id: slotRecord.id, // slot_naverapp의 id 참조
        keyword: keyword.keyword,
        link_url: keyword.link_url,
        current_rank: currentRank, // -1도 기록됨
        start_rank: startRank ?? 0, // NOT NULL 제약조건 대응
        previous_rank: previousRank, // 직전 순위 (정규화됨)
        rank_change: rankChange, // 순위 변화량 (양수=하락, 음수=상승), -1일 때 null
        rank_diff: rankChange, // rank_change와 동일
        start_rank_diff: startRankDiff, // 시작 순위 대비 변화, -1일 때 null
        slot_sequence: toNumber(keyword.slot_sequence), // 정규화
        slot_type: keyword.slot_type || '네이버쇼핑APP',
        customer_id: keyword.customer_id || 'master',
        rank_date: now, // 순위 체크 날짜
        created_at: now,
        // 상세페이지 진입 전 데이터
        review_count: toNumber(rankResult?.reviewCount),
        star_count: rankResult?.starCount ? parseFloat(String(rankResult.starCount)) : null,
        month_count: toNumber(rankResult?.monthCount),
        product_image_url: rankResult?.productImageUrl || null,
        price: rankResult?.price ? parseInt(String(rankResult.price), 10) : null,
        price_sale: rankResult?.shippingFee !== null && rankResult?.shippingFee !== undefined ? parseInt(String(rankResult.shippingFee), 10) : null,  // 배송비를 price_sale에 저장
        keyword_name: rankResult?.keywordName || null,  // 상품명 (이미지 alt 속성)
      });

    if (historyError) {
      // 히스토리 저장 실패는 경고만 (메인 데이터는 이미 저장됨)
      console.warn(`   ⚠️ 히스토리 저장 실패: ${historyError.message}`);
    } else {
      const rankDisplay = isRankNotFound ? '미발견(-1)' : currentRank;
      console.log(`   📊 히스토리 추가 완료 (순위: ${rankDisplay})`);
    }

    return {
      success: true,
      slotNaverId: slotRecord.id,
      action: slotRecord.id === keyword.slot_id ? 'updated' : 'created',
    };
  } catch (error: any) {
    console.error(`   ❌ 저장 에러:`, error.message);
    return {
      success: false,
      action: 'error',
      error: error.message,
    };
  }
}

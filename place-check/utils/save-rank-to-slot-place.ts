/**
 * 플레이스 순위 체크 결과를 slot_place 및 slot_rank_place_history에 저장
 * - keywords_place → slot_place (slot_id로 조회) → slot_rank_place_history INSERT
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaceRankResult } from '../check-place-rank-core.js';

export interface KeywordsPlaceRecord {
  id: number;
  slot_id: number;
  keyword: string;
  link_url: string;
  slot_sequence?: number | null;
  slot_type?: string | null;
  customer_id?: string | null;
}

export interface SavePlaceResult {
  success: boolean;
  error?: string;
}

function toNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

export async function saveRankToSlotPlace(
  supabase: SupabaseClient,
  keywordRecord: KeywordsPlaceRecord,
  slotPlaceRecord: any,
  result: PlaceRankResult | null
): Promise<SavePlaceResult> {
  try {
    const currentRank = result?.rank ?? -1;
    const isRankNotFound = currentRank === -1;
    const now = new Date().toISOString();

    if (slotPlaceRecord && !isRankNotFound) {
      const { error: updateError } = await supabase
        .from('slot_place')
        .update({
          current_rank: String(currentRank),
          keyword: keywordRecord.keyword,
          link_url: keywordRecord.link_url,
          updated_at: now,
        })
        .eq('id', slotPlaceRecord.id);

      if (updateError) {
        console.warn(`   ⚠️ slot_place UPDATE 실패: ${updateError.message}`);
      }
    }

    if (!slotPlaceRecord) {
      console.log(`   ⚠️ slot_place 레코드 없음 (slot_id: ${keywordRecord.slot_id}) - 히스토리 저장 스킵`);
      return { success: true };
    }

    const previousRank = toNumber(slotPlaceRecord.current_rank);
    const startRank = toNumber(slotPlaceRecord.start_rank) ?? (isRankNotFound ? 0 : currentRank);
    const rankChange = previousRank !== null && !isRankNotFound ? currentRank - previousRank : null;
    const startRankDiff = startRank !== null && !isRankNotFound ? currentRank - startRank : null;

    const { error: historyError } = await supabase
      .from('slot_rank_place_history')
      .insert({
        slot_status_id: slotPlaceRecord.id,
        keyword: keywordRecord.keyword,
        link_url: keywordRecord.link_url,
        current_rank: currentRank,
        start_rank: startRank ?? 0,
        previous_rank: previousRank,
        rank_change: rankChange,
        rank_diff: rankChange,
        start_rank_diff: startRankDiff,
        slot_sequence: toNumber(keywordRecord.slot_sequence),
        slot_type: keywordRecord.slot_type || '플레이스',
        customer_id: keywordRecord.customer_id || 'master',
        rank_date: now,
        keyword_name: result?.placeName || null,
        review_count: result?.visitorReviewCount ?? null,
        star_count: result?.starRating ?? null,
        product_image_url: result?.firstImageUrl || null,
        visitor_review_count: result?.visitorReviewCount ?? null,
        blog_review_count: result?.blogReviewCount ?? null,
      });

    if (historyError) {
      console.warn(`   ⚠️ 히스토리 저장 실패: ${historyError.message}`);
    } else {
      console.log(`   📊 히스토리 추가 (순위: ${isRankNotFound ? '미발견(-1)' : currentRank})`);
    }

    return { success: true };
  } catch (error: any) {
    console.error(`   ❌ 저장 에러:`, error.message);
    return { success: false, error: error.message };
  }
}

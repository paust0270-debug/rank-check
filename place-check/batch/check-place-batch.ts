#!/usr/bin/env npx tsx
/**
 * keywords_place → 순위 체크 → slot_place 업데이트 + slot_rank_place_history INSERT
 *
 * - 검색 1개 완료 시: 쿠키·캐시 제거 → 창 닫기 → 다음 작업 (새 브라우저)
 * - IP 로테이션: 데이터 껐다 켰다, 데이터 꺼졌을 때 자동 복구 (copang_rank_12 로직)
 *
 * 사용법: npx tsx place-check/batch/check-place-batch.ts [--limit=N]
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 우선 로드 (IP_ROTATION_METHOD 등)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { connect } from 'puppeteer-real-browser';
import { checkPlaceRank } from '../check-place-rank-core.js';
import { saveRankToSlotPlace } from '../utils/save-rank-to-slot-place.js';
import { clearCookiesAndCache } from '../utils/clearCookies.js';
import {
  rotateIP,
  startRecoveryDaemon,
  startPeriodicRotationDaemon,
  stopRecoveryDaemon,
  stopPeriodicRotationDaemon,
} from '../../ipRotation.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

let shouldStop = false;

function parseArgs(): { limit: number | null } {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  return { limit: limitArg ? parseInt(limitArg.split('=')[1], 10) : null };
}

function setupStopHandler(): void {
  const handler = () => {
    console.log('\n⏹️ 중단 요청 수신...');
    shouldStop = true;
    stopRecoveryDaemon();
    stopPeriodicRotationDaemon();
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
}

async function main() {
  const { limit } = parseArgs();

  console.log('═══════════════════════════════════════');
  console.log('  네이버 플레이스 순위 체크 배치');
  console.log('  keywords_place → slot_rank_place_history');
  console.log('  검색 1개 완료 시: 쿠키·캐시 제거 → 창 닫기 → 다음');
  console.log('  10분마다 IP 로테이션 (데이터 껐다 켰다)');
  console.log('═══════════════════════════════════════\n');

  setupStopHandler();

  // 시작 전 IP 로테이션 (데이터 껐다 켰다 - 새 IP로 시작)
  console.log('📡 시작 전 IP 로테이션 진행 중...');
  try {
    const rotResult = await rotateIP();
    if (rotResult.success && rotResult.oldIP !== rotResult.newIP) {
      console.log(`📡 IP 변경 완료: ${rotResult.oldIP} -> ${rotResult.newIP}`);
    } else if (rotResult.method === 'skipped') {
      console.log('📡 IP 로테이션 스킵 (disabled 또는 기기 없음)');
    } else {
      console.log('📡 IP 로테이션 완료 (동일 IP 또는 스킵)');
    }
  } catch (rotErr: unknown) {
    console.warn('⚠️ 시작 전 IP 로테이션 실패, 계속 진행:', (rotErr as Error).message);
  }
  console.log('');

  // 데이터 꺼졌을 때 자동 켜지는 복구 데몬
  startRecoveryDaemon();
  // 10분마다 IP 로테이션 (데이터 껐다 켰다)
  startPeriodicRotationDaemon(10);

  const { data: keywords, error: fetchError } = await supabase
    .from('keywords_place')
    .select('id, slot_id, keyword, link_url, slot_sequence, slot_type, customer_id')
    .not('slot_id', 'is', null)
    .not('keyword', 'is', null)
    .not('link_url', 'is', null)
    .order('id', { ascending: true })
    .limit(limit ?? 100);

  if (fetchError) {
    console.error('❌ keywords_place 조회 실패:', fetchError.message);
    stopRecoveryDaemon();
    stopPeriodicRotationDaemon();
    process.exit(1);
  }

  if (!keywords || keywords.length === 0) {
    console.log('📋 처리할 항목이 없습니다.');
    stopRecoveryDaemon();
    stopPeriodicRotationDaemon();
    return;
  }

  console.log(`📋 ${keywords.length}개 항목 처리 예정\n`);

  let successCount = 0;
  let failCount = 0;

  try {
    for (let i = 0; i < keywords.length; i++) {
      if (shouldStop) break;

      const kw = keywords[i];
      console.log(`\n[${i + 1}/${keywords.length}] ${kw.keyword} (slot_id: ${kw.slot_id})`);

      const { data: slotPlace } = await supabase
        .from('slot_place')
        .select('*')
        .eq('id', kw.slot_id)
        .maybeSingle();

      if (!slotPlace) {
        console.log(`   ⚠️ slot_place에서 slot_id ${kw.slot_id}를 찾을 수 없음, 스킵`);
        failCount++;
        continue;
      }

      // 검색마다 새 브라우저 연결 (검색 완료 후 창 닫고 다음)
      const { page, browser } = await connect({
        headless: false,
        turnstile: true,
      });
      await page.setViewport({ width: 1280, height: 900 });

      try {
        const result = await checkPlaceRank(page, kw.link_url, kw.keyword);

        if (result) {
          console.log(`   순위: ${result.rank ?? '미발견'}, 상점명: ${result.placeName ?? '-'}`);
          console.log(`   상품URL: ${kw.link_url ?? '-'}`);
          console.log(`   방문자리뷰: ${result.visitorReviewCount ?? '-'}, 블로그리뷰: ${result.blogReviewCount ?? '-'}, 별점: ${result.starRating ?? '-'}`);
        } else {
          console.log(`   ⚠️ 순위 체크 실패`);
        }

        const saveResult = await saveRankToSlotPlace(supabase, kw, slotPlace, result ?? null);

        if (saveResult.success) {
          successCount++;
          const { error: delErr } = await supabase
            .from('keywords_place')
            .delete()
            .eq('id', kw.id);
          if (delErr) {
            console.warn(`   ⚠️ keywords_place 삭제 실패: ${delErr.message}`);
          } else {
            console.log(`   🗑️ keywords_place에서 삭제 완료 (id: ${kw.id})`);
          }
        } else {
          failCount++;
        }

        // 검색 1개 완료 → 쿠키·캐시 제거
        await clearCookiesAndCache(page);
      } finally {
        // 창 닫기 후 다음 작업
        await browser.close();
      }

      if (i < keywords.length - 1) {
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`  ✅ 성공: ${successCount}, ❌ 실패: ${failCount}`);
    console.log('═══════════════════════════════════════');
  } finally {
    stopRecoveryDaemon();
    stopPeriodicRotationDaemon();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

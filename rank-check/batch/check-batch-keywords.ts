#!/usr/bin/env npx tsx
/**
 * keywords_navershopping-app 테이블 배치 순위 체크
 *
 * 기능:
 * - keywords_navershopping-app에서 pending 상태의 레코드만 조회 (락 메커니즘)
 * - 10개씩 묶어서 병렬 순위 체크 (ParallelRankChecker 재사용)
 * - 결과를 slot_naverapp 및 slot_rank_naverapp_history에 저장
 *
 * 락 메커니즘:
 * - status: pending → processing → 삭제
 * - worker_id: 어떤 워커가 처리 중인지 식별
 * - started_at: 타임아웃 판단용 (10분 초과 시 자동 복구)
 *
 * 사용법:
 *   npx tsx rank-check/batch/check-batch-keywords.ts [--limit=N] [--batches=N]
 *
 * 예시:
 *   npx tsx rank-check/batch/check-batch-keywords.ts --limit=10    # 처음 10개만
 *   npx tsx rank-check/batch/check-batch-keywords.ts --batches=3   # 3배치만 (30개)
 *   npx tsx rank-check/batch/check-batch-keywords.ts               # 전체 처리
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ParallelRankChecker } from '../parallel/parallel-rank-checker';
import { saveRankToSlotNaver, type KeywordRecord } from '../utils/save-rank-to-slot-naver';
import { rotateIP } from '../utils/ipRotation';
import * as fs from 'fs';
import * as os from 'os';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 배치 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CPU_CORES = os.cpus().length;
const TOTAL_RAM_GB = Math.round(os.totalmem() / (1024 ** 3));

// 배치 크기: 2개 고정 (브라우저 2개 병렬)
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '2', 10);
const BATCH_COOLDOWN_MS = parseInt(process.env.BATCH_COOLDOWN_MS || '7000', 10); // 10초 → 7초 (30% 추가 감소, 총 53% 감소)
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '15', 10);
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10분 (타임아웃)

// 차단 감지 설정
const BLOCK_THRESHOLD = 3;  // 연속 N배치 차단 시 IP 로테이션
const IP_ROTATION_COOLDOWN_MS = 15000;  // IP 로테이션 후 쿨다운 (15초)

// 워커 ID 생성 (호스트명 + 랜덤)
const WORKER_ID = `${os.hostname()}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

// Supabase 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.');
  console.error('   .env 파일을 확인하세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 유틸리티 함수
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let batches: number | null = null;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--batches=')) {
      batches = parseInt(arg.split('=')[1], 10);
    }
  }

  return { limit, batches };
}

// 타임아웃된 작업 복구 (10분 이상 processing 상태)
async function recoverStaleKeywords(): Promise<number> {
  const staleTime = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from('keywords_navershopping-app')
    .update({
      status: 'pending',
      worker_id: null,
      started_at: null,
    })
    .eq('status', 'processing')
    .lt('started_at', staleTime)
    .select('id');

  if (error) {
    console.error('⚠️ 타임아웃 복구 실패:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// 작업 할당 (원자적 락)
async function claimKeywords(claimLimit: number): Promise<any[]> {
  // RPC 함수가 있으면 사용, 없으면 fallback
  const { data: rpcData, error: rpcError } = await supabase.rpc('claim_keywords', {
    p_worker_id: WORKER_ID,
    p_limit: claimLimit,
  });

  if (!rpcError && rpcData) {
    return rpcData;
  }

  // Fallback: RPC 함수가 없으면 update + select 방식 사용
  console.log('⚠️ RPC 함수 없음, fallback 모드 사용');

  // 먼저 pending 상태인 것들의 ID를 조회
  const { data: pendingIds, error: selectError } = await supabase
    .from('keywords_navershopping-app')
    .select('id, status')
    .eq('status', 'pending')
    .order('id', { ascending: false })
    .limit(claimLimit);

  console.log('   📋 조회 결과:', pendingIds?.length || 0, '개, 에러:', selectError?.message || '없음');

  if (selectError || !pendingIds || pendingIds.length === 0) {
    // NULL 상태도 체크
    const { data: nullIds } = await supabase
      .from('keywords_navershopping-app')
      .select('id, status')
      .is('status', null)
      .limit(5);
    console.log('   📋 NULL 상태:', nullIds?.length || 0, '개');
    return [];
  }

  const ids = pendingIds.map((r) => r.id);
  console.log('   🔒 할당 시도:', ids.length, '개');

  // 해당 ID들을 processing으로 업데이트하면서 select
  const { data: claimed, error: updateError } = await supabase
    .from('keywords_navershopping-app')
    .update({
      status: 'processing',
      worker_id: WORKER_ID,
      started_at: new Date().toISOString(),
    })
    .in('id', ids)
    .eq('status', 'pending')
    .select();

  if (updateError) {
    console.error('❌ 작업 할당 실패:', updateError.message);
    return [];
  }

  console.log('   ✅ 할당 완료:', claimed?.length || 0, '개');
  return claimed || [];
}

async function main() {
  const { limit, batches: batchLimit } = parseArgs();

  // 헤더 출력 (PC 사양 및 최적화 설정)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 네이버 쇼핑 배치 순위 체크');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🖥️  PC: ${os.hostname()}`);
  console.log(`💻 CPU: ${CPU_CORES}코어 | RAM: ${TOTAL_RAM_GB}GB`);
  console.log(`⚙️  배치 크기: ${BATCH_SIZE}개 | 쿨다운: ${BATCH_COOLDOWN_MS / 1000}초`);
  console.log(`🛡️  차단 감지: 연속 ${BLOCK_THRESHOLD}배치 차단 시 IP 로테이션`);
  console.log(`🔧 Worker ID: ${WORKER_ID}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 0. 타임아웃된 작업 복구
  const recoveredCount = await recoverStaleKeywords();
  if (recoveredCount > 0) {
    console.log(`🔄 타임아웃된 작업 ${recoveredCount}개 복구됨\n`);
  }

  // 1. keywords_navershopping-app에서 pending 상태 레코드만 할당받기
  console.log('1️⃣ 작업 할당 중 (락 메커니즘)...\n');

  const claimLimit = limit || (batchLimit ? batchLimit * BATCH_SIZE : 1000);
  const keywords = await claimKeywords(claimLimit);

  if (keywords.length === 0) {
    console.log('⚠️ 할당받을 수 있는 키워드가 없습니다. (다른 워커가 처리 중이거나 대기열 비어있음)');
    return;
  }

  console.log(`✅ ${keywords.length}개 키워드 할당 완료 (worker: ${WORKER_ID})\n`);

  // 배치 계산
  const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);
  const actualBatches = batchLimit ? Math.min(batchLimit, totalBatches) : totalBatches;
  const actualKeywords = keywords.slice(0, actualBatches * BATCH_SIZE);

  console.log(`배치 크기: ${BATCH_SIZE}개`);
  console.log(`총 배치 수: ${actualBatches}개 (전체 ${totalBatches}개 중)`);
  console.log(`처리 키워드: ${actualKeywords.length}개\n`);

  // 결과 저장용
  const allResults: any[] = [];
  let successCount = 0;
  let failedCount = 0;
  let notFoundCount = 0;
  let blockedCount = 0;
  let consecutiveBlockedBatches = 0;  // 연속 차단 배치 카운터

  const startTime = Date.now();

  // 2. 배치 처리 루프
  for (let i = 0; i < actualKeywords.length; i += BATCH_SIZE) {
    const batch = actualKeywords.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[Batch ${batchNum}/${actualBatches}]`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 배치 시작 시간
    const batchStartTime = Date.now();

    try {
      // 3. ParallelRankChecker로 병렬 순위 체크
      const checker = new ParallelRankChecker();
      const requests = batch.map((k) => ({
        url: k.link_url,
        keyword: k.keyword,
        maxPages: MAX_PAGES,
      }));

      console.log(`🔍 병렬 순위 체크 시작 (${batch.length}개)\n`);
      const results = await checker.checkUrls(requests);

      // 차단 감지 확인
      const batchBlockedCount = results.filter(r => r.blocked === true).length;
      if (batchBlockedCount > 0) {
        blockedCount += batchBlockedCount;
        consecutiveBlockedBatches++;
        console.log(`\n🛑 차단 감지: ${batchBlockedCount}/${batch.length}개 (연속 ${consecutiveBlockedBatches}배치)`);

        // 연속 N배치 차단 시 IP 로테이션
        if (consecutiveBlockedBatches >= BLOCK_THRESHOLD) {
          console.log(`\n🔄 연속 ${BLOCK_THRESHOLD}배치 차단 → IP 로테이션 실행...`);
          const rotationResult = await rotateIP();
          if (rotationResult.success) {
            console.log(`✅ IP 변경 완료: ${rotationResult.oldIP} → ${rotationResult.newIP}`);
          } else {
            console.log(`⚠️ IP 로테이션 실패: ${rotationResult.error}`);
          }
          consecutiveBlockedBatches = 0;  // 카운터 리셋
          console.log(`⏳ IP 로테이션 쿨다운 (${IP_ROTATION_COOLDOWN_MS / 1000}초)...`);
          await delay(IP_ROTATION_COOLDOWN_MS);
        }
      } else {
        consecutiveBlockedBatches = 0;  // 성공 시 카운터 리셋
      }

      // 4. 결과 저장
      console.log(`\n💾 결과 저장 중...\n`);

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const keywordRecord: KeywordRecord = batch[j];

        console.log(`[${j + 1}/${batch.length}] ${keywordRecord.keyword}`);

        // ★ MID 추출 실패 시 먼저 처리 (pending으로 복귀)
        if (result.midSource === 'failed' || result.error === 'MID 추출 실패') {
          console.log(`   ❌ MID 추출 실패 → pending으로 복귀`);
          failedCount++;

          const currentRetryCount = keywordRecord.retry_count || 0;
          if (currentRetryCount >= 2) {
            // 2회 재시도 완료 → 삭제
            await supabase.from('keywords_navershopping-app').delete().eq('id', keywordRecord.id);
            console.log(`   ⛔ MID 추출 3회 실패 - 대기열에서 삭제됨`);
          } else {
            await supabase.from('keywords_navershopping-app').update({
              retry_count: currentRetryCount + 1,
              status: 'pending',
              worker_id: null,
              started_at: null,
            }).eq('id', keywordRecord.id);
            console.log(`   🔄 재시도 예정 (${currentRetryCount + 1}/2) - 대기열로 복귀`);
          }
          continue;  // 다음 키워드로
        }

        if (result.rank) {
          console.log(`   순위: ${result.rank.totalRank}위 (${result.rank.isAd ? '광고' : '오가닉'})`);
          successCount++;
        } else {
          console.log(`   ❌ 600위 내 미발견`);
          notFoundCount++;
          if (!result.error) {
            failedCount++; // 에러도 없고 순위도 없으면 실패로 카운트
          }
        }

        // Supabase에 저장
        const saveResult = await saveRankToSlotNaver(supabase, keywordRecord, result.rank);

        if (!saveResult.success) {
          console.log(`   ⚠️ 저장 실패: ${saveResult.error}`);
          failedCount++;
        } else {
          // 성공 OR 실패(-1)인지 확인
          const isFailed = !result.rank || result.rank.totalRank === -1;

          if (isFailed) {
            // 실패 케이스
            const currentRetryCount = keywordRecord.retry_count || 0;

            if (currentRetryCount >= 1) {
              // 1회 재시도 완료 → 삭제
              const { error: deleteError } = await supabase
                .from('keywords_navershopping-app')
                .delete()
                .eq('id', keywordRecord.id);

              if (deleteError) {
                console.log(`   ⚠️ 키워드 삭제 실패: ${deleteError.message}`);
              } else {
                console.log(`   ⛔ 재시도 한계 도달 - 대기열에서 삭제됨`);
              }
            } else {
              // 재시도 카운트 증가 + status를 pending으로 되돌림
              const { error: updateError } = await supabase
                .from('keywords_navershopping-app')
                .update({
                  retry_count: currentRetryCount + 1,
                  status: 'pending',
                  worker_id: null,
                  started_at: null,
                })
                .eq('id', keywordRecord.id);

              if (updateError) {
                console.log(`   ⚠️ 재시도 카운트 업데이트 실패: ${updateError.message}`);
              } else {
                console.log(`   🔄 재시도 예정 (${currentRetryCount + 1}/1) - 대기열로 복귀`);
              }
            }
          } else {
            // 성공 케이스 → 즉시 삭제
            const { error: deleteError } = await supabase
              .from('keywords_navershopping-app')
              .delete()
              .eq('id', keywordRecord.id);

            if (deleteError) {
              console.log(`   ⚠️ 키워드 삭제 실패: ${deleteError.message}`);
            } else {
              console.log(`   🗑️  작업 완료 - 대기열에서 삭제됨`);
            }
          }
        }

        // 결과 수집
        allResults.push({
          batchNumber: batchNum,
          keywordId: keywordRecord.id,
          keyword: keywordRecord.keyword,
          url: keywordRecord.link_url,
          mid: result.mid,
          rank: result.rank
            ? {
                totalRank: result.rank.totalRank,
                organicRank: result.rank.organicRank,
                isAd: result.rank.isAd,
                page: result.rank.page,
                pagePosition: result.rank.pagePosition,
              }
            : null,
          duration: result.duration,
          error: result.error,
          saveResult: saveResult,
        });
      }

      const batchDuration = Math.round((Date.now() - batchStartTime) / 1000);
      console.log(`\n✅ Batch ${batchNum} 완료 (${batchDuration}초)`);
    } catch (error: any) {
      console.error(`\n🚨 Batch ${batchNum} 에러:`, error.message);
      failedCount += batch.length;

      // 에러 발생 시 배치의 모든 키워드를 pending으로 되돌림
      console.log(`   🔄 에러 발생 - ${batch.length}개 키워드를 pending으로 복귀`);
      for (const keywordRecord of batch) {
        const currentRetryCount = keywordRecord.retry_count || 0;
        const { error: updateError } = await supabase
          .from('keywords_navershopping-app')
          .update({
            retry_count: currentRetryCount + 1,
            status: 'pending',
            worker_id: null,
            started_at: null,
          })
          .eq('id', keywordRecord.id);

        if (updateError) {
          console.log(`   ⚠️ ${keywordRecord.keyword} pending 복귀 실패: ${updateError.message}`);
        }
      }
    }

    // 5. 배치 간 쿨다운
    if (i + BATCH_SIZE < actualKeywords.length) {
      console.log(`\n⏳ 다음 배치 대기 (${BATCH_COOLDOWN_MS / 1000}초)...\n`);
      await delay(BATCH_COOLDOWN_MS);
    }
  }

  const totalDuration = Math.round((Date.now() - startTime) / 1000);

  // 6. 최종 결과 요약
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 최종 결과 요약');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`총 처리: ${actualKeywords.length}개`);
  console.log(`✅ 순위 발견: ${successCount}개`);
  console.log(`❌ 미발견: ${notFoundCount}개`);
  console.log(`🛑 차단: ${blockedCount}개`);
  console.log(`🚨 실패: ${failedCount}개`);
  console.log(`\n⏱️ 총 소요 시간: ${totalDuration}초 (${Math.round(totalDuration / 60)}분)`);
  console.log(`⚡ 평균 처리 속도: ${Math.round((actualKeywords.length / totalDuration) * 60)}개/분\n`);

  // 7. JSON 파일로 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `batch-rank-results-${timestamp}.json`;

  const outputData = {
    timestamp: new Date().toISOString(),
    config: {
      batchSize: BATCH_SIZE,
      maxPages: MAX_PAGES,
      cooldown: BATCH_COOLDOWN_MS,
    },
    summary: {
      total: actualKeywords.length,
      success: successCount,
      notFound: notFoundCount,
      blocked: blockedCount,
      failed: failedCount,
      duration: totalDuration,
    },
    results: allResults,
  };

  fs.writeFileSync(filename, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`💾 결과 저장: ${filename}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((error) => {
  console.error('\n🚨 치명적 에러:', error.message);
  console.error(error.stack);
  process.exit(1);
});

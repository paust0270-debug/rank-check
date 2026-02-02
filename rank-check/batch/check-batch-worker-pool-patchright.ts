#!/usr/bin/env npx tsx
/**
 * 워커 풀 방식 배치 순위 체크 (Patchright 버전)
 *
 * puppeteer-real-browser 대신 patchright 사용
 * - 더 가볍고 빠름
 * - Playwright 기반으로 안정성 높음
 *
 * 사용법:
 *   npx tsx rank-check/batch/check-batch-worker-pool-patchright.ts [--workers=N] [--limit=N]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ParallelRankCheckerPatchright, type ParallelRankResult } from '../parallel/parallel-rank-checker-patchright';
import { saveRankToSlotNaver, type KeywordRecord } from '../utils/save-rank-to-slot-naver';
import { rotateIP } from '../utils/ipRotation';
import * as fs from 'fs';
import * as os from 'os';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEFAULT_WORKERS = 4;
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '15', 10);
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30분 (타임아웃 복구)
const STALE_CHECK_INTERVAL_MS = 60 * 1000; // 1분마다 stale 체크

// 차단 감지 설정
const BLOCK_THRESHOLD = 5;  // 연속 N개 차단 시 IP 로테이션
const IP_ROTATION_COOLDOWN_MS = 15000;

// 워커 ID 생성
const WORKER_ID = `${os.hostname()}-patchright-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

// Supabase 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 통계 카운터
let successCount = 0;
let failedCount = 0;
let notFoundCount = 0;
let blockedCount = 0;
let consecutiveBlocked = 0;

function parseArgs() {
  const args = process.argv.slice(2);
  let workers = DEFAULT_WORKERS;
  let limit: number | null = null;

  for (const arg of args) {
    if (arg.startsWith('--workers=')) {
      workers = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    }
  }

  return { workers, limit };
}

// slot_naver에서 기존 MID 조회 (URL 기준)
async function getCachedMids(urls: string[]): Promise<Map<string, string>> {
  const midMap = new Map<string, string>();

  if (urls.length === 0) return midMap;

  const { data, error } = await supabase
    .from('slot_naverapp')
    .select('link_url, mid')
    .in('link_url', urls)
    .not('mid', 'is', null);

  if (error) {
    console.warn('⚠️ MID 캐시 조회 실패:', error.message);
    return midMap;
  }

  for (const row of data || []) {
    if (row.mid) {
      midMap.set(row.link_url, row.mid);
    }
  }

  console.log(`📦 캐시된 MID: ${midMap.size}개 / ${urls.length}개`);
  return midMap;
}

// 타임아웃된 작업 복구
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

// 작업 할당 (pending + 24시간 지난 waiting)
async function claimKeywords(claimLimit: number): Promise<any[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('claim_keywords', {
    p_worker_id: WORKER_ID,
    p_limit: claimLimit,
  });

  if (!rpcError && rpcData) {
    return rpcData;
  }

  // Fallback: pending 가져오기
  const { data: pendingData } = await supabase
    .from('keywords_navershopping-app')
    .select('id, status')
    .eq('status', 'pending')
    .order('id', { ascending: false })
    .limit(claimLimit);

  // 24시간 지난 waiting 가져오기
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: waitingData } = await supabase
    .from('keywords_navershopping-app')
    .select('id, status')
    .eq('status', 'waiting')
    .lt('started_at', twentyFourHoursAgo)
    .order('id', { ascending: false })
    .limit(claimLimit);

  const allIds = [
    ...(pendingData || []).map(r => r.id),
    ...(waitingData || []).map(r => r.id),
  ].slice(0, claimLimit);

  if (allIds.length === 0) {
    return [];
  }

  console.log(`   📋 pending: ${pendingData?.length || 0}개, waiting(24h+): ${waitingData?.length || 0}개`);

  const { data: claimed, error: updateError } = await supabase
    .from('keywords_navershopping-app')
    .update({
      status: 'processing',
      worker_id: WORKER_ID,
      started_at: new Date().toISOString(),
    })
    .in('id', allIds)
    .in('status', ['pending', 'waiting'])
    .select();

  if (updateError) {
    console.error('❌ 작업 할당 실패:', updateError.message);
    return [];
  }

  return claimed || [];
}

// 단일 결과 처리 (순위 발견 시 저장, 결과와 상관없이 삭제)
async function processResult(
  result: ParallelRankResult,
  keywordRecord: KeywordRecord
): Promise<void> {
  console.log(`\n📝 처리: ${keywordRecord.keyword}`);

  // 차단 감지 (IP 로테이션만 처리)
  if (result.blocked) {
    blockedCount++;
    consecutiveBlocked++;
    console.log(`   🛑 차단 감지 (연속 ${consecutiveBlocked}개)`);

    if (consecutiveBlocked >= BLOCK_THRESHOLD) {
      console.log(`\n🔄 IP 로테이션 실행...`);
      const rotationResult = await rotateIP();
      if (rotationResult.success) {
        console.log(`✅ IP 변경: ${rotationResult.oldIP} → ${rotationResult.newIP}`);
      }
      consecutiveBlocked = 0;
      await new Promise((r) => setTimeout(r, IP_ROTATION_COOLDOWN_MS));
    }
  } else {
    consecutiveBlocked = 0;
  }

  // 순위 발견 → 저장
  if (result.rank && result.rank.totalRank > 0) {
    console.log(`   ✅ 순위: ${result.rank.totalRank}위 (${result.rank.isAd ? '광고' : '오가닉'})`);
    successCount++;

    const saveResult = await saveRankToSlotNaver(supabase, keywordRecord, result.rank);
    if (!saveResult.success) {
      console.log(`   ⚠️ 저장 실패: ${saveResult.error}`);
      failedCount++;
    }
  } else {
    // 순위 미발견 (차단, MID 실패, 600위 밖 등)
    console.log(`   ❌ 순위 미발견`);
    notFoundCount++;
  }

  // 결과와 상관없이 무조건 삭제
  await supabase.from('keywords_navershopping-app').delete().eq('id', keywordRecord.id);
  console.log(`   🗑️ 삭제 완료`);
}

async function main() {
  const { workers, limit } = parseArgs();
  const CPU_CORES = os.cpus().length;
  const TOTAL_RAM_GB = Math.round(os.totalmem() / (1024 ** 3));

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 워커 풀 방식 순위 체크 (Patchright 버전)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🖥️  PC: ${os.hostname()}`);
  console.log(`💻 CPU: ${CPU_CORES}코어 | RAM: ${TOTAL_RAM_GB}GB`);
  console.log(`👷 워커: ${workers}개`);
  console.log(`🔧 Worker ID: ${WORKER_ID}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 타임아웃 복구
  const recoveredCount = await recoverStaleKeywords();
  if (recoveredCount > 0) {
    console.log(`🔄 타임아웃 작업 ${recoveredCount}개 복구됨\n`);
  }

  // 작업 할당
  console.log('1️⃣ 작업 할당 중...\n');
  const claimLimit = limit || 1000;
  const keywords = await claimKeywords(claimLimit);

  if (keywords.length === 0) {
    console.log('⚠️ 처리할 키워드가 없습니다.');
    return;
  }

  console.log(`✅ ${keywords.length}개 키워드 할당 완료\n`);

  // slot_naver에서 기존 MID 조회
  const urls = keywords.map((k) => k.link_url);
  const cachedMidMap = await getCachedMids(urls);

  // 요청 배열 생성
  const requests = keywords.map((k) => ({
    url: k.link_url,
    keyword: k.keyword,
    maxPages: MAX_PAGES,
    cachedMid: cachedMidMap.get(k.link_url),
  }));

  const startTime = Date.now();

  // 워커 풀 실행
  console.log('2️⃣ 워커 풀 순위 체크 시작 (Patchright)...\n');

  // 주기적 stale 복구
  const staleCheckInterval = setInterval(async () => {
    const recovered = await recoverStaleKeywords();
    if (recovered > 0) {
      console.log(`\n🔄 [주기적 복구] ${recovered}개 타임아웃 작업 pending으로 복구\n`);
    }
  }, STALE_CHECK_INTERVAL_MS);

  const checker = new ParallelRankCheckerPatchright();
  const results = await checker.checkUrlsWithWorkerPool(
    requests,
    workers,
    async (result, index) => {
      const keywordRecord: KeywordRecord = keywords[index];
      await processResult(result, keywordRecord);
    }
  );

  clearInterval(staleCheckInterval);

  const totalDuration = Date.now() - startTime;

  // 최종 결과
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 최종 결과 (Patchright)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`총 처리: ${keywords.length}개`);
  console.log(`✅ 순위 발견: ${successCount}개`);
  console.log(`❌ 미발견: ${notFoundCount}개`);
  console.log(`🛑 차단: ${blockedCount}개`);
  console.log(`🚨 실패: ${failedCount}개`);
  console.log(`\n⏱️ 총 소요: ${Math.round(totalDuration / 1000)}초 (${Math.round(totalDuration / 60000)}분)`);
  console.log(`⚡ 처리 속도: ${Math.round((keywords.length / totalDuration) * 60000)}개/분\n`);

  // JSON 저장
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `worker-pool-patchright-results-${timestamp}.json`;

  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    engine: 'patchright',
    config: { workers, maxPages: MAX_PAGES },
    summary: {
      total: keywords.length,
      success: successCount,
      notFound: notFoundCount,
      blocked: blockedCount,
      failed: failedCount,
      duration: totalDuration,
    },
  }, null, 2), 'utf-8');

  console.log(`💾 결과 저장: ${filename}\n`);
}

main().catch((error) => {
  console.error('\n🚨 치명적 에러:', error.message);
  console.error(error.stack);
  process.exit(1);
});

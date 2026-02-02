#!/usr/bin/env npx tsx
/**
 * 자동 업데이트 런처 (작업 감시 모드)
 *
 * 기능:
 * - 작업 큐(keywords_navershopping-app)를 감시하여 즉시 처리
 * - 작업 있으면: 처리 완료 → 5초 쿨다운 → 다음 배치
 * - 작업 없으면: 1분 대기 후 재확인
 * - 18분마다 Git 업데이트 확인 및 pull
 *
 * 사용법:
 *   npx tsx rank-check/launcher/auto-update-launcher.ts
 */

import 'dotenv/config';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// ESM 호환 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 설정
const IDLE_WAIT_MS = 5 * 1000; // 작업 없을 때 대기 시간 (5초)
const BATCH_COOLDOWN_MS = 3 * 1000; // 5초 → 3초 (40% 감소, 배치 완료 후 쿨다운)
const GIT_CHECK_INTERVAL_MS = 18 * 60 * 1000; // Git 체크 주기 (18분)
const GIT_BRANCH = 'main';
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// 상태
let runCount = 0;
let childProcess: ChildProcess | null = null;
let lastGitCheck = 0;
const startTime = new Date();

function log(message: string): void {
  const now = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  console.log(`[${now}] ${message}`);
}

function logHeader(): void {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 자동 업데이트 런처 시작 (작업 감시 모드)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 호스트: ${os.hostname()}`);
  console.log(`📁 경로: ${PROJECT_ROOT}`);
  console.log(`⏰ 작업 없을 때 대기: ${IDLE_WAIT_MS / 1000}초`);
  console.log(`⚡ 배치 완료 후 쿨다운: ${BATCH_COOLDOWN_MS / 1000}초`);
  console.log(`🔄 Git 체크 주기: ${GIT_CHECK_INTERVAL_MS / 1000 / 60}분`);
  console.log(`🌿 Git 브랜치: ${GIT_BRANCH}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

/**
 * Git 업데이트 확인 및 pull
 */
async function checkForUpdates(): Promise<boolean> {
  try {
    log('🔍 Git 업데이트 확인 중...');

    // fetch
    await execAsync(`git -C "${PROJECT_ROOT}" fetch origin ${GIT_BRANCH}`);

    // 변경사항 확인
    const { stdout: diffOutput } = await execAsync(
      `git -C "${PROJECT_ROOT}" diff HEAD origin/${GIT_BRANCH} --stat`
    );

    if (!diffOutput.trim()) {
      log('✅ 최신 상태입니다.');
      return false;
    }

    log(`📦 업데이트 발견:\n${diffOutput}`);

    // pull
    const { stdout: pullOutput } = await execAsync(
      `git -C "${PROJECT_ROOT}" pull origin ${GIT_BRANCH}`
    );
    log(`🔄 Git Pull 완료:\n${pullOutput}`);

    return true;
  } catch (error: any) {
    log(`⚠️ Git 업데이트 실패: ${error.message}`);
    return false;
  }
}

/**
 * 순위 체크 실행 (자식 프로세스)
 * @returns 처리된 키워드 수 (0이면 작업 없음)
 */
async function runRankCheck(): Promise<number> {
  return new Promise((resolve) => {
    log('🔍 순위 체크 시작...');

    const scriptPath = path.join(PROJECT_ROOT, 'rank-check', 'batch', 'check-batch-worker-pool.ts');

    let output = '';

    // tsx로 스크립트 실행
    childProcess = spawn('npx', ['tsx', scriptPath], {
      cwd: PROJECT_ROOT,
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: true,
    });

    // stdout에서 처리된 개수 파싱
    childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      output += text;
    });

    childProcess.on('close', (code) => {
      childProcess = null;

      // "총 처리: N개" 또는 "N개 키워드 할당" 패턴에서 개수 추출
      let processedCount = 0;
      const matchTotal = output.match(/총 처리:\s*(\d+)개/);
      const matchAssign = output.match(/(\d+)개 키워드 할당/);
      const matchNoWork = output.includes('처리할 키워드가 없습니다');

      if (matchNoWork) {
        processedCount = 0;
      } else if (matchTotal) {
        processedCount = parseInt(matchTotal[1], 10);
      } else if (matchAssign) {
        processedCount = parseInt(matchAssign[1], 10);
      }

      if (code === 0) {
        log(`✅ 순위 체크 완료 (${processedCount}개 처리)`);
      } else {
        log(`⚠️ 순위 체크 종료 (코드: ${code})`);
      }

      resolve(processedCount);
    });

    childProcess.on('error', (error) => {
      childProcess = null;
      log(`❌ 순위 체크 에러: ${error.message}`);
      resolve(0);
    });
  });
}

/**
 * 메인 루프 1회 실행
 * @returns 처리된 키워드 수
 */
async function runOnce(): Promise<number> {
  runCount++;

  console.log('');
  console.log(`━━━━━━━━━━ [${runCount}회차 실행] ━━━━━━━━━━`);

  try {
    // Git 업데이트 체크 (시간 기반)
    const now = Date.now();
    if (now - lastGitCheck >= GIT_CHECK_INTERVAL_MS) {
      lastGitCheck = now;
      const updated = await checkForUpdates();
      if (updated) {
        log('🔄 코드 업데이트됨 - 변경사항이 다음 실행에 반영됩니다.');
      }
    }

    // 순위 체크 실행
    const processedCount = await runRankCheck();
    return processedCount;
  } catch (error: any) {
    log(`🚨 에러 발생: ${error.message}`);
    return 0;
  }
}

/**
 * 통계 출력
 */
function printStats(): void {
  const uptime = Math.round((Date.now() - startTime.getTime()) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 런처 통계');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`시작 시간: ${startTime.toLocaleString('ko-KR')}`);
  console.log(`실행 시간: ${hours}시간 ${minutes}분 ${seconds}초`);
  console.log(`총 실행 횟수: ${runCount}회`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
}

/**
 * 종료 핸들러
 */
function setupShutdownHandler(): void {
  const shutdown = (signal: string) => {
    log(`\n${signal} 신호 수신. 종료 중...`);

    // 자식 프로세스 종료
    if (childProcess) {
      childProcess.kill('SIGTERM');
    }

    printStats();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * 대기 함수
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 메인 함수 - 작업 감시 루프
 */
async function main(): Promise<void> {
  logHeader();
  setupShutdownHandler();

  log('🔄 작업 감시 모드로 실행합니다. (Ctrl+C로 종료)');
  log('   - 작업 있으면: 즉시 처리 → 5초 쿨다운 → 다음 배치');
  log('   - 작업 없으면: 1분 대기 후 재확인');
  console.log('');

  // 무한 루프로 작업 감시
  while (true) {
    const processedCount = await runOnce();

    if (processedCount === 0) {
      // 작업 없음 → 1분 대기 후 재확인
      log(`⏳ 작업 없음. ${IDLE_WAIT_MS / 1000}초 후 재확인...`);
      await delay(IDLE_WAIT_MS);
    } else {
      // 작업 있었음 → 짧은 쿨다운 후 즉시 다음 배치
      log(`⚡ ${BATCH_COOLDOWN_MS / 1000}초 쿨다운 후 다음 배치 시작...`);
      await delay(BATCH_COOLDOWN_MS);
    }
  }
}

main().catch((error) => {
  console.error('🚨 치명적 에러:', error.message);
  console.error(error.stack);
  process.exit(1);
});

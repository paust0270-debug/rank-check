/**
 * 브라우저 창을 띄워 순위 검증 (headed 모드)
 *
 * - 키워드: 갤럭시s25
 * - catalog nvMid: 52628743819 (DOM에서 catalog_nv_mid로 매칭)
 * - 기대: 2위
 *
 * 실행: npx tsx rank-check/test/verify-rank-with-browser.ts
 */

import { ParallelRankChecker } from '../parallel/parallel-rank-checker.js';

const KEYWORD = '갤럭시s25';
// 캐탈로그 URL (catalog/52628743819) → DOM에서 catalog_nv_mid로 매칭
const CATALOG_URL = 'https://search.shopping.naver.com/catalog/52628743819?cat_id=50001519&frm=MOSCPRO&query=%EA%B0%A4%EB%9F%AD%EC%8B%9Cs25&nvMid=52628743819';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🪟 브라우저 창 띄워서 순위 검증');
  console.log(`   키워드: ${KEYWORD}`);
  console.log(`   catalog nvMid: 52628743819`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const checker = new ParallelRankChecker();
  const results = await checker.checkUrls([
    { url: CATALOG_URL, keyword: KEYWORD, productName: '갤럭시 S25 (검증)' },
  ]);

  const r = results[0];
  console.log('\n━━━━ 결과 ━━━━');
  console.log('URL:', r.url);
  console.log('키워드:', r.keyword);
  console.log('순위:', r.rank?.totalRank ?? r.error ?? '미발견');
  if (r.rank) {
    console.log('광고 여부:', r.rank.isAd);
    console.log('페이지:', r.rank.page, '/ 순위:', r.rank.pagePosition);
  }
  console.log('소요:', Math.round(r.duration / 1000), '초');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

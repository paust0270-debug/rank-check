/**
 * 단일 스마트스토어/가격비교 URL 순위 검사 (갤럭시s25)
 * 실행: npx tsx rank-check/test/check-one-smartstore.ts
 */

import { ParallelRankChecker } from '../parallel/parallel-rank-checker.js';

const KEYWORD = '갤럭시s25';
const TARGET_URL =
  'https://smartstore.naver.com/smf/products/11471497761?NaPm=ct%3Dml4mqqmw%7Cci%3Dc02959b5123526235e529a6c8e1ce4d5580d969d%7Ctr%3Dslsbrc%7Csn%3D335181%7Chk%3D6c6459ef57554d4f6267a386bc21b17d0030b204&nl-au=54be8053e8b44c8d9066a0c0de52eebf&nl-query=%EA%B0%A4%EB%9F%AD%EC%8B%9Cs25';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 단일 순위 검사 (스마트스토어/가격비교)');
  console.log('   키워드:', KEYWORD);
  console.log('   URL: .../products/11471497761');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const checker = new ParallelRankChecker();
  const results = await checker.checkUrls([
    { url: TARGET_URL, keyword: KEYWORD, productName: '갤럭시 S25 (가격비교)' },
  ]);

  const r = results[0];
  console.log('\n━━━━ 결과 ━━━━');
  console.log('URL:', r.url.substring(0, 70) + '...');
  console.log('키워드:', r.keyword);
  console.log('순위:', r.rank?.totalRank ?? r.error ?? '미발견');
  if (r.rank) {
    console.log('광고 여부:', r.rank.isAd);
    console.log('페이지:', r.rank.page, '/ 순위:', r.rank.pagePosition);
    if (r.rank.productName) console.log('상품명:', r.rank.productName);
  }
  console.log('소요:', Math.round(r.duration / 1000), '초');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

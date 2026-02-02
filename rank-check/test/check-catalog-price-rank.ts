/**
 * 검색 → 쇼핑탭 → 캐탈로그 클릭 진입 → 가격비교 순위 찾기 (봇 우회 동작 유지)
 *
 * 1. 네이버 메인 → 검색 "갤럭시s25" → 쇼핑탭 (직접 링크 X)
 * 2. 검색 결과에서 catalog/52628743955 상품 클릭 → 캐탈로그 페이지 진입
 * 3. 캐탈로그 페이지 내 가격비교 목록에서 /products/11829749361 몇 위인지
 *
 * 실행: npx tsx rank-check/test/check-catalog-price-rank.ts
 */

import { connect } from 'puppeteer-real-browser';
import { humanType, humanClick, humanClickWithWander, humanScroll } from '../utils/humanBehavior.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const KEYWORD = '갤럭시s25';
const CATALOG_NVMID = '52628743955'; // 검색 결과에서 클릭할 캐탈로그
const TARGET_PRODUCT_ID = '11829749361'; // smartstore.naver.com/seolbin/products/11829749361

const SAFE_DELAY_MS = 1500;

function getProfilePath(): string {
  const p = path.join(os.tmpdir(), 'prb-catalog-price-rank');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 검색 → 쇼핑탭 → 캐탈로그 클릭 → 가격비교 순위');
  console.log('   키워드:', KEYWORD);
  console.log('   진입할 캐탈로그 nvMid:', CATALOG_NVMID);
  console.log('   찾을 상품 ID:', TARGET_PRODUCT_ID);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const connection = await connect({
    headless: false,
    turnstile: true,
    fingerprint: true,
    customConfig: { userDataDir: getProfilePath() },
  });
  const browser = connection.browser;
  const page = connection.page;

  try {
    // 봇 탐지 완화: 일반적인 데스크톱 해상도
    await page.setViewport({ width: 1920, height: 1080 });

    // ─── 1. 네이버 메인 진입 ───
    console.log('🧭 네이버 메인 진입');
    await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 페이지 안정화 + "읽는" 시간
    await delay(2500 + Math.random() * 2500); // 2.5~5초

    // ─── 2. 검색창 인간형 클릭 후 키워드 입력 ───
    const searchRect = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="query"]');
      if (!input) return null;
      const r = input.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!searchRect) {
      console.log('❌ 검색 입력창 없음');
      return;
    }
    await delay(400 + Math.random() * 500);
    await humanClick(page, searchRect.x, searchRect.y);
    await delay(600 + Math.random() * 600); // 포커스 후 타이핑 전 대기
    await humanType(page, KEYWORD);
    await delay(300 + Math.random() * 400);
    await page.keyboard.press('Enter');

    console.log('⏳ 검색 결과 대기...');
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch {}
    await delay(2000 + Math.random() * 2000); // 2~4초

    // 봇 탐지 완화: 검색 결과 "읽는" 시간 길게 + 스크롤(훑기) 후 쇼핑탭 "워더→클릭"
    const readingDelay = 3000 + Math.random() * 3000; // 3~6초
    await delay(readingDelay);
    await humanScroll(page, 180 + Math.random() * 220);
    await delay(600 + Math.random() * 800);

    // ─── 3. 쇼핑탭 클릭 (워더 후 인간형 클릭) ───
    console.log('🛒 쇼핑탭 이동 (워더 후 클릭)');
    let clicked = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const linkRect = await page.evaluate(() => {
        const link = document.querySelector<HTMLAnchorElement>('a[href*="search.shopping.naver.com"]');
        if (!link) return null;
        link.removeAttribute('target');
        link.scrollIntoView({ block: 'center', behavior: 'auto' });
        const r = link.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (!linkRect) {
        await delay(2000);
        continue;
      }
      await delay(500 + Math.random() * 700);
      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
      try {
        await humanClickWithWander(page, linkRect.x, linkRect.y);
        clicked = true;
        await navPromise;
        break;
      } catch {
        await delay(2000);
      }
    }
    if (!clicked) {
      console.log('❌ 쇼핑탭 링크 없음');
      return;
    }
    await delay(SAFE_DELAY_MS + 800);

    if (!page.url().includes('search.shopping.naver.com')) {
      console.log('⚠️ 쇼핑탭 URL 미확인');
      return;
    }

    // 상품 목록 로드 대기
    try {
      await page.waitForSelector('[data-shp-contents-id]', { timeout: 15000 });
    } catch {}
    await delay(800 + Math.random() * 700);

    // 봇 탐지 완화: 쇼핑 결과 "훑는" 시간 길게 + 스크롤 후 캐탈로그 "워더→클릭"
    const catalogReadingDelay = 3000 + Math.random() * 3000; // 3~6초
    await delay(catalogReadingDelay);
    await humanScroll(page, 220 + Math.random() * 280);
    await delay(700 + Math.random() * 1000);

    // ─── 4. 캐탈로그(catalog/52628743955) 링크 워더 후 인간형 클릭 → 캐탈로그 페이지 진입 ───
    console.log('📂 캐탈로그 상품 클릭 진입 (워더 후 클릭)');
    const catalogLinkRect = await page.evaluate((nvMid: string) => {
      const link = document.querySelector<HTMLAnchorElement>(`a[href*="catalog/${nvMid}"], a[href*="/catalog/${nvMid}"]`);
      if (!link) return null;
      link.removeAttribute('target');
      link.scrollIntoView({ block: 'center', behavior: 'auto' });
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, CATALOG_NVMID);

    if (!catalogLinkRect) {
      console.log('❌ 캐탈로그 링크 없음 (검색 결과에 catalog/' + CATALOG_NVMID + ' 없음)');
      return;
    }

    await delay(500 + Math.random() * 800);
    const catalogNavPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    try {
      await humanClickWithWander(page, catalogLinkRect.x, catalogLinkRect.y);
    } catch (e) {
      console.log('⚠️ 캐탈로그 클릭 실패:', (e as Error).message);
    }
    await catalogNavPromise;
    await delay(2500 + Math.random() * 1500);

    if (!page.url().includes('catalog')) {
      console.log('⚠️ 캐탈로그 페이지 URL 미확인:', page.url().substring(0, 60));
    }

    // 가격비교 목록 로드 대기
    try {
      await page.waitForSelector('a[href*="/products/"]', { timeout: 12000 });
    } catch {}
    await delay(2000);

    // ─── 5. 캐탈로그 페이지에서 가격비교 목록 수집 → 11829749361 순위 ───
    // ul.productList_list_seller__MmlUy 내 각 li → a[data-shp-contents-dtl] 에서 chnl_prod_no·순위 추출
    const rankResult = await page.evaluate((targetId: string) => {
      window.scrollTo(0, document.body.scrollHeight);
      const listUl = document.querySelector('ul.productList_list_seller__MmlUy') ?? document.querySelector('ul[class*="productList_list_seller"]');
      const anchors = listUl
        ? Array.from(listUl.querySelectorAll<HTMLAnchorElement>('li a[data-shp-contents-dtl]'))
        : Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-shp-contents-dtl]'));
      const productIds: string[] = [];
      let rank: number | null = null;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const dtlRaw = a.getAttribute('data-shp-contents-dtl');
        if (!dtlRaw) continue;
        try {
          const dtl = JSON.parse(dtlRaw) as { chnl_prod_no?: string };
          const pid = dtl.chnl_prod_no != null ? String(dtl.chnl_prod_no) : '';
          if (pid) productIds.push(pid);
          if (pid === targetId) {
            const rankAttr = a.getAttribute('data-shp-contents-rank');
            rank = rankAttr != null ? parseInt(rankAttr, 10) : i + 1;
            if (Number.isNaN(rank)) rank = i + 1;
            break;
          }
        } catch {
          /* ignore parse error */
        }
      }
      if (rank === null && productIds.length)
        rank = productIds.indexOf(targetId) !== -1 ? productIds.indexOf(targetId) + 1 : null;
      return { rank, total: productIds.length, ids: productIds.slice(0, 25) };
    }, TARGET_PRODUCT_ID);

    if (rankResult.rank !== null) {
      console.log('\n✅ 가격비교 순위:', rankResult.rank, '위');
      console.log('   (총', rankResult.total, '개 쇼핑몰 링크 중', rankResult.rank, '번째)');
    } else {
      console.log('\n❌ 해당 상품(ID:', TARGET_PRODUCT_ID, ')을 가격비교 목록에서 찾지 못함.');
      console.log('   수집된 /products/ 링크 수:', rankResult.total);
      if (rankResult.ids?.length) console.log('   상품 ID 샘플:', rankResult.ids.join(', '));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

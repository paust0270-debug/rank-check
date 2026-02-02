/**
 * 네이버 검색 → 쇼핑탭 → 캐탈로그 → 지정 상품 클릭 → 상품 페이지 진입
 *
 * 실행: npx tsx rank-check/test/navigate-to-catalog.ts
 */

import { connect } from 'puppeteer-real-browser';
import { humanType, humanClick, humanClickWithWander, humanScroll } from '../utils/humanBehavior.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const KEYWORD = '갤럭시s25';
const CATALOG_NVMID = '52628743955';
const TARGET_PRODUCT_ID = '11829749361'; // 캐탈로그 가격비교 목록에서 클릭할 상품

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
  console.log('🔍 캐탈로그 → 지정 상품 페이지 진입 테스트');
  console.log('   키워드:', KEYWORD);
  console.log('   캐탈로그 nvMid:', CATALOG_NVMID);
  console.log('   클릭할 상품 ID:', TARGET_PRODUCT_ID);
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
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. 네이버 메인 진입
    console.log('🧭 네이버 메인 진입');
    await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await delay(1000 + Math.random() * 800);

    // 2. 검색창 클릭 후 키워드 입력
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
    await delay(250 + Math.random() * 300);
    await humanClick(page, searchRect.x, searchRect.y);
    await delay(350 + Math.random() * 350);
    await humanType(page, KEYWORD);
    await delay(200 + Math.random() * 200);
    await page.keyboard.press('Enter');

    console.log('⏳ 검색 결과 대기...');
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 });
    } catch {}
    await delay(800 + Math.random() * 800);

    await humanScroll(page, 120 + Math.random() * 150);
    await delay(350 + Math.random() * 400);

    // 3. 쇼핑탭 클릭
    console.log('🛒 쇼핑탭 이동');
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
        await delay(1000);
        continue;
      }
      await delay(300 + Math.random() * 400);
      const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      try {
        await humanClickWithWander(page, linkRect.x, linkRect.y);
        clicked = true;
        await navPromise;
        break;
      } catch {
        await delay(800);
      }
    }
    if (!clicked) {
      console.log('❌ 쇼핑탭 링크 없음');
      return;
    }
    await delay(800 + 400);

    if (!page.url().includes('search.shopping.naver.com')) {
      console.log('⚠️ 쇼핑탭 URL 미확인');
      return;
    }

    try {
      await page.waitForSelector('[data-shp-contents-id]', { timeout: 10000 });
    } catch {}
    await delay(400 + Math.random() * 400);

    await humanScroll(page, 150 + Math.random() * 180);
    await delay(400 + Math.random() * 500);

    // 4. 캐탈로그 링크 클릭
    console.log('📂 캐탈로그 상품 클릭 진입');
    const catalogLinkRect = await page.evaluate((nvMid: string) => {
      const link = document.querySelector<HTMLAnchorElement>(`a[href*="catalog/${nvMid}"], a[href*="/catalog/${nvMid}"]`);
      if (!link) return null;
      link.removeAttribute('target');
      link.scrollIntoView({ block: 'center', behavior: 'auto' });
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, CATALOG_NVMID);

    if (!catalogLinkRect) {
      console.log('❌ 캐탈로그 링크 없음 → 직접 URL 이동');
      await page.goto(`https://search.shopping.naver.com/catalog/${CATALOG_NVMID}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    } else {
      await delay(300 + Math.random() * 400);
      const catalogNavPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      try {
        await humanClickWithWander(page, catalogLinkRect.x, catalogLinkRect.y);
      } catch (e) {
        console.log('⚠️ 캐탈로그 클릭 실패:', (e as Error).message);
      }
      await catalogNavPromise;
      await delay(1000 + Math.random() * 500);

      if (!page.url().includes('catalog')) {
        console.log('⚠️ 캐탈로그 미진입 → 직접 URL 이동');
        await page.goto(`https://search.shopping.naver.com/catalog/${CATALOG_NVMID}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await delay(1500 + Math.random() * 500);
      }
    }

    // 5. 스크롤로 가격비교 목록(판매처 카드슬롯) 로드
    console.log('📜 단계적 스크롤 → 판매처 목록 노출');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await delay(700 + Math.random() * 400);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500 + Math.random() * 800);

    // 6. 지정 상품(11829749361) 링크 찾아서 클릭 → 상품 페이지 진입
    console.log('🛍️ 지정 상품 클릭 → 상품 페이지 진입');
    const productLinkRect = await page.evaluate((targetId: string) => {
      const items = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          '.productList_list_seller__MmlUy li .productList_inner__UH7Oa .productList_product__Y0LS_ a[data-shp-contents-dtl]'
        )
      );
      for (const item of items) {
        const dtl = item.getAttribute('data-shp-contents-dtl');
        if (!dtl) continue;
        try {
          const unescaped = dtl.replace(/&quot;/g, '"');
          const parsed = JSON.parse(unescaped);
          const entry = parsed.find((e: { key: string; value: string }) => e.key === 'chnl_prod_no');
          if (entry?.value === targetId) {
            item.removeAttribute('target');
            item.scrollIntoView({ block: 'center', behavior: 'auto' });
            const r = item.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        } catch {}
      }
      return null;
    }, TARGET_PRODUCT_ID);

    if (!productLinkRect) {
      console.log('❌ 지정 상품 링크 없음 (가격비교 목록에 없을 수 있음)');
      console.log('   URL:', page.url());
      await delay(10000);
      return;
    }

    await delay(300 + Math.random() * 400);
    const productNavPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    try {
      await humanClickWithWander(page, productLinkRect.x, productLinkRect.y);
    } catch (e) {
      console.log('⚠️ 상품 클릭 실패:', (e as Error).message);
    }
    await productNavPromise;
    await delay(1000 + Math.random() * 500);

    console.log('\n✅ 상품 페이지 진입 완료!');
    console.log('   URL:', page.url());
    console.log('   브라우저를 30초간 열어둡니다...\n');
    await delay(30000);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

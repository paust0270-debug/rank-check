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

const SAFE_DELAY_MS = 800;

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
    await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await delay(1000 + Math.random() * 800);

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
    await delay(SAFE_DELAY_MS + 400);

    if (!page.url().includes('search.shopping.naver.com')) {
      console.log('⚠️ 쇼핑탭 URL 미확인');
      return;
    }

    // 상품 목록 로드 대기
    try {
      await page.waitForSelector('[data-shp-contents-id]', { timeout: 10000 });
    } catch {}
    await delay(400 + Math.random() * 400);

    await humanScroll(page, 150 + Math.random() * 180);
    await delay(400 + Math.random() * 500);

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

    await delay(300 + Math.random() * 400);
    const catalogNavPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    try {
      await humanClickWithWander(page, catalogLinkRect.x, catalogLinkRect.y);
    } catch (e) {
      console.log('⚠️ 캐탈로그 클릭 실패:', (e as Error).message);
    }
    await catalogNavPromise;
    await delay(1000 + Math.random() * 500);

    // 캐탈로그 URL 미확인 시 직접 이동 시도 (클릭 실패/다른 페이지 대비)
    if (!page.url().includes('catalog')) {
      console.log('⚠️ 캐탈로그 미진입 → 직접 URL 이동');
      await page.goto(`https://search.shopping.naver.com/catalog/${CATALOG_NVMID}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await delay(1500 + Math.random() * 500);
    }

    // 판매처 카드슬롯: 단계적 스크롤으로 lazy load 유도 (5단계)
    console.log('📜 단계적 스크롤 → 판매처 카드슬롯 노출');
    const doScrollAndExtract = async () => {
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await delay(700 + Math.random() * 400);
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1500 + Math.random() * 800);
    };

    let rankResult: { rank: number | null; total: number; ids: string[] } = { rank: null, total: 0, ids: [] };
    for (let retry = 0; retry < 3; retry++) {
      try {
        await doScrollAndExtract();
        if (!page.url().includes('catalog')) {
          console.log('⚠️ 스크롤 중 페이지 이탈 → 캐탈로그 재진입');
          await page.goto(`https://search.shopping.naver.com/catalog/${CATALOG_NVMID}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          await delay(2000 + Math.random() * 500);
          continue;
        }
        // ─── 5. 가격비교 목록 수집 → 순위 ───
        rankResult = await page.evaluate((targetId: string) => {
      const allProductItems = Array.from(document.querySelectorAll<HTMLAnchorElement>('.productList_list_seller__MmlUy li .productList_inner__UH7Oa .productList_product__Y0LS_ a[data-shp-contents-dtl]'));
      let rank = null;
      const productIds: string[] = [];
      const seenProductIds = new Set<string>();

      for (const item of allProductItems) {
        const dataShpContentsDtl = item.getAttribute('data-shp-contents-dtl');
        if (dataShpContentsDtl) {
          try {
            // HTML escape된 JSON 문자열을 unescape하고 파싱
            const unescapedJsonString = dataShpContentsDtl.replace(/&quot;/g, '"');
            const dtl = JSON.parse(unescapedJsonString);
            const chnlProdNoEntry = dtl.find((entry: { key: string; value: string; }) => entry.key === 'chnl_prod_no');
            
            if (chnlProdNoEntry) {
              const chnlProdNo = chnlProdNoEntry.value;
              if (chnlProdNo && !seenProductIds.has(chnlProdNo)) {
                seenProductIds.add(chnlProdNo);
                productIds.push(chnlProdNo); // 순서 유지를 위해 배열에 추가
                
                if (chnlProdNo === targetId) {
                  const rankAttr = item.getAttribute('data-shp-contents-rank');
                  if (rankAttr) {
                    rank = parseInt(rankAttr, 10);
                  }
                }
              }
            }
          } catch (e) {
            console.error('JSON 파싱 오류:', e);
          }
        }
      }
      return { rank, total: productIds.length, ids: productIds.slice(0, 25) };
        }, TARGET_PRODUCT_ID);
        break;
      } catch (e: unknown) {
        const msg = (e as Error).message || '';
        if (msg.includes('Execution context was destroyed') || msg.includes('Target closed')) {
          console.log(`⚠️ 실행 컨텍스트 손실 (재시도 ${retry + 1}/3)`);
          await delay(1500 + Math.random() * 1000);
          if (retry < 2) {
            try {
              const url = page.url();
              if (!url.includes('catalog')) {
                await page.goto(`https://search.shopping.naver.com/catalog/${CATALOG_NVMID}`, {
                  waitUntil: 'domcontentloaded',
                  timeout: 15000,
                });
              } else {
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
              }
              await delay(2000);
            } catch {}
          }
        } else {
          throw e;
        }
      }
    }

    if (rankResult.rank !== null) {
      console.log('\n✅ 가격비교 순위:', rankResult.rank, '위');
      console.log('   (총', rankResult.total, '개 쇼핑몰 링크 중', rankResult.rank, '번째)');
    } else {
      console.log('\n❌ 해당 상품(ID:', TARGET_PRODUCT_ID, ')을 가격비교 목록에서 찾지 못함.');
      console.log('   수집된 /products/ 링크 수:', rankResult.total);
      if (rankResult.ids?.length) console.log('   상품 ID 샘플:', rankResult.ids.join(', '));
      // 디버그: 페이지 실제 구조 확인
      const debug = await page.evaluate(() => {
        const all = document.querySelectorAll('a[href]');
        const withProduct = Array.from(all).filter((a) => (a.getAttribute('href') || '').toLowerCase().includes('product'));
        return {
          url: location.href,
          totalLinks: all.length,
          linksWithProduct: withProduct.length,
          sampleHrefs: withProduct.slice(0, 5).map((a) => (a.getAttribute('href') || '').substring(0, 80)),
        };
      });
      console.log('   [디버그] URL:', debug.url);
      console.log('   [디버그] 전체 <a> 수:', debug.totalLinks, '| products 포함 링크:', debug.linksWithProduct);
      if (debug.sampleHrefs?.length) console.log('   [디버그] href 샘플:', debug.sampleHrefs);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

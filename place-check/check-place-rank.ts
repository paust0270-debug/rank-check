#!/usr/bin/env npx tsx
/**
 * 네이버 플레이스 순위 체크 (테스트)
 *
 * 흐름:
 * 1. naver.me 단축 URL 방문 → 실제 플레이스 URL/ID 추출
 * 2. PC 네이버 접속 → 키워드 검색 (강남맛집)
 * 3. "키워드+더보기" 버튼 클릭 → map.naver.com 플레이스 리스트 진입
 * 4. 플레이스 리스트에서 대상 장소 순위 찾기
 *
 * 봇우회: humanBehavior (humanType, humanScroll, humanClickWithWander) 참조
 */

import { connect } from 'puppeteer-real-browser';
import { humanScroll, humanType, humanClickWithWander } from './utils/humanBehavior.js';

const KEYWORD = '강남맛집';
const TARGET_SHORT_URL = 'https://naver.me/xHgIsIwD';
// 추출 실패 시 fallback (필요 시 추가)
const KNOWN_PLACE_NAMES: Record<string, string> = {};

const SAFE_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * naver.me 단축 URL 방문하여 실제 플레이스 URL, ID, 장소명, 리뷰 수 추출
 */
async function resolvePlaceUrl(page: any): Promise<{
  placeUrl: string;
  placeId: string | null;
  placeName: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null; // 저장수 (명이 저장)
}> {
  console.log('🔗 naver.me 단축 URL 해석 중...');
  try {
    await page.goto(TARGET_SHORT_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await delay(3000);

    // entry iframe 로드 대기 (플레이스 상세는 iframe에 있음)
    try {
      await page.waitForSelector('iframe[name="entryIframe"], iframe#entryIframe, iframe[src*="entry"]', { timeout: 5000 });
      await delay(1000);
    } catch {}

    const finalUrl = page.url();
    console.log(`   → 최종 URL: ${finalUrl}`);

    // place ID 추출
    const placeIdMatch =
      finalUrl.match(/\/place\/([^/?]+)/) ||
      finalUrl.match(/\/entry\/place\/([^/?]+)/) ||
      finalUrl.match(/\/restaurant\/([^/?]+)/) ||
      finalUrl.match(/\/entry\/([^/?]+)/) ||
      finalUrl.match(/[?&]id=([^&]+)/);
    const placeId = placeIdMatch ? placeIdMatch[1] : null;

    // 장소명 추출 (og:title, document.title, name_text, FKA1t 등) - 메인 + 모든 iframe
    const extractPlaceName = () => {
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogTitle && !ogTitle.includes('네이버 지도') && ogTitle.length > 2)
        return ogTitle.replace(/\s*[-|]\s*네이버.*$/, '').trim();
      const docTitle = document.title;
      if (docTitle && !docTitle.includes('네이버 지도') && docTitle.length > 2)
        return docTitle.replace(/\s*[-|]\s*네이버.*$/, '').trim();
      const selectors = ['.name_text', 'strong.name_text', '.FKA1t', '.GHAhcb', 'h1', '[class*="place_name"]', '[class*="PlaceName"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const text = el?.textContent?.trim();
        if (text && text.length > 1 && text !== '장소') return text;
      }
      return null;
    };

    let placeName = await page.evaluate(extractPlaceName);
    if (!placeName) {
      for (const frame of page.frames()) {
        try {
          const name = await frame.evaluate(() => {
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            if (ogTitle && !ogTitle.includes('네이버 지도') && ogTitle.length > 2)
              return ogTitle.replace(/\s*[-|]\s*네이버.*$/, '').trim();
            const docTitle = document.title;
            if (docTitle && !docTitle.includes('네이버 지도') && docTitle.length > 2)
              return docTitle.replace(/\s*[-|]\s*네이버.*$/, '').trim();
            const selectors = ['.name_text', 'strong.name_text', '.FKA1t', '.GHAhcb', 'h1', '[class*="PlaceName"]'];
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              const text = el?.textContent?.trim();
              if (text && text.length > 1 && text !== '장소') return text;
            }
            return null;
          });
          if (name) {
            placeName = name;
            break;
          }
        } catch {}
      }
    }
    // body 텍스트에서 "방문자 리뷰" 앞의 첫 줄 추출 (장소명이 보통 상단에 있음)
    if (!placeName) {
      placeName = await page.evaluate(() => {
        const bodyText = document.body?.innerText ?? '';
        const lines = bodyText.split(/\n/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 50);
        for (const line of lines) {
          if (!/^(네이버|지도|장소|리뷰|방문자|블로그|저장|예약|주소|전화)/.test(line) && !/^\d+$/.test(line)) return line;
        }
        return null;
      });
    }

    // 방문자 리뷰, 블로그 리뷰, 저장수 추출 (메인 + iframe)
    let visitorReviewCount: number | null = null;
    let blogReviewCount: number | null = null;
    let saveCount: number | null = null;

    const extractReviewsAndSave = (): {
      visitor: number | null;
      blog: number | null;
      save: number | null;
    } => {
      const bodyText = document.body?.innerText ?? '';
      const visitor = bodyText.match(/방문자\s*리뷰\s*([\d,]+)/)?.[1]?.replace(/,/g, '');
      const blog = bodyText.match(/블로그\s*리뷰\s*([\d,]+)/)?.[1]?.replace(/,/g, '');
      // 저장수: "1,234명이 저장", "저장 1,234", "1,234명 저장" 등 다양한 형태
      const saveMatch =
        bodyText.match(/([\d,]+)\s*명이\s*저장/)?.[1] ||
        bodyText.match(/저장\s*([\d,]+)/)?.[1] ||
        bodyText.match(/([\d,]+)\s*명\s*저장/)?.[1] ||
        bodyText.match(/저장했어요\s*([\d,]+)/)?.[1] ||
        bodyText.match(/([\d,]+)\s*명이\s*저장했어요/)?.[1];
      const save = saveMatch?.replace(/,/g, '');
      return {
        visitor: visitor ? parseInt(visitor, 10) : null,
        blog: blog ? parseInt(blog, 10) : null,
        save: save ? parseInt(save, 10) : null,
      };
    };

    const mainData = await page.evaluate(extractReviewsAndSave);
    if (mainData.visitor != null) visitorReviewCount = mainData.visitor;
    if (mainData.blog != null) blogReviewCount = mainData.blog;
    if (mainData.save != null) saveCount = mainData.save;

    if (visitorReviewCount == null || blogReviewCount == null || saveCount == null) {
      for (const frame of page.frames()) {
        try {
          const frameData = await frame.evaluate(extractReviewsAndSave);
          if (visitorReviewCount == null && frameData.visitor != null) visitorReviewCount = frameData.visitor;
          if (blogReviewCount == null && frameData.blog != null) blogReviewCount = frameData.blog;
          if (saveCount == null && frameData.save != null) saveCount = frameData.save;
          if (visitorReviewCount != null && blogReviewCount != null && saveCount != null) break;
        } catch {}
      }
    }

    return { placeUrl: finalUrl, placeId, placeName, visitorReviewCount, blogReviewCount, saveCount };
  } catch (e) {
    console.log('   ⚠️ 단축 URL 해석 실패:', e);
    return { placeUrl: '', placeId: null, placeName: null, visitorReviewCount: null, blogReviewCount: null, saveCount: null };
  }
}

/**
 * 네이버 검색 → "키워드+더보기" 클릭 → map.naver.com 플레이스 리스트 진입
 */
async function enterPlaceList(page: any, keyword: string): Promise<boolean> {
  console.log('🧭 네이버 메인 진입');
  try {
    await page.goto('https://www.naver.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
  } catch (error) {
    console.log('⚠️ 네이버 진입 실패', error);
    return false;
  }

  await delay(SAFE_DELAY_MS);

  // 검색어 입력 (humanType으로 봇우회)
  const searchInput = await page.waitForSelector('input[name="query"]', { timeout: 15000 }).catch(() => null);
  if (!searchInput) {
    console.log('❌ 검색 입력창 없음');
    return false;
  }

  await searchInput.click({ clickCount: 3 });
  await humanType(page, keyword);
  await page.keyboard.press('Enter');

  console.log('⏳ 검색 결과 대기...');
  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch {}
  await delay(2000 + Math.random() * 2000);

  // 봇 탐지 완화: 검색 결과 "읽는" 시간 + 스크롤
  await delay(2500 + Math.random() * 2000);
  await humanScroll(page, 200 + Math.random() * 200);
  await delay(600 + Math.random() * 800);

  // "키워드+더보기" 버튼 클릭 (group_more, cru에 map.naver.com 포함)
  // HTML: <a class="group_more" cru="https://map.naver.com/p/search/강남맛집..."><span class="etc">강남맛집 더보기</span></a>
  console.log(`📍 "${keyword} 더보기" 클릭`);
  let clicked = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const linkRect = await page.evaluate((kw: string) => {
      // 1) 키워드+더보기 텍스트가 있는 group_more (플레이스 섹션)
      const links = document.querySelectorAll<HTMLAnchorElement>('a.group_more');
      for (const link of links) {
        const text = (link.textContent || '').replace(/\s+/g, ' ').trim();
        const cru = link.getAttribute('cru') || '';
        if (
          text.includes('더보기') &&
          (text.includes(kw) || cru.includes(encodeURIComponent(kw)) || cru.includes(kw))
        ) {
          link.removeAttribute('target');
          link.scrollIntoView({ block: 'center', behavior: 'auto' });
          const r = link.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      // 2) map.naver.com으로 가는 더보기 링크
      const mapLinks = document.querySelectorAll<HTMLAnchorElement>('a[cru*="map.naver.com"]');
      for (const link of mapLinks) {
        if ((link.textContent || '').includes('더보기')) {
          link.removeAttribute('target');
          link.scrollIntoView({ block: 'center', behavior: 'auto' });
          const r = link.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      // 3) fallback: 첫 번째 group_more
      const fallback = document.querySelector<HTMLAnchorElement>('a.group_more');
      if (fallback) {
        fallback.removeAttribute('target');
        fallback.scrollIntoView({ block: 'center', behavior: 'auto' });
        const r = fallback.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    }, keyword);

    if (!linkRect) {
      console.log(`   ⏳ 더보기 링크 대기 중... (${attempt}/5)`);
      await delay(1500);
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
      await delay(1500);
    }
  }

  if (!clicked) {
    console.log('❌ "더보기" 링크 클릭 실패');
    return false;
  }

  await delay(SAFE_DELAY_MS + 1000);

  const currentUrl = page.url();
  if (!currentUrl.includes('map.naver.com') && !currentUrl.includes('place.naver.com')) {
    console.log(`⚠️ 플레이스 페이지 미확인. 현재 URL: ${currentUrl.substring(0, 80)}...`);
    return false;
  }

  console.log('✅ 플레이스 리스트 진입 완료');
  return true;
}

/**
 * 플레이스 리스트에서 대상 장소 순위 찾기
 * - placeId로 매칭 또는 placeUrl 포함 여부로 매칭
 * - map.naver.com / pcmap.place.naver.com 구조 대응
 * - li.UEzoS: 각 플레이스 항목 (직계 자식만 사용해 순위 정확히 계산)
 */
async function findPlaceRankInList(
  page: any,
  placeUrl: string,
  placeId: string | null,
  targetPlaceName: string | null
): Promise<{ rank: number | null; placeName: string | null; listPreview: string[] }> {
  console.log('🔍 플레이스 리스트에서 순위 검색 중...');

  // 리스트 로드 대기 (header_text_area + name_text 구조 포함)
  try {
    await page.waitForSelector('#_pcmap_list_scroll_container, [id*="pcmap_list"], .place_bluelink, .TYaxT, .name_text, li.UEzoS', {
      timeout: 12000,
    });
  } catch {}
  await delay(1500);

  // 리스트가 pcmap.place.naver.com 또는 searchIframe 내부에 있음
  let targetFrame = page;
  for (const frame of page.frames()) {
    try {
      const hasList = await frame.evaluate(() => {
        const c = document.querySelector('#_pcmap_list_scroll_container');
        const items = document.querySelectorAll('li.UEzoS, li[class*="UEzoS"], .header_text_area');
        return !!c && items.length > 0;
      });
      if (hasList) {
        targetFrame = frame;
        break;
      }
    } catch {}
  }

  // iframe 내부에서 스크롤 (80위까지 로드 - lazy loading)
  let prevCount = 0;
  for (let s = 0; s < 80; s++) {
    await targetFrame.evaluate(() => {
      const container = document.querySelector('#_pcmap_list_scroll_container');
      if (container) container.scrollTop += 500;
    });
    await delay(200);
    const count = await targetFrame.evaluate(() =>
      document.querySelectorAll('li.UEzoS, li[class*="UEzoS"], .header_text_area').length
    );
    if (count >= 80 && count === prevCount) break;
    prevCount = count;
  }
  await delay(800);

  // 장소명 매칭용 (placeId 없을 때만 사용, 특정 장소 fallback 없음)
  const searchNames = targetPlaceName ? [targetPlaceName, targetPlaceName.replace(/\s+/g, '')] : [];

  const result = await targetFrame.evaluate(
    (targetUrl: string, targetId: string | null, namesToMatch: string[]) => {
      const container = document.querySelector('#_pcmap_list_scroll_container');
      // li.UEzoS 우선, header_text_area(부모 li/div) fallback
      let items = container
        ? Array.from(container.querySelectorAll('li.UEzoS, li[class*="UEzoS"]'))
        : Array.from(document.querySelectorAll('li.UEzoS, li[class*="UEzoS"]'));
      if (items.length === 0 && container) {
        const headerAreas = container.querySelectorAll('.header_text_area');
        const seen = new Set<Element>();
        items = Array.from(headerAreas)
          .map((el) => el.closest('li') || el.closest('[class*="item"]') || el.parentElement?.parentElement || el.parentElement)
          .filter((el): el is Element => !!el && !seen.has(el) && (seen.add(el), true));
      }
      if (items.length === 0 && container) {
        const ul = container.querySelector('ul');
        items = ul ? Array.from(ul.querySelectorAll(':scope > li')) : Array.from(container.querySelectorAll('li'));
      }

      const listPreview: string[] = [];
      let rank = 0;

      for (const item of items) {
        rank++;
        // 제목만 추출: .name_text 우선 (예약/쿠폰/카테고리 등 제외)
        const nameEl = item.querySelector('.name_text, strong.name_text');
        let name = nameEl?.textContent?.trim() || '';
        if (!name) {
          const fallback = item.querySelector('.TYaxT, [class*="TYaxT"], .place_bluelink, a.place_bluelink span');
          const raw = fallback?.textContent?.trim() || '';
          // 예약/톡톡/쿠폰 이후 문자열 제거 → 제목만 (예: "명가우육면 선릉역점예약쿠폰중식당" → "명가우육면 선릉역점")
          name = raw.replace(/(예약|톡톡|쿠폰|네이버페이|주문|배달).*$/, '').trim();
        }
        if (name) listPreview.push(`${rank}. ${name}`);

        // 1) place ID로 매칭 (href, data-id, data-cid, outerHTML, onclick 등)
        let matched = false;
        const allLinks = item.querySelectorAll('a[href]');
        for (const a of allLinks) {
          const href = (a as HTMLAnchorElement).href || '';
          const dataId = a.getAttribute('data-id') || a.getAttribute('data-cid') || a.getAttribute('data-laim-exp-id');
          const onclick = a.getAttribute('onclick') || '';
          if (targetId && (href.includes(targetId) || href.includes(`/place/${targetId}`) || href.includes(`/entry/${targetId}`) || href.includes(`/restaurant/${targetId}`) || href.includes(`place/${targetId}`) || dataId === targetId || onclick.includes(targetId)))
            matched = true;
        }
        const itemDataId = item.getAttribute('data-id') || item.getAttribute('data-cid') || item.querySelector('[data-id]')?.getAttribute('data-id');
        if (targetId && (itemDataId === targetId || item.outerHTML.includes(targetId) || item.innerHTML.includes(targetId))) matched = true;

        // 2) 장소명으로 매칭 (fallback)
        if (!matched && name) {
          const n = name.replace(/\s+/g, '').toLowerCase();
          for (const t of namesToMatch) {
            const tn = t.replace(/\s+/g, '').toLowerCase();
            if (tn && (n.includes(tn) || tn.includes(n))) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
          return { rank, placeName: name || '알 수 없음', listPreview: listPreview.slice(0, 80) };
        }
      }

      return { rank: null, placeName: null, listPreview: listPreview.slice(0, 80) };
    },
    placeUrl,
    placeId,
    searchNames
  );

  return result;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  네이버 플레이스 순위 체크 (테스트)');
  console.log('  키워드:', KEYWORD);
  console.log('  대상:', TARGET_SHORT_URL);
  console.log('═══════════════════════════════════════\n');

  const { page, browser } = await connect({
    headless: false,
    turnstile: true,
  });
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // 1. naver.me URL 해석 (장소명, 방문자/블로그 리뷰, 저장수 포함)
    const { placeUrl, placeId, placeName: resolvedName, visitorReviewCount, blogReviewCount, saveCount } =
      await resolvePlaceUrl(page);
    const placeName = resolvedName && resolvedName !== '장소' ? resolvedName : KNOWN_PLACE_NAMES[TARGET_SHORT_URL] ?? null;
    console.log(`   placeId: ${placeId || '(없음)'}`);
    if (placeName) console.log(`   장소명: ${placeName}`);
    if (visitorReviewCount != null) console.log(`   방문자 리뷰: ${visitorReviewCount.toLocaleString()}개`);
    if (blogReviewCount != null) console.log(`   블로그 리뷰: ${blogReviewCount.toLocaleString()}개`);
    if (saveCount != null) console.log(`   저장수: ${saveCount.toLocaleString()}명`);
    console.log('');

    // 2. 플레이스 리스트 진입
    const entered = await enterPlaceList(page, KEYWORD);
    if (!entered) {
      console.log('❌ 플레이스 리스트 진입 실패');
      return;
    }

    // 3. 순위 찾기 (iframe 내 리스트에서)
    const { rank, placeName: foundName, listPreview } = await findPlaceRankInList(page, placeUrl, placeId, placeName);

    if (rank !== null) {
      console.log('\n═══════════════════════════════════════');
      console.log(`  ✅ 순위: ${rank}위`);
      if (foundName) console.log(`  장소명: ${foundName}`);
      if (visitorReviewCount != null) console.log(`  방문자 리뷰: ${visitorReviewCount.toLocaleString()}개`);
      if (blogReviewCount != null) console.log(`  블로그 리뷰: ${blogReviewCount.toLocaleString()}개`);
      if (saveCount != null) console.log(`  저장수: ${saveCount.toLocaleString()}명`);
      console.log('═══════════════════════════════════════');
    } else {
      console.log('\n⚠️ 리스트에서 대상 장소를 찾지 못했습니다.');
      console.log('   (placeId가 없거나, 리스트 구조가 다를 수 있습니다)');
      if (listPreview?.length) {
        console.log('\n   리스트 상위 80개:');
        listPreview.forEach((line: string) => console.log('   ', line));
      }
    }

    await delay(3000);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

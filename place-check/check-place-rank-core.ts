/**
 * 네이버 플레이스 순위 체크 코어 로직
 * - checkPlaceRank: 배치에서 호출 가능한 순위 체크 함수
 */
import { humanScroll, humanClickWithWander } from './utils/humanBehavior.js';

const DEFAULT_KEYWORD = '강남맛집';
const CLEAN_NAME_REGEX = /(영업\s|리뷰\s*[\d,]+|서울\s*강남구|상세주소\s*열기|육류,고기요리|카페,디저트|한식|중식|일식|양식|24시간\s*영업|TV전지적참견시점|새로오픈|저장|예약|톡톡|쿠폰|네이버페이|주문|배달).*$/gi;
const SAFE_DELAY_MS = 2000;
const MAX_RANK_INLINE = 200;
const MAX_RANK_LIST = 150;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getKeywordFromUrl(url: string): string {
  try {
    const m = url.match(/(?:n_query|bk_query)=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {}
  return DEFAULT_KEYWORD;
}

async function parsePlaceIdFromUrl(targetUrl: string): Promise<string | null> {
  if (targetUrl.includes('/restaurant/') || targetUrl.includes('/place/')) {
    const m = targetUrl.match(/\/restaurant\/(\d+)/) || targetUrl.match(/\/place\/(\d+)/);
    return m ? m[1] : null;
  }
  if (targetUrl.startsWith('https://naver.me/') || targetUrl.startsWith('http://naver.me/')) {
    try {
      const res = await fetch(targetUrl, { redirect: 'follow' });
      const m = res.url.match(/\/restaurant\/(\d+)/) || res.url.match(/\/place\/(\d+)/) || res.url.match(/\/entry\/place\/(\d+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function searchOnMobile(page: any, keyword: string): Promise<boolean> {
  try {
    await page.goto(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
  } catch {
    return false;
  }
  await delay(2500 + Math.random() * 1500);
  await humanScroll(page, 150 + Math.random() * 100);
  await delay(800);
  return page.url().includes('naver.com');
}

async function findPlaceRankInMobileList(
  page: any,
  placeId: string | null,
  maxRank: number
): Promise<{ rank: number | null; placeName: string | null; listPreview: string[] }> {
  await delay(1500);
  for (let s = 0; s < 3; s++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(300);
  }
  await delay(500);

  return page.evaluate(
    (targetId: string | null, max: number, cleanRegex: string) => {
      const re = new RegExp(cleanRegex, 'gi');
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/restaurant/"], a[href*="place.naver.com"]'));
      const seen = new Set<string>();
      const items: { id: string; name: string }[] = [];
      for (const a of links) {
        const href = a.href || '';
        const idMatch = href.match(/\/restaurant\/(\d+)/) || href.match(/\/place\/(\d+)/);
        if (!idMatch || seen.has(idMatch[1])) continue;
        seen.add(idMatch[1]);
        const item = a.closest('li') || a.closest('[class*="item"]') || a.parentElement?.parentElement || a;
        const nameEl = item?.querySelector('span, div, strong') || a;
        let name = (nameEl?.textContent || a.textContent || '').trim().replace(re, '').trim();
        if (name.length > 50) name = name.slice(0, 50);
        items.push({ id: idMatch[1], name });
        if (items.length >= max) break;
      }
      const listPreview = items.map((x, i) => `${i + 1}. ${x.name}`).slice(0, 50);
      for (let i = 0; i < items.length; i++) {
        if (targetId && items[i].id === targetId) {
          return { rank: i + 1, placeName: items[i].name || '알 수 없음', listPreview };
        }
      }
      return { rank: null, placeName: null, listPreview };
    },
    placeId,
    maxRank,
    CLEAN_NAME_REGEX.source
  );
}

async function clickExpandMore(page: any): Promise<boolean> {
  const rect = await page.evaluate(() => {
    const btn = document.querySelector('a.FtXwJ[role="button"]');
    if (!btn || !(btn.textContent || '').includes('펼쳐서 더보기')) return null;
    (btn as HTMLElement).scrollIntoView({ block: 'center', behavior: 'auto' });
    const r = (btn as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!rect) return false;
  await humanClickWithWander(page, rect.x, rect.y);
  await delay(2000);
  return true;
}

async function clickKeywordMore(page: any, keyword: string): Promise<boolean> {
  const linkRect = await page.evaluate((kw: string) => {
    const links = document.querySelectorAll('a.cf8PL, a[class*="cf8PL"]');
    for (const link of links) {
      const text = (link.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.includes('더보기') && (text.includes(kw) || link.querySelector('.UPDKY')?.textContent?.includes(kw))) {
        link.scrollIntoView({ block: 'center', behavior: 'auto' });
        const r = link.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const all = document.querySelectorAll('a[href*="restaurant/list"]');
    for (const a of all) {
      if ((a.textContent || '').includes('더보기')) {
        a.scrollIntoView({ block: 'center', behavior: 'auto' });
        const r = a.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, keyword);
  if (!linkRect) return false;
  const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  await humanClickWithWander(page, linkRect.x, linkRect.y);
  await navPromise;
  await delay(SAFE_DELAY_MS);
  return page.url().includes('restaurant/list');
}

async function scrollListPage(page: any): Promise<boolean> {
  const ok = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/restaurant/"]'));
    if (links.length === 0) return false;
    const last = links[links.length - 1];
    const item = last.closest('li') || last.closest('[class*="item"]') || last.parentElement?.parentElement || last;
    (item || last).scrollIntoView({ block: 'end', behavior: 'auto' });
    return true;
  });
  if (ok) await delay(800);
  return ok;
}

async function scrollListPageByKeyboard(page: any): Promise<void> {
  await page.keyboard.press('PageDown');
  await delay(400);
  await page.keyboard.press('PageDown');
  await delay(400);
}

async function findPlaceRankInListPage(
  page: any,
  placeId: string | null
): Promise<{ rank: number | null; placeName: string | null; listPreview: string[] }> {
  await delay(2000);
  const MAX_SCROLL_ROUNDS = 30;
  let noNewContentCount = 0;

  for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
    const result = await page.evaluate(
      (targetId: string | null, cleanRegex: string) => {
        const re = new RegExp(cleanRegex, 'gi');
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/restaurant/"]'));
        const seen = new Set<string>();
        let rank = 0;
        const listPreview: string[] = [];
        for (const a of links) {
          const href = a.href || '';
          const idMatch = href.match(/\/restaurant\/(\d+)/);
          if (!idMatch || seen.has(idMatch[1])) continue;
          seen.add(idMatch[1]);
          rank++;
          const item = a.closest('li') || a.closest('[class*="item"]') || a.parentElement?.parentElement || a;
          let name = (item?.querySelector('span, div, strong')?.textContent || a.textContent || '').trim().replace(re, '').trim();
          if (name) listPreview.push(`${rank}. ${name}`);
          if (targetId && idMatch[1] === targetId) return { rank, placeName: name || '알 수 없음', listPreview: listPreview.slice(0, 50), itemCount: rank };
        }
        return { rank: null, placeName: null, listPreview: listPreview.slice(0, 50), itemCount: rank };
      },
      placeId,
      CLEAN_NAME_REGEX.source
    );

    if (result.rank !== null) return { rank: result.rank, placeName: result.placeName, listPreview: result.listPreview };
    const prevCount = result.itemCount ?? 0;
    if (prevCount >= MAX_RANK_LIST) break;
    if (round >= 3) {
      const atEnd = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/restaurant/"]');
        if (links.length === 0) return true;
        const last = links[links.length - 1];
        const el = last.closest('ul') || last.closest('[class*="list"]') || document.documentElement;
        const st = el === document.documentElement ? window.scrollY : (el as HTMLElement).scrollTop;
        const sh = el === document.documentElement ? document.documentElement.scrollHeight : (el as HTMLElement).scrollHeight;
        const ch = el === document.documentElement ? window.innerHeight : (el as HTMLElement).clientHeight;
        return st + ch >= sh - 20;
      });
      if (atEnd) break;
    }
    await scrollListPage(page);
    await scrollListPageByKeyboard(page);
    const afterCount = await page.evaluate(() => {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/restaurant/"]');
      const seen = new Set<string>();
      links.forEach((a) => {
        const m = (a.href || '').match(/\/restaurant\/(\d+)/);
        if (m) seen.add(m[1]);
      });
      return seen.size;
    });
    if (afterCount <= prevCount) {
      noNewContentCount++;
      if (noNewContentCount >= 2) break;
    } else noNewContentCount = 0;
  }
  return { rank: null, placeName: null, listPreview: [] };
}

async function extractReviewsFromPlacePage(page: any, placeId: string): Promise<{
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  starRating: number | null;
  firstImageUrl: string | null;
}> {
  try {
    await page.goto(`https://m.place.naver.com/restaurant/${placeId}/home`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(2500);
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const visitor = bodyText.match(/방문자\s*리뷰\s*([\d,]+)/)?.[1]?.replace(/,/g, '');
    const blog = bodyText.match(/블로그\s*리뷰\s*([\d,]+)/)?.[1]?.replace(/,/g, '');
    const starMatch = bodyText.match(/별점\s*([\d.]+)/);
    let starRating: number | null = starMatch ? parseFloat(starMatch[1]) : null;
    if (starRating == null) {
      const fromEl = await page.evaluate(() => {
        const el = document.querySelector('.h69bs.orXYY, span.h69bs, [class*="h69bs"]');
        const m = (el?.textContent || '').trim().match(/([\d.]+)/);
        return m ? m[1] : null;
      });
      starRating = fromEl ? parseFloat(fromEl) : null;
    }
    const firstImageUrl = await page.evaluate(() => {
      const img = document.querySelector('a.place_thumb img, .place_thumb.QX0J7 img, #_autoPlayable img') as HTMLImageElement | null;
      return img?.src || null;
    });
    return {
      visitorReviewCount: visitor ? parseInt(visitor, 10) : null,
      blogReviewCount: blog ? parseInt(blog, 10) : null,
      starRating: starRating != null && starRating >= 0 && starRating <= 5 ? starRating : null,
      firstImageUrl,
    };
  } catch {
    return { visitorReviewCount: null, blogReviewCount: null, starRating: null, firstImageUrl: null };
  }
}

export interface PlaceRankResult {
  rank: number | null;
  placeName: string | null;
  placeId: string;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  starRating: number | null;
  firstImageUrl: string | null;
}

export async function checkPlaceRank(
  page: any,
  targetUrl: string,
  keywordOverride?: string
): Promise<PlaceRankResult | null> {
  const keyword = keywordOverride ?? getKeywordFromUrl(targetUrl);
  const placeId = await parsePlaceIdFromUrl(targetUrl);
  if (!placeId) return null;

  const searched = await searchOnMobile(page, keyword);
  if (!searched) return null;

  let rank: number | null = null;
  let foundName: string | null = null;

  let result = await findPlaceRankInMobileList(page, placeId, MAX_RANK_INLINE);
  rank = result.rank;
  foundName = result.placeName;

  if (rank === null) {
    const expanded = await clickExpandMore(page);
    if (expanded) {
      result = await findPlaceRankInMobileList(page, placeId, MAX_RANK_INLINE);
      rank = result.rank;
      foundName = result.placeName;
    }
  }

  if (rank === null) {
    const listEntered = await clickKeywordMore(page, keyword);
    if (listEntered) {
      const listResult = await findPlaceRankInListPage(page, placeId);
      rank = listResult.rank;
      foundName = listResult.placeName;
    }
  }

  let visitorReviewCount: number | null = null;
  let blogReviewCount: number | null = null;
  let starRating: number | null = null;
  let firstImageUrl: string | null = null;

  if (rank !== null) {
    const extracted = await extractReviewsFromPlacePage(page, placeId);
    visitorReviewCount = extracted.visitorReviewCount;
    blogReviewCount = extracted.blogReviewCount;
    starRating = extracted.starRating;
    firstImageUrl = extracted.firstImageUrl;
  }

  return {
    rank,
    placeName: foundName,
    placeId,
    visitorReviewCount,
    blogReviewCount,
    starRating,
    firstImageUrl,
  };
}

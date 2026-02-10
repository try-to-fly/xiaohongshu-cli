import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';
import type { Feed, SearchFilters } from '../types/index.js';

const FILTER_MAP: Record<string, { group: number; options: Record<string, number> }> = {
  sortBy: {
    group: 1,
    options: { 综合: 1, 最新: 2, 最多点赞: 3, 最多评论: 4, 最多收藏: 5 },
  },
  noteType: { group: 2, options: { 不限: 1, 视频: 2, 图文: 3 } },
  publishTime: {
    group: 3,
    options: { 不限: 1, 一天内: 2, 一周内: 3, 半年内: 4 },
  },
  searchScope: {
    group: 4,
    options: { 不限: 1, 已看过: 2, 未看过: 3, 已关注: 4 },
  },
  location: { group: 5, options: { 不限: 1, 同城: 2, 附近: 3 } },
};

export async function search(
  page: Page,
  keyword: string,
  filters: SearchFilters = {}
): Promise<Feed[]> {
  const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);

  if (Object.keys(filters).length > 0) {
    await page.hover('div.filter');
    await page.waitForSelector('div.filter-panel');

    for (const [key, value] of Object.entries(filters)) {
      const config = FILTER_MAP[key];
      if (config && config.options[value as string]) {
        const selector = `div.filter-panel div.filters:nth-child(${config.group}) div.tags:nth-child(${config.options[value as string]})`;
        await page.click(selector);
        await sleep(300);
      }
    }

    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);
  }

  const feeds = await page.evaluate(() => {
    const state = (window as any).__INITIAL_STATE__;
    if (state?.search?.feeds) {
      return state.search.feeds.value ?? state.search.feeds._value ?? [];
    }
    return [];
  });

  return feeds;
}

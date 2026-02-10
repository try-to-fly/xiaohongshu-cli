import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';
import type { Feed, SearchFilters } from '../types/index.js';
import { debugSearch } from '../utils/debug.js';

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
  debugSearch('搜索关键词: %s', keyword);
  debugSearch('搜索URL: %s', url);
  debugSearch('筛选条件: %O', filters);

  await page.goto(url);

  // 检查是否被重定向
  const currentUrl = page.url();
  debugSearch('导航后当前URL: %s', currentUrl);
  if (currentUrl !== url) {
    debugSearch('警告: URL发生变化，可能被重定向');
  }

  await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);
  debugSearch('__INITIAL_STATE__ 已加载');

  // 等待搜索结果加载（最多等待 10 秒）
  await page.waitForFunction(
    () => {
      const state = (window as any).__INITIAL_STATE__;
      const feeds = state?.search?.feeds;
      if (!feeds) return false;
      const data = feeds._rawValue ?? feeds._value ?? feeds.value ?? [];
      return Array.isArray(data) && data.length > 0;
    },
    { timeout: 10000 }
  ).catch(() => {
    debugSearch('等待 feeds 数据超时，继续尝试提取');
  });

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

    // 调试: 记录顶层 keys
    const topKeys = Object.keys(state || {});
    console.log('[xhs:search] __INITIAL_STATE__ 顶层 keys:', topKeys);

    // 调试: 记录 search 对象结构
    if (state?.search) {
      console.log('[xhs:search] state.search keys:', Object.keys(state.search));
      console.log('[xhs:search] state.search.feeds 类型:', typeof state.search.feeds);
      if (state.search.feeds) {
        console.log('[xhs:search] state.search.feeds keys:', Object.keys(state.search.feeds));
      }
    } else {
      console.log('[xhs:search] state.search 不存在');
    }

    if (state?.search?.feeds) {
      const feedsData = state.search.feeds._rawValue ?? state.search.feeds._value ?? state.search.feeds.value ?? [];
      console.log('[xhs:search] feeds 数量:', feedsData.length);
      return feedsData;
    }
    return [];
  });

  debugSearch('提取到 feeds 数量: %d', feeds.length);
  if (feeds.length === 0) {
    // 额外调试: 获取完整的 state 结构
    const stateDebug = await page.evaluate(() => {
      const state = (window as any).__INITIAL_STATE__;
      return {
        hasState: !!state,
        topKeys: Object.keys(state || {}),
        hasSearch: !!state?.search,
        searchKeys: state?.search ? Object.keys(state.search) : [],
        feedsType: state?.search?.feeds ? typeof state.search.feeds : 'undefined',
        feedsKeys: state?.search?.feeds ? Object.keys(state.search.feeds) : [],
      };
    });
    debugSearch('state 调试信息: %O', stateDebug);
  }

  return feeds;
}

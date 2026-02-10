import type { Page } from 'playwright';
import { sleep, randomInt, getScrollInterval } from '../utils/helpers.js';
import type { Feed, FeedDetail, CommentConfig } from '../types/index.js';

export async function getFeedsList(page: Page): Promise<Feed[]> {
  await page.goto('https://www.xiaohongshu.com');
  await page.waitForLoadState('domcontentloaded');
  await sleep(1000);

  await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);

  const feeds = await page.evaluate(() => {
    const state = (window as any).__INITIAL_STATE__;
    if (state?.feed?.feeds) {
      const feeds = state.feed.feeds;
      return feeds.value ?? feeds._value ?? [];
    }
    return [];
  });

  return feeds;
}

export async function getFeedDetail(
  page: Page,
  feedId: string,
  xsecToken: string
): Promise<FeedDetail> {
  const url = `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;

  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await sleep(500);

  const errorEl = await page.$(
    '.access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper'
  );
  if (errorEl) {
    const errorText = await errorEl.textContent();
    const keywords = ['无法浏览', '已被删除', '不存在', '私密笔记', '仅作者可见', '违规'];
    for (const kw of keywords) {
      if (errorText?.includes(kw)) {
        throw new Error(`笔记不可访问: ${kw}`);
      }
    }
  }

  const detail = await page.evaluate((feedId: string) => {
    const noteDetailMap = (window as any).__INITIAL_STATE__?.note?.noteDetailMap;
    if (noteDetailMap && noteDetailMap[feedId]) {
      return noteDetailMap[feedId];
    }
    return null;
  }, feedId);

  if (!detail) {
    throw new Error('无法获取笔记详情');
  }

  return detail;
}

export async function loadAllComments(
  page: Page,
  config: CommentConfig = {}
): Promise<void> {
  const {
    clickMoreReplies = false,
    maxRepliesThreshold = 10,
    maxCommentItems = 0,
    scrollSpeed = 'normal',
  } = config;

  const commentsContainer = await page.$('.comments-container');
  if (commentsContainer) {
    await commentsContainer.scrollIntoViewIfNeeded();
  }
  await sleep(500);

  const noCommentsEl = await page.$('.no-comments-text');
  if (noCommentsEl) {
    const text = await noCommentsEl.textContent();
    if (text?.includes('这是一片荒地')) {
      return;
    }
  }

  let lastCount = 0;
  let stagnantChecks = 0;
  const maxAttempts = maxCommentItems > 0 ? maxCommentItems * 3 : 500;

  for (let i = 0; i < maxAttempts; i++) {
    const endEl = await page.$('.end-container');
    if (endEl) {
      const text = await endEl.textContent();
      if (text?.toUpperCase().includes('THE END')) {
        break;
      }
    }

    const comments = await page.$$('.parent-comment');
    const currentCount = comments.length;

    if (maxCommentItems > 0 && currentCount >= maxCommentItems) {
      break;
    }

    if (currentCount === lastCount) {
      stagnantChecks++;
      if (stagnantChecks >= 20) {
        break;
      }
    } else {
      stagnantChecks = 0;
      lastCount = currentCount;
    }

    if (clickMoreReplies && i % 3 === 0) {
      const showMoreButtons = await page.$$('.show-more');
      for (const btn of showMoreButtons.slice(0, 3)) {
        const text = await btn.textContent();
        const match = text?.match(/展开\s*(\d+)\s*条回复/);
        if (match) {
          const replyCount = parseInt(match[1]);
          if (replyCount <= maxRepliesThreshold) {
            await btn.scrollIntoViewIfNeeded();
            await sleep(randomInt(300, 700));
            await btn.click();
            await sleep(randomInt(500, 1200));
          }
        }
      }
    }

    if (comments.length > 0) {
      await comments[comments.length - 1].scrollIntoViewIfNeeded();
      await sleep(randomInt(300, 500));
    }

    await page.evaluate(() => {
      const scrollDelta = window.innerHeight * (0.7 + Math.random() * 0.2);
      window.scrollBy(0, scrollDelta);
    });

    await sleep(getScrollInterval(scrollSpeed));
  }
}

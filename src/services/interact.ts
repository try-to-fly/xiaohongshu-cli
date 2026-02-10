import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';

export async function likeFeed(
  page: Page,
  feedId: string,
  xsecToken: string
): Promise<{ success: boolean; message: string }> {
  return toggleInteract(page, feedId, xsecToken, 'like', true);
}

export async function unlikeFeed(
  page: Page,
  feedId: string,
  xsecToken: string
): Promise<{ success: boolean; message: string }> {
  return toggleInteract(page, feedId, xsecToken, 'like', false);
}

export async function favoriteFeed(
  page: Page,
  feedId: string,
  xsecToken: string
): Promise<{ success: boolean; message: string }> {
  return toggleInteract(page, feedId, xsecToken, 'favorite', true);
}

export async function unfavoriteFeed(
  page: Page,
  feedId: string,
  xsecToken: string
): Promise<{ success: boolean; message: string }> {
  return toggleInteract(page, feedId, xsecToken, 'favorite', false);
}

async function toggleInteract(
  page: Page,
  feedId: string,
  xsecToken: string,
  type: 'like' | 'favorite',
  targetState: boolean
): Promise<{ success: boolean; message: string }> {
  const url = `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await sleep(1000);

  const currentState = await page.evaluate((feedId: string) => {
    const detail = (window as any).__INITIAL_STATE__?.note?.noteDetailMap?.[feedId];
    return {
      liked: detail?.note?.interactInfo?.liked || false,
      collected: detail?.note?.interactInfo?.collected || false,
    };
  }, feedId);

  const stateKey = type === 'like' ? 'liked' : 'collected';
  const selector =
    type === 'like'
      ? '.interact-container .left .like-lottie'
      : '.interact-container .left .reds-icon.collect-icon';

  if (currentState[stateKey] === targetState) {
    return { success: true, message: '状态已是目标值' };
  }

  await page.click(selector);
  await sleep(3000);

  const newState = await page.evaluate((feedId: string) => {
    const detail = (window as any).__INITIAL_STATE__?.note?.noteDetailMap?.[feedId];
    return {
      liked: detail?.note?.interactInfo?.liked || false,
      collected: detail?.note?.interactInfo?.collected || false,
    };
  }, feedId);

  if (newState[stateKey] === targetState) {
    return { success: true, message: '操作成功' };
  }

  await page.click(selector);
  await sleep(2000);

  return { success: true, message: '已重试' };
}

export async function postComment(
  page: Page,
  feedId: string,
  xsecToken: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  const url = `https://www.xiaohongshu.com/explore/${feedId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await sleep(1000);

  const errorEl = await page.$('.access-wrapper, .error-wrapper');
  if (errorEl) {
    throw new Error('笔记不可访问');
  }

  const inputTrigger = await page.$('div.input-box div.content-edit span');
  if (!inputTrigger) {
    throw new Error('未找到评论输入框，该帖子可能不支持评论');
  }
  await inputTrigger.click();

  const inputArea = await page.$('div.input-box div.content-edit p.content-input');
  if (!inputArea) {
    throw new Error('未找到评论输入区域');
  }
  await inputArea.fill(content);
  await sleep(1000);

  await page.click('div.bottom button.submit');
  await sleep(1000);

  return { success: true, message: '评论发表成功' };
}

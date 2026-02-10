import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';

const EXPLORE_URL = 'https://www.xiaohongshu.com/explore';
const LOGIN_SELECTOR = '.main-container .user .link-wrapper .channel';
const QRCODE_SELECTOR = '.login-container .qrcode-img';

export async function checkLoginStatus(page: Page): Promise<boolean> {
  await page.goto(EXPLORE_URL);
  await page.waitForLoadState('load');
  await sleep(1000);

  const loginEl = await page.$(LOGIN_SELECTOR);
  return loginEl !== null;
}

export async function getQrcode(
  page: Page
): Promise<{ isLoggedIn: boolean; qrcode: string | null }> {
  await page.goto(EXPLORE_URL);
  await page.waitForLoadState('load');
  await sleep(2000);

  const loginEl = await page.$(LOGIN_SELECTOR);
  if (loginEl) {
    return { isLoggedIn: true, qrcode: null };
  }

  const qrcodeEl = await page.$(QRCODE_SELECTOR);
  if (!qrcodeEl) {
    throw new Error('未找到二维码元素');
  }

  const src = await qrcodeEl.getAttribute('src');
  return { isLoggedIn: false, qrcode: src };
}

export async function waitForLogin(page: Page, timeout = 120000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const loginEl = await page.$(LOGIN_SELECTOR);
    if (loginEl) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

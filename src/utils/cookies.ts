import fs from 'fs';
import path from 'path';
import type { BrowserContext } from 'playwright';
import { debugCookie } from './debug.js';

const DEFAULT_COOKIE_PATH = path.join(process.cwd(), 'cookies.json');

export async function saveCookies(
  context: BrowserContext,
  filePath: string = DEFAULT_COOKIE_PATH
): Promise<void> {
  const cookies = await context.cookies();
  debugCookie('保存 Cookie 到: %s', filePath);
  debugCookie('Cookie 数量: %d', cookies.length);
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
}

export async function loadCookies(
  context: BrowserContext,
  filePath: string = DEFAULT_COOKIE_PATH
): Promise<boolean> {
  debugCookie('尝试加载 Cookie 从: %s', filePath);

  if (!fs.existsSync(filePath)) {
    debugCookie('Cookie 文件不存在');
    return false;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    debugCookie('Cookie 数量: %d', cookies.length);

    // 记录关键 Cookie
    const webSession = cookies.find((c: any) => c.name === 'web_session');
    const userId = cookies.find((c: any) => c.name === 'customerClientId');
    debugCookie('web_session 存在: %s', !!webSession);
    debugCookie('customerClientId 存在: %s', !!userId);

    if (webSession) {
      const expires = new Date(webSession.expires * 1000);
      debugCookie('web_session 过期时间: %s', expires.toISOString());
      debugCookie('web_session 是否过期: %s', expires < new Date());
    }

    await context.addCookies(cookies);
    debugCookie('Cookie 加载成功');
    return true;
  } catch (error) {
    debugCookie('Cookie 加载失败: %O', error);
    return false;
  }
}

export function deleteCookies(filePath: string = DEFAULT_COOKIE_PATH): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getCookiePath(): string {
  return DEFAULT_COOKIE_PATH;
}

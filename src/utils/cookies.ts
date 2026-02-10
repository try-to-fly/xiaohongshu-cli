import fs from 'fs';
import path from 'path';
import type { BrowserContext } from 'playwright';

const DEFAULT_COOKIE_PATH = path.join(process.cwd(), 'cookies.json');

export async function saveCookies(
  context: BrowserContext,
  filePath: string = DEFAULT_COOKIE_PATH
): Promise<void> {
  const cookies = await context.cookies();
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
}

export async function loadCookies(
  context: BrowserContext,
  filePath: string = DEFAULT_COOKIE_PATH
): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    await context.addCookies(cookies);
    return true;
  } catch {
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

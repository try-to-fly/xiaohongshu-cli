import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { loadCookies, saveCookies } from '../utils/cookies.js';
import { debugBrowser } from '../utils/debug.js';

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init(options: { headless?: boolean; cookiePath?: string } = {}): Promise<Page> {
    const { headless = true, cookiePath } = options;

    debugBrowser('启动浏览器, headless: %s', headless);

    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    debugBrowser('浏览器启动成功');

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // 隐藏自动化特征
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    });

    const cookieLoaded = cookiePath
      ? await loadCookies(this.context, cookiePath)
      : await loadCookies(this.context);

    debugBrowser('Cookie 加载结果: %s', cookieLoaded);

    this.page = await this.context.newPage();
    return this.page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  async saveCookies(cookiePath?: string): Promise<void> {
    if (this.context) {
      await saveCookies(this.context, cookiePath);
    }
  }
}

export const browserService = new BrowserService();

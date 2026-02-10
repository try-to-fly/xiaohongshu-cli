import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';

interface PublishOptions {
  title: string;
  content: string;
  imagePaths: string[];
  tags?: string[];
  scheduleTime?: string;
}

// 点击"上传图文" TAB（带重试机制）
async function clickPublishTab(page: Page, tabName: string): Promise<void> {
  const maxRetries = 15;
  const retryInterval = 200;

  for (let i = 0; i < maxRetries; i++) {
    const tabs = await page.$$('div.creator-tab');

    for (const tab of tabs) {
      // 检查元素是否可见
      const isVisible = await tab.isVisible();
      if (!isVisible) continue;

      // 检查文本是否匹配
      const text = await tab.textContent();
      if (text?.trim() !== tabName) continue;

      // 检查是否被遮挡
      const isBlocked = await tab.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return true;

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        return !(target === el || el.contains(target));
      });

      // 如果被遮挡，移除弹窗并点击空白位置
      if (isBlocked) {
        await page.evaluate(() => {
          const popover = document.querySelector('div.d-popover');
          if (popover) popover.remove();
        });
        // 点击空白位置关闭可能的弹窗
        await page.mouse.click(
          380 + Math.random() * 100,
          20 + Math.random() * 60
        );
        await sleep(200);
        continue; // 重新检查
      }

      // 点击 TAB
      await tab.click();
      return;
    }

    await sleep(retryInterval);
  }

  throw new Error(`未找到发布 TAB: ${tabName}`);
}

export async function publishImage(page: Page, options: PublishOptions): Promise<void> {
  const { title, content, imagePaths, tags = [], scheduleTime } = options;

  // 改进页面加载等待
  await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official');
  await page.waitForLoadState('load');
  await sleep(2000);
  await page.waitForLoadState('domcontentloaded');
  await sleep(1000);
  await page.waitForSelector('div.upload-content', { state: 'visible' });

  // 点击"上传图文" TAB（使用带重试机制的函数）
  await clickPublishTab(page, '上传图文');
  await sleep(1000);

  // 逐张上传图片
  for (let i = 0; i < imagePaths.length; i++) {
    const selector = i === 0 ? '.upload-input' : 'input[type="file"]';
    const input = await page.$(selector);
    if (input) {
      await input.setInputFiles(imagePaths[i]);
    }

    await page.waitForFunction(
      (expected: number) =>
        document.querySelectorAll('.img-preview-area .pr').length >= expected,
      i + 1,
      { timeout: 60000 }
    );
    await sleep(1000);
  }

  // 输入标题
  await page.fill('div.d-input input', title);
  await sleep(500);

  const titleError = await page.$('div.title-container div.max_suffix');
  if (titleError) {
    const errorText = await titleError.textContent();
    throw new Error(`标题超长: ${errorText}`);
  }

  // 输入正文
  const contentEl = await page.$('div.ql-editor');
  if (contentEl) {
    await contentEl.fill(content);
  }
  await sleep(1000);

  const contentError = await page.$('div.edit-container div.length-error');
  if (contentError) {
    const errorText = await contentError.textContent();
    throw new Error(`正文超长: ${errorText}`);
  }

  // 输入标签
  for (const tag of tags.slice(0, 10)) {
    const cleanTag = tag.replace(/^#/, '');

    if (contentEl) {
      // 使用 ArrowDown 确保光标移动到正文末尾
      for (let j = 0; j < 20; j++) {
        await contentEl.press('ArrowDown');
        await sleep(10);
      }
      await contentEl.press('Enter');
      await contentEl.press('Enter');
      await sleep(1000);

      await contentEl.type('#');
      await sleep(200);

      for (const char of cleanTag) {
        await contentEl.type(char);
        await sleep(50);
      }
      await sleep(1000);

      const topicItem = await page.$('#creator-editor-topic-container .item');
      if (topicItem) {
        await topicItem.scrollIntoViewIfNeeded();
        await sleep(200);
        await topicItem.click();
      } else {
        await contentEl.type(' ');
      }
      await sleep(500);
    }
  }

  // 设置定时发布
  if (scheduleTime) {
    const switchBtn = await page.$('.post-time-wrapper .d-switch');
    if (switchBtn) {
      await switchBtn.scrollIntoViewIfNeeded();
      await sleep(200);
      await switchBtn.click();
    }
    await sleep(800);

    const dateInput = await page.$('.date-picker-container input');
    if (dateInput) {
      await dateInput.selectText();
      await dateInput.fill(scheduleTime);
    }
  }

  // 点击发布
  const publishBtn = await page.$('.publish-page-publish-btn button.bg-red');
  if (publishBtn) {
    await publishBtn.scrollIntoViewIfNeeded();
    await sleep(300);
    await publishBtn.click();
  }
  await sleep(3000);
}

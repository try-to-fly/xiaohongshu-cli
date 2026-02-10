import type { Page } from 'playwright';
import { sleep } from '../utils/helpers.js';

interface PublishOptions {
  title: string;
  content: string;
  imagePaths: string[];
  tags?: string[];
  scheduleTime?: string;
}

export async function publishImage(page: Page, options: PublishOptions): Promise<void> {
  const { title, content, imagePaths, tags = [], scheduleTime } = options;

  await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official');
  await page.waitForSelector('div.upload-content');
  await sleep(2000);

  // 点击"上传图文" TAB
  const tabs = await page.$$('div.creator-tab');
  for (const tab of tabs) {
    const text = await tab.textContent();
    if (text?.trim() === '上传图文') {
      const isBlocked = await tab.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        return !(target === el || el.contains(target));
      });

      if (isBlocked) {
        await page.evaluate(() => {
          const popover = document.querySelector('div.d-popover');
          if (popover) popover.remove();
        });
        await sleep(200);
      }

      await tab.click();
      break;
    }
  }
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
      await contentEl.press('End');
      await contentEl.press('Enter');
      await contentEl.press('Enter');
      await contentEl.type('#');
      await sleep(200);

      for (const char of cleanTag) {
        await contentEl.type(char);
        await sleep(50);
      }
      await sleep(1000);

      const topicItem = await page.$('#creator-editor-topic-container .item');
      if (topicItem) {
        await topicItem.click();
      } else {
        await contentEl.type(' ');
      }
      await sleep(500);
    }
  }

  // 设置定时发布
  if (scheduleTime) {
    await page.click('.post-time-wrapper .d-switch');
    await sleep(800);

    const dateInput = await page.$('.date-picker-container input');
    if (dateInput) {
      await dateInput.selectText();
      await dateInput.fill(scheduleTime);
    }
  }

  // 点击发布
  await page.click('.publish-page-publish-btn button.bg-red');
  await sleep(3000);
}

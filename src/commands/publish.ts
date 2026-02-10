import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { browserService, publishImage } from '../services/index.js';

export function registerPublishCommands(program: Command): void {
  program
    .command('publish')
    .description('发布图文笔记')
    .requiredOption('--title <title>', '标题')
    .requiredOption('--content <content>', '正文内容')
    .requiredOption('--images <paths...>', '图片路径(支持多个)')
    .option('--tags <tags...>', '标签(支持多个)')
    .option('--schedule <time>', '定时发布时间 (格式: YYYY-MM-DD HH:mm)')
    .option('--no-headless', '显示浏览器窗口')
    .action(async (options) => {
      // 验证图片路径
      const imagePaths: string[] = [];
      for (const imgPath of options.images) {
        const absolutePath = path.isAbsolute(imgPath) ? imgPath : path.resolve(process.cwd(), imgPath);
        if (!fs.existsSync(absolutePath)) {
          console.error(chalk.red(`图片不存在: ${absolutePath}`));
          process.exit(1);
        }
        imagePaths.push(absolutePath);
      }

      const spinner = ora('准备发布...').start();
      try {
        const page = await browserService.init({ headless: options.headless });

        spinner.text = '上传图片并发布...';
        await publishImage(page, {
          title: options.title,
          content: options.content,
          imagePaths,
          tags: options.tags || [],
          scheduleTime: options.schedule,
        });

        await browserService.close();
        spinner.succeed(chalk.green('发布成功'));
      } catch (error) {
        spinner.fail(chalk.red(`发布失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });
}

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { browserService, search } from '../services/index.js';
import type { SearchFilters } from '../types/index.js';

export function registerSearchCommands(program: Command): void {
  program
    .command('search <keyword>')
    .description('搜索笔记')
    .option('--headless', '无头模式', true)
    .option('-n, --limit <number>', '显示数量', '10')
    .option('--sort <type>', '排序: 综合|最新|最多点赞|最多评论|最多收藏')
    .option('--type <type>', '类型: 不限|视频|图文')
    .option('--time <range>', '时间: 不限|一天内|一周内|半年内')
    .option('--json', '输出 JSON 格式')
    .action(async (keyword, options) => {
      const spinner = ora(`搜索 "${keyword}"...`).start();
      try {
        const page = await browserService.init({ headless: options.headless });

        const filters: SearchFilters = {};
        if (options.sort) filters.sortBy = options.sort;
        if (options.type) filters.noteType = options.type;
        if (options.time) filters.publishTime = options.time;

        const feeds = await search(page, keyword, filters);
        await browserService.close();

        spinner.succeed(`搜索到 ${feeds.length} 条结果`);

        const limit = parseInt(options.limit);
        const displayFeeds = feeds.slice(0, limit);

        if (options.json) {
          console.log(JSON.stringify(displayFeeds, null, 2));
        } else {
          console.log('');
          displayFeeds.forEach((feed: any, index: number) => {
            console.log(chalk.cyan(`[${index + 1}] ${feed.noteCard?.displayTitle || '无标题'}`));
            console.log(chalk.gray(`    ID: ${feed.id}`));
            console.log(chalk.gray(`    Token: ${feed.xsecToken?.substring(0, 20)}...`));
            console.log(chalk.gray(`    作者: ${feed.noteCard?.user?.nickname || '未知'}`));
            console.log(chalk.gray(`    点赞: ${feed.noteCard?.interactInfo?.likedCount || 0}`));
            console.log('');
          });
        }
      } catch (error) {
        spinner.fail(chalk.red(`搜索失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });
}

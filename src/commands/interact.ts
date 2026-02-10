import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { browserService, likeFeed, unlikeFeed, favoriteFeed, unfavoriteFeed, postComment } from '../services/index.js';

export function registerInteractCommands(program: Command): void {
  const interact = program.command('interact').description('互动操作');

  interact
    .command('like <feedId>')
    .description('点赞笔记')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .action(async (feedId, options) => {
      const spinner = ora('点赞中...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await likeFeed(page, feedId, options.token);
        await browserService.close();
        spinner.succeed(chalk.green(result.message));
      } catch (error) {
        spinner.fail(chalk.red(`点赞失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  interact
    .command('unlike <feedId>')
    .description('取消点赞')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .action(async (feedId, options) => {
      const spinner = ora('取消点赞中...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await unlikeFeed(page, feedId, options.token);
        await browserService.close();
        spinner.succeed(chalk.green(result.message));
      } catch (error) {
        spinner.fail(chalk.red(`取消点赞失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  interact
    .command('favorite <feedId>')
    .description('收藏笔记')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .action(async (feedId, options) => {
      const spinner = ora('收藏中...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await favoriteFeed(page, feedId, options.token);
        await browserService.close();
        spinner.succeed(chalk.green(result.message));
      } catch (error) {
        spinner.fail(chalk.red(`收藏失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  interact
    .command('unfavorite <feedId>')
    .description('取消收藏')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .action(async (feedId, options) => {
      const spinner = ora('取消收藏中...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await unfavoriteFeed(page, feedId, options.token);
        await browserService.close();
        spinner.succeed(chalk.green(result.message));
      } catch (error) {
        spinner.fail(chalk.red(`取消收藏失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  interact
    .command('comment <feedId>')
    .description('发表评论')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .requiredOption('-c, --content <content>', '评论内容')
    .option('--headless', '无头模式', true)
    .action(async (feedId, options) => {
      const spinner = ora('发表评论中...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await postComment(page, feedId, options.token, options.content);
        await browserService.close();
        spinner.succeed(chalk.green(result.message));
      } catch (error) {
        spinner.fail(chalk.red(`评论失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });
}

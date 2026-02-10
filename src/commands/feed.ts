import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { browserService, getFeedsList, getFeedDetail, loadAllComments } from '../services/index.js';

export function registerFeedCommands(program: Command): void {
  const feed = program.command('feed').description('Feed 操作');

  feed
    .command('list')
    .description('获取首页推荐列表')
    .option('--headless', '无头模式', true)
    .option('-n, --limit <number>', '显示数量', '10')
    .option('--json', '输出 JSON 格式')
    .action(async (options) => {
      const spinner = ora('获取 Feed 列表...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const feeds = await getFeedsList(page);
        await browserService.close();

        spinner.succeed(`获取到 ${feeds.length} 条 Feed`);

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
        spinner.fail(chalk.red(`获取失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  feed
    .command('detail <feedId>')
    .description('获取笔记详情')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .option('--comments', '加载全部评论')
    .option('--json', '输出 JSON 格式')
    .action(async (feedId, options) => {
      const spinner = ora('获取笔记详情...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const detail = await getFeedDetail(page, feedId, options.token);

        if (options.comments) {
          spinner.text = '加载评论...';
          await loadAllComments(page);
        }

        await browserService.close();
        spinner.succeed('获取成功');

        if (options.json) {
          console.log(JSON.stringify(detail, null, 2));
        } else {
          const note = detail.note;
          console.log('');
          console.log(chalk.cyan(`标题: ${note.title}`));
          console.log(chalk.gray(`ID: ${note.noteId}`));
          console.log(chalk.gray(`类型: ${note.type}`));
          console.log(chalk.gray(`作者: ${note.user?.nickname}`));
          console.log(chalk.gray(`IP属地: ${note.ipLocation}`));
          console.log(chalk.gray(`点赞: ${note.interactInfo?.likedCount}`));
          console.log(chalk.gray(`收藏: ${note.interactInfo?.collectedCount}`));
          console.log(chalk.gray(`评论: ${note.interactInfo?.commentCount}`));
          console.log('');
          console.log(chalk.white('正文:'));
          console.log(note.desc);
        }
      } catch (error) {
        spinner.fail(chalk.red(`获取失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });
}

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { browserService, getUserProfile } from '../services/index.js';

export function registerUserCommands(program: Command): void {
  const user = program.command('user').description('用户操作');

  user
    .command('profile <userId>')
    .description('获取用户主页信息')
    .requiredOption('-t, --token <xsecToken>', 'xsec_token')
    .option('--headless', '无头模式', true)
    .option('--json', '输出 JSON 格式')
    .action(async (userId, options) => {
      const spinner = ora('获取用户信息...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const profile = await getUserProfile(page, userId, options.token);
        await browserService.close();

        spinner.succeed('获取成功');

        if (options.json) {
          console.log(JSON.stringify(profile, null, 2));
        } else {
          const info = profile.basicInfo;
          console.log('');
          console.log(chalk.cyan(`昵称: ${info.nickname}`));
          console.log(chalk.gray(`小红书号: ${info.redId}`));
          console.log(chalk.gray(`简介: ${info.desc || '无'}`));
          console.log(chalk.gray(`IP属地: ${info.ipLocation}`));
          console.log('');

          if (profile.interactions?.length > 0) {
            profile.interactions.forEach((item: any) => {
              console.log(chalk.gray(`${item.name}: ${item.count}`));
            });
            console.log('');
          }

          console.log(chalk.cyan(`笔记数量: ${profile.notes?.length || 0}`));
        }
      } catch (error) {
        spinner.fail(chalk.red(`获取失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });
}

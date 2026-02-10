import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import qrcode from 'qrcode-terminal';
import { browserService, checkLoginStatus, getQrcode, waitForLogin } from '../services/index.js';
import { deleteCookies } from '../utils/cookies.js';

export function registerLoginCommands(program: Command): void {
  const login = program.command('login').description('登录管理');

  login
    .command('status')
    .description('检查登录状态')
    .option('--headless', '无头模式', true)
    .action(async (options) => {
      const spinner = ora('检查登录状态...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const isLoggedIn = await checkLoginStatus(page);
        await browserService.close();

        if (isLoggedIn) {
          spinner.succeed(chalk.green('已登录'));
        } else {
          spinner.warn(chalk.yellow('未登录'));
        }
      } catch (error) {
        spinner.fail(chalk.red(`检查失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  login
    .command('qrcode')
    .description('获取登录二维码并等待扫码')
    .option('--no-headless', '显示浏览器窗口')
    .option('-t, --timeout <seconds>', '超时时间(秒)', '120')
    .action(async (options) => {
      const spinner = ora('获取二维码...').start();
      try {
        const page = await browserService.init({ headless: options.headless });
        const result = await getQrcode(page);

        if (result.isLoggedIn) {
          spinner.succeed(chalk.green('已登录，无需扫码'));
          await browserService.close();
          return;
        }

        spinner.stop();

        if (result.qrcode) {
          // 从 base64 提取数据并显示二维码
          const base64Data = result.qrcode.replace(/^data:image\/\w+;base64,/, '');
          console.log(chalk.cyan('\n请使用小红书 APP 扫描以下二维码登录:\n'));

          // 如果是 base64 图片，提示用户查看浏览器
          if (result.qrcode.startsWith('data:image')) {
            console.log(chalk.yellow('二维码为图片格式，请查看浏览器窗口扫码'));
            console.log(chalk.gray('提示: 使用 --no-headless 参数可显示浏览器窗口\n'));
          }
        }

        const waitSpinner = ora('等待扫码登录...').start();
        const timeout = parseInt(options.timeout) * 1000;
        const success = await waitForLogin(page, timeout);

        if (success) {
          await browserService.saveCookies();
          waitSpinner.succeed(chalk.green('登录成功，Cookie 已保存'));
        } else {
          waitSpinner.fail(chalk.red('登录超时'));
        }

        await browserService.close();
      } catch (error) {
        spinner.fail(chalk.red(`获取二维码失败: ${(error as Error).message}`));
        await browserService.close();
        process.exit(1);
      }
    });

  login
    .command('logout')
    .description('删除保存的 Cookie')
    .action(() => {
      deleteCookies();
      console.log(chalk.green('Cookie 已删除'));
    });
}

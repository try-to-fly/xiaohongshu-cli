#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import {
  registerLoginCommands,
  registerFeedCommands,
  registerSearchCommands,
  registerInteractCommands,
  registerUserCommands,
  registerPublishCommands,
} from './commands/index.js';

const program = new Command();

program
  .name('xhs')
  .description('小红书命令行工具')
  .version('1.0.0');

// 注册所有命令
registerLoginCommands(program);
registerFeedCommands(program);
registerSearchCommands(program);
registerInteractCommands(program);
registerUserCommands(program);
registerPublishCommands(program);

// 错误处理
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error: any) {
  if (error.code === 'commander.help' || error.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  if (error.code === 'commander.version') {
    process.exit(0);
  }
  console.error(chalk.red(error.message));
  process.exit(1);
}

# xhs-cli

小红书命令行工具，基于 Playwright 浏览器自动化实现。

## 功能特性

- 登录管理：二维码登录、状态检查、Cookie 管理
- 内容浏览：获取首页推荐、搜索笔记、查看笔记详情
- 用户信息：获取用户主页信息
- 互动操作：点赞、收藏、评论
- 内容发布：发布图文笔记（支持多图、标签、定时发布）

## 安装

```bash
# 安装依赖
npm install

# 构建
npm run build

# 全局安装（可选）
npm link
```

## 使用方法

### 登录

```bash
# 检查登录状态
xhs login status

# 二维码登录
xhs login qrcode

# 显示浏览器窗口扫码
xhs login qrcode --no-headless

# 退出登录（删除 Cookie）
xhs login logout
```

### 获取 Feed

```bash
# 获取首页推荐列表
xhs feed list

# 限制显示数量
xhs feed list -n 5

# 输出 JSON 格式
xhs feed list --json

# 获取笔记详情
xhs feed detail <feedId> -t <xsecToken>

# 获取详情并加载全部评论
xhs feed detail <feedId> -t <xsecToken> --comments
```

### 搜索

```bash
# 搜索笔记
xhs search "关键词"

# 带筛选条件搜索
xhs search "关键词" --sort 最新 --type 图文 --time 一周内

# 输出 JSON 格式
xhs search "关键词" --json -n 20
```

**筛选选项：**
- `--sort`: 综合 | 最新 | 最多点赞 | 最多评论 | 最多收藏
- `--type`: 不限 | 视频 | 图文
- `--time`: 不限 | 一天内 | 一周内 | 半年内

### 用户信息

```bash
# 获取用户主页信息
xhs user profile <userId> -t <xsecToken>

# 输出 JSON 格式
xhs user profile <userId> -t <xsecToken> --json
```

### 互动操作

```bash
# 点赞
xhs interact like <feedId> -t <xsecToken>

# 取消点赞
xhs interact unlike <feedId> -t <xsecToken>

# 收藏
xhs interact favorite <feedId> -t <xsecToken>

# 取消收藏
xhs interact unfavorite <feedId> -t <xsecToken>

# 发表评论
xhs interact comment <feedId> -t <xsecToken> -c "评论内容"
```

### 发布笔记

```bash
# 发布图文笔记
xhs publish --title "标题" --content "正文内容" --images ./img1.jpg ./img2.jpg

# 带标签发布
xhs publish --title "标题" --content "正文" --images ./img.jpg --tags 标签1 标签2

# 定时发布
xhs publish --title "标题" --content "正文" --images ./img.jpg --schedule "2024-12-25 10:00"

# 显示浏览器窗口
xhs publish --title "标题" --content "正文" --images ./img.jpg --no-headless
```

## 通用选项

- `--headless`: 无头模式运行（默认开启）
- `--no-headless`: 显示浏览器窗口
- `--json`: 输出 JSON 格式
- `-n, --limit <number>`: 限制显示数量

## 开发

```bash
# 开发模式运行（带调试日志）
npm run dev

# 构建
npm run build

# 运行
npm start
```

## 技术栈

- TypeScript
- Playwright（浏览器自动化）
- Commander（CLI 框架）
- Chalk / Ora（终端美化）

## 许可证

MIT

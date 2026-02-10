# 小红书轻量化 HTTP API 技术方案

## 一、项目概述

基于现有 Go 项目的核心实现原理，使用 Node.js 构建一个全新的小红书 HTTP API 服务。

---

## 二、核心控制原理

### 2.1 为什么使用浏览器自动化？

小红书的 Web API 有复杂的签名机制（xs、xt 等参数），直接调用 API 需要逆向签名算法。
**浏览器自动化方案**绕过了这个问题：

- 让真实浏览器执行请求，自动处理签名
- 通过 JavaScript 注入从 `window.__INITIAL_STATE__` 提取数据
- 模拟用户操作（点击、输入、滚动）完成交互

### 2.2 数据来源：`window.__INITIAL_STATE__`

小红书使用 Vue/Nuxt 框架，服务端渲染时将数据注入到全局变量：

```javascript
// 浏览器控制台可以直接查看
console.log(window.__INITIAL_STATE__);
```

**数据结构**：

```javascript
window.__INITIAL_STATE__ = {
  feed: {
    feeds: { _value: [...] }      // 首页推荐列表
  },
  search: {
    feeds: { _value: [...] }      // 搜索结果
  },
  note: {
    noteDetailMap: {              // 笔记详情（按 feedID 索引）
      "feedID123": {
        note: { ... },            // 笔记内容
        comments: { ... }         // 评论列表
      }
    }
  },
  user: {
    userPageData: { _value: {...} },  // 用户信息
    notes: { _value: [...] }          // 用户笔记列表
  }
}
```

---

## 三、核心技术原理

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    小红书 HTTP API                          │
├─────────────────────────────────────────────────────────────┤
│  HTTP Server (Express/Fastify)                              │
│    └── RESTful API 端点                                     │
├─────────────────────────────────────────────────────────────┤
│  业务逻辑层                                                  │
│    ├── LoginService      - 登录管理                         │
│    ├── FeedService       - Feed 列表/详情                   │
│    ├── SearchService     - 搜索功能                         │
│    ├── PublishService    - 发布图文/视频                    │
│    ├── InteractService   - 点赞/收藏/评论                   │
│    └── UserService       - 用户信息                         │
├─────────────────────────────────────────────────────────────┤
│  浏览器自动化层 (Puppeteer/Playwright)                      │
│    ├── 页面导航和等待                                        │
│    ├── DOM 元素操作                                          │
│    ├── JavaScript 注入执行                                   │
│    └── Cookie 管理                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心原理：数据提取

**关键发现**：小红书前端将数据存储在 `window.__INITIAL_STATE__` 全局对象中。

```javascript
// 数据提取的核心方式
const data = await page.evaluate(() => {
  if (window.__INITIAL_STATE__) {
    return JSON.stringify(window.__INITIAL_STATE__);
  }
  return null;
});
```

**数据路径映射**：

| 功能      | 数据路径                                            |
| --------- | --------------------------------------------------- |
| Feed 列表 | `__INITIAL_STATE__.feed.feeds._value` 或 `.value`   |
| 搜索结果  | `__INITIAL_STATE__.search.feeds._value` 或 `.value` |
| 笔记详情  | `__INITIAL_STATE__.note.noteDetailMap[feedID]`      |
| 用户信息  | `__INITIAL_STATE__.user.userPageData._value`        |
| 用户笔记  | `__INITIAL_STATE__.user.notes._value`               |

---

## 三、详细控制流程

### 3.1 登录管理

**页面 URL**: `https://www.xiaohongshu.com/explore`

**控制流程**：

```
1. 打开页面 → 2. 检查是否已登录 → 3. 未登录则获取二维码 → 4. 轮询等待登录成功
```

**DOM 元素**：
| 元素 | CSS 选择器 | 说明 |
|------|------------|------|
| 登录状态标识 | `.main-container .user .link-wrapper .channel` | 存在则已登录 |
| 二维码图片 | `.login-container .qrcode-img` | src 属性为 base64 图片 |

**实现代码**：

```javascript
// 1. 检查登录状态
async function checkLoginStatus(page) {
  await page.goto("https://www.xiaohongshu.com/explore");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000); // 等待页面渲染

  const loginEl = await page.$(".main-container .user .link-wrapper .channel");
  return loginEl !== null;
}

// 2. 获取二维码
async function getQrcode(page) {
  await page.goto("https://www.xiaohongshu.com/explore");
  await page.waitForLoadState("load");
  await page.waitForTimeout(2000);

  // 先检查是否已登录
  const loginEl = await page.$(".main-container .user .link-wrapper .channel");
  if (loginEl) {
    return { isLoggedIn: true, qrcode: null };
  }

  // 获取二维码
  const qrcodeEl = await page.$(".login-container .qrcode-img");
  if (!qrcodeEl) {
    throw new Error("未找到二维码元素");
  }
  const src = await qrcodeEl.getAttribute("src");
  return { isLoggedIn: false, qrcode: src };
}

// 3. 等待登录完成（轮询）
async function waitForLogin(page, timeout = 120000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const loginEl = await page.$(
      ".main-container .user .link-wrapper .channel",
    );
    if (loginEl) {
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}
```

### 3.2 获取 Feed 列表

**页面 URL**: `https://www.xiaohongshu.com`

**控制流程**：

```
1. 打开首页 → 2. 等待 __INITIAL_STATE__ 加载 → 3. 执行 JS 提取数据
```

**数据提取**：

```javascript
async function getFeedsList(page) {
  await page.goto("https://www.xiaohongshu.com");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  // 等待数据加载
  await page.waitForFunction(() => window.__INITIAL_STATE__ !== undefined);

  // 提取数据
  const feeds = await page.evaluate(() => {
    const state = window.__INITIAL_STATE__;
    if (state?.feed?.feeds) {
      const feeds = state.feed.feeds;
      // 兼容两种数据格式
      return feeds.value ?? feeds._value ?? [];
    }
    return [];
  });

  return feeds;
}
```

**返回数据结构**（每个 Feed 包含）：

```typescript
interface Feed {
  id: string; // 笔记 ID，用于获取详情
  xsecToken: string; // 安全令牌，访问详情必须携带
  modelType: string; // "note"
  noteCard: {
    type: string; // "normal"(图文) | "video"(视频)
    displayTitle: string; // 标题
    user: {
      userId: string;
      nickname: string;
      avatar: string;
    };
    interactInfo: {
      liked: boolean;
      likedCount: string;
      collected: boolean;
      collectedCount: string;
      commentCount: string;
    };
    cover: {
      url: string;
      width: number;
      height: number;
    };
  };
}
```

**重要**：`xsecToken` 是访问笔记详情、用户主页的必需参数，必须从 Feed 列表获取。

### 3.3 搜索功能

**页面 URL**: `https://www.xiaohongshu.com/search_result?keyword={keyword}&source=web_explore_feed`

**控制流程**：

```
1. 构造搜索 URL → 2. 打开页面 → 3. (可选)应用筛选条件 → 4. 提取搜索结果
```

**筛选条件 DOM 操作**：

| 筛选组   | 索引 | 选项                                               |
| -------- | ---- | -------------------------------------------------- |
| 排序依据 | 1    | 1=综合, 2=最新, 3=最多点赞, 4=最多评论, 5=最多收藏 |
| 笔记类型 | 2    | 1=不限, 2=视频, 3=图文                             |
| 发布时间 | 3    | 1=不限, 2=一天内, 3=一周内, 4=半年内               |
| 搜索范围 | 4    | 1=不限, 2=已看过, 3=未看过, 4=已关注               |
| 位置距离 | 5    | 1=不限, 2=同城, 3=附近                             |

**筛选选择器**：`div.filter-panel div.filters:nth-child({筛选组}) div.tags:nth-child({选项})`

**实现代码**：

```javascript
async function search(page, keyword, filters = {}) {
  // 1. 构造 URL 并打开
  const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
  await page.goto(url);
  await page.waitForFunction(() => window.__INITIAL_STATE__ !== undefined);

  // 2. 应用筛选条件
  if (Object.keys(filters).length > 0) {
    // 悬停在筛选按钮上，触发下拉面板
    await page.hover("div.filter");
    await page.waitForSelector("div.filter-panel");

    // 筛选映射
    const filterMap = {
      sortBy: {
        group: 1,
        options: { 综合: 1, 最新: 2, 最多点赞: 3, 最多评论: 4, 最多收藏: 5 },
      },
      noteType: { group: 2, options: { 不限: 1, 视频: 2, 图文: 3 } },
      publishTime: {
        group: 3,
        options: { 不限: 1, 一天内: 2, 一周内: 3, 半年内: 4 },
      },
      searchScope: {
        group: 4,
        options: { 不限: 1, 已看过: 2, 未看过: 3, 已关注: 4 },
      },
      location: { group: 5, options: { 不限: 1, 同城: 2, 附近: 3 } },
    };

    // 点击筛选选项
    for (const [key, value] of Object.entries(filters)) {
      const config = filterMap[key];
      if (config && config.options[value]) {
        const selector = `div.filter-panel div.filters:nth-child(${config.group}) div.tags:nth-child(${config.options[value]})`;
        await page.click(selector);
        await page.waitForTimeout(300);
      }
    }

    // 等待页面更新
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => window.__INITIAL_STATE__ !== undefined);
  }

  // 3. 提取搜索结果
  const feeds = await page.evaluate(() => {
    const state = window.__INITIAL_STATE__;
    if (state?.search?.feeds) {
      return state.search.feeds.value ?? state.search.feeds._value ?? [];
    }
    return [];
  });

  return feeds;
}
```

### 3.4 获取笔记详情

**页面 URL**: `https://www.xiaohongshu.com/explore/{feedID}?xsec_token={xsecToken}&xsec_source=pc_feed`

**控制流程**：

```
1. 构造详情 URL → 2. 打开页面 → 3. 检查页面是否可访问 → 4. 提取笔记数据
```

**错误检测 DOM**：
| 错误类型 | CSS 选择器 | 关键词 |
|----------|------------|--------|
| 访问受限 | `.access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper` | 见下方列表 |

**错误关键词**：

- "当前笔记暂时无法浏览"
- "该内容因违规已被删除"
- "该笔记已被删除"
- "内容不存在"
- "私密笔记"
- "仅作者可见"

**实现代码**：

```javascript
async function getFeedDetail(page, feedID, xsecToken) {
  // 1. 构造 URL
  const url = `https://www.xiaohongshu.com/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_feed`;

  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);

  // 2. 检查页面是否可访问
  const errorEl = await page.$(
    ".access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper",
  );
  if (errorEl) {
    const errorText = await errorEl.textContent();
    const keywords = [
      "无法浏览",
      "已被删除",
      "不存在",
      "私密笔记",
      "仅作者可见",
      "违规",
    ];
    for (const kw of keywords) {
      if (errorText.includes(kw)) {
        throw new Error(`笔记不可访问: ${kw}`);
      }
    }
  }

  // 3. 提取笔记详情
  const detail = await page.evaluate((feedID) => {
    const noteDetailMap = window.__INITIAL_STATE__?.note?.noteDetailMap;
    if (noteDetailMap && noteDetailMap[feedID]) {
      return noteDetailMap[feedID];
    }
    return null;
  }, feedID);

  if (!detail) {
    throw new Error("无法获取笔记详情");
  }

  return detail; // { note: {...}, comments: {...} }
}
```

**返回数据结构**：

```typescript
interface FeedDetailResponse {
  note: {
    noteId: string;
    title: string;
    desc: string; // 正文内容
    type: string; // "normal" | "video"
    time: number; // 发布时间戳
    ipLocation: string; // IP 属地
    user: User;
    interactInfo: {
      liked: boolean; // 当前用户是否点赞
      likedCount: string;
      collected: boolean; // 当前用户是否收藏
      collectedCount: string;
      commentCount: string;
    };
    imageList: Array<{
      width: number;
      height: number;
      urlDefault: string; // 图片 URL
    }>;
  };
  comments: {
    list: Comment[];
    cursor: string;
    hasMore: boolean;
  };
}

interface Comment {
  id: string;
  noteId: string;
  content: string;
  likeCount: string;
  createTime: number;
  ipLocation: string;
  liked: boolean;
  userInfo: User;
  subCommentCount: string; // 子评论数量
  subComments: Comment[]; // 子评论列表
}
```

### 3.5 加载全部评论

**控制流程**：

```
1. 滚动到评论区 → 2. 循环滚动触发懒加载 → 3. (可选)点击"展开更多回复" → 4. 检测到底部停止
```

**关键 DOM 元素**：
| 元素 | CSS 选择器 | 说明 |
|------|------------|------|
| 评论容器 | `.comments-container` | 评论区域 |
| 评论总数 | `.comments-container .total` | 文本格式："共N条评论" |
| 单条评论 | `.parent-comment` | 主评论元素 |
| 展开更多 | `.show-more` | 文本格式："展开N条回复" |
| 底部标识 | `.end-container` | 文本包含 "THE END" |
| 无评论 | `.no-comments-text` | 文本包含 "这是一片荒地" |

**实现代码**：

```javascript
async function loadAllComments(page, config = {}) {
  const {
    clickMoreReplies = false, // 是否展开子评论
    maxRepliesThreshold = 10, // 子评论数量阈值（超过则跳过）
    maxCommentItems = 0, // 最大加载评论数（0=不限）
    scrollSpeed = "normal", // slow | normal | fast
  } = config;

  // 1. 滚动到评论区
  const commentsContainer = await page.$(".comments-container");
  if (commentsContainer) {
    await commentsContainer.scrollIntoViewIfNeeded();
  }
  await sleep(500);

  // 检查是否无评论
  const noCommentsEl = await page.$(".no-comments-text");
  if (noCommentsEl) {
    const text = await noCommentsEl.textContent();
    if (text.includes("这是一片荒地")) {
      return; // 无评论，直接返回
    }
  }

  let lastCount = 0;
  let stagnantChecks = 0;
  const maxAttempts = maxCommentItems > 0 ? maxCommentItems * 3 : 500;

  for (let i = 0; i < maxAttempts; i++) {
    // 2. 检查是否到达底部
    const endEl = await page.$(".end-container");
    if (endEl) {
      const text = await endEl.textContent();
      if (text.toUpperCase().includes("THE END")) {
        console.log("已到达评论底部");
        break;
      }
    }

    // 3. 获取当前评论数
    const comments = await page.$$(".parent-comment");
    const currentCount = comments.length;

    // 检查是否达到目标
    if (maxCommentItems > 0 && currentCount >= maxCommentItems) {
      console.log(`已达到目标评论数: ${currentCount}`);
      break;
    }

    // 停滞检测
    if (currentCount === lastCount) {
      stagnantChecks++;
      if (stagnantChecks >= 20) {
        console.log("评论加载停滞，停止");
        break;
      }
    } else {
      stagnantChecks = 0;
      lastCount = currentCount;
    }

    // 4. 点击"展开更多回复"按钮
    if (clickMoreReplies && i % 3 === 0) {
      const showMoreButtons = await page.$$(".show-more");
      for (const btn of showMoreButtons.slice(0, 3)) {
        const text = await btn.textContent();
        const match = text.match(/展开\s*(\d+)\s*条回复/);
        if (match) {
          const replyCount = parseInt(match[1]);
          if (replyCount <= maxRepliesThreshold) {
            await btn.scrollIntoViewIfNeeded();
            await sleep(randomInt(300, 700));
            await btn.click();
            await sleep(randomInt(500, 1200));
          }
        }
      }
    }

    // 5. 滚动到最后一个评论
    if (comments.length > 0) {
      await comments[comments.length - 1].scrollIntoViewIfNeeded();
      await sleep(randomInt(300, 500));
    }

    // 6. 模拟人类滚动
    await page.evaluate(() => {
      const scrollDelta = window.innerHeight * (0.7 + Math.random() * 0.2);
      window.scrollBy(0, scrollDelta);
    });

    await sleep(getScrollInterval(scrollSpeed));
  }
}

function getScrollInterval(speed) {
  switch (speed) {
    case "slow":
      return randomInt(1200, 1500);
    case "fast":
      return randomInt(300, 400);
    default:
      return randomInt(600, 800);
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 3.6 发布图文（详细版）

**页面 URL**: `https://creator.xiaohongshu.com/publish/publish?source=official`

**完整控制流程**：

```
1. 导航到发布页面
2. 等待页面加载完成（WaitLoad + WaitDOMStable）
3. 点击"上传图文" TAB（处理弹窗遮挡）
4. 逐张上传图片（等待每张上传完成）
5. 输入标题（检查长度限制）
6. 输入正文（检查长度限制）
7. 输入标签（使用标签联想）
8. (可选) 设置定时发布
9. 点击发布按钮
```

#### 3.6.1 页面初始化

```javascript
async function initPublishPage(page) {
  const url = "https://creator.xiaohongshu.com/publish/publish?source=official";

  await page.goto(url);

  // 等待页面加载
  await page.waitForLoadState("load");
  await sleep(2000);

  // 等待 DOM 稳定
  await page.waitForLoadState("domcontentloaded");
  await sleep(1000);

  // 等待上传区域出现
  await page.waitForSelector("div.upload-content", { state: "visible" });
}
```

#### 3.6.2 点击 TAB（处理弹窗遮挡）

**关键问题**：页面可能有弹窗（`div.d-popover`）遮挡 TAB 按钮

```javascript
async function clickPublishTab(page, tabName) {
  // tabName: "上传图文" 或 "上传视频"

  const maxRetries = 15;
  const retryInterval = 200;

  for (let i = 0; i < maxRetries; i++) {
    // 1. 查找所有 TAB 元素
    const tabs = await page.$$("div.creator-tab");

    for (const tab of tabs) {
      // 检查元素是否可见
      const isVisible = await tab.isVisible();
      if (!isVisible) continue;

      // 检查文本是否匹配
      const text = await tab.textContent();
      if (text.trim() !== tabName) continue;

      // 2. 检查是否被遮挡
      const isBlocked = await tab.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return true;

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        return !(target === el || el.contains(target));
      });

      // 3. 如果被遮挡，移除弹窗
      if (isBlocked) {
        console.log("TAB 被遮挡，尝试移除弹窗");
        await page.evaluate(() => {
          const popover = document.querySelector("div.d-popover");
          if (popover) popover.remove();
        });
        // 点击空白位置
        await page.mouse.click(
          380 + Math.random() * 100,
          20 + Math.random() * 60,
        );
        await sleep(200);
        continue;
      }

      // 4. 点击 TAB
      await tab.click();
      return true;
    }

    await sleep(retryInterval);
  }

  throw new Error(`未找到发布 TAB: ${tabName}`);
}
```

#### 3.6.3 上传图片（逐张上传）

**关键点**：

- 第一张图片使用 `.upload-input` 选择器
- 后续图片使用 `input[type="file"]` 选择器
- 每张图片上传后，等待预览元素数量增加

```javascript
async function uploadImages(page, imagePaths) {
  // 1. 验证文件存在
  const validPaths = [];
  for (const path of imagePaths) {
    if (fs.existsSync(path)) {
      validPaths.push(path);
      console.log(`有效图片: ${path}`);
    } else {
      console.warn(`图片不存在: ${path}`);
    }
  }

  if (validPaths.length === 0) {
    throw new Error("没有有效的图片文件");
  }

  // 2. 逐张上传
  for (let i = 0; i < validPaths.length; i++) {
    const path = validPaths[i];

    // 选择器：第一张用 .upload-input，后续用 input[type="file"]
    const selector = i === 0 ? ".upload-input" : 'input[type="file"]';

    const input = await page.$(selector);
    if (!input) {
      throw new Error(`未找到上传输入框 (第${i + 1}张)`);
    }

    // 设置文件
    await input.setInputFiles(path);
    console.log(`已提交上传: 第${i + 1}张 - ${path}`);

    // 3. 等待上传完成（预览元素数量达到 i+1）
    await waitForUploadComplete(page, i + 1);
    await sleep(1000);
  }
}

async function waitForUploadComplete(page, expectedCount) {
  const maxWait = 60000; // 60秒超时
  const interval = 500;
  const startTime = Date.now();
  let lastCount = expectedCount - 1;

  while (Date.now() - startTime < maxWait) {
    const previews = await page.$$(".img-preview-area .pr");
    const currentCount = previews.length;

    // 数量变化时打印日志
    if (currentCount !== lastCount) {
      console.log(`上传进度: ${currentCount}/${expectedCount}`);
      lastCount = currentCount;
    }

    if (currentCount >= expectedCount) {
      console.log(`第${expectedCount}张图片上传完成`);
      return;
    }

    await sleep(interval);
  }

  throw new Error(`第${expectedCount}张图片上传超时(60s)`);
}
```

#### 3.6.4 输入标题（检查长度）

**标题限制**：最大 20 个单位长度（中文算 2，英文算 1）

```javascript
async function inputTitle(page, title) {
  const titleInput = await page.$("div.d-input input");
  if (!titleInput) {
    throw new Error("未找到标题输入框");
  }

  await titleInput.fill(title);
  await sleep(500);

  // 检查是否超长
  const maxSuffix = await page.$("div.title-container div.max_suffix");
  if (maxSuffix) {
    const errorText = await maxSuffix.textContent();
    // 格式: "25/20" 表示当前25，最大20
    const parts = errorText.split("/");
    if (parts.length === 2) {
      throw new Error(`标题超长: 当前${parts[0]}，最大${parts[1]}`);
    }
    throw new Error(`标题超长: ${errorText}`);
  }

  console.log("标题输入完成");
}
```

#### 3.6.5 输入正文（检查长度）

**正文输入框**：有两种可能的选择器

- `div.ql-editor` - Quill 富文本编辑器
- `p[data-placeholder*="输入正文描述"]` 的父级 `[role="textbox"]`

```javascript
async function inputContent(page, content) {
  // 尝试两种选择器
  let contentEl = await page.$("div.ql-editor");

  if (!contentEl) {
    // 备选方案：通过 placeholder 查找
    const placeholderEl = await page.$('p[data-placeholder*="输入正文描述"]');
    if (placeholderEl) {
      // 向上查找 role="textbox" 的父元素
      contentEl = await placeholderEl.evaluateHandle((el) => {
        let current = el;
        for (let i = 0; i < 5; i++) {
          current = current.parentElement;
          if (current && current.getAttribute("role") === "textbox") {
            return current;
          }
        }
        return null;
      });
    }
  }

  if (!contentEl) {
    throw new Error("未找到正文输入框");
  }

  await contentEl.fill(content);
  await sleep(1000);

  // 检查是否超长
  const lengthError = await page.$("div.edit-container div.length-error");
  if (lengthError) {
    const errorText = await lengthError.textContent();
    const parts = errorText.split("/");
    if (parts.length === 2) {
      throw new Error(`正文超长: 当前${parts[0]}，最大${parts[1]}`);
    }
    throw new Error(`正文超长: ${errorText}`);
  }

  console.log("正文输入完成");
  return contentEl; // 返回元素，后续输入标签需要
}
```

#### 3.6.6 输入标签（使用标签联想）

**标签输入流程**：

1. 移动光标到正文末尾
2. 按两次回车换行
3. 输入 `#` 触发标签联想
4. 逐字输入标签内容
5. 等待联想下拉框出现
6. 点击第一个联想选项（或输入空格）

```javascript
async function inputTags(page, contentEl, tags) {
  if (!tags || tags.length === 0) return;

  // 最多 10 个标签
  const validTags = tags.slice(0, 10);

  await sleep(1000);

  // 移动到正文末尾，按多次下箭头确保到底部
  for (let i = 0; i < 20; i++) {
    await contentEl.press("ArrowDown");
    await sleep(10);
  }

  // 按两次回车换行
  await contentEl.press("Enter");
  await contentEl.press("Enter");
  await sleep(1000);

  // 逐个输入标签
  for (const tag of validTags) {
    const cleanTag = tag.replace(/^#/, ""); // 移除开头的 #
    await inputSingleTag(page, contentEl, cleanTag);
  }
}

async function inputSingleTag(page, contentEl, tag) {
  // 1. 输入 #
  await contentEl.type("#");
  await sleep(200);

  // 2. 逐字输入标签
  for (const char of tag) {
    await contentEl.type(char);
    await sleep(50);
  }

  await sleep(1000);

  // 3. 查找标签联想容器
  const topicContainer = await page.$("#creator-editor-topic-container");
  if (!topicContainer) {
    console.warn(`未找到标签联想下拉框，直接输入空格: ${tag}`);
    await contentEl.type(" ");
    return;
  }

  // 4. 查找第一个联想选项
  const firstItem = await topicContainer.$(".item");
  if (!firstItem) {
    console.warn(`未找到标签联想选项，直接输入空格: ${tag}`);
    await contentEl.type(" ");
    return;
  }

  // 5. 点击联想选项
  await firstItem.click();
  console.log(`成功点击标签联想: ${tag}`);

  await sleep(500);
}
```

#### 3.6.7 设置定时发布

**定时发布限制**：1 小时后 ~ 14 天内

```javascript
async function setSchedulePublish(page, scheduleTime) {
  // scheduleTime: Date 对象或 "YYYY-MM-DD HH:mm" 字符串

  // 1. 点击定时发布开关
  const switchEl = await page.$(".post-time-wrapper .d-switch");
  if (!switchEl) {
    throw new Error("未找到定时发布开关");
  }
  await switchEl.click();
  await sleep(800);

  // 2. 格式化时间
  const dateTimeStr =
    typeof scheduleTime === "string"
      ? scheduleTime
      : formatDateTime(scheduleTime);

  // 3. 输入时间
  const dateInput = await page.$(".date-picker-container input");
  if (!dateInput) {
    throw new Error("未找到日期时间输入框");
  }

  // 选中现有文本并替换
  await dateInput.click({ clickCount: 3 }); // 三击全选
  await dateInput.fill(dateTimeStr);

  console.log(`定时发布设置完成: ${dateTimeStr}`);
}

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
```

#### 3.6.8 点击发布按钮

```javascript
async function clickPublishButton(page) {
  const publishBtn = await page.$(".publish-page-publish-btn button.bg-red");
  if (!publishBtn) {
    throw new Error("未找到发布按钮");
  }

  await publishBtn.click();
  await sleep(3000);

  console.log("已点击发布按钮");
}
```

#### 3.6.9 完整发布图文函数

```javascript
async function publishImage(
  page,
  { title, content, imagePaths, tags = [], scheduleTime = null },
) {
  // 1. 初始化发布页面
  await initPublishPage(page);

  // 2. 点击"上传图文" TAB
  await clickPublishTab(page, "上传图文");
  await sleep(1000);

  // 3. 上传图片
  await uploadImages(page, imagePaths);

  // 4. 输入标题
  await inputTitle(page, title);
  await sleep(1000);

  // 5. 输入正文
  const contentEl = await inputContent(page, content);

  // 6. 输入标签
  await inputTags(page, contentEl, tags);
  await sleep(1000);

  // 7. 设置定时发布（可选）
  if (scheduleTime) {
    await setSchedulePublish(page, scheduleTime);
  }

  // 8. 点击发布
  await clickPublishButton(page);
}
```

---

### 3.7 发布视频（详细版）

**与图文的主要区别**：

1. TAB 名称为"上传视频"
2. 只上传一个视频文件
3. 视频处理时间更长（最多等待 10 分钟）
4. 需要等待发布按钮变为可点击状态

#### 3.7.1 上传视频

```javascript
async function uploadVideo(page, videoPath) {
  // 1. 验证文件存在
  if (!fs.existsSync(videoPath)) {
    throw new Error(`视频文件不存在: ${videoPath}`);
  }

  // 2. 查找上传输入框
  let fileInput = await page.$(".upload-input");
  if (!fileInput) {
    fileInput = await page.$('input[type="file"]');
  }
  if (!fileInput) {
    throw new Error("未找到视频上传输入框");
  }

  // 3. 设置文件
  await fileInput.setInputFiles(videoPath);
  console.log(`已提交视频上传: ${videoPath}`);

  // 4. 等待视频处理完成（发布按钮变为可点击）
  await waitForPublishButtonClickable(page);
}
```

#### 3.7.2 等待发布按钮可点击

**视频处理可能需要较长时间**，需要等待发布按钮从禁用状态变为可点击状态。

```javascript
async function waitForPublishButtonClickable(page) {
  const maxWait = 10 * 60 * 1000; // 10 分钟
  const interval = 1000;
  const startTime = Date.now();
  const selector = ".publish-page-publish-btn button.bg-red";

  console.log("开始等待发布按钮可点击（视频处理中）...");

  while (Date.now() - startTime < maxWait) {
    const btn = await page.$(selector);
    if (btn) {
      // 检查是否可见
      const isVisible = await btn.isVisible();
      if (!isVisible) {
        await sleep(interval);
        continue;
      }

      // 检查是否禁用
      const disabled = await btn.getAttribute("disabled");
      if (disabled !== null) {
        await sleep(interval);
        continue;
      }

      // 检查 class 是否包含 disabled
      const className = await btn.getAttribute("class");
      if (className && className.includes("disabled")) {
        await sleep(interval);
        continue;
      }

      console.log("视频处理完成，发布按钮可点击");
      return btn;
    }

    await sleep(interval);
  }

  throw new Error("等待发布按钮可点击超时（10分钟）");
}
```

#### 3.7.3 完整发布视频函数

```javascript
async function publishVideo(
  page,
  { title, content, videoPath, tags = [], scheduleTime = null },
) {
  // 1. 初始化发布页面
  await initPublishPage(page);

  // 2. 点击"上传视频" TAB
  await clickPublishTab(page, "上传视频");
  await sleep(1000);

  // 3. 上传视频（会等待处理完成）
  await uploadVideo(page, videoPath);

  // 4. 输入标题
  await inputTitle(page, title);
  await sleep(1000);

  // 5. 输入正文
  const contentEl = await inputContent(page, content);

  // 6. 输入标签
  await inputTags(page, contentEl, tags);
  await sleep(1000);

  // 7. 设置定时发布（可选）
  if (scheduleTime) {
    await setSchedulePublish(page, scheduleTime);
  }

  // 8. 等待发布按钮可点击并点击
  const publishBtn = await waitForPublishButtonClickable(page);
  await publishBtn.click();
  await sleep(3000);

  console.log("视频发布完成");
}
```

---

### 3.8 发布功能 DOM 选择器汇总

| 元素           | 选择器                                    | 说明                         |
| -------------- | ----------------------------------------- | ---------------------------- |
| 上传区域容器   | `div.upload-content`                      | 等待页面加载                 |
| TAB 按钮       | `div.creator-tab`                         | 文本为"上传图文"或"上传视频" |
| 弹窗遮挡       | `div.d-popover`                           | 需要移除                     |
| 首张图片上传   | `.upload-input`                           | 第一张图片/视频              |
| 后续图片上传   | `input[type="file"]`                      | 第 2 张及以后                |
| 图片预览       | `.img-preview-area .pr`                   | 统计已上传数量               |
| 标题输入框     | `div.d-input input`                       | 标题                         |
| 标题超长提示   | `div.title-container div.max_suffix`      | 格式: "25/20"                |
| 正文输入框(主) | `div.ql-editor`                           | Quill 编辑器                 |
| 正文输入框(备) | `p[data-placeholder*="输入正文描述"]`     | 向上找 textbox               |
| 正文超长提示   | `div.edit-container div.length-error`     | 格式: "1500/1000"            |
| 标签联想容器   | `#creator-editor-topic-container`         | 标签下拉框                   |
| 标签联想选项   | `#creator-editor-topic-container .item`   | 第一个选项                   |
| 定时发布开关   | `.post-time-wrapper .d-switch`            | 开关按钮                     |
| 定时输入框     | `.date-picker-container input`            | 格式: YYYY-MM-DD HH:mm       |
| 发布按钮       | `.publish-page-publish-btn button.bg-red` | 红色发布按钮                 |

---

### 3.9 发布功能常见问题

#### Q1: TAB 点击无效

**原因**：页面有弹窗（`div.d-popover`）遮挡
**解决**：移除弹窗元素，或点击空白位置关闭

#### Q2: 图片上传超时

**原因**：网络慢或图片太大
**解决**：增加超时时间，或压缩图片

#### Q3: 标题/正文超长

**原因**：超过字数限制
**解决**：检查 `div.max_suffix` 或 `div.length-error` 元素

#### Q4: 标签联想不出现

**原因**：输入太快或网络延迟
**解决**：增加输入间隔，或直接输入空格跳过

#### Q5: 视频处理超时

**原因**：视频太大或服务器繁忙
**解决**：增加等待时间（默认 10 分钟）

#### Q6: 发布按钮不可点击

**原因**：内容未填写完整或正在处理中
**解决**：检查必填项，等待处理完成

**页面 URL**: `https://www.xiaohongshu.com/explore/{feedID}?xsec_token={xsecToken}&xsec_source=pc_feed`

**控制流程**：

```
1. 打开详情页 → 2. 读取当前状态 → 3. 判断是否需要操作 → 4. 点击按钮 → 5. 验证状态变化
```

**关键 DOM 元素**：
| 元素 | CSS 选择器 | 说明 |
|------|------------|------|
| 点赞按钮 | `.interact-container .left .like-lottie` | 点赞图标 |
| 收藏按钮 | `.interact-container .left .reds-icon.collect-icon` | 收藏图标 |

**状态读取**（从 `__INITIAL_STATE__`）：

```javascript
// 读取点赞/收藏状态
const state = await page.evaluate((feedID) => {
  const detail = window.__INITIAL_STATE__?.note?.noteDetailMap?.[feedID];
  return {
    liked: detail?.note?.interactInfo?.liked || false,
    collected: detail?.note?.interactInfo?.collected || false,
  };
}, feedID);
```

**实现代码**：

```javascript
// 点赞
async function likeFeed(page, feedID, xsecToken) {
  return toggleInteract(page, feedID, xsecToken, "like", true);
}

// 取消点赞
async function unlikeFeed(page, feedID, xsecToken) {
  return toggleInteract(page, feedID, xsecToken, "like", false);
}

// 收藏
async function favoriteFeed(page, feedID, xsecToken) {
  return toggleInteract(page, feedID, xsecToken, "favorite", true);
}

// 取消收藏
async function unfavoriteFeed(page, feedID, xsecToken) {
  return toggleInteract(page, feedID, xsecToken, "favorite", false);
}

// 通用交互操作
async function toggleInteract(page, feedID, xsecToken, type, targetState) {
  const url = `https://www.xiaohongshu.com/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await sleep(1000);

  // 读取当前状态
  const currentState = await page.evaluate((feedID) => {
    const detail = window.__INITIAL_STATE__?.note?.noteDetailMap?.[feedID];
    return {
      liked: detail?.note?.interactInfo?.liked || false,
      collected: detail?.note?.interactInfo?.collected || false,
    };
  }, feedID);

  const stateKey = type === "like" ? "liked" : "collected";
  const selector =
    type === "like"
      ? ".interact-container .left .like-lottie"
      : ".interact-container .left .reds-icon.collect-icon";

  // 检查是否需要操作
  if (currentState[stateKey] === targetState) {
    console.log(`已经是目标状态，无需操作`);
    return { success: true, message: "状态已是目标值" };
  }

  // 点击按钮
  await page.click(selector);
  await sleep(3000);

  // 验证状态变化
  const newState = await page.evaluate((feedID) => {
    const detail = window.__INITIAL_STATE__?.note?.noteDetailMap?.[feedID];
    return {
      liked: detail?.note?.interactInfo?.liked || false,
      collected: detail?.note?.interactInfo?.collected || false,
    };
  }, feedID);

  if (newState[stateKey] === targetState) {
    return { success: true, message: "操作成功" };
  }

  // 状态未变化，重试一次
  console.log("状态未变化，重试...");
  await page.click(selector);
  await sleep(2000);

  return { success: true, message: "已重试" };
}
```

### 3.8 发表评论/回复

**页面 URL**: `https://www.xiaohongshu.com/explore/{feedID}?xsec_token={xsecToken}&xsec_source=pc_feed`

**控制流程（发表评论）**：

```
1. 打开详情页 → 2. 点击评论输入框 → 3. 输入评论内容 → 4. 点击提交
```

**控制流程（回复评论）**：

```
1. 打开详情页 → 2. 滚动查找目标评论 → 3. 点击回复按钮 → 4. 输入回复内容 → 5. 点击提交
```

**关键 DOM 元素**：
| 元素 | CSS 选择器 | 说明 |
|------|------------|------|
| 评论输入框触发 | `div.input-box div.content-edit span` | 点击激活输入框 |
| 评论输入区域 | `div.input-box div.content-edit p.content-input` | 实际输入区域 |
| 提交按钮 | `div.bottom button.submit` | 提交评论 |
| 评论元素 | `.parent-comment, .comment-item, .comment` | 评论容器 |
| 回复按钮 | `.right .interactions .reply` | 评论的回复按钮 |
| 评论 ID 定位 | `#comment-{commentID}` | 通过 ID 定位评论 |

**实现代码**：

```javascript
// 发表评论
async function postComment(page, feedID, xsecToken, content) {
  const url = `https://www.xiaohongshu.com/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await sleep(1000);

  // 检查页面是否可访问
  const errorEl = await page.$(".access-wrapper, .error-wrapper");
  if (errorEl) {
    throw new Error("笔记不可访问");
  }

  // 点击评论输入框
  const inputTrigger = await page.$("div.input-box div.content-edit span");
  if (!inputTrigger) {
    throw new Error("未找到评论输入框，该帖子可能不支持评论");
  }
  await inputTrigger.click();

  // 输入评论内容
  const inputArea = await page.$(
    "div.input-box div.content-edit p.content-input",
  );
  await inputArea.fill(content);
  await sleep(1000);

  // 点击提交
  await page.click("div.bottom button.submit");
  await sleep(1000);

  return { success: true, message: "评论发表成功" };
}

// 回复评论
async function replyToComment(
  page,
  feedID,
  xsecToken,
  commentID,
  userID,
  content,
) {
  const url = `https://www.xiaohongshu.com/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // 查找目标评论
  const commentEl = await findCommentElement(page, commentID, userID);
  if (!commentEl) {
    throw new Error("未找到目标评论");
  }

  // 滚动到评论位置
  await commentEl.scrollIntoViewIfNeeded();
  await sleep(1000);

  // 点击回复按钮
  const replyBtn = await commentEl.$(".right .interactions .reply");
  if (!replyBtn) {
    throw new Error("未找到回复按钮");
  }
  await replyBtn.click();
  await sleep(1000);

  // 输入回复内容
  const inputArea = await page.$(
    "div.input-box div.content-edit p.content-input",
  );
  await inputArea.fill(content);
  await sleep(500);

  // 点击提交
  await page.click("div.bottom button.submit");
  await sleep(2000);

  return { success: true, message: "回复成功" };
}

// 查找评论元素（需要滚动加载）
async function findCommentElement(page, commentID, userID) {
  const maxAttempts = 100;

  // 滚动到评论区
  const commentsContainer = await page.$(".comments-container");
  if (commentsContainer) {
    await commentsContainer.scrollIntoViewIfNeeded();
  }
  await sleep(1000);

  for (let i = 0; i < maxAttempts; i++) {
    // 检查是否到达底部
    const endEl = await page.$(".end-container");
    if (endEl) {
      const text = await endEl.textContent();
      if (text.toUpperCase().includes("THE END")) {
        break;
      }
    }

    // 通过 commentID 查找
    if (commentID) {
      const el = await page.$(`#comment-${commentID}`);
      if (el) return el;
    }

    // 通过 userID 查找
    if (userID) {
      const comments = await page.$$(
        ".parent-comment, .comment-item, .comment",
      );
      for (const comment of comments) {
        const userEl = await comment.$(`[data-user-id="${userID}"]`);
        if (userEl) return comment;
      }
    }

    // 继续滚动
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });
    await sleep(800);
  }

  return null;
}
```

### 3.9 获取用户主页

**页面 URL**: `https://www.xiaohongshu.com/user/profile/{userID}?xsec_token={xsecToken}&xsec_source=pc_note`

**控制流程**：

```
1. 构造用户主页 URL → 2. 打开页面 → 3. 等待数据加载 → 4. 提取用户信息和笔记列表
```

**数据路径**：

- 用户信息：`__INITIAL_STATE__.user.userPageData._value` 或 `.value`
- 用户笔记：`__INITIAL_STATE__.user.notes._value` 或 `.value`

**实现代码**：

```javascript
async function getUserProfile(page, userID, xsecToken) {
  const url = `https://www.xiaohongshu.com/user/profile/${userID}?xsec_token=${xsecToken}&xsec_source=pc_note`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => window.__INITIAL_STATE__ !== undefined);

  const profile = await page.evaluate(() => {
    const state = window.__INITIAL_STATE__;

    // 提取用户信息
    const userPageData = state?.user?.userPageData;
    const userData =
      userPageData?.value ?? userPageData?._value ?? userPageData?._rawValue;

    // 提取用户笔记
    const notes = state?.user?.notes;
    const notesData = notes?.value ?? notes?._value ?? [];

    return {
      basicInfo: userData?.basicInfo || {},
      interactions: userData?.interactions || [],
      notes: Array.isArray(notesData) ? notesData.flat() : [], // 展平双重数组
    };
  });

  return profile;
}
```

**返回数据结构**：

```typescript
interface UserProfileResponse {
  basicInfo: {
    nickname: string;
    redId: string; // 小红书号
    desc: string; // 个人简介
    gender: number; // 0=未知, 1=男, 2=女
    ipLocation: string; // IP 属地
    images: string; // 头像 URL
    imageb: string; // 背景图 URL
  };
  interactions: Array<{
    type: string; // "follows" | "fans" | "interaction"
    name: string; // "关注" | "粉丝" | "获赞与收藏"
    count: string; // 数量
  }>;
  notes: Feed[]; // 用户发布的笔记列表
}
```

---

## 四、Cookie 管理

**Cookie 持久化**是保持登录状态的关键。

```javascript
const fs = require("fs");

// 保存 cookies
async function saveCookies(context, filePath = "cookies.json") {
  const cookies = await context.cookies();
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  console.log(`Cookies 已保存到 ${filePath}`);
}

// 加载 cookies
async function loadCookies(context, filePath = "cookies.json") {
  if (!fs.existsSync(filePath)) {
    console.log("Cookie 文件不存在");
    return false;
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    await context.addCookies(cookies);
    console.log(`已加载 ${cookies.length} 个 cookies`);
    return true;
  } catch (error) {
    console.error("加载 cookies 失败:", error);
    return false;
  }
}

// 删除 cookies
function deleteCookies(filePath = "cookies.json") {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("Cookies 已删除");
  }
}
```

**使用流程**：

```javascript
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  // 尝试加载已保存的 cookies
  const loaded = await loadCookies(context);

  const page = await context.newPage();

  if (!loaded) {
    // 需要登录
    const { qrcode } = await getQrcode(page);
    console.log("请扫描二维码登录");
    // 显示二维码...

    await waitForLogin(page);
    await saveCookies(context); // 登录成功后保存
  }

  // 继续其他操作...
}
```

---

## 五、浏览器管理

### 5.1 浏览器初始化

```javascript
const { chromium } = require("playwright");

class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init(options = {}) {
    const { headless = true, cookiePath = "cookies.json" } = options;

    // 启动浏览器
    this.browser = await chromium.launch({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled", // 隐藏自动化特征
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    // 创建上下文
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    // 加载 cookies
    await loadCookies(this.context, cookiePath);

    // 创建页面
    this.page = await this.context.newPage();

    return this.page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage() {
    return this.page;
  }

  getContext() {
    return this.context;
  }
}
```

### 5.2 反检测措施

```javascript
// 在页面加载前注入脚本，隐藏自动化特征
await page.addInitScript(() => {
  // 隐藏 webdriver 属性
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
  });

  // 修改 plugins
  Object.defineProperty(navigator, "plugins", {
    get: () => [1, 2, 3, 4, 5],
  });

  // 修改 languages
  Object.defineProperty(navigator, "languages", {
    get: () => ["zh-CN", "zh", "en"],
  });
});
```

---

## 六、API 设计

### 6.1 RESTful API 端点

```
基础路径: /api/v1

认证管理
├── GET    /login/status       - 检查登录状态
├── GET    /login/qrcode       - 获取登录二维码
└── DELETE /login/cookies      - 删除 cookies，重置登录

Feed 操作
├── GET    /feeds              - 获取首页推荐列表
├── POST   /feeds/search       - 搜索笔记
├── POST   /feeds/detail       - 获取笔记详情
├── POST   /feeds/like         - 点赞
├── DELETE /feeds/like         - 取消点赞
├── POST   /feeds/favorite     - 收藏
├── DELETE /feeds/favorite     - 取消收藏
└── POST   /feeds/comment      - 发表评论

发布操作
├── POST   /publish            - 发布图文
└── POST   /publish/video      - 发布视频

用户操作
├── GET    /user/me            - 获取当前登录用户信息
└── POST   /user/profile       - 获取指定用户主页

系统
└── GET    /health             - 健康检查
```

### 6.2 请求/响应示例

**搜索笔记**：

```bash
POST /api/v1/feeds/search
Content-Type: application/json

{
  "keyword": "美食",
  "filters": {
    "sortBy": "最新",
    "noteType": "图文",
    "publishTime": "一周内"
  }
}
```

**获取笔记详情**：

```bash
POST /api/v1/feeds/detail
Content-Type: application/json

{
  "feedId": "6578a1b2c3d4e5f6",
  "xsecToken": "ABCxyz123...",
  "loadAllComments": true,
  "commentConfig": {
    "clickMoreReplies": true,
    "maxRepliesThreshold": 10,
    "maxCommentItems": 100,
    "scrollSpeed": "normal"
  }
}
```

**发布图文**：

```bash
POST /api/v1/publish
Content-Type: application/json

{
  "title": "今日美食分享",
  "content": "这是一道超级好吃的菜...",
  "imagePaths": ["/path/to/image1.jpg", "/path/to/image2.jpg"],
  "tags": ["美食", "分享", "日常"],
  "scheduleTime": "2024-01-20 10:00"  // 可选，定时发布
}
```

---

## 七、Node.js 技术栈建议

| 组件         | 推荐方案       | 说明                                          |
| ------------ | -------------- | --------------------------------------------- |
| HTTP 框架    | **Fastify**    | 性能优于 Express，内置 JSON Schema 验证       |
| 浏览器自动化 | **Playwright** | 比 Puppeteer 更稳定，API 更友好，支持多浏览器 |
| 日志         | **Pino**       | 高性能 JSON 日志                              |
| 参数验证     | **Zod**        | TypeScript 友好的 Schema 验证                 |
| 进程管理     | **PM2**        | 生产环境部署、进程守护                        |
| TypeScript   | **推荐使用**   | 类型安全，更好的开发体验                      |

---

## 八、关键注意事项

### 8.1 xsec_token 机制

- **必须配对使用**：访问笔记详情、用户主页等都需要从 Feed 列表获取的 `xsecToken`
- **有时效性**：token 可能会过期，需要重新获取
- **一一对应**：每个 Feed 的 xsecToken 只能用于访问该 Feed

### 8.2 模拟人类行为

```javascript
// 随机延迟
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 在操作之间添加随机延迟
await sleep(randomInt(300, 700)); // 300-700ms 随机延迟
```

### 8.3 错误处理

- 检查页面是否可访问（笔记被删除、私密笔记等）
- 处理网络超时
- 处理元素未找到的情况
- 实现重试机制

### 8.4 并发控制

浏览器实例是有状态的，需要合理管理：

- 单实例串行处理请求
- 或使用浏览器池管理多个实例

---

## 九、项目结构建议

```
xiaohongshu-api/
├── src/
│   ├── index.ts              # 入口
│   ├── server.ts             # HTTP 服务器
│   ├── routes/               # 路由定义
│   │   ├── login.ts
│   │   ├── feeds.ts
│   │   ├── publish.ts
│   │   └── user.ts
│   ├── services/             # 业务逻辑
│   │   ├── browser.ts        # 浏览器管理
│   │   ├── login.ts          # 登录服务
│   │   ├── feed.ts           # Feed 服务
│   │   ├── search.ts         # 搜索服务
│   │   ├── publish.ts        # 发布服务
│   │   ├── interact.ts       # 点赞/收藏/评论
│   │   └── user.ts           # 用户服务
│   ├── utils/
│   │   ├── cookies.ts        # Cookie 管理
│   │   ├── sleep.ts          # 延迟工具
│   │   └── random.ts         # 随机数工具
│   └── types/                # TypeScript 类型定义
│       └── xiaohongshu.ts
├── cookies.json              # Cookie 存储（gitignore）
├── package.json
├── tsconfig.json
└── README.md
```

---

## 十、DOM 选择器速查表

| 功能         | 选择器                                                            | 说明           |
| ------------ | ----------------------------------------------------------------- | -------------- |
| 登录状态     | `.main-container .user .link-wrapper .channel`                    | 存在则已登录   |
| 二维码       | `.login-container .qrcode-img`                                    | src 为 base64  |
| 评论容器     | `.comments-container`                                             | 评论区域       |
| 单条评论     | `.parent-comment`                                                 | 主评论         |
| 展开回复     | `.show-more`                                                      | "展开N条回复"  |
| 底部标识     | `.end-container`                                                  | 包含 "THE END" |
| 点赞按钮     | `.interact-container .left .like-lottie`                          | 点赞           |
| 收藏按钮     | `.interact-container .left .reds-icon.collect-icon`               | 收藏           |
| 评论输入触发 | `div.input-box div.content-edit span`                             | 点击激活       |
| 评论输入区   | `div.input-box div.content-edit p.content-input`                  | 输入内容       |
| 提交按钮     | `div.bottom button.submit`                                        | 提交评论       |
| 发布页上传区 | `div.upload-content`                                              | 等待加载       |
| TAB 按钮     | `div.creator-tab`                                                 | 上传图文/视频  |
| 首张图片上传 | `.upload-input`                                                   | 第一张         |
| 后续图片上传 | `input[type="file"]`                                              | 后续           |
| 图片预览     | `.img-preview-area .pr`                                           | 已上传预览     |
| 标题输入     | `div.d-input input`                                               | 标题           |
| 正文输入     | `div.ql-editor`                                                   | 富文本         |
| 标签联想     | `#creator-editor-topic-container .item`                           | 第一个选项     |
| 定时开关     | `.post-time-wrapper .d-switch`                                    | 定时发布       |
| 定时输入     | `.date-picker-container input`                                    | 日期时间       |
| 发布按钮     | `.publish-page-publish-btn button.bg-red`                         | 发布           |
| 筛选按钮     | `div.filter`                                                      | 悬停触发       |
| 筛选面板     | `div.filter-panel`                                                | 筛选选项       |
| 筛选选项     | `div.filter-panel div.filters:nth-child(N) div.tags:nth-child(M)` | N=组,M=选项    |

# FFM | Fzu Food Map 改进方案

> 本文档基于 2026-04-25 对仓库的完整审阅撰写，涵盖 `fzu-food-map`（用户端地图应用）和 `ffm-studio`（数据编辑器）两个子项目的现状分析、改进方案与技术知识补充。

---

## 一、fzu-food-map（用户端）现状

### 1.1 架构概览

| 项目 | 详情 |
|------|------|
| 框架 | React 19 + TypeScript 5.9 + Vite 7 |
| 地图 | MapLibre GL 5.10（来源：MapTiler） |
| 搜索 | 本地 Fuse.js（已安装） + 自写过滤逻辑 |
| 数据 | 本地静态 GeoJSON（`public/data/fuzhou/*.geojson`） |
| 收藏 | localStorage Set\<string\> |
| 路由 | 无，纯单页 |
| 状态管理 | 无，useState + useRef |

### 1.2 现有文件结构

```
fzu-food-map/src/
├── App.tsx              (956行) ← 巨型单体，需拆分
├── App.css              (1274行) ← 全部样式
├── main.tsx             (18行)
├── index.css            (68行) ← Vite 默认样式，可删除
├── types.ts             (44行)
├── cities/
│   ├── index.ts         城市/区域配置类型
│   └── fuzhou.config.ts 福州各区地理信息
├── components/
│   ├── MapView.tsx       (1006行) ← 巨型单体，需拆分
│   ├── SourcesSection.tsx
│   ├── SourceIcon.tsx
│   ├── SourceIconStack.tsx
│   └── SourceListPopover.tsx
├── utils/
│   ├── favorites.ts     localStorage CRUD
│   ├── share.ts         URL参数读写
│   └── sources.ts       来源数据规范化
└── assets/
    └── announcement.txt 公告内容
```

### 1.3 核心问题

1. **UI 空间已满**：顶栏（logo + 搜索 + 切换区域）和左下浮动栏（定位 + 公告 + 主题）已占满所有位置，无预留扩展入口。

2. **巨型组件不可维护**：`App.tsx` 定义 5 个内联子组件 + 十数个 hook，`MapView.tsx` 混合地图初始化、图层管理、Popup 渲染、搜索过滤、定位追踪、收藏同步。

3. **收藏功能残缺**：
   - `App.tsx:293` 的 `onlyFav` 硬编码为 `false`
   - 收藏数据只有 Set 存取，无视图、无分组、无排序
   - URL 参数 `?fav=` 已解析但没有触发入口

4. **零代码复用**：`SearchInput`、`SelectionDropdown` 等组件为 App 内部闭包，`escapeHtml`、`ratingValue` 散落在 MapView 内。

5. **缺少路由/面板管理**：切换不同"模式"（地图、收藏、抽奖）无统一机制，依赖多层 boolean useState。

---

## 二、fzu-food-map 改进方案

### 2.1 架构层：引入 Context + 面板管理

```
新架构层次：
  App → ThemeProvider → MapProvider → PanelRouter
                                     ├── MapPanel (地图模式)
                                     ├── FavoritesPanel (收藏模式)
                                     └── LuckyDrawPanel (抽奖模式)
```

新建 `src/contexts/` 目录，将分散的 state 提升为 Context：

| Context | 覆盖范围 |
|---------|----------|
| `ThemeContext` | 主题切换（当前在 App.tsx 的 `theme` state） |
| `FavoritesContext` | 收藏读写、排序、分组、分享（替代 `utils/favorites.ts`） |
| `DataContext` | 地图数据加载与搜索（从 `MapView.tsx` 提取） |
| `PanelContext` | 当前面板状态（地图/收藏/抽奖） |

### 2.2 组件层：拆分巨头 + 新增功能模块

#### 拆分计划

```
src/
├── components/
│   ├── Toolbar.tsx               ← 从 App.tsx 拆出顶栏整体
│   ├── SearchPanel.tsx            ← 从 App.tsx 拆出搜索弹窗
│   ├── LocationPanel.tsx          ← 从 App.tsx 拆出区域切换面板
│   ├── FloatingDock.tsx           ← 从 App.tsx 拆出左下浮动按钮组
│   ├── AppPanel.tsx               ★ 新增：右侧功能导航+面板容器
│   ├── FavoritesPanel.tsx         ★ 新增：收藏夹列表
│   ├── LuckyDrawPanel.tsx         ★ 新增：随机抽奖面板
│   └── MapView.tsx                ← 简化后的地图组件
├── contexts/
│   ├── ThemeContext.tsx            ★ 新增
│   ├── FavoritesContext.tsx        ★ 新增
│   ├── DataContext.tsx             ★ 新增（从 MapView 提取）
│   └── PanelContext.tsx            ★ 新增
├── hooks/
│   ├── useFavorites.ts            ★ 新增（扩展 utils/favorites.ts）
│   ├── useLuckyDraw.ts            ★ 新增（抽奖算法）
│   └── useSearch.ts               ← 从 MapView 提取搜索逻辑
└── utils/
    ├── favorites.ts               ← 保留并扩展
    ├── share.ts                   ← 保留
    └── sources.ts                 ← 保留
```

#### 新增 UI 方案：右侧玻璃态功能面板

不破坏现有顶栏和左下浮动栏，在**右下角**增加一个功能入口按钮组，点击后从右侧滑出玻璃态面板：

```
┌──────────────────────────────────────────────┐
│  [🍜Logo]  [🔍搜索]              [切换区域]   │ ← 顶栏不动
│                                              │
│                  地图主体                     │
│                                              │
│  [📍定位]                        ┌────────┐  │
│  [📢公告]                        │  ★ 收藏  │  │ ← 右下功能入口
│  [🌙主题]                        │  🎲 抽奖  │  │
│                                  └────────┘  │
└──────────────────────────────────────────────┘

点击后右侧滑出面板（复用现有 --surface-card 玻璃态风格）：

┌──────────────────────────────┬──────────────┐
│         地图主体              │  收藏夹  [✕]  │
│                              │──────────────│
│                              │ 旗山校区 (3)  │
│                              │  ├ 沙茶面 ★★  │
│                              │  ├ 兰州拉面 ★  │
│                              │  └ 小炒店 ★   │
│                              │ 铜盘校区 (1)  │
│                              │  ├ 黄焖鸡 ★   │
│                              │──────────────│
│                              │ [📤分享] [清空]│
└──────────────────────────────┴──────────────┘
```

#### 收藏夹面板 (FavoritesPanel)

**功能**：
- 按区域分组展示所有收藏店铺
- 每项显示：名称、标签、评分、价格
- 点击项目跳转到地图上的店铺位置
- 批量分享功能（通过 URL 的 `?fav=` 参数）
- 一键清空

**实现依托现有代码**：
- `utils/favorites.ts` 的 `getFavs()` / `toggleFav()` 直接复用
- `utils/share.ts` 的 `buildShareUrl()` 已有 `favIds` 参数
- 分组逻辑可参照 `App.tsx:533-561` 的 `groupedSuggestions`

#### 随机抽奖面板 (LuckyDrawPanel)

**功能**：
- 筛选条件：区域（下拉）、类别（下拉）、价格区间、仅限收藏、最低评分
- 加权随机算法：收藏权重 ×2，评分越高权重越大
- 点击"抽一个"触发动画（备选方案：转盘动画 / 抽签动画 / 简洁翻牌）
- 结果展示：店铺名 + 标签 + 评分 + "在地图上查看"按钮 + "再抽一次"按钮
- 历史记录：保存最近 10 次抽奖结果，避免重复

**推荐初始方案：简洁翻牌动画**（实现最快，与现有 UI 风格一致）：
- 抽奖时快速滚动店名（类似老虎机），2 秒后定格
- 结果以卡片形式展示
- 转盘动画作为后续迭代

### 2.3 数据层：优化搜索与性能

- **启用 Fuse.js**：当前已安装 `fuse.js@7.1.0` 但未使用，搜索逻辑完全是自写的 `matchesSearch()`。用 Fuse.js 替代可获得更好的模糊搜索和中文支持。
- **拆出 `useMapData.ts`**：将 `MapView.tsx` 中 545-604 行的数据加载逻辑提取为独立 hook。

---

## 三、ffm-studio（数据编辑器）现状与改进

### 3.1 架构概览

```
ffm-studio/
├── src/
│   ├── App.tsx              (1108行) 主编辑器逻辑
│   ├── api.ts               (81行)   API 请求层
│   ├── types.ts             (88行)   类型定义
│   ├── geojsonDiff.ts       (110行)  Dirty/差异检测
│   ├── index.css            (1241行) 设计系统CSS
│   └── components/
│       ├── TreePanel.tsx     (305行) 文件树侧栏
│       ├── CategoryEditor.tsx (163行) 类型选择器
│       ├── TagEditor.tsx     (138行) 标签编辑器
│       ├── IncludeEditor.tsx (59行)  内嵌店铺编辑器
│       ├── SourceListEditor.tsx (93行) 来源列表编辑器
│       └── MiniMap.tsx       (114行) 坐标预览地图
├── server/
│   └── index.mjs            (701行) 纯Node HTTP服务（无Express）
├── scripts/
│   ├── dev.mjs              (191行) 开发环境编排
│   └── build.mjs           (21行)  构建脚本
└── .cache/
    ├── taxonomy.json        标签/类别缓存
    └── data/fuzhou/         缓存 GeoJSON（编辑沙盒）
```

### 3.2 编辑工作流

```
[source]                          [cache]                        [UI]
fzu-food-map/public/data/  ←保存←  ffm-studio/.cache/data/  ←编辑← App.tsx
                         overwrite                             3s 自动写入
```

- cache 是编辑沙盒，source 是发布目录
- 编辑后 3 秒自动写入 cache
- 手动"同步至源目录"将 cache 完整覆写 source
- taxonomy 缓存独立管理

### 3.3 核心问题

1. **半成品状态明确标注**：
   - `README.md` 写明 "This tool is still in an early stage"
   - `/api/source-search` 端点返回 501 "待实现"
   - `SourceListEditor.tsx` 按钮标注 "预留：半自动搜索"
   - 仅支持手动录入来源

2. **搜索链接自动化缺失**（这是你提的关键点）：
   - `SourceListEditor.tsx` 有 `pageUrl`、`searchUrl`、`appUrl` 三个字段
   - 目前全是手动填写，零自动化
   - **改进方向**：输入店铺名称后，自动生成各平台的 `searchUrl`（URL-encode 店名 + 平台搜索前缀），并根据用户设备自动选择 `appUrl`（移动端用 URL scheme，桌面端用 Web URL）

3. **App.tsx 同样巨型**：1108 行，内联了 Modal 组件和十多个状态变量。

4. **缺少批量操作**：
   - 无法批量修改多个点位的分类/标签
   - 无法批量导入 Google Maps/高德导出的 KML 文件

5. **没有数据验证**：
   - 坐标可手动输入负数或超出中国范围的值
   - 评分可输入 >5 的值
   - 无必填字段校验

### 3.4 ffm-studio 改进方案

#### 短期（完成核心闭环）

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | **自动生成搜索链接** | 输入店名后一键生成各平台 `searchUrl`和 `appUrl` |
| P0 | **设备检测适配** | 根据 User-Agent 区分桌面端/移动端，自动填充对应链接 |
| P1 | URL scheme 验证 | 预览时自动检测 appUrl 是否可跳转，在卡片上标注"移动端专用" |
| P1 | 批量标签编辑 | 选中多个点位，统一添加/删除标签 |
| P2 | 数据验证 | 坐标范围校验、评分 0-5 校验、必填字段提示 |

#### 中期（提升编辑效率）

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P1 | `/api/source-search` 实现 | 对接公开搜索 API（如大众点评搜索页抓取）自动填充来源 |
| P1 | KML/GPX 导入 | 支持从高德/Google Maps 导出文件批量导入点位 |
| P2 | 重复点位检测 | 基于名称+距离检测疑似重复的点位 |
| P2 | 变更日志 | 记录每次"同步至源目录"的 diff |
| P3 | 拖拽排序 | TreePanel 支持拖拽调整点位顺序 |

#### 长期（完善生产工具）

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P2 | 版本管理 | Git 集成，每次保存自动 commit |
| P3 | 图片管理 | 为点位添加照片字段（本地/图床） |
| P3 | 协作编辑 | 多人同时编辑时的冲突检测 |

### 3.5 搜索链接自动化设计（重点）

#### 方案：URL-Encode 店铺名称自动拼接

在 `SourceListEditor.tsx` 中，当用户输入 `platform` 字段时，根据已知平台前缀自动生成 `searchUrl`。

**核心实现**：

```typescript
// 平台搜索模板
const PLATFORM_URL_TEMPLATES: Record<string, {
  searchUrl: string;      // Web 搜索链接（桌面端+移动端通用）
  pageUrl?: string;       // 如果已确认具体页面
  mobileScheme?: string;  // iOS URL Scheme
  androidScheme?: string; // Android URL Scheme / Intent
  desktopSearchUrl?: string; // 桌面端专用（部分平台不同）
}> = {
  dianping: {
    searchUrl: "https://m.dianping.com/search/keyword/{query}",
    pageUrl: "https://m.dianping.com/shop/{id}",
    mobileScheme: "dianping://web?url={url_encoded}",
    androidScheme: "dianping://web?url={url_encoded}",
  },
  meituan: {
    searchUrl: "https://i.meituan.com/poi/s/{query}",
    mobileScheme: "imeituan://www.meituan.com/search?query={query}",
    androidScheme: "imeituan://www.meituan.com/search?query={query}",
  },
  xiaohongshu: {
    searchUrl: "https://www.xiaohongshu.com/search_result?keyword={query}",
    mobileScheme: "xhsdiscover://search?keyword={query}",
  },
  amap: {
    searchUrl: "https://ditu.amap.com/search?query={query}",
    mobileScheme: "iosamap://search?keyword={query}",
    androidScheme: "amapuri://search?keyword={query}",
  },
  baidu_map: {
    searchUrl: "https://map.baidu.com/search/{query}",
    mobileScheme: "baidumap://map/place/search?query={query}",
  },
  apple_maps: {
    searchUrl: "https://maps.apple.com/?q={query}",
    mobileScheme: "maps://?q={query}",
  },
  google_maps: {
    searchUrl: "https://www.google.com/maps/search/{query}",
    mobileScheme: "comgooglemaps://?q={query}",
  },
  // ... 更多平台
};

function generateSearchUrl(platform: string, keyword: string): string | null {
  const template = PLATFORM_URL_TEMPLATES[platform.toLowerCase()];
  if (!template) return null;
  return template.searchUrl.replace("{query}", encodeURIComponent(keyword));
}

function generateAppUrl(
  platform: string, 
  keyword: string, 
  device: "ios" | "android" | "desktop"
): string | null {
  const template = PLATFORM_URL_TEMPLATES[platform.toLowerCase()];
  if (!template) return null;

  if (device === "desktop") {
    // 桌面端：直接用 Web 链接
    return template.searchUrl.replace("{query}", encodeURIComponent(keyword));
  }

  // 移动端：优先使用 app URL scheme
  const scheme = device === "ios" 
    ? (template.mobileScheme || template.androidScheme)
    : (template.androidScheme || template.mobileScheme);
  
  if (!scheme) return null;
  return scheme.replace("{query}", encodeURIComponent(keyword));
}
```

#### 集成到 SourceListEditor

在 `SourceListEditor.tsx` 中：
1. 当用户选择平台（下拉选择）并填写来源标题后，自动填充 `searchUrl` 和 `appUrl`
2. 增加一个"生成链接"按钮（及自动生成开关）
3. 预览区域显示：Web 链接（桌面端） / App 跳转链接（移动端，显示对应的 scheme）
4. 增加设备检测提示："当前为桌面端，自动生成 Web 搜索链接"

#### fzu-food-map 侧的改进

在 `fzu-food-map/src/utils/sources.ts` 的 `getPreferredSourceUrl()` 中，当前逻辑是优先 `appUrl`，这在**桌面端**会失效。应改为：

```typescript
function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getPreferredSourceUrl(source: PoiSource) {
  if (isMobile()) {
    // 移动端优先 app scheme（可唤起 App）
    return normalizeOptionalString(source.appUrl) 
      ?? normalizeOptionalString(source.searchUrl)
      ?? normalizeOptionalString(source.pageUrl);
  }
  // 桌面端只能用 Web 链接
  return normalizeOptionalString(source.searchUrl) 
    ?? normalizeOptionalString(source.pageUrl)
    ?? normalizeOptionalString(source.appUrl);
}
```

同时区分 Android 和 iOS（某些平台 Android/iOS scheme 不同）。当前 `PoiSource` 类型已经有两个字段 `appUrl` 和 `searchUrl`，可以这样约定：
- `searchUrl`：Web 搜索链接（桌面端 + 移动端 Web 兜底）
- `pageUrl`：具体页面 Web 链接（如果已确认）
- `appUrl`：移动端 URL scheme（可以是 iOS 的 `iosamap://` 也可以是 Android 的 `amapuri://`）

或者扩展 `PoiSource` 类型增加 `iosAppUrl` 和 `androidAppUrl` 两个字段。

---

## 四、实施优先级总览

### fzu-food-map

| 阶段 | 内容 | 工时估计 |
|------|------|----------|
| 第一步 | 拆分 App.tsx → Toolbar + SearchPanel + LocationPanel + FloatingDock | 1-2h |
| 第二步 | 新建 contexts/（ThemeContext + PanelContext） | 0.5h |
| 第三步 | 新建 AppPanel（右下功能入口 + 右侧面板容器） | 1h |
| 第四步 | 实现 FavoritesPanel（基于现有 favorites.ts） | 1.5h |
| 第五步 | 实现 LuckyDrawPanel（筛选 + 加权随机 + 动画） | 2-3h |
| 第六步 | 拆分 MapView.tsx → useMapData + usePopup + useLayers | 2h |
| 第七步 | URL scheme 设备检测集成 | 0.5h |

### ffm-studio

| 阶段 | 内容 | 工时估计 |
|------|------|----------|
| 第一步 | 搜索链接自动生成（PLATFORM_URL_TEMPLATES + SourceListEditor 集成） | 2-3h |
| 第二步 | 设备检测+链接预览 | 1h |
| 第三步 | 数据验证（坐标/评分/必填校验） | 1h |
| 第四步 | 批量标签编辑 | 1.5h |
| 第五步 | `/api/source-search` 后端实现 | 视需求定 |

---

## 五、知识补充：URL Scheme、Deep Link、桌面端与移动端

> 以下内容解答你对"电脑端和移动端链接不同"以及"Android 和 iOS 链接是否不同"的疑问。

### 5.1 三种链接方式

| 类型 | 格式 | 适用平台 | 说明 |
|------|------|----------|------|
| **Web URL** | `https://m.dianping.com/shop/xxx` | 桌面 + 移动端 Web | 通用，任何浏览器可打开 |
| **URL Scheme** | `dianping://web?url=xxx` | 移动端 App | 直接唤起 App；若未安装则无反应（可能弹"无法打开网页"的错误浏览器提示） |
| **Universal Link** (iOS) / **App Link** (Android) | `https://www.dianping.com/shop/xxx` | 移动端 App | 访问 HTTPS 链接，若 App 已安装则跳转 App，否则在浏览器打开（优于 URL Scheme） |

### 5.2 为什么桌面端和移动端链接要分开？

桌面端浏览器**不支持** URL Scheme（如 `dianping://`）。如果用户在桌面端点击 `dianping://web?url=...`，浏览器会弹出"无法处理此链接"的错误。

**正确做法**：
- **桌面端**：始终使用 `https://` 开头的 Web 搜索链接
- **移动端**：优先尝试 App 内打开（URL Scheme 或 Universal Link），若 App 未安装则 fallback 到 Web 链接

**JavaScript 设备判断**：
```javascript
const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
```

### 5.3 Android 和 iOS 的 URL Scheme 是否不同？

**取决于平台**。总结如下：

| App | iOS Scheme | Android Scheme | 是否相同 |
|-----|------------|----------------|----------|
| 高德地图 | `iosamap://` | `amapuri://` | **不同** |
| 百度地图 | `baidumap://` | `baidumap://` | 相同 |
| 大众点评 | `dianping://` | `dianping://` | 相同 |
| 美团 | `imeituan://` | `imeituan://` | 相同 |
| 小红书 | `xhsdiscover://` | `xhsdiscover://` | 相同 |
| 微信 | `weixin://` | `weixin://` | 相同 |
| QQ | `mqqapi://` | `mqqapi://` | 相同 |
| Google Maps | `comgooglemaps://` | `comgooglemaps://` | 相同 |
| Apple Maps | `maps://` | N/A（Android 无此 App） | N/A |

**结论**：大部分国产 App（美团、点评、小红书、微信）的 URL Scheme 在 iOS 和 Android 上**相同**。最显著的例外是**高德地图**（`iosamap://` vs `amapuri://`），部分版本也可能使用 `amap://`。

### 5.4 Android Intent URL

Android 还支持 `intent://` 协议，这是更强大的跳转方式：

```
intent://web?url=#Intent;scheme=dianping;package=com.dianping.v1;S.browser_fallback_url=;end
```

- `scheme`：目标 App 的 scheme
- `package`：Android 包名（若 App 未安装则跳转 fallback URL）
- `S.browser_fallback_url`：若 App 未安装，跳转此 URL（通常是 Web 搜索链接）

这是 Android 上比纯 URL Scheme 更可靠的方案，因为自带 fallback。

### 5.5 在你的项目中的实践建议

**PoiSource 类型扩展**（`fzu-food-map/src/types.ts`）：

```typescript
export type PoiSource = {
  platform?: string;
  title?: string;
  pageUrl?: string;       // 具体页面 Web 链接
  searchUrl?: string;     // Web 搜索链接（桌面端 + 移动端兜底）
  appUrl?: string;        // 移动端 URL Scheme（如果 iOS/Android 相同）
  iosAppUrl?: string;     // iOS 专用 URL Scheme（如果与 Android 不同，如高德）
  androidAppUrl?: string; // Android 专用 URL Scheme 或 Intent URL
  status?: PoiSourceStatus | string;
};
```

不过为了最小化改动，你可以保持现有结构，约定：
- `appUrl` 存通用 URL scheme 或 iOS scheme
- `searchUrl` 始终存 Web 链接（作为桌面端 + 移动端的兜底）
- 需要区分的平台（如高德），在 `sources.ts` 中运行时判断设备后选择正确的 scheme

**fzu-food-map 的卡片跳转逻辑改进**（`utils/sources.ts`）：

```typescript
export function getPreferredSourceUrl(source: PoiSource): string | undefined {
  if (isMobile()) {
    if (isIOS()) {
      // iOS：优先 appUrl（大多数 platform 共用），没有则用 searchUrl
      return source.appUrl ?? source.searchUrl ?? source.pageUrl;
    }
    // Android：优先 appUrl（或 Intent URL），没有则用 searchUrl
    return source.appUrl ?? source.searchUrl ?? source.pageUrl;
  }
  // 桌面端：只能用 Web 链接
  return source.searchUrl ?? source.pageUrl ?? source.appUrl;
}
```

### 5.6 主流平台搜索 URL 模板速查

由于 fzu-food-map 已经安装了 `marked` 解析 Markdown，你可以将这些平台模板维护为一个配置文件（JSON/YAML），供 ffm-studio 自动生成和 fzu-food-map 渲染使用。

| 平台 | Web 搜索链接 | iOS Scheme | Android Scheme | 来源类型 |
|------|-------------|------------|----------------|----------|
| 大众点评 | `https://m.dianping.com/search/keyword/{query}` | `dianping://web?url=` | `dianping://web?url=` | url-encode 搜索词 |
| 美团 | `https://i.meituan.com/s/{query}` | `imeituan://www.meituan.com/search?query=` | `imeituan://www.meituan.com/search?query=` | url-encode 搜索词 |
| 小红书 | `https://www.xiaohongshu.com/search_result?keyword={query}` | `xhsdiscover://search?keyword=` | `xhsdiscover://search?keyword=` | url-encode 搜索词 |
| 抖音 | `https://www.douyin.com/search/{query}` | `snssdk1128://search?keyword=` | `snssdk1128://search?keyword=` | url-encode 搜索词 |
| 高德地图 | `https://ditu.amap.com/search?query={query}` | `iosamap://search?keyword=` | `amapuri://search?keyword=` | **iOS/Android 不同** |
| 百度地图 | `https://map.baidu.com/search/{query}` | `baidumap://map/place/search?query=` | `baidumap://map/place/search?query=` | url-encode 搜索词 |
| Apple 地图 | `https://maps.apple.com/?q={query}` | `maps://?q=` | N/A | 仅 iOS/macOS |

> **注意**：以上 URL Scheme 可能随 App 版本变更而失效，建议在 ffm-studio 中将模板配置化，方便后期维护。同时不建议直接伪造具体店铺的 pageUrl（如 `dianping.com/shop/12345`），因为店铺 ID 各平台不同且无法推断；应使用搜索链接（searchUrl），让用户在跳转后自行定位。


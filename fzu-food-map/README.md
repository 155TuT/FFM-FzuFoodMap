<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/assets/icons/dark/favicon.svg">
    <img src="./public/assets/icons/light/favicon.svg" alt="FFM" width="36" height="36">
  </picture>
  fzu-food-map
</h1>

<p align="center">
  FFM · Fzu Food Map 的访客端地图应用
</p>

<p align="center">
  <a href="https://155tut.github.io/fzufoodmap/">在线访问</a>
  ·
  <a href="../README.md">仓库说明</a>
  ·
  <a href="../ffm-studio/README.md">FFM Studio</a>
</p>

## 项目定位

`fzu-food-map` 是 FFM 仓库中面向普通访客的地图前端，也是 GitHub Pages 实际构建和部署的子项目。应用读取 `public/data` 下的 GeoJSON 数据，在 MapTiler 底图上展示福州大学校区周边及福州市内的美食点位。

该应用是纯前端项目：店铺数据随静态资源发布，不依赖线上业务后端。数据的新增和维护主要通过同仓库的 [FFM Studio](../ffm-studio/README.md) 完成。

## 已实现功能

- 基于 MapLibre GL JS 的地图浏览、平移、缩放和点位聚合。
- 按门店、食堂、摊位区分点位颜色，并高亮当前地区。
- 使用 Fuse.js 按店名、标签和推荐内容进行模糊搜索。
- 搜索连锁店或合集时匹配其 `include` 子项，并在详情中定位对应条目。
- 在弹窗中展示评分、价格、营业时间、联系方式、地址、分类标签、推荐内容和信息来源。
- 加载多个地区的 GeoJSON，并在运行时合并为统一的城市数据集。
- 通过 URL 查询参数保存城市和地区状态。
- 在获得浏览器授权后持续显示用户位置。
- 浅色、深色主题切换，并根据系统配色设置初始主题。
- 使用 Markdown 编写公告，经 `marked` 解析并由 DOMPurify 清理后展示。
- 生产环境注册 Service Worker，缓存已访问的 MapTiler 地图瓦片。
- 自动适配本地根路径与 GitHub Pages 仓库子路径。

## 技术栈

| 用途 | 技术 |
| --- | --- |
| UI | React 19、React DOM |
| 开发与构建 | TypeScript、Vite 7 |
| 地图 | MapLibre GL JS、MapTiler |
| 模糊搜索 | Fuse.js |
| 公告内容 | marked、DOMPurify |
| 数据格式 | GeoJSON |
| 代码检查 | ESLint |

## 目录结构

```text
fzu-food-map/
├─ public/
│  ├─ assets/                 # 主题图标、平台图标等静态资源
│  ├─ data/fuzhou/            # 各地区 GeoJSON 数据
│  └─ sw.js                   # MapTiler 瓦片缓存 Service Worker
├─ src/
│  ├─ assets/                 # 公告等需参与构建的文本资源
│  ├─ cities/                 # 城市、地区、数据路径和默认视图配置
│  ├─ components/             # 布局与来源展示组件
│  ├─ features/
│  │  ├─ map/                 # 地图实例、图层、数据、弹窗和定位
│  │  ├─ pois/                # POI 详情数据整理
│  │  ├─ regions/             # 地区选择与 URL 状态
│  │  └─ search/              # 搜索逻辑与搜索界面
│  ├─ hooks/                  # 主题等通用 Hook
│  ├─ styles/                 # 全局样式与主题变量
│  ├─ utils/                  # 资源路径、来源和 URL 工具
│  ├─ App.tsx                 # 应用组合入口
│  ├─ tagGroups.ts            # 标签分组和兼容性归一化
│  └─ types.ts                # GeoJSON 与 POI 类型
├─ index.html
├─ vite.config.ts
└─ package.json
```

## 本地开发

### 环境要求

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- [MapTiler](https://www.maptiler.com/) API Key

### 安装依赖

从仓库根目录进入本项目：

```bash
cd fzu-food-map
npm ci
```

### 配置地图 Key

在本目录创建 `.env.local`：

```dotenv
VITE_MAPTILER_KEY=你的_MapTiler_API_Key
```

`.env.local` 已被 Git 忽略，请勿将真实 Key 写入源码、README 或提交记录。

### 启动开发服务器

```bash
npm run dev
```

终端会输出实际的本地访问地址。浏览器定位功能需要用户授权；在非安全来源中可能被浏览器禁用，本机 `localhost` 通常可以正常使用。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器并启用热更新 |
| `npm run build` | 先执行 TypeScript 项目构建，再生成生产文件到 `dist` |
| `npm run lint` | 对项目运行 ESLint |
| `npm run preview` | 本地预览 `dist` 中的生产构建 |

提交改动前建议至少运行：

```bash
npm run lint
npm run build
```

## 数据加载方式

城市入口定义在 `src/cities/index.ts`，当前福州配置位于 `src/cities/fuzhou.config.ts`。配置中的每个地区可以通过 `dataPath` 指向一个 GeoJSON 文件：

```ts
{
  id: "qishan",
  name: "旗山校区及周边",
  center: [119.187565, 26.061328],
  zoom: 16,
  dataPath: "data/fuzhou/qishan.geojson"
}
```

应用启动后会并行读取所有配置了 `dataPath` 的地区文件，将配置中的地区 ID 补入缺少 `regionId` 的点位，再合并为一个 `FeatureCollection`。因此：

- GeoJSON 中的坐标必须使用 `[经度, 纬度]` 顺序。
- 每个点位必须是 `Point` Feature，并具有唯一、稳定的 `properties.id`。
- 新增 GeoJSON 文件后，还需要在对应的城市配置中添加地区对象。
- 数据文件和地区配置应保持一致，否则该文件不会被地图加载。

完整的数据结构和维护流程见仓库根目录的 [数据约定](../README.md#数据约定)。日常维护建议使用 [FFM Studio](../ffm-studio/README.md)，避免手工编辑时破坏结构。

## 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `VITE_MAPTILER_KEY` | 是 | 浏览器端加载 MapTiler 地图样式和瓦片所需的公开访问 Key |

该变量会进入前端构建产物，不应使用具备其他敏感权限的 Key。建议在 MapTiler 控制台中为 Key 设置允许来源等访问限制。

## 构建与部署

生产构建：

```bash
npm run build
```

构建产物位于 `dist`。`vite.config.ts` 会根据环境决定资源基础路径：

- 本地开发与普通本地构建使用 `/`。
- GitHub Actions 中根据 `GITHUB_REPOSITORY` 自动使用 `/<仓库名>/`。

仓库的 [GitHub Pages 工作流](../.github/workflows/deploy.yml) 会在推送到 `main` 后安装依赖、注入仓库 Secret `VITE_MAPTILER_KEY`、执行构建并发布 `dist`。部署前需要在仓库设置中：

1. 添加 Actions Secret：`VITE_MAPTILER_KEY`；
2. 将 Pages 的 Source 设置为 **GitHub Actions**。

## 与 FFM Studio 的关系

FFM Studio 是仅供本地使用的数据管理工具：

- 将 `public/data` 作为发布数据源；
- 在 `../ffm-studio/.cache` 中暂存编辑；
- 保存时将 GeoJSON 同步回 `public/data`；
- 同时更新对应地区配置的中心点和缩放级别；
- 复用本项目 `node_modules` 中的 React、Vite 和 MapLibre 依赖。

因此，在运行 Studio 前也需要先在当前目录执行 `npm ci`。

## 相关文档

- [仓库总览](../README.md)
- [FFM Studio 使用与设计约束](../ffm-studio/README.md)
- [GitHub Pages 部署流程](../.github/workflows/deploy.yml)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./fzu-food-map/public/assets/icons/dark/favicon.svg">
    <img src="./fzu-food-map/public/assets/icons/light/favicon.svg" alt="FFM" width="36" height="36">
  </picture>
  FFM · Fzu Food Map
</h1>

<p align="center">
  面向福州大学学生与福州本地觅食场景的非商业美食地图。
</p>

<p align="center">
  <a href="https://155tut.github.io/fzufoodmap/">在线地图</a>
  ·
  <a href="https://github.com/155TuT/fzufoodmap/issues">问题反馈</a>
  ·
  <a href="./LICENSE">MIT License</a>
</p>

## 项目简介

FFM（Fzu Food Map）是一份由个人与身边朋友实际探店后整理的福州美食地图。目前以福州大学旗山校区、铜盘校区及福州市内常见活动区域为主，帮助你在“不知道吃什么”时更快找到一个值得尝试的去处。

> 收录的店铺是我们愿意推荐的店铺，但未收录不代表不好吃。项目与餐馆不存在商业合作，评分、价格、营业时间、电话和地址均来自个人体验或公开信息，仅供参考，请以店家最新信息为准。

当前仓库包含两个部分：

- `fzu-food-map`：面向访客的地图应用，也是 GitHub Pages 实际部署的内容。
- `ffm-studio`：维护者在本地编辑 GeoJSON、标签、来源和地区配置的管理工作台。

## 主要功能

- **地图浏览**：基于 MapLibre GL 展示 POI，支持点位聚合、缩放和分类配色。
- **模糊搜索**：可以按店名、标签或推荐内容搜索；连锁店或合集内的子店铺也会参与匹配。
- **店铺详情**：展示分类、评分、价格、营业时间、联系方式、地址、标签、推荐菜和信息来源。
- **区域化数据**：当前数据覆盖旗山、铜盘、仓山、鼓楼、台江和长乐等区域，并可按城市配置继续扩展。
- **位置辅助**：在浏览器授权后显示当前位置，方便判断附近店铺。
- **主题适配**：支持浅色与深色地图主题，并跟随系统初始偏好。
- **地图瓦片缓存**：生产环境注册 Service Worker，对已访问的 MapTiler 瓦片采用缓存优先、后台更新策略。
- **数据管理工作台**：通过 FFM Studio 新增、编辑和删除地区、GeoJSON 文件及点位，并在确认后同步到发布数据目录。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 地图前端 | React 19、TypeScript、Vite 7 |
| 地图渲染 | MapLibre GL JS、MapTiler 地图样式 |
| 搜索 | Fuse.js |
| 公告渲染 | marked、DOMPurify |
| 数据 | GeoJSON |
| 本地工作台 | React、Vite、Node.js HTTP API |
| 部署 | GitHub Actions、GitHub Pages |

## 目录结构

```text
FFM-FzuFoodMap/
├─ fzu-food-map/              # 对外地图应用
│  ├─ public/
│  │  ├─ assets/              # 图标与平台资源
│  │  └─ data/fuzhou/         # 发布使用的 GeoJSON 数据
│  └─ src/
│     ├─ cities/              # 城市与地区配置
│     ├─ components/          # 通用界面组件
│     ├─ features/            # 地图、搜索、地区等功能
│     └─ utils/               # 路径、来源、URL 状态工具
├─ ffm-studio/                # 本地 GeoJSON 管理工作台
│  ├─ server/                 # 本地文件读写 API
│  ├─ scripts/                # 开发、构建和标签迁移脚本
│  └─ src/                    # Studio 前端
├─ .github/workflows/         # GitHub Pages 部署流程
└─ analysis/                  # 项目分析与迭代记录
```

## 本地运行地图

### 环境要求

- Node.js 20.19+ 或 22.12+
- npm
- 一个 [MapTiler](https://www.maptiler.com/) API Key

### 启动步骤

```bash
git clone https://github.com/155TuT/fzufoodmap.git
cd fzufoodmap/fzu-food-map
npm ci
```

在 `fzu-food-map` 目录中新建 `.env.local`：

```dotenv
VITE_MAPTILER_KEY=你的_MapTiler_API_Key
```

然后启动开发服务器：

```bash
npm run dev
```

Vite 会在终端中输出本地访问地址。`.env.local` 已被 Git 忽略，请不要提交 API Key。

### 常用命令

在 `fzu-food-map` 目录运行：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动地图开发服务器 |
| `npm run build` | 执行 TypeScript 检查并构建生产版本 |
| `npm run lint` | 运行 ESLint |
| `npm run preview` | 本地预览生产构建 |

## 使用 FFM Studio 维护数据

FFM Studio 会复用 `fzu-food-map/node_modules` 中的 React、Vite 和 MapLibre 依赖，因此请先完成主应用的 `npm ci`。

```bash
cd ffm-studio
npm run dev
```

默认情况下会启动：

- Studio 前端：`http://127.0.0.1:5174`
- 本地 API：优先使用 `http://127.0.0.1:4173`；端口占用时开发脚本会自动寻找可用端口

Studio 采用“缓存编辑、手动发布”的工作流：

```text
fzu-food-map/public/data
          ↓ 初始化
ffm-studio/.cache/data
          ↓ 本地编辑与自动暂存
点击保存 / 全部保存
          ↓
fzu-food-map/public/data + src/cities/*.config.ts
```

需要注意：

- `fzu-food-map/public/data` 是发布数据源，`ffm-studio/.cache` 是本地编辑沙盒且不会提交到 Git。
- 普通编辑先写入缓存；只有在 Studio 中执行保存后才同步至发布目录。
- 保存操作会按缓存内容同步 GeoJSON，并更新对应地区的 `center` 和 `zoom`。保存前请确认工作区差异。
- `/api/source-search` 目前仍是预留接口，来源信息需要手动维护。

Studio 其他命令：

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建 Studio 前端 |
| `npm test` | 运行本地 API 测试 |
| `npm run check:tags` | 只检查标签迁移结果，不写入文件 |
| `npm run migrate:tags` | 幂等迁移源数据、缓存和 taxonomy 中的标签结构 |

更多设计约束见 [`ffm-studio/README.md`](./ffm-studio/README.md)。

## 数据约定

每个地区对应一个 GeoJSON `FeatureCollection`，每个店铺或摊位是一个 `Point` Feature。常用属性包括：

```json
{
  "type": "Feature",
  "properties": {
    "id": "qishan-001",
    "category": "门店",
    "name": "示例店铺",
    "tags": {
      "cuisines": ["闽菜"],
      "characteristics": ["适合聚餐"],
      "dish": ["小吃"],
      "miscellaneous": []
    },
    "rating": 4.5,
    "price": "50",
    "notes": "推荐内容",
    "address": "地址",
    "contact": "联系方式",
    "openhour": "营业时间",
    "sources": []
  },
  "geometry": {
    "type": "Point",
    "coordinates": [119.187565, 26.061328]
  }
}
```

其中 `characteristics` 在界面中显示为“用餐方式”，`dish` 显示为“品类”。`price` 只保存人均价格数值，不包含 `¥` 或 `￥`；地图端会将菜系、品类与价格合并渲染，例如“闽菜 融合菜 小吃 人均45￥”。

坐标顺序为 `[经度, 纬度]`。新增地区时，还需要在 `fzu-food-map/src/cities` 中配置地区名称、中心点、默认缩放级别和 `dataPath`。

## 部署

仓库已经配置 GitHub Pages 工作流。推送到 `main` 后，GitHub Actions 会：

1. 在 `fzu-food-map` 中执行 `npm ci`；
2. 从仓库 Secret `VITE_MAPTILER_KEY` 注入地图 Key；
3. 执行 `npm run build`；
4. 将 `fzu-food-map/dist` 发布到 GitHub Pages。

首次部署前，请在仓库中完成以下设置：

1. 在 **Settings → Secrets and variables → Actions** 添加 `VITE_MAPTILER_KEY`；
2. 在 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。

Vite 会在 GitHub Actions 环境下根据仓库名自动设置 `base`，本地开发仍使用根路径 `/`。

## 反馈与贡献

- 发现定位、店铺信息或页面功能有误，可以提交 [Issue](https://github.com/155TuT/fzufoodmap/issues) 或通过 [飞书](https://ecn391pn069m.feishu.cn/share/base/form/shrcng2l20D5SHVn1o5R4oahXmf) 反馈
- 推荐新店时，请尽量提供店名、地址、经纬度、推荐理由和可核验的信息来源。
- 修改代码或 GeoJSON 后，请至少运行 `npm run lint` 与 `npm run build`；修改 Studio 服务端时再运行 `npm test`。

## 致谢

首先是刷到的有福州探店经历的探店博主们，虽然粉丝数有多有少，但探店品质甚高，不会为店家赏金而无脑打广告，谢谢你们的付出

- [跟着老高吃东西（真探高文麒）](https://space.bilibili.com/3546672569256789) *@bilibili*
- [真探唐仁杰](https://space.bilibili.com/544336675) *@bilibili*
- [小吴老师想下班](https://space.bilibili.com/518055077) *@bilibili*
- [酷酷的珊文鱼](https://space.bilibili.com/3493128128432841) *@bilibili*
- [桃子食遇记](https://space.bilibili.com/1072347464) *@bilibili*
- [低调的唐老师](https://space.bilibili.com/24103340) *@bilibili*
- [Victoria-Ling](https://space.bilibili.com/33183682) *@bilibili*
- [李李吃吃喝喝](https://space.bilibili.com/3546942816651864) *@bilibili*
- [达哥在上海](https://space.bilibili.com/504799975) *@bilibili*

以及两位只做过一条视频但也很精品的

- [20个福州特色本地人美食](https://www.bilibili.com/video/BV1TRLXzHECn/) from [花二Strange](https://space.bilibili.com/107486042) *@bilibili*
- [福州本地人带吃](https://www.bilibili.com/video/BV1CUSEYdEZB) from [陈随便778](https://space.bilibili.com/480662886) *@bilibili*

其次是为我探店与制作网页提供动力、灵感与探店素材的各位（排名不分先后）：

- 23 材料 杨（湖南）
- 24 车工 吴（福建漳州）
- 24 数智 张（福建漳州）
- 24 数智 王（福建泉州）
- 24 数融 杨 （云南）
- 24 计类 黄（福建莆田）
- 24 计类 任（河北）
- 25 水利 张（福建福州）
- ...

## License

本项目基于 [MIT License](./LICENSE) 开源。

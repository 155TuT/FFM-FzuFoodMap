# ![favicon](./fzu-food-map/public/assets/icons/favicon.svg) FFM | Fzu Food Map

## 0x00 声明

~~本段同网页右上角公告~~

### 欢迎使用 [155TuT](https://github.com/155TuT) 的福州大学美食地图

这是一份集合了自己与身边朋友亲身品尝过的探店地图，非真实评价不会被收录其中：**收录的一定是好吃的，但不代表未收录的就难吃**，~~只是我暂时还没尝到~~

这份地图是为了让你能在自己/朋友不知道吃什么又不想踩雷时安心挑选，并不想为你空增负担

地图与任何餐馆无合作关系，欢迎各位品鉴。

地图数据持续更新中，欢迎各位[反馈一下自己遇到的bug、期待的功能与推荐的美食](https://ecn391pn069m.feishu.cn/share/base/form/shrcng2l20D5SHVn1o5R4oahXmf)

提供的营业时间与电话请以店家为准，信息为个人搜集，仅供参考

地址可能模糊，但定位全部为手调经纬度，不会超过方圆20米，如遇问题请及时上报

本页面采用github pages部署，如遇连接失败请等待一段时间或科学上网后再尝试访问

#### 点位颜色信息

- 门店为蓝色
- 食堂为绿色
- 摊位为紫色

#### 另附搜索技巧

**按店名搜索时**，如果没能搜到存在的餐馆，请检查定位处的餐馆并反馈；

**按标签搜索时**，有如下饭店标签:

- *所属菜系(福建菜，广东菜，东北菜...)*
- *菜品类别(火锅，烧烤，甜品...)*
- *用餐渠道（堂食，外卖）*
- *用餐人数（聚餐，一人食）*
- *价位(见下方说明)*

人均价位标签说明：

- *(价格<=20r)便宜*
- *(80r>=价格>20r)平价*
- *(150r>=价格>80r)轻奢*
- *(价格>150r)小资*

**按菜品搜索时**，我们仅收录了每个店铺几道最好吃的菜，因此建议在特别想吃某个菜时使用

## 0x01 项目相关

### 技术路线

本项目为纯前端项目，主要技术栈如下：

- 框架采用[React](https://react.dev/reference/react)+[TypeScript](https://www.typescriptlang.org)+[Vite](https://github.com/vitejs/vite)轻量构建
- 地图瓦片使用了免费的OSM：[MapTiler](https://www.maptiler.com) API
- 网页由[Github Pages](https://githubdocs.cn/en/pages/getting-started-with-github-pages)托管
- 图标由[shadcn/ui](https://github.com/shadcn-ui/ui)提供

### 部署

主体仅需 `cd fzu-food-map`后简单的 `npm install` 和 `npm run dev` 即可

注意：部署后在使用前需在fzu-food-map即项目文件夹中创建 `.env.local` 文件并输入 `VITE_MAPTILER_KEY=你从MapTiler获取的API` 来替换成自己开发环境下的地图瓦片

### 杂项

另有一些小工具在tools/中，包括：

- 地图间经纬度转换工具
- ...

## 0x02 致谢

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

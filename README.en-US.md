<h1>
  <a href="https://github.com/155TuT/FFM-FzuFoodMap#gh-light-mode-only">
    <img src="./fzu-food-map/public/assets/icons/light/favicon.svg" alt="favicon_light" width="32" height="32">
  </a>
  <a href="https://github.com/155TuT/FFM-FzuFoodMap#gh-dark-mode-only">
    <img src="./fzu-food-map/public/assets/icons/dark/favicon.svg" alt="favicon_dark" width="32" height="32">
  </a>
  FFM | Fzu Food Map
</h1>

## 0x00 Disclaimer

~~This section is the same as the announcement in the top right corner of the webpage~~

### Welcome to [155TuT](https://github.com/155TuT)'s Fuzhou University Food Map

This is a curated map of eateries personally tasted by myself and my friends. Fake reviews will not be included: **Everything listed is definitely delicious, but that doesn't mean those not listed are bad**—~~it just means I haven't tried them yet~~.

This map is designed to help you and your friends pick a place to eat with confidence when you don't know what to have and want to avoid "landmines," without adding unnecessary burden to your choice.

This map has no partnership with any restaurant. Everyone is welcome to try them out.

Map data is continuously being updated. You are welcome to [provide feedback on bugs you encounter, features you expect, or food recommendations](https://ecn391pn069m.feishu.cn/share/base/form/shrcng2l20D5SHVn1o5R4oahXmf).

Please refer to the shop owners for the actual business hours and phone numbers; the information provided is personally collected and for reference only.

Addresses may be vague, but all locations are manually adjusted coordinates (latitude/longitude) and will not deviate by more than 20 meters. Please report any issues promptly.

This page is deployed via GitHub Pages. If the connection fails, please wait a while or try accessing it via a VPN (scientific internet access).

## 0x01 Project Related

### Technical Stack

This is a pure front-end project. The main technical stack is as follows:

- Framework: Built lightweight with [React](https://react.dev/reference/react) + [Vite](https://github.com/vitejs/vite)
- Map Tiles: Uses free OSM via [MapTiler](https://www.maptiler.com) API
- Hosting: Hosted by [Github Pages](https://githubdocs.cn/en/pages/getting-started-with-github-pages)
- Icons: Provided by [shadcn/ui](https://github.com/shadcn-ui/ui)

### Deployment

The main project only requires `cd fzu-food-map` followed by a simple `npm install` and `npm run dev` ~~Note: Please ensure Node.js is installed on your computer and added to the Path~~.

Note: Before using after deployment, you need to create a `.env.local` file in the `fzu-food-map` project folder and enter `VITE_MAPTILER_KEY=Your_API_Key_From_MapTiler` to replace the map tiles for your development environment.

## 0x02 Acknowledgments

First, to the food bloggers I came across who have explored Fuzhou. Regardless of their follower count, the quality of their reviews is very high, and they don't blindly advertise for money. Thank you for your efforts.

- [跟着老高吃东西（真探高文麒）](https://space.bilibili.com/3546672569256789) *@bilibili*
- [真探唐仁杰](https://space.bilibili.com/544336675) *@bilibili*
- [小吴老师想下班](https://space.bilibili.com/518055077) *@bilibili*
- [酷酷的珊文鱼](https://space.bilibili.com/3493128128432841) *@bilibili*
- [桃子食遇记](https://space.bilibili.com/1072347464) *@bilibili*
- [低调的唐老师](https://space.bilibili.com/24103340) *@bilibili*
- [Victoria-Ling](https://space.bilibili.com/33183682) *@bilibili*
- [李李吃吃喝喝](https://space.bilibili.com/3546942816651864) *@bilibili*
- [达哥在上海](https://space.bilibili.com/504799975) *@bilibili*

As well as two creators who only made one video, but it was high quality:

- [20 Fuzhou Local Specialty Foods](https://www.bilibili.com/video/BV1TRLXzHECn/) from [花二Strange](https://space.bilibili.com/107486042) *@bilibili*
- [Eating with Fuzhou Locals](https://www.bilibili.com/video/BV1CUSEYdEZB) from [陈随便778](https://space.bilibili.com/480662886) *@bilibili*

Secondly, to everyone who provided the motivation, inspiration, and materials for exploring shops and building this webpage (listed in no particular order):

- 23 Materials, Yang (Hunan)
- 24 Automotive Engineering, Wu (Zhangzhou, Fujian)
- 24 Digital Intelligence, Zhang (Zhangzhou, Fujian)
- 24 Digital Intelligence, Wang (Quanzhou, Fujian)
- 24 Digital Fusion, Yang (Yunnan)
- 24 CS, Huang (Putian, Fujian)
- 24 CS, Ren (Hebei)
- 25 Water Conservancy, Zhang (Fuzhou, Fujian)
- ...

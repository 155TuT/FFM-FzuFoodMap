import type { CityConfig, RegionConfig } from "./index";

const CITY_CENTER: [number, number] = [119.30952702, 26.05088034];
const CITY_ZOOM = 12;

const regions: RegionConfig[] = [
  {
    id: "citywide",
    name: "全市范围",
    center: CITY_CENTER,
    zoom: CITY_ZOOM,
    isCitywide: true
  },
  {
    id: "qishan",
    name: "旗山校区及周边",
    center: [119.19892631, 26.06421910],
    zoom: 16,
    dataPath: "data/fuzhou/qishan.geojson"
  },
  {
    id: "tongpan",
    name: "铜盘校区及周边",
    center: [119.26785371, 26.11253389],
    zoom: 14.5,
    dataPath: "data/fuzhou/tongpan.geojson"
  },
  {
    id: "cangshan",
    name: "仓山区至福州南站",
    center: [119.27931791, 26.05247215],
    zoom: 12.5,
    dataPath: "data/fuzhou/cangshan.geojson"
  },
  {
    id: "gulou",
    name: "鼓楼区即三坊七巷等",
    center: [119.31100294, 26.08880935],
    zoom: 14,
    dataPath: "data/fuzhou/gulou.geojson"
  },
  {
    id: "taijiang",
    name: "台江区即上下杭等",
    center: [119.32050098, 26.05859228],
    zoom: 14.5,
    dataPath: "data/fuzhou/taijiang.geojson"
  }
];

const fuzhou: CityConfig = {
  slug: "fuzhou",
  name: "福州",
  center: CITY_CENTER,
  zoom: CITY_ZOOM,
  regions,
  defaultRegionId: "citywide",
  theme: { primary: "#0ea5e9", danger: "#ef4444", warning: "#f59e0b" }
};

export default fuzhou;

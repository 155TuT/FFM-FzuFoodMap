import type { CityConfig, RegionConfig } from "./index";

const CITY_CENTER: [number, number] = [119.29824947, 26.04783333];
const CITY_ZOOM = 12;

const regions: RegionConfig[] = [
  {
    id: "fuzhou-citywide",
    name: "全市范围",
    center: CITY_CENTER,
    zoom: CITY_ZOOM,
    isCitywide: true
  },
  {
    id: "qishan",
    name: "旗山校区及周边",
    center: [119.187565, 26.061328],
    zoom: 16,
    dataPath: "data/fuzhou/qishan.geojson"
  },
  {
    id: "tongpan",
    name: "铜盘校区及周边",
    center: [119.256639, 26.109497],
    zoom: 14.5,
    dataPath: "data/fuzhou/tongpan.geojson"
  }
];

const fuzhou: CityConfig = {
  slug: "fuzhou",
  name: "福州",
  center: CITY_CENTER,
  zoom: CITY_ZOOM,
  regions,
  defaultRegionId: "fuzhou-citywide",
  theme: { primary: "#0ea5e9", danger: "#ef4444", warning: "#f59e0b" }
};

export default fuzhou;

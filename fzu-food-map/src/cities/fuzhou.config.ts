import type { CityConfig } from "./index";

const fuzhou: CityConfig = {
  slug: "fuzhou",
  name: "福州",
  center: [119.29824947, 26.04783333],
  zoom: 12,
  dataPath: "data/fuzhou.geojson",
  theme: { primary: "#0ea5e9", danger: "#ef4444", warning: "#f59e0b" }
};
export default fuzhou;

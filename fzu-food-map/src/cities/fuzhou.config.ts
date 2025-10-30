import type { CityConfig } from "./index";

const fuzhou: CityConfig = {
  slug: "fuzhou",
  name: "福州",
  center: [119.19153372, 26.05948138],
  zoom: 12,
  dataPath: "/data/fuzhou.geojson",
  theme: { primary: "#0ea5e9", danger: "#ef4444", warning: "#f59e0b" }
};
export default fuzhou;
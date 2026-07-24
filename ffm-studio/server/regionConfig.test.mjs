import assert from "node:assert/strict";
import test from "node:test";
import { formatRegionConfigArray, parseCityConfigSource } from "./index.mjs";

const source = `import type { RegionConfig } from "./index";

const CITY_CENTER: [number, number] = [119.29824947, 26.04783333];
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
    center: [119.187565, 26.061328],
    zoom: 16,
    dataPath: "data/fuzhou/qishan.geojson"
  }
];
`;

test("GeoJSON region updates leave citywide constants and unrelated fields untouched", () => {
  const parsed = parseCityConfigSource(source, "fuzhou.config.ts");
  const replacement = formatRegionConfigArray(parsed, [
    {
      id: "qishan",
      name: "该名称不应覆写源码",
      center: [119.2, 26.1],
      zoom: 17,
      dataPath: "data/fuzhou/qishan.geojson"
    },
    {
      id: "changle",
      name: "长乐",
      center: [119.5, 25.9],
      zoom: 14,
      dataPath: "data/fuzhou/changle.geojson"
    }
  ]);
  const output =
    parsed.source.slice(0, parsed.arrayStart) +
    replacement +
    parsed.source.slice(parsed.arrayEnd + 1);

  assert.match(output, /const CITY_CENTER: \[number, number\] = \[119\.29824947, 26\.04783333\]/);
  assert.match(output, /const CITY_ZOOM = 12/);
  assert.match(output, /id: "citywide"[\s\S]*center: CITY_CENTER,[\s\S]*zoom: CITY_ZOOM/);
  assert.match(output, /id: "qishan"[\s\S]*name: "旗山校区及周边"/);
  assert.match(output, /id: "qishan"[\s\S]*center: \[119\.2, 26\.1\],[\s\S]*zoom: 17/);
  assert.doesNotMatch(output, /该名称不应覆写源码/);
  assert.match(output, /id: "changle"[\s\S]*center: \[119\.5, 25\.9\],[\s\S]*zoom: 14/);
});

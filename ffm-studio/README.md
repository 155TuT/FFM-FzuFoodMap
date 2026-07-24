# FFM Studio

本目录是 `fzu-food-map/public/data` 的本地 GeoJSON 管理工作台。

## 启动

```bash
cd ffm-studio
npm run dev
```

说明：当前工作台复用了 `../fzu-food-map/node_modules` 里的 Vite、React 和 MapLibre 依赖，因此请先保证主项目依赖已经安装。

默认会同时启动：

- 本地 API：`http://127.0.0.1:4173`
- 前端：`http://127.0.0.1:5174`

## 设计约束

- `fzu-food-map/public/data` 作为原始数据源。
- 所有编辑先写入 `ffm-studio/.cache/data`。
- `ffm-studio/.cache/taxonomy.json` 会缓存启动时扫描出的门店类型与标签，并保留手动新增项。
- `ffm-studio/.cache/regions.json` 只缓存带 `dataPath` 的 GeoJSON 地区中心点与默认显示层级，不包含 `citywide`。
- 新增 GeoJSON 会自动按点位范围推导中心点，并以层级 `14` 建立待覆写的地区配置。
- 只有点击保存后，才会把 GeoJSON 写回 `fzu-food-map/public/data`，并仅覆写对应地区对象的 `center` 与 `zoom`；城市级 `CITY_CENTER`、`CITY_ZOOM` 和 `citywide` 原文保持不变。
- 预留了 `/api/source-search` 作为后续半自动来源搜索接口。

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
- 只有点击保存后，才会把指定 GeoJSON 写回 `fzu-food-map/public/data`。
- 预留了 `/api/source-search` 作为后续半自动来源搜索接口。

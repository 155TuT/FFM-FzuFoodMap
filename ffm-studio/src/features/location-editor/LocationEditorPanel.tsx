import MiniMap from "./MiniMap";
import type { ThemeMode } from "../../hooks/useStudioTheme";
import type {
  FilePayload,
  GeoFeature,
  RegionConfig
} from "../../types";

type Props = {
  activeFile: FilePayload | null;
  feature: GeoFeature | null;
  theme: ThemeMode;
  onMutateFeature: (
    mutator: (feature: GeoFeature) => GeoFeature
  ) => void;
  onCommitRegionConfig: (
    next: Pick<RegionConfig, "center" | "zoom">
  ) => void;
};

export default function LocationEditorPanel({
  activeFile,
  feature,
  theme,
  onMutateFeature,
  onCommitRegionConfig
}: Props) {
  const regionConfig = activeFile?.regionConfig ?? null;

  const updateFeatureCoordinates = (coordinates: [number, number]) => {
    onMutateFeature(current => ({
      ...current,
      geometry: { ...current.geometry, coordinates }
    }));
  };

  return (
    <section className="panel panel--map">
      <div className="panel__header">
        <div>
          <p className="section-kicker">位置预览</p>
          <h2>坐标与样式</h2>
        </div>
      </div>
      {feature ? (
        <>
          <div className="form-grid">
            <label className="field">
              <span>经度</span>
              <input
                type="number"
                step="0.00000001"
                value={feature.geometry.coordinates[0]}
                onChange={event =>
                  updateFeatureCoordinates([
                    Number(event.target.value),
                    feature.geometry.coordinates[1]
                  ])
                }
              />
            </label>
            <label className="field">
              <span>纬度</span>
              <input
                type="number"
                step="0.00000001"
                value={feature.geometry.coordinates[1]}
                onChange={event =>
                  updateFeatureCoordinates([
                    feature.geometry.coordinates[0],
                    Number(event.target.value)
                  ])
                }
              />
            </label>
          </div>
          <div className="field map-preview-field">
            <span>位置预览</span>
            <MiniMap
              category={feature.properties.category}
              theme={theme}
              coordinates={feature.geometry.coordinates}
              onChangeCoordinates={updateFeatureCoordinates}
            />
          </div>
          <div className="json-preview">
            <div className="editor-section__header">
              <div>
                <h3>当前点位 JSON 预览</h3>
                <p>这里展示当前缓存中的最终结构，便于快速核对</p>
              </div>
            </div>
            <pre>{JSON.stringify(feature, null, 2)}</pre>
          </div>
        </>
      ) : regionConfig ? (
        <>
          <div className="editor-section__header region-config-heading">
            <div>
              <h3>地区中心点与默认层级</h3>
              <p>
                对应 {regionConfig.configPath}
                {regionConfig.inferred
                  ? "；当前为新 GeoJSON 自动建立的缓存配置"
                  : ""}
              </p>
            </div>
            <span
              className={`status-pill${
                regionConfig.dirty ? " status-pill--dirty" : ""
              }`}
            >
              {regionConfig.dirty ? "待覆写" : "已同步"}
            </span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>中心点经度</span>
              <input
                type="number"
                step="0.00000001"
                value={regionConfig.data.center[0]}
                onChange={event =>
                  onCommitRegionConfig({
                    center: [
                      Number(event.target.value),
                      regionConfig.data.center[1]
                    ],
                    zoom: regionConfig.data.zoom
                  })
                }
              />
            </label>
            <label className="field">
              <span>中心点纬度</span>
              <input
                type="number"
                step="0.00000001"
                value={regionConfig.data.center[1]}
                onChange={event =>
                  onCommitRegionConfig({
                    center: [
                      regionConfig.data.center[0],
                      Number(event.target.value)
                    ],
                    zoom: regionConfig.data.zoom
                  })
                }
              />
            </label>
            <label className="field field--full">
              <span>默认显示层级</span>
              <input
                type="number"
                min="0"
                max="22"
                step="1"
                value={regionConfig.data.zoom}
                onChange={event =>
                  onCommitRegionConfig({
                    center: regionConfig.data.center,
                    zoom: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>
          <div className="field map-preview-field">
            <span>地区视图预览</span>
            <MiniMap
              theme={theme}
              coordinates={regionConfig.data.center}
              zoom={regionConfig.data.zoom}
              markerColor="#f59e0b"
              hint="拖动标记或点击地图更新地区中心点；层级输入框箭头每次调整 1 级"
              onChangeCoordinates={center =>
                onCommitRegionConfig({
                  center,
                  zoom: regionConfig.data.zoom
                })
              }
            />
          </div>
          <div className="json-preview">
            <div className="editor-section__header">
              <div>
                <h3>地区配置缓存预览</h3>
                <p>保存前只会写入 Studio 缓存，不会直接修改城市配置源码</p>
              </div>
            </div>
            <pre>{JSON.stringify(regionConfig.data, null, 2)}</pre>
          </div>
        </>
      ) : (
        <div className="empty-block">
          当前文件无法匹配到城市配置，请确认它位于已有城市目录中
        </div>
      )}
    </section>
  );
}

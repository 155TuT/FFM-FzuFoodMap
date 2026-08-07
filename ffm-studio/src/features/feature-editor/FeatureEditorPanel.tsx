import CategoryEditor from "./components/CategoryEditor";
import IncludeEditor from "./components/IncludeEditor";
import SourceListEditor from "./components/SourceListEditor";
import TagEditor from "./components/TagEditor";
import {
  DEFAULT_CATEGORY,
  fromIncludeRows,
  normalizeCategoryInput,
  normalizePriceInput,
  toIncludeRows,
  uniq
} from "../../domain/geoJson";
import { normalizeTagGroups, TAG_GROUPS, type TagGroups } from "../../tagGroups";
import type {
  GeoFeature,
  TaxonomyEntryKind
} from "../../types";

type Props = {
  feature: GeoFeature | null;
  categories: string[];
  tagSuggestions: TagGroups;
  onMutate: (mutator: (feature: GeoFeature) => GeoFeature) => void;
  onCreateTaxonomyEntry: (
    kind: TaxonomyEntryKind,
    value: string
  ) => void;
  onTriggerSourceSearch: () => void;
};

export default function FeatureEditorPanel({
  feature,
  categories,
  tagSuggestions,
  onMutate,
  onCreateTaxonomyEntry,
  onTriggerSourceSearch
}: Props) {
  const updateProperties = (next: Partial<GeoFeature["properties"]>) => {
    onMutate(current => ({
      ...current,
      properties: { ...current.properties, ...next }
    }));
  };

  return (
    <section className="panel panel--feature">
      <div className="panel__header">
        <div>
          <p className="section-kicker">点位</p>
          <h2>{feature?.properties.name ?? "未选择点位"}</h2>
        </div>
        {feature ? (
          <span className="status-pill">{feature.properties.id}</span>
        ) : null}
      </div>
      {feature ? (
        <>
          <div className="form-grid">
            <label className="field">
              <span>名称</span>
              <input
                value={feature.properties.name}
                onChange={event =>
                  updateProperties({ name: event.target.value })
                }
              />
            </label>
            <div className="field">
              <span>门店类型</span>
              <CategoryEditor
                value={feature.properties.category ?? DEFAULT_CATEGORY}
                suggestions={categories}
                onSelect={category => updateProperties({ category })}
                onCreateCategory={category => {
                  const nextCategory = normalizeCategoryInput(category);
                  onCreateTaxonomyEntry("category", nextCategory);
                  updateProperties({ category: nextCategory });
                }}
              />
            </div>
            <label className="field">
              <span>评分</span>
              <input
                type="number"
                step="0.1"
                value={feature.properties.rating ?? ""}
                onChange={event =>
                  updateProperties({
                    rating:
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value)
                  })
                }
              />
            </label>
            <label className="field">
              <span>价格</span>
              <span className="field__input-suffix">
                <input
                  inputMode="decimal"
                  value={normalizePriceInput(feature.properties.price)}
                  onChange={event =>
                    updateProperties({
                      price: normalizePriceInput(event.target.value) || undefined
                    })
                  }
                  aria-label="人均价格"
                />
                <span aria-hidden="true">￥</span>
              </span>
            </label>
            <label className="field">
              <span>联系</span>
              <input
                value={feature.properties.contact ?? ""}
                onChange={event =>
                  updateProperties({ contact: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>营业时间</span>
              <input
                value={feature.properties.openhour ?? ""}
                onChange={event =>
                  updateProperties({ openhour: event.target.value })
                }
              />
            </label>
            <label className="field field--full">
              <span>地址</span>
              <input
                value={feature.properties.address ?? ""}
                onChange={event =>
                  updateProperties({ address: event.target.value })
                }
              />
            </label>
            <label className="field field--full">
              <span>招牌菜 / 细分内容</span>
              <textarea
                rows={4}
                value={feature.properties.notes ?? ""}
                onChange={event =>
                  updateProperties({ notes: event.target.value })
                }
              />
            </label>
          </div>

          <div className="editor-section">
            <div className="editor-section__header">
              <div>
                <h3>地点标签</h3>
                <p>
                  每类标签独立维护；删除后会回到对应备选列表，新增后会自动选中
                </p>
              </div>
            </div>
            <div className="tag-groups-editor">
              {TAG_GROUPS.map(group => {
                const currentTags = normalizeTagGroups(feature.properties.tags);
                return (
                  <section className="tag-group-editor" key={group.key}>
                    <div className="tag-group-editor__header">
                      <h4>{group.label}</h4>
                      <p>{group.description}</p>
                    </div>
                    <TagEditor
                      value={currentTags[group.key]}
                      suggestions={tagSuggestions[group.key]}
                      onCreateTag={tag => {
                        const nextTag = tag.trim();
                        if (!nextTag) return;
                        onCreateTaxonomyEntry(group.key, nextTag);
                        updateProperties({
                          tags: {
                            ...currentTags,
                            [group.key]: uniq([...currentTags[group.key], nextTag])
                          }
                        });
                      }}
                      onChange={next =>
                        updateProperties({
                          tags: { ...currentTags, [group.key]: next }
                        })
                      }
                    />
                  </section>
                );
              })}
            </div>
          </div>

          <div className="editor-section">
            <div className="editor-section__header">
              <div>
                <h3>包含店铺</h3>
                <p>用于把同一栋建筑内的多家店铺合并到同一个点位</p>
              </div>
            </div>
            <IncludeEditor
              rows={toIncludeRows(feature.properties.include)}
              namePlaceholder="店铺名"
              notePlaceholder="楼层 / 补充说明"
              emptyText="当前点位未合并其他店铺"
              addLabel="新增店铺"
              onChange={next =>
                updateProperties({ include: fromIncludeRows(next) })
              }
            />
          </div>

          <div className="editor-section">
            <div className="editor-section__header">
              <div>
                <h3>来源</h3>
                <p>新增点位默认来源为手动添加，后续可在这里接入半自动搜索</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>source</span>
                <input
                  value={feature.properties.source ?? "manual"}
                  onChange={event =>
                    updateProperties({ source: event.target.value })
                  }
                />
              </label>
            </div>
            <SourceListEditor
              value={feature.properties.sources ?? []}
              onChange={next => updateProperties({ sources: next })}
              onTriggerSearch={onTriggerSourceSearch}
            />
          </div>
        </>
      ) : (
        <div className="empty-block">
          当前文件还没有选中点位，可以在左侧文件行 hover 后直接新建点位
        </div>
      )}
    </section>
  );
}

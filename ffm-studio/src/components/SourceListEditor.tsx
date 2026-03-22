import type { PoiSource } from "../types";

type Props = {
  value: PoiSource[];
  onChange: (next: PoiSource[]) => void;
  onTriggerSearch: () => void;
};

const EMPTY_SOURCE: PoiSource = {
  platform: "manual",
  title: "手动添加",
  status: "manual"
};

export default function SourceListEditor({ value, onChange, onTriggerSearch }: Props) {
  const updateRow = (index: number, key: keyof PoiSource, nextValue: string) => {
    onChange(
      value.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: nextValue || undefined } : item))
    );
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="stack-editor">
      <div className="source-toolbar">
        <button type="button" className="secondary-button" onClick={() => onChange([...value, { ...EMPTY_SOURCE }])}>
          新增来源
        </button>
        <button type="button" className="ghost-button" onClick={onTriggerSearch}>
          预留：半自动搜索
        </button>
      </div>
      {value.length ? (
        value.map((item, index) => (
          <div className="source-card" key={`source-${index}`}>
            <div className="source-card__grid">
              <label>
                <span>平台</span>
                <input
                  value={item.platform ?? ""}
                  onChange={event => updateRow(index, "platform", event.target.value)}
                />
              </label>
              <label>
                <span>标题</span>
                <input
                  value={item.title ?? ""}
                  onChange={event => updateRow(index, "title", event.target.value)}
                />
              </label>
              <label>
                <span>状态</span>
                <input
                  value={item.status ?? ""}
                  onChange={event => updateRow(index, "status", event.target.value)}
                />
              </label>
              <label>
                <span>页面链接</span>
                <input
                  value={item.pageUrl ?? ""}
                  onChange={event => updateRow(index, "pageUrl", event.target.value)}
                />
              </label>
              <label>
                <span>搜索链接</span>
                <input
                  value={item.searchUrl ?? ""}
                  onChange={event => updateRow(index, "searchUrl", event.target.value)}
                />
              </label>
              <label>
                <span>App 链接</span>
                <input
                  value={item.appUrl ?? ""}
                  onChange={event => updateRow(index, "appUrl", event.target.value)}
                />
              </label>
            </div>
            <button type="button" className="ghost-button" onClick={() => removeRow(index)}>
              删除该来源
            </button>
          </div>
        ))
      ) : (
        <span className="empty-inline">暂无来源，新增点位默认会写入手动来源</span>
      )}
    </div>
  );
}

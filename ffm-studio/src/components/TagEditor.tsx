import { useMemo, useState } from "react";

type Props = {
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
};

function cleanTags(tags: string[]) {
  return [...new Set(tags.map(item => item.trim()).filter(Boolean))];
}

export default function TagEditor({ value, suggestions, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const filteredSuggestions = useMemo(() => {
    const keyword = draft.trim().toLowerCase();
    return suggestions
      .filter(item => !value.includes(item))
      .filter(item => (keyword ? item.toLowerCase().includes(keyword) : true))
      .slice(0, 12);
  }, [draft, suggestions, value]);

  const addTag = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    onChange(cleanTags([...value, next]));
    setDraft("");
  };

  return (
    <div className="chip-editor">
      <div className="chip-list">
        {value.length ? (
          value.map(tag => (
            <button
              key={tag}
              type="button"
              className="chip-token"
              onClick={() => onChange(value.filter(item => item !== tag))}
              title="点击删除标签"
            >
              {tag}
              <span aria-hidden="true">×</span>
            </button>
          ))
        ) : (
          <span className="empty-inline">暂无标签</span>
        )}
      </div>
      <div className="chip-editor__controls">
        <input
          value={draft}
          placeholder="输入标签后回车"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag(draft);
            }
          }}
        />
        <button type="button" className="secondary-button" onClick={() => addTag(draft)}>
          添加
        </button>
      </div>
      {filteredSuggestions.length ? (
        <div className="suggestion-list">
          {filteredSuggestions.map(tag => (
            <button key={tag} type="button" className="suggestion-pill" onClick={() => addTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

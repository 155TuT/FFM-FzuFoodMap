import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
  onCreateTag: (tag: string) => void;
};

const addIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/add.svg",
  import.meta.url
).href;

const saveIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/save.svg",
  import.meta.url
).href;

function cleanTags(tags: string[]) {
  return [...new Set(tags.map(item => item.trim()).filter(Boolean))];
}

export default function TagEditor({ value, suggestions, onChange, onCreateTag }: Props) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filteredSuggestions = useMemo(
    () => suggestions.filter(item => !value.includes(item)),
    [suggestions, value]
  );

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
        setDraft("");
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [expanded]);

  const saveDraft = () => {
    const next = draft.trim();
    if (!next) return;
    onCreateTag(next);
    setDraft("");
    setExpanded(false);
  };

  return (
    <div ref={rootRef} className="chip-editor">
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

      <div className="suggestion-list">
        {filteredSuggestions.map(tag => (
          <button key={tag} type="button" className="suggestion-pill" onClick={() => onChange(cleanTags([...value, tag]))}>
            {tag}
          </button>
        ))}

        {expanded ? (
          <div className="tag-creator">
            <input
              ref={inputRef}
              value={draft}
              placeholder="新标签"
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveDraft();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setExpanded(false);
                  setDraft("");
                }
              }}
            />
            <button
              type="button"
              className="tree-row__action tag-creator__save"
              title="保存当前标签"
              aria-label="保存当前标签"
              disabled={!draft.trim()}
              onClick={saveDraft}
            >
              <img className="tree-row__action-icon" src={saveIconSrc} alt="" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="tag-creator__toggle"
            title="新增标签"
            aria-label="新增标签"
            onClick={() => setExpanded(true)}
          >
            <img className="tree-row__action-icon" src={addIconSrc} alt="" />
          </button>
        )}
      </div>
    </div>
  );
}

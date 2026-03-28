import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string;
  suggestions: string[];
  onSelect: (category: string) => void;
  onCreateCategory: (category: string) => void;
};

const liftupIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/liftup.svg",
  import.meta.url
).href;

const pulldownIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/pulldown.svg",
  import.meta.url
).href;

function normalizeValue(value: string) {
  return value.trim();
}

export default function CategoryEditor({ value, suggestions, onSelect, onCreateCategory }: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const normalizedDraft = normalizeValue(draft);
  const filteredSuggestions = useMemo(() => {
    const keyword = normalizedDraft.toLocaleLowerCase();
    const next = keyword
      ? suggestions.filter(item => item.toLocaleLowerCase().includes(keyword))
      : suggestions;

    return [...next].sort((left, right) => {
      if (left === value) return -1;
      if (right === value) return 1;
      return left.localeCompare(right, "zh-CN");
    });
  }, [normalizedDraft, suggestions, value]);

  const hasExactMatch = suggestions.some(item => item === normalizedDraft);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraft("");
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const closeDropdown = () => {
    setOpen(false);
    setDraft("");
  };

  const submitDraft = () => {
    if (!normalizedDraft) {
      return;
    }

    if (hasExactMatch) {
      onSelect(normalizedDraft);
    } else {
      onCreateCategory(normalizedDraft);
    }
    closeDropdown();
  };

  return (
    <div ref={rootRef} className="category-picker">
      <button
        type="button"
        className={`category-picker__trigger${open ? " category-picker__trigger--open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (open) {
            closeDropdown();
            return;
          }
          setOpen(true);
        }}
      >
        <span className={`category-picker__value${value ? "" : " category-picker__value--placeholder"}`}>
          {value || "请选择门店类型"}
        </span>
        <img className="category-picker__icon" src={open ? liftupIconSrc : pulldownIconSrc} alt="" />
      </button>

      {open ? (
        <div className="category-picker__dropdown">
          <div className="category-picker__controls">
            <input
              ref={inputRef}
              value={draft}
              placeholder="输入新类型后加入缓存"
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitDraft();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeDropdown();
                }
              }}
            />
            <button
              type="button"
              className="secondary-button primary-button--compact category-picker__submit"
              disabled={!normalizedDraft}
              onClick={submitDraft}
            >
              {hasExactMatch ? "选择" : "加入并选择"}
            </button>
          </div>

          <div className="category-picker__card" role="listbox" aria-label="门店类型">
            {filteredSuggestions.length ? (
              filteredSuggestions.map(category => (
                <button
                  key={category}
                  type="button"
                  role="option"
                  aria-selected={category === value}
                  className={`category-picker__option${category === value ? " category-picker__option--selected" : ""}`}
                  onClick={() => {
                    onSelect(category);
                    closeDropdown();
                  }}
                >
                  <span>{category}</span>
                  <span className="category-picker__meta">{category === value ? "当前" : "选择"}</span>
                </button>
              ))
            ) : (
              <div className="category-picker__empty">没有匹配项，直接加入即可</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import type { RefObject } from "react";

type SearchInputProps = {
  variant: "toolbar" | "popover";
  value: string;
  placeholder: string;
  searchIconUrl?: string;
  clearIconUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  readOnly?: boolean;
};

export function SearchInput({
  variant,
  value,
  placeholder,
  searchIconUrl,
  clearIconUrl,
  inputRef,
  onChange,
  onClear,
  onFocus,
  readOnly
}: SearchInputProps) {
  const hasValue = value.length > 0;

  if (variant === "popover") {
    return (
      <div className="search-popover-input-row">
        <input
          type="search"
          value={value}
          ref={inputRef}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {hasValue && (
          <button
            type="button"
            className="search-popover-clear"
            onClick={onClear}
            aria-label="清除搜索内容"
          >
            <img src={clearIconUrl} alt="" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`toolbar-search-field${hasValue ? " toolbar-search-field--has-text" : ""}`}>
      <span className="toolbar-search-icon" aria-hidden="true">
        <img src={searchIconUrl} alt="" />
      </span>
      <input
        type="search"
        className="toolbar-search-input"
        placeholder={placeholder}
        value={value}
        ref={inputRef}
        onFocus={onFocus}
        onChange={event => onChange(event.target.value)}
        aria-haspopup="dialog"
        aria-controls="search-popover"
        readOnly={readOnly}
      />
      {hasValue && (
        <button
          type="button"
          className="toolbar-search-clear"
          onClick={event => {
            event.stopPropagation();
            onClear();
          }}
          aria-label="清除搜索内容"
        >
          <img src={clearIconUrl} alt="" />
        </button>
      )}
    </div>
  );
}

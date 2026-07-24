import { useCallback, useEffect, useRef } from "react";
import type { CityConfig } from "../../../cities";
import type { GeoFeature, SearchField } from "../../../types";
import type { AppIconPaths } from "../../../utils/assetPaths";
import { SearchInput } from "./SearchInput";
import { SearchPopover } from "./SearchPopover";
import "./SearchControl.css";

type SearchControlProps = {
  city: CityConfig;
  open: boolean;
  value: string;
  field: SearchField;
  suggestions: GeoFeature[];
  icons: AppIconPaths;
  onOpen: () => void;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onFieldChange: (field: SearchField) => void;
  onSuggestionSelect: (feature: GeoFeature) => void;
};

export function SearchControl({
  city,
  open,
  value,
  field,
  suggestions,
  icons,
  onOpen,
  onClose,
  onValueChange,
  onFieldChange,
  onSuggestionSelect
}: SearchControlProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const toolbarInputRef = useRef<HTMLInputElement | null>(null);
  const popoverInputRef = useRef<HTMLInputElement | null>(null);

  const clearSearch = useCallback(() => {
    onValueChange("");
    requestAnimationFrame(() => {
      (open ? popoverInputRef.current ?? toolbarInputRef.current : toolbarInputRef.current)?.focus();
    });
  }, [onValueChange, open]);

  useEffect(() => {
    if (!open) {
      toolbarInputRef.current?.blur();
      popoverInputRef.current?.blur();
      return;
    }

    const focusTarget = () => {
      if (window.matchMedia("(max-width: 719px)").matches) {
        popoverInputRef.current?.focus({ preventScroll: true });
      } else {
        toolbarInputRef.current?.focus({ preventScroll: true });
        toolbarInputRef.current?.select();
      }
    };
    requestAnimationFrame(focusTarget);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (document.getElementById("map")?.contains(target)) return;
      if (!wrapperRef.current?.contains(target)) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, open]);

  return (
    <div
      className={`toolbar-search${open ? " toolbar-search--open" : ""}`}
      ref={wrapperRef}
      onClick={event => {
        if ((event.target as Element).closest(".search-popover")) return;
        if (!open) onOpen();
        else toolbarInputRef.current?.focus();
      }}
    >
      <SearchInput
        variant="toolbar"
        value={value}
        placeholder="搜索"
        searchIconUrl={icons.search}
        clearIconUrl={icons.clear}
        inputRef={toolbarInputRef}
        onChange={onValueChange}
        onClear={clearSearch}
        onFocus={onOpen}
        readOnly={!open}
      />
      {open && (
        <SearchPopover
          city={city}
          value={value}
          field={field}
          suggestions={suggestions}
          inputRef={popoverInputRef}
          clearIconUrl={icons.clear}
          collapseIconUrl={icons.collapse}
          onChange={onValueChange}
          onClear={clearSearch}
          onClose={onClose}
          onFieldChange={onFieldChange}
          onSuggestionSelect={onSuggestionSelect}
        />
      )}
    </div>
  );
}

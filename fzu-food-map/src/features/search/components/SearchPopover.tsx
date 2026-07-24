import { useMemo, type RefObject } from "react";
import type { CityConfig } from "../../../cities";
import type { GeoFeature, SearchField } from "../../../types";
import { getPoiMetaLines } from "../../pois/poiDetails";
import { SearchInput } from "./SearchInput";

const SEARCH_OPTIONS: { value: SearchField; label: string }[] = [
  { value: "name", label: "店名" },
  { value: "tags", label: "标签" },
  { value: "notes", label: "菜品" }
];

const UNASSIGNED_REGION_ID = "__unassigned__";
const UNASSIGNED_REGION_LABEL = "未分区";

type SearchPopoverProps = {
  city: CityConfig;
  value: string;
  field: SearchField;
  suggestions: GeoFeature[];
  inputRef: RefObject<HTMLInputElement | null>;
  clearIconUrl: string;
  collapseIconUrl: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
  onFieldChange: (field: SearchField) => void;
  onSuggestionSelect: (feature: GeoFeature) => void;
};

export function SearchPopover({
  city,
  value,
  field,
  suggestions,
  inputRef,
  clearIconUrl,
  collapseIconUrl,
  onChange,
  onClear,
  onClose,
  onFieldChange,
  onSuggestionSelect
}: SearchPopoverProps) {
  const groupedSuggestions = useMemo(() => groupByRegion(suggestions, city), [city, suggestions]);
  const showEmptyState = value.trim().length > 0 && suggestions.length === 0;

  return (
    <div id="search-popover" className="search-popover" role="dialog" aria-label="搜索">
      <SearchInput
        variant="popover"
        value={value}
        placeholder="搜索"
        clearIconUrl={clearIconUrl}
        inputRef={inputRef}
        onChange={onChange}
        onClear={onClear}
      />
      <div className="search-popover-results scrollable-card" role="listbox" aria-label="搜索">
        {groupedSuggestions.length > 0 ? (
          groupedSuggestions.map(group => {
            const headerId = `search-group-${group.regionId}`;
            return (
              <div
                key={group.regionId}
                className="search-popover-group"
                role="group"
                aria-labelledby={headerId}
              >
                <div className="search-popover-group-header" id={headerId}>
                  <span className="search-popover-group-label">{group.label}</span>
                  <span className="search-popover-group-divider" aria-hidden="true" />
                </div>
                {group.items.map(feature => (
                  <button
                    key={feature.properties.id}
                    type="button"
                    className="search-popover-result"
                    onClick={() => onSuggestionSelect(feature)}
                    role="option"
                  >
                    <span className="search-suggestion-title" title={feature.properties.name}>
                      {feature.properties.name}
                    </span>
                    {getPoiMetaLines(feature.properties, 3).map(line => (
                      <span
                        key={`${feature.properties.id}-popover-${line.key}`}
                        className={`search-suggestion-meta${
                          line.secondary ? " search-suggestion-meta--secondary" : ""
                        }`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            );
          })
        ) : (
          <p className="search-popover-empty">
            {showEmptyState ? "暂无匹配结果，请尝试通过右侧公告反馈" : "选择标签并输入关键字以搜索"}
          </p>
        )}
      </div>
      <div className="search-popover-footer">
        <div className="search-field-chips" role="group" aria-label="选择搜索类型">
          {SEARCH_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`chip ${field === option.value ? "chip--active" : ""}`}
              onClick={() => onFieldChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="search-popover-collapse"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          aria-label="收起搜索面板"
        >
          <span className="search-popover-collapse-text">收起</span>
          <span className="search-popover-collapse-icon" aria-hidden="true">
            <img src={collapseIconUrl} alt="" />
          </span>
        </button>
      </div>
    </div>
  );
}

function groupByRegion(suggestions: GeoFeature[], city: CityConfig) {
  const grouped = new Map<string, GeoFeature[]>();
  suggestions.forEach(feature => {
    const regionId = feature.properties.regionId ?? UNASSIGNED_REGION_ID;
    const items = grouped.get(regionId);
    if (items) items.push(feature);
    else grouped.set(regionId, [feature]);
  });

  const ordered: { regionId: string; label: string; items: GeoFeature[] }[] = [];
  city.regions.forEach(region => {
    const items = grouped.get(region.id);
    if (!items?.length) return;
    ordered.push({ regionId: region.id, label: region.name, items });
    grouped.delete(region.id);
  });
  grouped.forEach((items, regionId) => {
    ordered.push({ regionId, label: UNASSIGNED_REGION_LABEL, items });
  });
  return ordered;
}

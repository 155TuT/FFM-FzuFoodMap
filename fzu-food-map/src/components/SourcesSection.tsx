import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PoiProps } from "../types";
import { getDisplaySources } from "../utils/sources";
import SourceIcon from "./SourceIcon";

type Props = {
  poi: PoiProps;
};

export default function SourcesSection({ poi }: Props) {
  const sources = useMemo(() => getDisplaySources(poi), [poi]);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const iconBase = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const toggleIcon = `${iconBase}assets/icons/normal/${expanded ? "left" : "right"}.svg`;

  useEffect(() => {
    if (!expanded) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      const target = event.target;
      if (!(target instanceof Node) || !container || container.contains(target)) {
        return;
      }

      setExpanded(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  if (!sources.length) {
    return null;
  }

  return (
    <div className={`poi-sources${expanded ? " poi-sources--expanded" : ""}`} ref={containerRef}>
      <button
        className="poi-sources__toggle"
        type="button"
        onClick={() => setExpanded(current => !current)}
        aria-expanded={expanded}
        aria-controls={listId}
        title={expanded ? "收起来源" : "查看来源"}
        aria-label={expanded ? "收起来源" : "查看来源"}
      >
        <span className="poi-sources__toggle-circle" aria-hidden="true">
          <img
            className="poi-sources__toggle-icon"
            src={toggleIcon}
            alt=""
          />
        </span>
      </button>
      <div
        className={`poi-sources__strip${expanded ? " poi-sources__strip--expanded" : ""}`}
        id={listId}
        aria-label="来源列表"
        aria-hidden={!expanded}
      >
        {expanded ? (
          <div className="poi-sources__scroller">
            {sources.map(source => (
              <SourceIcon key={source.key} source={source} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

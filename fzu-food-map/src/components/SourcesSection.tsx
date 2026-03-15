import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PoiProps } from "../types";
import { getDisplaySources } from "../utils/sources";
import SourceIcon from "./SourceIcon";
import SourceIconStack from "./SourceIconStack";
import SourceListPopover from "./SourceListPopover";

type Props = {
  poi: PoiProps;
};

export default function SourcesSection({ poi }: Props) {
  const sources = useMemo(() => getDisplaySources(poi), [poi]);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

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

  if (sources.length === 1) {
    return (
      <div className="poi-sources" ref={containerRef}>
        <SourceIcon source={sources[0]} />
      </div>
    );
  }

  return (
    <div className="poi-sources poi-sources--multiple" ref={containerRef}>
      <button
        className="source-stack-trigger"
        type="button"
        onClick={() => setExpanded(current => !current)}
        aria-expanded={expanded}
        aria-controls={expanded ? popoverId : undefined}
        title={`显示 ${sources.length} 个来源`}
        aria-label={`显示 ${sources.length} 个来源`}
      >
        <SourceIconStack sources={sources} />
      </button>
      {expanded ? <SourceListPopover id={popoverId} sources={sources} /> : null}
    </div>
  );
}

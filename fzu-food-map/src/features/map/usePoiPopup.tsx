import { useCallback, useRef, type RefObject } from "react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap } from "maplibre-gl";
import { createRoot, type Root } from "react-dom/client";
import type { PoiProps } from "../../types";
import SourcesSection from "../../components/SourcesSection";
import { escapeHtml, getIncludeEntries, getPoiMetaLines } from "../pois/poiDetails";

type PopupOptions = {
  highlightIncludeIndex?: number | null;
};

export function usePoiPopup(mapRef: RefObject<MapLibreMap | null>) {
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const sourcesRootRef = useRef<Root | null>(null);

  const cleanupSourcesRoot = useCallback(() => {
    sourcesRootRef.current?.unmount();
    sourcesRootRef.current = null;
  }, []);

  const closePopup = useCallback(() => {
    cleanupSourcesRoot();
    popupRef.current?.remove();
    popupRef.current = null;
  }, [cleanupSourcesRoot]);

  const showPoiPopup = useCallback(
    (poi: PoiProps, coordinates: LngLatLike, options?: PopupOptions) => {
      const map = mapRef.current;
      if (!map) return;

      cleanupSourcesRoot();
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          offset: 10,
          closeButton: false,
          maxWidth: "260px"
        });
        popupRef.current.on("close", cleanupSourcesRoot);
      }

      const popup = popupRef.current;
      const includeEntries = getIncludeEntries(poi);
      const metaHtml = getPoiMetaLines(poi)
        .filter(line => line.key !== "note")
        .map(line => `<div class="poi-meta">${escapeHtml(line.text)}</div>`)
        .join("");
      const includeHtml =
        includeEntries.length > 0
          ? `<ul class="poi-include-list">${includeEntries
              .map(entry => {
                const notes = entry.notes
                  ? `<div class="poi-include-notes">${escapeHtml(entry.notes)}</div>`
                  : "";
                return `<li class="poi-include-item"><div class="poi-include-name">${escapeHtml(entry.name)}</div>${notes}</li>`;
              })
              .join("")}</ul>`
          : "";
      const noteHtml =
        includeEntries.length === 0 && poi.notes
          ? `<div class="poi-notes">${escapeHtml(poi.notes)}</div>`
          : "";

      popup
        .setLngLat(coordinates)
        .setHTML(`
          <div class="poi-popup-shell">
            <div class="poi-card scrollable-card">
              <div class="poi-title">${escapeHtml(poi.name)}</div>
              ${metaHtml ? `<div class="poi-meta-group">${metaHtml}</div>` : ""}
              ${includeHtml}
              ${noteHtml}
            </div>
            <div class="poi-sources-slot"></div>
          </div>
        `)
        .addTo(map);

      queueMicrotask(() => {
        const element = popup.getElement();
        if (!element) return;

        const card = element.querySelector<HTMLDivElement>(".poi-card.scrollable-card");
        const highlightIndex = options?.highlightIncludeIndex ?? null;
        if (card) {
          card.scrollTop = 0;
          const items = Array.from(card.querySelectorAll<HTMLLIElement>(".poi-include-item"));
          items.forEach(item => item.classList.remove("poi-include-item--active"));
          if (highlightIndex != null && highlightIndex >= 0 && highlightIndex < items.length) {
            const target = items[highlightIndex];
            target.classList.add("poi-include-item--active");
            card.scrollTop = Math.max(target.offsetTop - 8, 0);
          }
        }

        const sourcesMount = element.querySelector<HTMLDivElement>(".poi-sources-slot");
        if (sourcesMount) {
          const root = createRoot(sourcesMount);
          sourcesRootRef.current = root;
          root.render(<SourcesSection poi={poi} />);
        }
      });
    },
    [cleanupSourcesRoot, mapRef]
  );

  return { showPoiPopup, closePopup };
}

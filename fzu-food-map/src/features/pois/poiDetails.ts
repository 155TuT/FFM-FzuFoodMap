import type { PoiProps } from "../../types";
import { normalizePoiTags, TAG_GROUPS, type TagGroupKey } from "../../tagGroups";

export const META_SEPARATOR = " · ";

export type PoiMetaLine = {
  key: "schedule" | "address" | "price" | "note" | TagGroupKey;
  text: string;
  secondary: boolean;
};

export type IncludeEntry = {
  name: string;
  notes: string;
};

export function getIncludeEntries(poi: PoiProps): IncludeEntry[] {
  const names = Array.isArray(poi.include?.name) ? poi.include.name : [];
  const notes = Array.isArray(poi.include?.notes) ? poi.include.notes : [];

  return names
    .map((rawName, index) => {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) return null;
      const rawNote = notes[index];
      return {
        name,
        notes: typeof rawNote === "string" ? rawNote.trim() : ""
      };
    })
    .filter((entry): entry is IncludeEntry => entry !== null);
}

export function getPoiMetaLines(poi: PoiProps, tagLimit?: number): PoiMetaLine[] {
  const tags = normalizePoiTags(poi.tags);
  const schedule = [poi.openhour ?? "", poi.contact ? `tel:${poi.contact}` : ""]
    .filter(Boolean)
    .join(" ");

  const tagLines: PoiMetaLine[] = TAG_GROUPS.flatMap(group => {
    const values = tags[group.key].slice(0, tagLimit ?? tags[group.key].length);
    return values.length
      ? [{ key: group.key, text: `${group.label}\uff1a${values.join(META_SEPARATOR)}`, secondary: false }]
      : [];
  });

  const lines: PoiMetaLine[] = [
    { key: "schedule", text: schedule, secondary: false },
    { key: "address", text: poi.address ?? "", secondary: true },
    ...tagLines,
    { key: "price", text: poi.price ? `\u4ef7\u683c\uff1a${poi.price}` : "", secondary: false },
    { key: "note", text: poi.notes ?? "", secondary: true }
  ];
  return lines.filter(line => line.text);
}

export function escapeHtml(text?: string) {
  return (text ?? "").replace(/[&<>"]/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    };
    return entities[character] ?? character;
  });
}

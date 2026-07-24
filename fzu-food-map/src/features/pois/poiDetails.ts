import type { PoiProps } from "../../types";

export const META_SEPARATOR = " · ";

export type PoiMetaLine = {
  key: "schedule" | "address" | "tagprice" | "note";
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
  const tags = Array.isArray(poi.tags)
    ? poi.tags.slice(0, tagLimit ?? poi.tags.length).join(META_SEPARATOR)
    : "";
  const schedule = [poi.openhour ?? "", poi.contact ? `tel:${poi.contact}` : ""]
    .filter(Boolean)
    .join(" ");
  const tagPrice = [tags, poi.price ?? ""].filter(Boolean).join(META_SEPARATOR);

  const lines: PoiMetaLine[] = [
    { key: "schedule", text: schedule, secondary: false },
    { key: "address", text: poi.address ?? "", secondary: true },
    { key: "tagprice", text: tagPrice, secondary: false },
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

export const TAG_GROUPS = [
  { key: "cuisines", label: "菜系" },
  { key: "characteristics", label: "用餐方式" },
  { key: "dish", label: "品类" },
  { key: "miscellaneous", label: "其他" }
] as const;

export type TagGroupKey = (typeof TAG_GROUPS)[number]["key"];

export type PoiTags = Record<TagGroupKey, string[]>;

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map(value => value.trim())
        .filter(Boolean)
    )
  ];
}

export function normalizePoiTags(tags: unknown): PoiTags {
  if (Array.isArray(tags)) {
    return {
      cuisines: [],
      characteristics: [],
      dish: [],
      miscellaneous: clean(tags)
    };
  }

  const source = tags && typeof tags === "object" ? (tags as Record<string, unknown>) : {};
  return {
    cuisines: clean(source.cuisines),
    characteristics: clean(source.characteristics),
    dish: clean(source.dish),
    miscellaneous: clean(source.miscellaneous)
  };
}

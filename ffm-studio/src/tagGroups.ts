export const TAG_GROUPS = [
  { key: "cuisines", label: "菜系", description: "菜系与地域风味" },
  { key: "characteristics", label: "用餐方式", description: "用餐方式与适用场景" },
  { key: "dish", label: "品类", description: "主营品类与餐品形式" },
  { key: "miscellaneous", label: "其他", description: "不属于以上类别的补充标签" }
] as const;

export type TagGroupKey = (typeof TAG_GROUPS)[number]["key"];
export type TagGroups = Record<TagGroupKey, string[]>;

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

export function createEmptyTagGroups(): TagGroups {
  return {
    cuisines: [],
    characteristics: [],
    dish: [],
    miscellaneous: []
  };
}

export function normalizeTagGroups(tags: unknown): TagGroups {
  if (Array.isArray(tags)) {
    return { ...createEmptyTagGroups(), miscellaneous: clean(tags) };
  }

  const source = tags && typeof tags === "object" ? (tags as Record<string, unknown>) : {};
  return {
    cuisines: clean(source.cuisines),
    characteristics: clean(source.characteristics),
    dish: clean(source.dish),
    miscellaneous: clean(source.miscellaneous)
  };
}

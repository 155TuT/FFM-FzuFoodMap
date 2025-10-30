export function buildShareUrl(citySlug: string, favIds: string[]) {
  const u = new URL(location.href);
  u.searchParams.set("city", citySlug);
  u.searchParams.set("fav", favIds.join(","));
  return u.toString();
}
export function parseFavFromUrl(): string[] {
  const val = new URL(location.href).searchParams.get("fav");
  return val ? val.split(",").filter(Boolean) : [];
}
export function parseCityFromUrl(): string | undefined {
  return new URL(location.href).searchParams.get("city") || undefined;
}
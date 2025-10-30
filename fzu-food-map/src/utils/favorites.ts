const KEY = "foodmap:favs";
export function getFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); }
  catch { return new Set(); }
}
export function toggleFav(id: string): Set<string> {
  const s = getFavs();
  if (s.has(id)) {
    s.delete(id);
  } else {
    s.add(id);
  }
  localStorage.setItem(KEY, JSON.stringify([...s]));
  return s;
}
export function setFavs(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

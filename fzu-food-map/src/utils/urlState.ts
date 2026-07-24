export function parseCityFromUrl(): string | undefined {
  return new URL(location.href).searchParams.get("city") || undefined;
}

export function parseRegionFromUrl(): string | undefined {
  return new URL(location.href).searchParams.get("region") || undefined;
}

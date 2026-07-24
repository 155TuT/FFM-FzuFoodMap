import { useCallback, useEffect, useMemo, useState } from "react";
import { CITIES, getCityBySlug, type CityConfig } from "../../cities";
import { parseCityFromUrl, parseRegionFromUrl } from "../../utils/urlState";

export function useRegionSelection() {
  const [citySlug, setCitySlug] = useState(() => parseCityFromUrl() ?? CITIES[0].slug);
  const city = useMemo(() => getCityBySlug(citySlug), [citySlug]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(() =>
    resolveInitialRegionId(city)
  );

  useEffect(() => {
    setActiveRegionId(currentRegionId => {
      if (currentRegionId && city.regions.some(region => region.id === currentRegionId)) {
        return currentRegionId;
      }

      const regionFromUrl = parseRegionFromUrl();
      if (regionFromUrl && city.regions.some(region => region.id === regionFromUrl)) {
        return regionFromUrl;
      }

      return resolveDefaultRegionId(city);
    });
  }, [city]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("city", city.slug);
    if (activeRegionId) url.searchParams.set("region", activeRegionId);
    else url.searchParams.delete("region");
    window.history.replaceState({}, "", url);
  }, [activeRegionId, city.slug]);

  const selectCity = useCallback((slug: string) => {
    setCitySlug(slug);
  }, []);

  const selectRegion = useCallback((regionId: string | null) => {
    setActiveRegionId(regionId);
  }, []);

  return {
    city,
    citySlug,
    activeRegionId,
    selectCity,
    selectRegion
  };
}

function resolveInitialRegionId(city: CityConfig) {
  const regionFromUrl = parseRegionFromUrl();
  if (regionFromUrl && city.regions.some(region => region.id === regionFromUrl)) {
    return regionFromUrl;
  }
  return resolveDefaultRegionId(city);
}

function resolveDefaultRegionId(city: CityConfig) {
  return (
    city.defaultRegionId ??
    city.regions.find(region => region.isCitywide)?.id ??
    city.regions[0]?.id ??
    null
  );
}

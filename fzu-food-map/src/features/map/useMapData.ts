import { useEffect, useState } from "react";
import type { CityConfig } from "../../cities";
import type { GeoFeature, GeoJson } from "../../types";

const UNASSIGNED_REGION_ID = "__unassigned__";

type MapDataState = {
  data: GeoJson | null;
  loading: boolean;
};

export function useMapData(city: CityConfig): MapDataState {
  const [state, setState] = useState<MapDataState>({ data: null, loading: true });

  useEffect(() => {
    const abortController = new AbortController();

    async function loadData() {
      setState({ data: null, loading: true });

      const baseUrl = window.location.origin + import.meta.env.BASE_URL;
      const targets = city.regions
        .filter(region => region.dataPath)
        .map(region => ({
          regionId: region.id,
          url: new URL(region.dataPath!, baseUrl).toString()
        }));

      const results = await Promise.all(
        targets.map(async target => {
          try {
            const response = await fetch(target.url, { signal: abortController.signal });
            if (!response.ok) throw new Error(`加载 ${target.url} 失败 (${response.status})`);
            return { target, data: (await response.json()) as GeoJson };
          } catch (error) {
            if (!abortController.signal.aborted) console.error(error);
            return null;
          }
        })
      );

      if (abortController.signal.aborted) return;

      const features: GeoFeature[] = [];
      results.forEach(result => {
        result?.data.features.forEach(feature => {
          features.push({
            ...feature,
            properties: {
              ...feature.properties,
              regionId: feature.properties.regionId ?? result.target.regionId ?? UNASSIGNED_REGION_ID
            }
          });
        });
      });

      setState({
        data: { type: "FeatureCollection", features },
        loading: false
      });
    }

    void loadData();
    return () => abortController.abort();
  }, [city]);

  return state;
}

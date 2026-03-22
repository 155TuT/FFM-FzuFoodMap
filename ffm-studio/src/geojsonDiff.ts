import type { GeoFeature, GeoJsonDocument } from "./types";

type ComparableValue =
  | null
  | boolean
  | number
  | string
  | ComparableValue[]
  | { [key: string]: ComparableValue };

function normalizeComparableValue(value: unknown): ComparableValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeComparableValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeComparableValue(item)]));
  }

  return null;
}

function stableSerialize(value: unknown) {
  return JSON.stringify(normalizeComparableValue(value));
}

function buildFeatureComparableValue(feature: GeoFeature, includeId: boolean) {
  const { id: _id, ...propertiesWithoutId } = feature.properties ?? {};
  const properties = includeId ? feature.properties : propertiesWithoutId;
  return {
    ...feature,
    properties
  };
}

function buildFeatureMaterialSignature(feature: GeoFeature) {
  return stableSerialize(buildFeatureComparableValue(feature, false));
}

export function areGeoJsonDocumentsEqual(left: GeoJsonDocument | null, right: GeoJsonDocument | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return stableSerialize(left) === stableSerialize(right);
}

export function isGeoJsonDirtyAgainstSource(document: GeoJsonDocument, source: GeoJsonDocument | null) {
  return !areGeoJsonDocumentsEqual(document, source);
}

export function collectDirtyFeatureIds(document: GeoJsonDocument, source: GeoJsonDocument | null) {
  const dirtyIds = new Set<string>();
  const currentFeatures = Array.isArray(document.features) ? document.features : [];

  if (!source) {
    for (const feature of currentFeatures) {
      dirtyIds.add(feature.properties.id);
    }
    return dirtyIds;
  }

  const sourceFeatures = Array.isArray(source.features) ? source.features : [];
  const currentSignatures = currentFeatures.map(buildFeatureMaterialSignature);
  const sourceSignatures = sourceFeatures.map(buildFeatureMaterialSignature);
  const dp = Array.from({ length: currentSignatures.length + 1 }, () =>
    Array<number>(sourceSignatures.length + 1).fill(0)
  );

  for (let currentIndex = currentSignatures.length - 1; currentIndex >= 0; currentIndex -= 1) {
    for (let sourceIndex = sourceSignatures.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
      dp[currentIndex][sourceIndex] =
        currentSignatures[currentIndex] === sourceSignatures[sourceIndex]
          ? dp[currentIndex + 1][sourceIndex + 1] + 1
          : Math.max(dp[currentIndex + 1][sourceIndex], dp[currentIndex][sourceIndex + 1]);
    }
  }

  const matchedCurrentIndices = new Set<number>();
  let currentIndex = 0;
  let sourceIndex = 0;

  while (currentIndex < currentSignatures.length && sourceIndex < sourceSignatures.length) {
    if (currentSignatures[currentIndex] === sourceSignatures[sourceIndex]) {
      matchedCurrentIndices.add(currentIndex);
      currentIndex += 1;
      sourceIndex += 1;
      continue;
    }

    if (dp[currentIndex + 1][sourceIndex] >= dp[currentIndex][sourceIndex + 1]) {
      currentIndex += 1;
    } else {
      sourceIndex += 1;
    }
  }

  currentFeatures.forEach((feature, index) => {
    if (!matchedCurrentIndices.has(index)) {
      dirtyIds.add(feature.properties.id);
    }
  });

  return dirtyIds;
}

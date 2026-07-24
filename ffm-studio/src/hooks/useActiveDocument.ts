import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFile } from "../api";
import {
  buildFeature,
  getDefaultCoordsForFile,
  isRegionConfigDirty,
  normalizeFeature,
  renumberFeatures
} from "../domain/geoJson";
import { isGeoJsonDirtyAgainstSource } from "../geojsonDiff";
import type {
  FilePayload,
  GeoFeature,
  GeoJsonDocument,
  RegionConfig,
  Workspace
} from "../types";
import useAutosaveQueue from "./useAutosaveQueue";

type Props = {
  activeFilePath: string | null;
  categories: string[];
  setActiveFilePath: (path: string | null) => void;
  applyWorkspace: (workspace: Workspace) => void;
  onBusyChange: (busy: boolean) => void;
  onStatus: (message: string) => void;
};

export default function useActiveDocument({
  activeFilePath,
  categories,
  setActiveFilePath,
  applyWorkspace,
  onBusyChange,
  onStatus
}: Props) {
  const [activeFile, setActiveFile] = useState<FilePayload | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const activeFilePathRef = useRef<string | null>(null);
  const undoStackRef = useRef<GeoJsonDocument[]>([]);
  const pendingCreateFeatureRef = useRef<string | null>(null);
  const sourceSnapshotRef = useRef<GeoJsonDocument | null>(null);

  const applyFilePayload = (file: FilePayload) => {
    sourceSnapshotRef.current = file.sourceData;
    setActiveFile({
      ...file,
      dirty:
        isGeoJsonDirtyAgainstSource(file.data, file.sourceData) ||
        Boolean(file.regionConfig?.dirty)
    });
  };

  const {
    autosaveQueued,
    flushPendingSave,
    scheduleSave,
    scheduleRegionSave
  } = useAutosaveQueue({
    onSaved: (result, hasPendingChanges) => {
      applyWorkspace(result.workspace);
      if (
        activeFilePathRef.current === result.file.path &&
        !hasPendingChanges
      ) {
        applyFilePayload(result.file);
      }
    },
    onStatus
  });

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  useEffect(() => {
    if (!activeFilePath) {
      setActiveFile(null);
      setActiveFeatureId(null);
      undoStackRef.current = [];
      sourceSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    onBusyChange(true);
    void (async () => {
      try {
        const file = await fetchFile(activeFilePath);
        if (cancelled) {
          return;
        }
        applyFilePayload(file);
        setActiveFeatureId(current =>
          current &&
          file.data.features.some(
            feature => feature.properties.id === current
          )
            ? current
            : null
        );
        undoStackRef.current = [];
      } catch (error) {
        if (!cancelled) {
          onStatus(
            error instanceof Error ? error.message : "读取文件失败"
          );
        }
      } finally {
        if (!cancelled) {
          onBusyChange(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void flushPendingSave();
    };
  }, [activeFilePath]);

  const activeFeature = useMemo(
    () =>
      activeFile?.data.features.find(
        feature => feature.properties.id === activeFeatureId
      ) ?? null,
    [activeFile, activeFeatureId]
  );

  const commitDocument = (
    nextData: GeoJsonDocument,
    nextFeatureId?: string | null
  ) => {
    if (!activeFilePath || !activeFile) {
      return;
    }
    undoStackRef.current.push(structuredClone(activeFile.data));
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    setActiveFile(previous =>
      previous
        ? {
            ...previous,
            data: nextData,
            dirty:
              isGeoJsonDirtyAgainstSource(
                nextData,
                sourceSnapshotRef.current
              ) || Boolean(previous.regionConfig?.dirty)
          }
        : previous
    );
    if (typeof nextFeatureId !== "undefined") {
      setActiveFeatureId(nextFeatureId);
    }
    scheduleSave(activeFilePath, nextData);
  };

  const mutateDocument = (
    mutator: (document: GeoJsonDocument) => GeoJsonDocument,
    nextFeatureId?: string | null
  ) => {
    if (activeFile) {
      commitDocument(mutator(activeFile.data), nextFeatureId);
    }
  };

  const mutateFeature = (mutator: (feature: GeoFeature) => GeoFeature) => {
    if (!activeFile || !activeFeatureId) {
      return;
    }
    mutateDocument(document => ({
      ...document,
      features: document.features.map(feature =>
        feature.properties.id === activeFeatureId
          ? normalizeFeature(mutator(feature))
          : feature
      )
    }));
  };

  const commitRegionConfig = (
    next: Pick<RegionConfig, "center" | "zoom">
  ) => {
    if (!activeFilePath || !activeFile?.regionConfig) {
      return;
    }
    const nextRegion = {
      ...activeFile.regionConfig.data,
      center: [...next.center] as [number, number],
      zoom: next.zoom
    };
    const regionDirty = isRegionConfigDirty(
      nextRegion,
      activeFile.regionConfig.sourceData
    );
    setActiveFile(previous =>
      previous?.regionConfig
        ? {
            ...previous,
            dirty:
              isGeoJsonDirtyAgainstSource(
                previous.data,
                previous.sourceData
              ) || regionDirty,
            regionConfig: {
              ...previous.regionConfig,
              data: nextRegion,
              dirty: regionDirty
            }
          }
        : previous
    );
    scheduleRegionSave(activeFilePath, {
      center: nextRegion.center,
      zoom: nextRegion.zoom
    });
  };

  const createFeature = (filePath: string) => {
    if (!activeFile || activeFile.path !== filePath) {
      pendingCreateFeatureRef.current = filePath;
      setActiveFilePath(filePath);
      return;
    }
    const nextFeatures = renumberFeatures(filePath, [
      ...activeFile.data.features,
      buildFeature(
        categories,
        activeFile.regionConfig?.data.center ??
          getDefaultCoordsForFile(filePath, activeFile.data)
      )
    ]);
    const nextFeatureId =
      nextFeatures[nextFeatures.length - 1]?.properties.id ?? null;
    mutateDocument(
      document => ({ ...document, features: nextFeatures }),
      nextFeatureId
    );
  };

  useEffect(() => {
    if (
      !activeFile ||
      pendingCreateFeatureRef.current !== activeFile.path
    ) {
      return;
    }
    pendingCreateFeatureRef.current = null;
    const nextFeatures = renumberFeatures(activeFile.path, [
      ...activeFile.data.features,
      buildFeature(
        categories,
        activeFile.regionConfig?.data.center ??
          getDefaultCoordsForFile(activeFile.path, activeFile.data)
      )
    ]);
    const nextFeatureId =
      nextFeatures[nextFeatures.length - 1]?.properties.id ?? null;
    mutateDocument(
      document => ({ ...document, features: nextFeatures }),
      nextFeatureId
    );
  }, [activeFile, categories]);

  const deleteFeature = (
    filePath = activeFile?.path ?? null,
    featureId = activeFeatureId
  ) => {
    if (
      !activeFile ||
      !filePath ||
      activeFile.path !== filePath ||
      !featureId
    ) {
      return;
    }
    const removedIndex = activeFile.data.features.findIndex(
      feature => feature.properties.id === featureId
    );
    if (removedIndex === -1) {
      return;
    }
    const remaining = renumberFeatures(
      activeFile.path,
      activeFile.data.features.filter(
        feature => feature.properties.id !== featureId
      )
    );
    const nextFeatureId =
      remaining[Math.min(removedIndex, remaining.length - 1)]?.properties.id ??
      null;
    mutateDocument(
      document => ({ ...document, features: remaining }),
      nextFeatureId
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      if (!activeFilePath || undoStackRef.current.length === 0) {
        return;
      }
      event.preventDefault();
      const previous = undoStackRef.current.pop();
      if (!previous) {
        return;
      }
      setActiveFile(current =>
        current
          ? {
              ...current,
              data: previous,
              dirty:
                isGeoJsonDirtyAgainstSource(
                  previous,
                  sourceSnapshotRef.current
                ) || Boolean(current.regionConfig?.dirty)
            }
          : current
      );
      setActiveFeatureId(current =>
        current &&
        previous.features.some(
          feature => feature.properties.id === current
        )
          ? current
          : previous.features[0]?.properties.id ?? null
      );
      scheduleSave(activeFilePath, previous);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFilePath]);

  const resetActiveDocument = () => {
    setActiveFile(null);
    setActiveFeatureId(null);
    undoStackRef.current = [];
  };

  return {
    activeFile,
    activeFeature,
    activeFeatureId,
    autosaveQueued,
    setActiveFeatureId,
    applyFilePayload,
    resetActiveDocument,
    flushPendingSave,
    mutateFeature,
    commitRegionConfig,
    createFeature,
    deleteFeature
  };
}

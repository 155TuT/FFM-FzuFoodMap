import { useEffect, useRef, useState } from "react";
import { updateCacheFile, updateRegionConfig } from "../api";
import type {
  FileUpdateResponse,
  GeoJsonDocument,
  RegionConfig
} from "../types";

const AUTOSAVE_DELAY = 3000;

type StatusTone = "neutral" | "success" | "error";

type Props = {
  onSaved: (result: FileUpdateResponse, hasPendingChanges: boolean) => void;
  onStatus: (message: string, tone: StatusTone) => void;
};

export default function useAutosaveQueue({ onSaved, onStatus }: Props) {
  const [autosaveQueued, setAutosaveQueued] = useState(false);
  const syncRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const regionSaveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{
    path: string;
    data: GeoJsonDocument;
  } | null>(null);
  const pendingRegionSaveRef = useRef<{
    path: string;
    data: Pick<RegionConfig, "center" | "zoom">;
  } | null>(null);
  const onSavedRef = useRef(onSaved);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onSavedRef.current = onSaved;
    onStatusRef.current = onStatus;
  }, [onSaved, onStatus]);

  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (regionSaveTimerRef.current) {
      window.clearTimeout(regionSaveTimerRef.current);
      regionSaveTimerRef.current = null;
    }
    setAutosaveQueued(false);

    const pending = pendingSaveRef.current;
    const pendingRegion = pendingRegionSaveRef.current;
    if (!pending && !pendingRegion) {
      return;
    }
    pendingSaveRef.current = null;
    pendingRegionSaveRef.current = null;

    const token = ++syncRef.current;
    try {
      let result = pending
        ? await updateCacheFile(pending.path, pending.data)
        : null;
      if (pendingRegion) {
        result = await updateRegionConfig(
          pendingRegion.path,
          pendingRegion.data
        );
      }
      if (token !== syncRef.current || !result) {
        return;
      }
      onSavedRef.current(
        result,
        Boolean(pendingSaveRef.current || pendingRegionSaveRef.current)
      );
      onStatusRef.current("缓存已更新", "success");
    } catch (error) {
      if (token !== syncRef.current) {
        return;
      }
      onStatusRef.current(
        error instanceof Error ? error.message : "缓存更新失败",
        "error"
      );
    }
  };

  const scheduleSave = (path: string, data: GeoJsonDocument) => {
    pendingSaveRef.current = { path, data };
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    setAutosaveQueued(true);
    saveTimerRef.current = window.setTimeout(() => {
      void flushPendingSave();
    }, AUTOSAVE_DELAY);
    onStatusRef.current("已加入缓存队列，3 秒后自动写入缓存", "neutral");
  };

  const scheduleRegionSave = (
    path: string,
    data: Pick<RegionConfig, "center" | "zoom">
  ) => {
    pendingRegionSaveRef.current = { path, data };
    if (regionSaveTimerRef.current) {
      window.clearTimeout(regionSaveTimerRef.current);
    }
    setAutosaveQueued(true);
    regionSaveTimerRef.current = window.setTimeout(() => {
      void flushPendingSave();
    }, AUTOSAVE_DELAY);
    onStatusRef.current(
      "地区视图已加入缓存队列，3 秒后自动写入缓存",
      "neutral"
    );
  };

  useEffect(
    () => () => {
      void flushPendingSave();
    },
    []
  );

  return {
    autosaveQueued,
    flushPendingSave,
    scheduleSave,
    scheduleRegionSave
  };
}

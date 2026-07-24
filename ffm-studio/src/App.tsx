import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFolder,
  createGeoJsonFile,
  deleteFolder,
  deleteGeoJsonFile,
  fetchFile,
  fetchWorkspace,
  saveAllGeoJsonFiles,
  searchSourceCandidates,
  updateTaxonomyEntry
} from "./api";
import CreateEntryModal, {
  type CreateEntryDialog
} from "./components/CreateEntryModal";
import {
  DEFAULT_CATEGORY,
  mergeTaxonomyEntry,
  uniq
} from "./domain/geoJson";
import {
  basename,
  collectDirectoryPaths,
  findFileNode,
  firstFile,
  hasDirtyFiles,
  listDirectories
} from "./domain/workspaceTree";
import FeatureEditorPanel from "./features/feature-editor/FeatureEditorPanel";
import LocationEditorPanel from "./features/location-editor/LocationEditorPanel";
import TreePanel from "./features/workspace/TreePanel";
import WorkspaceSummary from "./features/workspace/WorkspaceSummary";
import { collectDirtyFeatureIds } from "./geojsonDiff";
import useActiveDocument from "./hooks/useActiveDocument";
import useStudioTheme from "./hooks/useStudioTheme";
import type { TaxonomyEntryKind, Workspace } from "./types";

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    new Set([""])
  );
  const [dialog, setDialog] = useState<CreateEntryDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在载入工作区");
  const activeFilePathRef = useRef<string | null>(null);
  const { theme, toggleTheme } = useStudioTheme();

  const applyWorkspace = (next: Workspace) => {
    setWorkspace(next);
    const availableDirectories = collectDirectoryPaths(next.tree);
    setExpandedDirectories(previous => {
      if (!previous.size) {
        return availableDirectories;
      }
      const nextSet = new Set<string>();
      for (const item of previous) {
        if (availableDirectories.has(item)) {
          nextSet.add(item);
        }
      }
      for (const item of availableDirectories) {
        nextSet.add(item);
      }
      return nextSet;
    });
  };

  const {
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
  } = useActiveDocument({
    activeFilePath,
    categories: workspace?.taxonomy.categories ?? [],
    setActiveFilePath,
    applyWorkspace,
    onBusyChange: setBusy,
    onStatus: setMessage
  });

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  useEffect(() => {
    void (async () => {
      try {
        const next = await fetchWorkspace();
        applyWorkspace(next);
        setActiveFilePath(firstFile(next.tree));
        setMessage("工作区已载入");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "载入工作区失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const directories = useMemo(
    () =>
      workspace
        ? listDirectories(workspace.tree).map(item => ({ path: item.path }))
        : [],
    [workspace]
  );

  const fileNode = useMemo(
    () =>
      workspace && activeFilePath
        ? findFileNode(workspace.tree, activeFilePath)
        : null,
    [workspace, activeFilePath]
  );

  const categories = useMemo(
    () =>
      uniq([
        ...(workspace?.taxonomy.categories ?? []),
        activeFeature?.properties.category ?? DEFAULT_CATEGORY
      ]),
    [workspace?.taxonomy.categories, activeFeature]
  );

  const tags = useMemo(
    () => uniq(workspace?.taxonomy.tags ?? []),
    [workspace?.taxonomy.tags]
  );

  const activeFileDirty =
    activeFile?.path === activeFilePath
      ? activeFile.dirty
      : fileNode?.dirty ?? false;
  const workspaceDirty = useMemo(
    () =>
      workspace ? hasDirtyFiles(workspace.tree, activeFilePath) : false,
    [workspace, activeFilePath]
  );
  const effectiveWorkspaceDirty =
    workspaceDirty ||
    activeFileDirty ||
    Boolean(workspace?.regionConfigDirty);
  const activeFeatureDirtyIds = useMemo(
    () =>
      activeFile
        ? collectDirtyFeatureIds(activeFile.data, activeFile.sourceData)
        : new Set<string>(),
    [activeFile]
  );
  const rootStatusTone = autosaveQueued
    ? "loading"
    : effectiveWorkspaceDirty
      ? "warning"
      : "success";
  const filePathLabel = activeFilePath ? `data/${activeFilePath}` : "data";

  const syncTaxonomyEntry = (
    kind: TaxonomyEntryKind,
    value: string
  ) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    setWorkspace(current =>
      current
        ? {
            ...current,
            taxonomy: mergeTaxonomyEntry(
              current.taxonomy,
              kind,
              normalizedValue
            )
          }
        : current
    );

    void updateTaxonomyEntry(kind, normalizedValue)
      .then(applyWorkspace)
      .catch(error => {
        setMessage(
          error instanceof Error ? error.message : "taxonomy 缓存更新失败"
        );
      });
  };

  const syncActiveFileAfterWorkspace = (
    next: Workspace,
    preferredPath: string | null = activeFilePathRef.current
  ) => {
    const nextPath =
      preferredPath && findFileNode(next.tree, preferredPath)
        ? preferredPath
        : firstFile(next.tree);
    setActiveFilePath(nextPath);
    if (nextPath !== preferredPath) {
      resetActiveDocument();
    }
  };

  const handleDeleteFolder = async (folderPath: string) => {
    const label = basename(folderPath);
    if (
      !window.confirm(
        `确认删除缓存中的地区文件夹“${label}”及其下所有 GeoJSON 吗？点击保存前，不会同步到源目录`
      )
    ) {
      return;
    }

    await flushPendingSave();
    setBusy(true);
    try {
      const nextWorkspace = await deleteFolder(folderPath);
      applyWorkspace(nextWorkspace);
      syncActiveFileAfterWorkspace(nextWorkspace);
      setMessage(`已从缓存删除地区文件夹：${label}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "删除地区文件夹失败"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGeoJsonFile = async (filePath: string) => {
    const label = basename(filePath);
    if (
      !window.confirm(
        `确认删除缓存中的 GeoJSON“${label}”吗？点击保存前，不会同步到源目录`
      )
    ) {
      return;
    }

    await flushPendingSave();
    setBusy(true);
    try {
      const nextWorkspace = await deleteGeoJsonFile(filePath);
      applyWorkspace(nextWorkspace);
      syncActiveFileAfterWorkspace(nextWorkspace);
      setMessage(`已从缓存删除 GeoJSON：${label}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除 GeoJSON 失败");
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
    await flushPendingSave();
    setBusy(true);
    try {
      const nextWorkspace = await saveAllGeoJsonFiles();
      applyWorkspace(nextWorkspace);
      if (activeFilePathRef.current) {
        applyFilePayload(await fetchFile(activeFilePathRef.current));
      }
      setMessage("已将点位与地区视图缓存覆写到 fzu-food-map");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "保存暂存更改失败"
      );
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = async () => {
    if (!dialog) {
      return;
    }
    setBusy(true);
    try {
      if (dialog.type === "folder") {
        applyWorkspace(await createFolder(dialog.parentPath, dialog.name));
        setMessage("文件夹已创建到缓存目录");
      } else {
        const result = await createGeoJsonFile(
          dialog.parentPath,
          dialog.name
        );
        applyWorkspace(result.workspace);
        setActiveFilePath(result.path);
        applyFilePayload(result.file);
        setActiveFeatureId(null);
        setMessage("GeoJSON 文件已创建到缓存目录");
      }
      setDialog(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const triggerSourceSearch = () => {
    if (!activeFeature) {
      return;
    }
    void searchSourceCandidates(activeFeature.properties.name)
      .then(result => {
        setMessage(result.message ?? "来源搜索接口已响应");
      })
      .catch(error => {
        setMessage(
          error instanceof Error ? error.message : "来源搜索接口不可用"
        );
      });
  };

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        {workspace ? (
          <TreePanel
            root={workspace.tree}
            rootStatusTone={rootStatusTone}
            theme={theme}
            activeFilePath={activeFilePath}
            activeFeatureId={activeFeatureId}
            activeFileDirty={activeFileDirty}
            activeFileFeatures={activeFile?.data.features ?? []}
            activeFeatureDirtyIds={activeFeatureDirtyIds}
            expandedDirectories={expandedDirectories}
            busy={busy}
            onToggleTheme={toggleTheme}
            onToggleDirectory={path =>
              setExpandedDirectories(previous => {
                const next = new Set(previous);
                if (next.has(path)) {
                  next.delete(path);
                } else {
                  next.add(path);
                }
                return next;
              })
            }
            onSelectFile={path => {
              setActiveFilePath(path);
              setActiveFeatureId(null);
            }}
            onSelectFeature={(filePath, featureId) => {
              setActiveFilePath(filePath);
              setActiveFeatureId(featureId);
            }}
            onCreateFolder={parentPath =>
              setDialog({ type: "folder", parentPath, name: "" })
            }
            onCreateFile={parentPath =>
              setDialog({ type: "file", parentPath, name: "" })
            }
            onCreateFeature={createFeature}
            onDeleteFeature={deleteFeature}
            onDeleteFolder={handleDeleteFolder}
            onDeleteFile={handleDeleteGeoJsonFile}
            onSaveAll={saveAll}
          />
        ) : (
          <div className="tree-panel tree-panel--empty">载入中…</div>
        )}
      </aside>

      <main className="workbench">
        <section className="status-banner status-banner--neutral">
          <span>{loading ? "正在读取工作区" : message}</span>
          {busy ? (
            <span>处理中…</span>
          ) : autosaveQueued ? (
            <span>3 秒后自动写入缓存</span>
          ) : null}
        </section>

        <div className="content-grid">
          <WorkspaceSummary
            filePathLabel={filePathLabel}
            fileNode={fileNode}
            activeFile={activeFile}
            workspace={workspace}
            dirty={effectiveWorkspaceDirty}
          />
          <FeatureEditorPanel
            feature={activeFeature}
            categories={categories}
            tags={tags}
            onMutate={mutateFeature}
            onCreateTaxonomyEntry={syncTaxonomyEntry}
            onTriggerSourceSearch={triggerSourceSearch}
          />
          <LocationEditorPanel
            activeFile={activeFile}
            feature={activeFeature}
            theme={theme}
            onMutateFeature={mutateFeature}
            onCommitRegionConfig={commitRegionConfig}
          />
        </div>
      </main>

      {dialog ? (
        <CreateEntryModal
          directories={directories}
          state={dialog}
          onChange={setDialog}
          onClose={() => setDialog(null)}
          onSubmit={() => void submitDialog()}
        />
      ) : null}
    </div>
  );
}

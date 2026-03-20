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
  updateCacheFile
} from "./api";
import IncludeEditor, { type IncludeRow } from "./components/IncludeEditor";
import MiniMap from "./components/MiniMap";
import SourceListEditor from "./components/SourceListEditor";
import TagEditor from "./components/TagEditor";
import TreePanel, { collectDirectoryPaths, findFileNode, listDirectories } from "./components/TreePanel";
import type { FilePayload, GeoFeature, GeoJsonDocument, PoiInclude, PoiSource, Workspace } from "./types";

type Tone = "neutral" | "success" | "error";
type DialogState = { type: "folder" | "file"; parentPath: string; name: string } | null;

const DEFAULT_CATEGORY = "门店";
const DEFAULT_COORDS: [number, number] = [119.30952702, 26.05088034];
const AUTOSAVE_DELAY = 3000;

function uniq(values: string[]) {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

function basename(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

function dirname(filePath: string) {
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

function firstFile(node: Workspace["tree"]): string | null {
  for (const child of node.children) {
    if (child.type === "file") return child.path;
    const nested = firstFile(child);
    if (nested) return nested;
  }
  return null;
}

function hasDirtyFiles(node: Workspace["tree"]): boolean {
  for (const child of node.children) {
    if (child.type === "file" && child.dirty) return true;
    if (child.type === "directory" && hasDirtyFiles(child)) return true;
  }
  return false;
}

function featurePrefix(filePath: string) {
  return basename(filePath).replace(/\.geojson$/i, "").toLowerCase();
}

function formatFeatureId(filePath: string, index: number) {
  return `${featurePrefix(filePath)}-${String(index + 1).padStart(3, "0")}`;
}

function renumberFeatures(filePath: string, features: GeoFeature[]) {
  return features.map((feature, index) => ({
    ...feature,
    properties: {
      ...feature.properties,
      id: formatFeatureId(filePath, index)
    }
  }));
}

function buildFeature(filePath: string, categories: string[]): GeoFeature {
  return {
    type: "Feature",
    properties: {
      id: "",
      category: categories[0] ?? DEFAULT_CATEGORY,
      name: "新建点位",
      source: "manual",
      tags: [],
      notes: "",
      address: "",
      contact: "",
      openhour: "",
      sources: [{ platform: "manual", title: "手动添加", status: "manual" }]
    },
    geometry: { type: "Point", coordinates: DEFAULT_COORDS }
  };
}

function serializeGeoJsonDocument(document: GeoJsonDocument | null) {
  return document ? `${JSON.stringify(document, null, 2)}\n` : null;
}

function isDirtyAgainstSource(document: GeoJsonDocument, sourceSnapshot: string | null) {
  return sourceSnapshot === null ? true : serializeGeoJsonDocument(document) !== sourceSnapshot;
}

function toIncludeRows(include?: PoiInclude): IncludeRow[] {
  const names = Array.isArray(include?.name) ? include.name : [];
  const notes = Array.isArray(include?.notes) ? include.notes : [];
  return names.map((name, index) => ({ name: name ?? "", notes: notes[index] ?? "" }));
}

function fromIncludeRows(rows: IncludeRow[]) {
  const cleaned = rows
    .map(row => ({ name: row.name.trim(), notes: row.notes.trim() }))
    .filter(row => row.name || row.notes);
  if (!cleaned.length) return undefined;
  return { name: cleaned.map(row => row.name), notes: cleaned.map(row => row.notes) };
}

function cleanSources(sources: PoiSource[]) {
  const cleaned = sources
    .map(source => ({
      platform: source.platform?.trim() || undefined,
      title: source.title?.trim() || undefined,
      pageUrl: source.pageUrl?.trim() || undefined,
      searchUrl: source.searchUrl?.trim() || undefined,
      appUrl: source.appUrl?.trim() || undefined,
      status: source.status?.trim() || undefined
    }))
    .filter(source => Object.values(source).some(Boolean));
  return cleaned.length ? cleaned : undefined;
}

function normalizeFeature(feature: GeoFeature): GeoFeature {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      category: feature.properties.category.trim() || DEFAULT_CATEGORY,
      name: feature.properties.name.trim() || "未命名点位",
      tags: uniq(feature.properties.tags ?? []),
      include: fromIncludeRows(toIncludeRows(feature.properties.include)),
      sources: cleanSources(feature.properties.sources ?? [])
    }
  };
}

function Modal({
  title,
  directories,
  state,
  onChange,
  onClose,
  onSubmit
}: {
  title: string;
  directories: { path: string }[];
  state: NonNullable<DialogState>;
  onChange: (next: NonNullable<DialogState>) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <p className="section-kicker">创建</p>
            <h3>{title}</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <label className="field">
          <span>父目录</span>
          <select value={state.parentPath} onChange={event => onChange({ ...state, parentPath: event.target.value })}>
            {directories.map(item => (
              <option key={item.path || "root"} value={item.path}>
                {item.path || "data"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{state.type === "folder" ? "文件夹名" : "文件名"}</span>
          <input
            autoFocus
            value={state.name}
            onChange={event => onChange({ ...state, name: event.target.value })}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </label>
        <div className="modal-card__actions">
          <button type="button" className="secondary-button" onClick={onSubmit}>
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<FilePayload | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set([""]));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [autosaveQueued, setAutosaveQueued] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("正在载入工作区");
  const [tone, setTone] = useState<Tone>("neutral");

  const syncRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ path: string; data: GeoJsonDocument } | null>(null);
  const activeFilePathRef = useRef<string | null>(null);
  const undoStackRef = useRef<GeoJsonDocument[]>([]);
  const pendingCreateFeatureRef = useRef<string | null>(null);
  const sourceSnapshotRef = useRef<string | null>(null);

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

  const syncActiveFileAfterWorkspace = (next: Workspace, preferredPath: string | null = activeFilePathRef.current) => {
    const nextPath = preferredPath && findFileNode(next.tree, preferredPath) ? preferredPath : firstFile(next.tree);
    setActiveFilePath(nextPath);
    if (nextPath !== preferredPath) {
      setActiveFile(null);
      setActiveFeatureId(null);
      undoStackRef.current = [];
    }
  };

  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setAutosaveQueued(false);
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;

    const token = ++syncRef.current;
    try {
      const result = await updateCacheFile(pending.path, pending.data);
      if (token !== syncRef.current) return;
      applyWorkspace(result.workspace);
      if (activeFilePathRef.current === pending.path) {
        applyFilePayload(result.file);
      }
      setMessage("缓存已更新");
      setTone("success");
    } catch (error) {
      if (token !== syncRef.current) return;
      setMessage(error instanceof Error ? error.message : "缓存更新失败");
      setTone("error");
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
    setMessage("已加入缓存队列，3 秒后自动写入缓存");
    setTone("neutral");
  };

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  const applyFilePayload = (file: FilePayload) => {
    const sourceSnapshot = serializeGeoJsonDocument(file.sourceData);
    sourceSnapshotRef.current = sourceSnapshot;
    setActiveFile({
      ...file,
      dirty: isDirtyAgainstSource(file.data, sourceSnapshot)
    });
  };

  useEffect(() => {
    void (async () => {
      try {
        const next = await fetchWorkspace();
        applyWorkspace(next);
        setActiveFilePath(firstFile(next.tree));
        setMessage("工作区已载入");
        setTone("success");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "载入工作区失败");
        setTone("error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      void flushPendingSave();
    };
  }, []);

  useEffect(() => {
    if (!activeFilePath) {
      setActiveFile(null);
      setActiveFeatureId(null);
      undoStackRef.current = [];
      sourceSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const file = await fetchFile(activeFilePath);
        if (cancelled) return;
        applyFilePayload(file);
        setActiveFeatureId(current =>
          current && file.data.features.some(feature => feature.properties.id === current)
            ? current
            : file.data.features[0]?.properties.id ?? null
        );
        undoStackRef.current = [];
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "读取文件失败");
          setTone("error");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      void flushPendingSave();
    };
  }, [activeFilePath]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") {
        return;
      }
      if (!activeFilePath || undoStackRef.current.length === 0) {
        return;
      }
      event.preventDefault();
      const previous = undoStackRef.current.pop();
      if (!previous) return;
      setActiveFile(current =>
        current
          ? { ...current, data: previous, dirty: isDirtyAgainstSource(previous, sourceSnapshotRef.current) }
          : current
      );
      setActiveFeatureId(current =>
        current && previous.features.some(feature => feature.properties.id === current)
          ? current
          : previous.features[0]?.properties.id ?? null
      );
      scheduleSave(activeFilePath, previous);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFilePath]);

  const directories = useMemo(
    () => (workspace ? listDirectories(workspace.tree).map(item => ({ path: item.path })) : []),
    [workspace]
  );

  const fileNode = useMemo(
    () => (workspace && activeFilePath ? findFileNode(workspace.tree, activeFilePath) : null),
    [workspace, activeFilePath]
  );

  const activeFeature = useMemo(
    () => activeFile?.data.features.find(feature => feature.properties.id === activeFeatureId) ?? null,
    [activeFile, activeFeatureId]
  );

  const categories = useMemo(
    () => uniq([...(workspace?.taxonomy.categories ?? []), activeFeature?.properties.category ?? DEFAULT_CATEGORY]),
    [workspace?.taxonomy.categories, activeFeature]
  );

  const tags = useMemo(
    () => uniq([...(workspace?.taxonomy.tags ?? []), ...(activeFeature?.properties.tags ?? [])]),
    [workspace?.taxonomy.tags, activeFeature]
  );

  const includeRows = activeFeature ? toIncludeRows(activeFeature.properties.include) : [];
  const filePathLabel = activeFilePath ? `data/${activeFilePath}` : "data";
  const workspaceDirty = useMemo(() => (workspace ? hasDirtyFiles(workspace.tree) : false), [workspace]);
  const rootStatusTone = autosaveQueued ? "loading" : workspaceDirty ? "warning" : "success";

  const commitDocument = (nextData: GeoJsonDocument, nextFeatureId?: string | null) => {
    if (!activeFilePath || !activeFile) return;
    undoStackRef.current.push(structuredClone(activeFile.data));
    if (undoStackRef.current.length > 100) {
      undoStackRef.current.shift();
    }
    setActiveFile(previous =>
      previous
        ? { ...previous, data: nextData, dirty: isDirtyAgainstSource(nextData, sourceSnapshotRef.current) }
        : previous
    );
    if (typeof nextFeatureId !== "undefined") {
      setActiveFeatureId(nextFeatureId);
    }
    scheduleSave(activeFilePath, nextData);
  };

  const mutateDocument = (mutator: (document: GeoJsonDocument) => GeoJsonDocument, nextFeatureId?: string | null) => {
    if (!activeFile) return;
    commitDocument(mutator(activeFile.data), nextFeatureId);
  };

  const mutateFeature = (mutator: (feature: GeoFeature) => GeoFeature) => {
    if (!activeFile || !activeFeatureId) return;
    mutateDocument(document => ({
      ...document,
      features: document.features.map(feature =>
        feature.properties.id === activeFeatureId ? normalizeFeature(mutator(feature)) : feature
      )
    }));
  };

  const handleCreateFeature = (filePath: string) => {
    if (!activeFile || activeFile.path !== filePath) {
      pendingCreateFeatureRef.current = filePath;
      setActiveFilePath(filePath);
      return;
    }
    const nextFeatures = renumberFeatures(filePath, [...activeFile.data.features, buildFeature(filePath, categories)]);
    const nextFeatureId = nextFeatures[nextFeatures.length - 1]?.properties.id ?? null;
    mutateDocument(document => ({ ...document, features: nextFeatures }), nextFeatureId);
  };

  useEffect(() => {
    if (!activeFile || pendingCreateFeatureRef.current !== activeFile.path) {
      return;
    }
    pendingCreateFeatureRef.current = null;
    const nextFeatures = renumberFeatures(
      activeFile.path,
      [...activeFile.data.features, buildFeature(activeFile.path, categories)]
    );
    const nextFeatureId = nextFeatures[nextFeatures.length - 1]?.properties.id ?? null;
    mutateDocument(document => ({ ...document, features: nextFeatures }), nextFeatureId);
  }, [activeFile, categories]);

  const handleDeleteFeature = (filePath = activeFile?.path ?? null, featureId = activeFeatureId) => {
    if (!activeFile || !filePath || activeFile.path !== filePath || !featureId) return;
    const removedIndex = activeFile.data.features.findIndex(feature => feature.properties.id === featureId);
    if (removedIndex === -1) return;
    const remaining = renumberFeatures(
      activeFile.path,
      activeFile.data.features.filter(feature => feature.properties.id !== featureId)
    );
    const nextFeatureId = remaining[Math.min(removedIndex, remaining.length - 1)]?.properties.id ?? null;
    mutateDocument(document => ({ ...document, features: remaining }), nextFeatureId);
  };

  const handleDeleteFolder = async (folderPath: string) => {
    const label = basename(folderPath);
    if (!window.confirm(`确认删除缓存中的地区文件夹“${label}”及其下所有 GeoJSON 吗？点击保存前，不会同步到源目录。`)) {
      return;
    }

    await flushPendingSave();
    setBusy(true);
    try {
      const nextWorkspace = await deleteFolder(folderPath);
      applyWorkspace(nextWorkspace);
      syncActiveFileAfterWorkspace(nextWorkspace);
      setMessage(`已从缓存删除地区文件夹：${label}`);
      setTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除地区文件夹失败");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGeoJsonFile = async (filePath: string) => {
    const label = basename(filePath);
    if (!window.confirm(`确认删除缓存中的 GeoJSON“${label}”吗？点击保存前，不会同步到源目录。`)) {
      return;
    }

    await flushPendingSave();
    setBusy(true);
    try {
      const nextWorkspace = await deleteGeoJsonFile(filePath);
      applyWorkspace(nextWorkspace);
      syncActiveFileAfterWorkspace(nextWorkspace);
      setMessage(`已从缓存删除 GeoJSON：${label}`);
      setTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除 GeoJSON 失败");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
    await flushPendingSave();
    setBusy(true);
    try {
      applyWorkspace(await saveAllGeoJsonFiles());
      setActiveFile(previous => {
        if (!previous) return previous;
        const nextSourceSnapshot = serializeGeoJsonDocument(previous.data);
        sourceSnapshotRef.current = nextSourceSnapshot;
        return { ...previous, dirty: false };
      });
      setMessage("已将缓存内容完整覆写到 fzu-food-map/public/data");
      setTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存暂存更改失败");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.type === "folder") {
        applyWorkspace(await createFolder(dialog.parentPath, dialog.name));
        setMessage("文件夹已创建到缓存目录");
      } else {
        const result = await createGeoJsonFile(dialog.parentPath, dialog.name);
        applyWorkspace(result.workspace);
        setActiveFilePath(result.path);
        applyFilePayload(result.file);
        setActiveFeatureId(null);
        setMessage("GeoJSON 文件已创建到缓存目录");
      }
      setTone("success");
      setDialog(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
      setTone("error");
    } finally {
      setBusy(false);
    }
  };

  const triggerSourceSearch = () => {
    if (!activeFeature) return;
    void searchSourceCandidates(activeFeature.properties.name)
      .then(result => {
        setMessage(result.message ?? "来源搜索接口已响应");
        setTone("neutral");
      })
      .catch(error => {
        setMessage(error instanceof Error ? error.message : "来源搜索接口不可用");
        setTone("error");
      });
  };

  return (
    <div className="studio-shell">
      <aside className="sidebar">
        {workspace ? (
          <TreePanel
            root={workspace.tree}
            rootStatusTone={rootStatusTone}
            activeFilePath={activeFilePath}
            activeFeatureId={activeFeatureId}
            activeFileFeatures={activeFile?.data.features ?? []}
            expandedDirectories={expandedDirectories}
            busy={busy}
            onToggleDirectory={path =>
              setExpandedDirectories(previous => {
                const next = new Set(previous);
                if (next.has(path)) next.delete(path);
                else next.add(path);
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
            onCreateFolder={parentPath => setDialog({ type: "folder", parentPath, name: "" })}
            onCreateFile={parentPath => setDialog({ type: "file", parentPath, name: "" })}
            onCreateFeature={handleCreateFeature}
            onDeleteFeature={handleDeleteFeature}
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
          {busy ? <span>处理中…</span> : autosaveQueued ? <span>3 秒后自动写入缓存</span> : null}
        </section>

        <div className="content-grid">
          <section className="panel panel--summary">
            <div className="panel__header panel__header--compact">
              <div>
                <p className="section-kicker">文件说明</p>
                <h2>{filePathLabel}</h2>
              </div>
              <span className={`status-pill${workspaceDirty ? " status-pill--dirty" : ""}`}>
                {workspaceDirty ? "缓存已改动" : "已同步"}
              </span>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-card__label">当前路径</span>
                <strong>{filePathLabel}</strong>
                <p>点位数量：{fileNode?.featureCount ?? 0}</p>
              </div>
              <div className="summary-card">
                <span className="summary-card__label">license</span>
                <strong>{String(activeFile?.data.license ?? "未设置")}</strong>
                <p>{String(activeFile?.data._notes ?? "暂无文件备注")}</p>
              </div>
              <div className="summary-card">
                <span className="summary-card__label">目录</span>
                <strong>源目录：{workspace?.sourceRoot ?? "…"}</strong>
                <p>缓存目录：{workspace?.cacheRoot ?? "…"}</p>
              </div>
            </div>
          </section>

          <section className="panel panel--feature">
            <div className="panel__header">
              <div>
                <p className="section-kicker">点位</p>
                <h2>{activeFeature?.properties.name ?? "未选择点位"}</h2>
              </div>
              {activeFeature ? <span className="status-pill">{activeFeature.properties.id}</span> : null}
            </div>
            {activeFeature ? (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={activeFeature.properties.name}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, name: event.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>门店类型</span>
                    <input
                      list="category-options"
                      value={activeFeature.properties.category ?? DEFAULT_CATEGORY}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, category: event.target.value }
                        }))
                      }
                    />
                    <datalist id="category-options">
                      {categories.map(item => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    <span>评分</span>
                    <input
                      type="number"
                      step="0.1"
                      value={activeFeature.properties.rating ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: {
                            ...feature.properties,
                            rating: event.target.value === "" ? undefined : Number(event.target.value)
                          }
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>价格</span>
                    <input
                      value={activeFeature.properties.price ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, price: event.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>联系</span>
                    <input
                      value={activeFeature.properties.contact ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, contact: event.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>营业时间</span>
                    <input
                      value={activeFeature.properties.openhour ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, openhour: event.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="field field--full">
                    <span>地址</span>
                    <input
                      value={activeFeature.properties.address ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, address: event.target.value }
                        }))
                      }
                    />
                  </label>
                  <label className="field field--full">
                    <span>招牌菜 / 细分内容</span>
                    <textarea
                      rows={4}
                      value={activeFeature.properties.notes ?? ""}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          properties: { ...feature.properties, notes: event.target.value }
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="editor-section">
                  <div className="editor-section__header">
                    <div>
                      <h3>标签</h3>
                      <p>支持从现有标签中选择，也支持直接录入新标签。</p>
                    </div>
                  </div>
                  <TagEditor
                    value={activeFeature.properties.tags ?? []}
                    suggestions={tags}
                    onChange={next =>
                      mutateFeature(feature => ({
                        ...feature,
                        properties: { ...feature.properties, tags: next }
                      }))
                    }
                  />
                </div>

                <div className="editor-section">
                  <div className="editor-section__header">
                    <div>
                      <h3>包含店铺</h3>
                      <p>用于把同一栋建筑内的多家店铺合并到同一个点位。</p>
                    </div>
                  </div>
                  <IncludeEditor
                    rows={includeRows}
                    namePlaceholder="店铺名"
                    notePlaceholder="楼层 / 补充说明"
                    emptyText="当前点位未合并其他店铺"
                    addLabel="新增店铺"
                    onChange={next =>
                      mutateFeature(feature => ({
                        ...feature,
                        properties: { ...feature.properties, include: fromIncludeRows(next) }
                      }))
                    }
                  />
                </div>

                <div className="editor-section">
                  <div className="editor-section__header">
                    <div>
                      <h3>来源</h3>
                      <p>新增点位默认来源为手动添加，后续可在这里接入半自动搜索。</p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>source</span>
                      <input
                        value={activeFeature.properties.source ?? "manual"}
                        onChange={event =>
                          mutateFeature(feature => ({
                            ...feature,
                            properties: { ...feature.properties, source: event.target.value }
                          }))
                        }
                      />
                    </label>
                  </div>
                  <SourceListEditor
                    value={activeFeature.properties.sources ?? []}
                    onChange={next =>
                      mutateFeature(feature => ({
                        ...feature,
                        properties: { ...feature.properties, sources: next }
                      }))
                    }
                    onTriggerSearch={triggerSourceSearch}
                  />
                </div>
              </>
            ) : (
              <div className="empty-block">当前文件还没有选中点位，可以在左侧文件行 hover 后直接新建点位。</div>
            )}
          </section>

          <section className="panel panel--map">
            <div className="panel__header">
              <div>
                <p className="section-kicker">位置预览</p>
                <h2>BD-09 坐标</h2>
              </div>
            </div>
            {activeFeature ? (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>经度（BD-09）</span>
                    <input
                      type="number"
                      step="0.00000001"
                      value={activeFeature.geometry.coordinates[0]}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          geometry: {
                            ...feature.geometry,
                            coordinates: [Number(event.target.value), feature.geometry.coordinates[1]]
                          }
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>纬度（BD-09）</span>
                    <input
                      type="number"
                      step="0.00000001"
                      value={activeFeature.geometry.coordinates[1]}
                      onChange={event =>
                        mutateFeature(feature => ({
                          ...feature,
                          geometry: {
                            ...feature.geometry,
                            coordinates: [feature.geometry.coordinates[0], Number(event.target.value)]
                          }
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="field map-preview-field">
                  <span>位置预览</span>
                  <MiniMap
                    category={activeFeature.properties.category}
                    coordinates={activeFeature.geometry.coordinates}
                    onChangeCoordinates={next =>
                      mutateFeature(feature => ({
                        ...feature,
                        geometry: { ...feature.geometry, coordinates: next }
                      }))
                    }
                  />
                </div>
                <div className="json-preview">
                  <div className="editor-section__header">
                    <div>
                      <h3>当前点位 JSON 预览</h3>
                      <p>这里展示当前缓存中的最终结构，便于快速核对。</p>
                    </div>
                  </div>
                  <pre>{JSON.stringify(activeFeature, null, 2)}</pre>
                </div>
              </>
            ) : (
              <div className="empty-block">选中点位后，这里会显示坐标编辑和地图预览。</div>
            )}
          </section>
        </div>
      </main>

      {dialog ? (
        <Modal
          title={dialog.type === "folder" ? "新建地区文件夹" : "新建 GeoJSON 文件"}
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

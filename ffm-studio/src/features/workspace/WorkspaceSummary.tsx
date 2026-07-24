import type { FilePayload, Workspace, WorkspaceFileNode } from "../../types";

type Props = {
  filePathLabel: string;
  fileNode: WorkspaceFileNode | null;
  activeFile: FilePayload | null;
  workspace: Workspace | null;
  dirty: boolean;
};

export default function WorkspaceSummary({
  filePathLabel,
  fileNode,
  activeFile,
  workspace,
  dirty
}: Props) {
  return (
    <section className="panel panel--summary">
      <div className="panel__header panel__header--compact">
        <div>
          <p className="section-kicker">文件说明</p>
          <h2>{filePathLabel}</h2>
        </div>
        <span className={`status-pill${dirty ? " status-pill--dirty" : ""}`}>
          {dirty ? "缓存已改动" : "已同步"}
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
          <p>点位缓存：{workspace?.cacheRoot ?? "…"}</p>
          <p>地区视图缓存：{workspace?.regionCachePath ?? "…"}</p>
        </div>
      </div>
    </section>
  );
}

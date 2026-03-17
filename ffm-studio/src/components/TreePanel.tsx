import type { ReactNode } from "react";
import type { GeoFeature, WorkspaceDirectoryNode, WorkspaceFileNode, WorkspaceNode } from "../types";

type TreeAction = {
  title: string;
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
};

type Props = {
  root: WorkspaceDirectoryNode;
  activeFilePath: string | null;
  activeFeatureId: string | null;
  activeFileFeatures: GeoFeature[];
  expandedDirectories: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onSelectFeature: (filePath: string, featureId: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFeature: (filePath: string) => void;
  onDeleteFeature: (filePath: string, featureId: string) => void;
  onDeleteFolder: (path: string) => void;
  onDeleteFile: (path: string) => void;
};

function TreeRow({
  depth,
  label,
  icon,
  active,
  dirty,
  muted,
  suffix,
  actions,
  onClick
}: {
  depth: number;
  label: string;
  icon: string;
  active?: boolean;
  dirty?: boolean;
  muted?: boolean;
  suffix?: string;
  actions?: TreeAction[];
  onClick?: () => void;
}) {
  return (
    <div className={`tree-row-shell${active ? " tree-row-shell--active" : ""}${muted ? " tree-row-shell--muted" : ""}`}>
      <button
        type="button"
        className="tree-row"
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        onClick={onClick}
      >
        <span className="tree-row__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="tree-row__label">{label}</span>
        {suffix ? <span className="tree-row__suffix">{suffix}</span> : null}
        {dirty ? <span className="tree-row__dirty" title="缓存已修改，尚未保存到源目录" /> : null}
      </button>
      {actions?.length ? (
        <div className="tree-row__actions">
          {actions.map(action => (
            <button
              key={`${action.title}-${action.label}`}
              type="button"
              className={`tree-row__action${action.tone === "danger" ? " tree-row__action--danger" : ""}`}
              title={action.title}
              aria-label={action.title}
              onClick={event => {
                event.stopPropagation();
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderNode(node: WorkspaceNode, depth: number, props: Props): ReactNode {
  if (node.type === "directory") {
    const expanded = props.expandedDirectories.has(node.path);
    return (
      <div key={`dir-${node.path}`} className="tree-node">
        <TreeRow
          depth={depth}
          label={node.name}
          icon={expanded ? "v" : ">"}
          actions={[
            { title: "删除当前地区文件夹", label: "x", tone: "danger", onClick: () => props.onDeleteFolder(node.path) },
            { title: "新建 GeoJSON", label: "+", onClick: () => props.onCreateFile(node.path) }
          ]}
          onClick={() => props.onToggleDirectory(node.path)}
        />
        {expanded ? node.children.map(child => renderNode(child, depth + 1, props)) : null}
      </div>
    );
  }

  const active = props.activeFilePath === node.path;
  return (
    <div key={`file-${node.path}`} className="tree-node">
      <TreeRow
        depth={depth}
        label={node.name}
        icon="o"
        suffix={`${node.featureCount}`}
        active={active}
        dirty={node.dirty}
        actions={[
          { title: "删除当前 GeoJSON", label: "x", tone: "danger", onClick: () => props.onDeleteFile(node.path) },
          { title: "新建点位", label: "+", onClick: () => props.onCreateFeature(node.path) }
        ]}
        onClick={() => props.onSelectFile(node.path)}
      />
      {active
        ? props.activeFileFeatures.map(feature => (
            <TreeRow
              key={`${node.path}-${feature.properties.id}`}
              depth={depth + 1}
              label={`${feature.properties.id} ${feature.properties.name || ""}`.trim()}
              icon="."
              active={props.activeFeatureId === feature.properties.id}
              actions={[
                {
                  title: "删除当前点位",
                  label: "x",
                  tone: "danger",
                  onClick: () => props.onDeleteFeature(node.path, feature.properties.id)
                }
              ]}
              onClick={() => props.onSelectFeature(node.path, feature.properties.id)}
            />
          ))
        : null}
    </div>
  );
}

export default function TreePanel(props: Props) {
  const rootExpanded = props.expandedDirectories.has(props.root.path);

  return (
    <div className="tree-panel">
      <div className="tree-panel__header">
        <p className="tree-panel__eyebrow">FFM Studio</p>
        <h2>GeoJSON 数据管理工作台</h2>
      </div>
      <div className="tree-panel__body">
        <TreeRow
          depth={0}
          label={props.root.name}
          icon={rootExpanded ? "v" : ">"}
          muted
          actions={[{ title: "新建地区文件夹", label: "+", onClick: () => props.onCreateFolder("") }]}
          onClick={() => props.onToggleDirectory(props.root.path)}
        />
        {rootExpanded ? props.root.children.map(node => renderNode(node, 1, props)) : null}
      </div>
    </div>
  );
}

export function collectDirectoryPaths(node: WorkspaceDirectoryNode, output = new Set<string>()) {
  output.add(node.path);
  for (const child of node.children) {
    if (child.type === "directory") {
      collectDirectoryPaths(child, output);
    }
  }
  return output;
}

export function findFileNode(node: WorkspaceDirectoryNode, targetPath: string): WorkspaceFileNode | null {
  for (const child of node.children) {
    if (child.type === "file" && child.path === targetPath) {
      return child;
    }
    if (child.type === "directory") {
      const nested = findFileNode(child, targetPath);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

export function listDirectories(node: WorkspaceDirectoryNode, output: WorkspaceDirectoryNode[] = []) {
  output.push(node);
  for (const child of node.children) {
    if (child.type === "directory") {
      listDirectories(child, output);
    }
  }
  return output;
}

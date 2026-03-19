import type { CSSProperties, ReactNode } from "react";
import type { GeoFeature, WorkspaceDirectoryNode, WorkspaceFileNode, WorkspaceNode } from "../types";

type TreeAction = {
  title: string;
  iconSrc: string;
  disabled?: boolean;
  onClick: () => void;
};

const deleteIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/delete.svg",
  import.meta.url
).href;

const addIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/add.svg",
  import.meta.url
).href;

const saveIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/save.svg",
  import.meta.url
).href;

const liftupIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/liftup.svg",
  import.meta.url
).href;

const pulldownIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/normal/pulldown.svg",
  import.meta.url
).href;

type Props = {
  root: WorkspaceDirectoryNode;
  rootStatusTone: "success" | "loading" | "warning";
  activeFilePath: string | null;
  activeFeatureId: string | null;
  activeFileFeatures: GeoFeature[];
  expandedDirectories: Set<string>;
  busy?: boolean;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onSelectFeature: (filePath: string, featureId: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFeature: (filePath: string) => void;
  onDeleteFeature: (filePath: string, featureId: string) => void;
  onDeleteFolder: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onSaveAll: () => void;
};

function TreeRow({
  depth,
  label,
  icon,
  active,
  dirty,
  statusTone,
  muted,
  suffix,
  actions,
  onClick
}: {
  depth: number;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  dirty?: boolean;
  statusTone?: "success" | "loading" | "warning";
  muted?: boolean;
  suffix?: string;
  actions?: TreeAction[];
  onClick?: () => void;
}) {
  const rowStyle = { "--tree-depth": depth } as CSSProperties;

  const rowContent = (
    <>
      {icon ? <span className="tree-row__icon">{icon}</span> : null}
      <span className="tree-row__content">
        <span className="tree-row__label">{label}</span>
        {dirty ? <span className="tree-row__dirty" title="缓存已修改，尚未保存到源目录" /> : null}
        {statusTone ? <span className={`tree-row__status-dot tree-row__status-dot--${statusTone}`} /> : null}
      </span>
      {suffix ? <span className="tree-row__suffix">{suffix}</span> : null}
    </>
  );

  return (
    <div className={`tree-row-shell${active ? " tree-row-shell--active" : ""}${muted ? " tree-row-shell--muted" : ""}`}>
      {onClick ? (
        <button type="button" className="tree-row" style={rowStyle} onClick={onClick}>
          {rowContent}
        </button>
      ) : (
        <div className="tree-row tree-row--static" style={rowStyle}>
          {rowContent}
        </div>
      )}
      {actions?.length ? (
        <div className="tree-row__actions">
          {actions.map(action => (
            <button
              key={action.title}
              type="button"
              className="tree-row__action"
              title={action.title}
              aria-label={action.title}
              disabled={action.disabled}
              onClick={event => {
                event.stopPropagation();
                action.onClick();
              }}
            >
              <img className="tree-row__action-icon" src={action.iconSrc} alt="" />
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
      <div key={`dir-${node.path}`} className="tree-node tree-node--nested">
        <TreeRow
          depth={depth}
          label={node.name}
          icon={<img className="tree-row__icon-image" src={expanded ? liftupIconSrc : pulldownIconSrc} alt="" />}
          actions={[
            { title: "删除当前地区文件夹", iconSrc: deleteIconSrc, onClick: () => props.onDeleteFolder(node.path) },
            { title: "新建 GeoJSON", iconSrc: addIconSrc, onClick: () => props.onCreateFile(node.path) }
          ]}
          onClick={() => props.onToggleDirectory(node.path)}
        />
        {expanded ? node.children.map(child => renderNode(child, depth + 1, props)) : null}
      </div>
    );
  }

  const active = props.activeFilePath === node.path;
  return (
    <div key={`file-${node.path}`} className="tree-node tree-node--nested">
      <TreeRow
        depth={depth}
        label={node.name}
        icon={<img className="tree-row__icon-image" src={active ? liftupIconSrc : pulldownIconSrc} alt="" />}
        suffix={`${node.featureCount}`}
        active={active}
        dirty={node.dirty}
        actions={[
          { title: "删除当前 GeoJSON", iconSrc: deleteIconSrc, onClick: () => props.onDeleteFile(node.path) },
          { title: "新建点位", iconSrc: addIconSrc, onClick: () => props.onCreateFeature(node.path) }
        ]}
        onClick={() => props.onSelectFile(node.path)}
      />
      {active
        ? props.activeFileFeatures.map(feature => (
            <TreeRow
              key={`${node.path}-${feature.properties.id}`}
              depth={depth + 1}
              label={`${feature.properties.id} ${feature.properties.name || ""}`.trim()}
              icon="o"
              active={props.activeFeatureId === feature.properties.id}
              dirty={node.dirty && props.activeFeatureId === feature.properties.id}
              actions={[{ title: "删除当前点位", iconSrc: deleteIconSrc, onClick: () => props.onDeleteFeature(node.path, feature.properties.id) }]}
              onClick={() => props.onSelectFeature(node.path, feature.properties.id)}
            />
          ))
        : null}
    </div>
  );
}

export default function TreePanel(props: Props) {
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
          statusTone={props.rootStatusTone}
          muted
          actions={[
            { title: "同步缓存至项目", iconSrc: saveIconSrc, disabled: props.busy, onClick: props.onSaveAll },
            { title: "新建地区文件夹", iconSrc: addIconSrc, disabled: props.busy, onClick: () => props.onCreateFolder("") }
          ]}
        />
        {props.root.children.map(node => renderNode(node, 1, props))}
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

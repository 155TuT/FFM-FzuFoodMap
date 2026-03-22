import type { CSSProperties, ReactNode } from "react";
import type { GeoFeature, WorkspaceDirectoryNode, WorkspaceFileNode, WorkspaceNode } from "../types";

type TreeAction = {
  title: string;
  iconSrc: string;
  disabled?: boolean;
  onClick: () => void;
};

type Props = {
  root: WorkspaceDirectoryNode;
  rootStatusTone: "success" | "loading" | "warning";
  theme: "light" | "dark";
  activeFilePath: string | null;
  activeFeatureId: string | null;
  activeFileDirty: boolean;
  activeFileFeatures: GeoFeature[];
  activeFeatureDirtyIds: ReadonlySet<string>;
  expandedDirectories: Set<string>;
  busy?: boolean;
  onToggleTheme: () => void;
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

const themeToggleLightIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/light/to.svg",
  import.meta.url
).href;

const themeToggleDarkIconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/dark/to.svg",
  import.meta.url
).href;

const githubRepositoryUrl = "https://github.com/155TuT/FFM-FzuFoodMap";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38
        0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52
        -.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2
        -3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.62
        7.62 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15
        0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01
        8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

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
  const fileDirty = active ? props.activeFileDirty : node.dirty;
  return (
    <div key={`file-${node.path}`} className="tree-node tree-node--nested">
      <TreeRow
        depth={depth}
        label={node.name}
        icon={<img className="tree-row__icon-image" src={active ? liftupIconSrc : pulldownIconSrc} alt="" />}
        suffix={`${node.featureCount}`}
        active={active}
        dirty={fileDirty}
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
              dirty={props.activeFeatureDirtyIds.has(feature.properties.id)}
              actions={[
                {
                  title: "删除当前点位",
                  iconSrc: deleteIconSrc,
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
  const themeToggleIconSrc = props.theme === "light" ? themeToggleLightIconSrc : themeToggleDarkIconSrc;
  const themeToggleLabel = props.theme === "light" ? "切换到暗色模式" : "切换到亮色模式";

  return (
    <div className="tree-panel">
      <div className="tree-panel__header">
        <div className="tree-panel__header-copy">
          <h2>FFM-Studio</h2>
          <p className="tree-panel__subtitle">GeoJSON本地编辑工作台</p>
        </div>
        <div className="tree-panel__toolbar">
          <a
            className="tree-panel__toolbar-button tree-panel__toolbar-button--icon"
            href={githubRepositoryUrl}
            target="_blank"
            rel="noreferrer"
            title="打开项目 GitHub 仓库"
            aria-label="打开项目 GitHub 仓库"
          >
            <GitHubIcon />
          </a>
          <button
            type="button"
            className="tree-panel__toolbar-button tree-panel__theme-toggle"
            title={themeToggleLabel}
            aria-label={themeToggleLabel}
            onClick={props.onToggleTheme}
          >
            <img className="tree-row__action-icon" src={themeToggleIconSrc} alt="" />
          </button>
        </div>
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

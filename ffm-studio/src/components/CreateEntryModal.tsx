export type CreateEntryDialog = {
  type: "folder" | "file";
  parentPath: string;
  name: string;
};

type Props = {
  directories: { path: string }[];
  state: CreateEntryDialog;
  onChange: (next: CreateEntryDialog) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function CreateEntryModal({
  directories,
  state,
  onChange,
  onClose,
  onSubmit
}: Props) {
  const title =
    state.type === "folder" ? "新建地区文件夹" : "新建 GeoJSON 文件";

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
          <select
            value={state.parentPath}
            onChange={event =>
              onChange({ ...state, parentPath: event.target.value })
            }
          >
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
          <button
            type="button"
            className="secondary-button"
            onClick={onSubmit}
          >
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

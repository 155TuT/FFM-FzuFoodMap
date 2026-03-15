export type IncludeRow = {
  name: string;
  notes: string;
};

type Props = {
  rows: IncludeRow[];
  onChange: (next: IncludeRow[]) => void;
  namePlaceholder?: string;
  notePlaceholder?: string;
  emptyText?: string;
  addLabel?: string;
};

export default function IncludeEditor({
  rows,
  onChange,
  namePlaceholder = "名称",
  notePlaceholder = "补充说明",
  emptyText = "暂无内容",
  addLabel = "新增"
}: Props) {
  const updateRow = (index: number, key: keyof IncludeRow, value: string) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  return (
    <div className="stack-editor">
      {rows.length ? (
        rows.map((row, index) => (
          <div className="stack-editor__row" key={`include-${index}`}>
            <input
              value={row.name}
              placeholder={namePlaceholder}
              onChange={event => updateRow(index, "name", event.target.value)}
            />
            <input
              value={row.notes}
              placeholder={notePlaceholder}
              onChange={event => updateRow(index, "notes", event.target.value)}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              删除
            </button>
          </div>
        ))
      ) : (
        <span className="empty-inline">{emptyText}</span>
      )}
      <button type="button" className="secondary-button" onClick={() => onChange([...rows, { name: "", notes: "" }])}>
        {addLabel}
      </button>
    </div>
  );
}

import type { NormalizedPoiSource } from "../utils/sources";
import SourceIcon from "./SourceIcon";

type Props = {
  sources: NormalizedPoiSource[];
  id?: string;
};

export default function SourceListPopover({ sources, id }: Props) {
  return (
    <div className="source-list-popover" id={id} aria-label="来源列表">
      {sources.map(source => (
        <SourceIcon key={source.key} source={source} />
      ))}
    </div>
  );
}

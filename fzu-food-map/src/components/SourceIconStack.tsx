import type { NormalizedPoiSource } from "../utils/sources";
import SourceIcon from "./SourceIcon";

type Props = {
  sources: NormalizedPoiSource[];
};

export default function SourceIconStack({ sources }: Props) {
  return (
    <span className="source-icon-stack" aria-hidden="true">
      {sources.map(source => (
        <span key={source.key} className="source-icon-stack__slot">
          <SourceIcon source={source} decorative />
        </span>
      ))}
    </span>
  );
}

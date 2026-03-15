import type { NormalizedPoiSource } from "../utils/sources";

type Props = {
  source: NormalizedPoiSource;
  decorative?: boolean;
  className?: string;
};

export default function SourceIcon({ source, decorative = false, className = "" }: Props) {
  const label = source.title || source.platform;
  const classes = ["source-icon", className].filter(Boolean).join(" ");
  const href = source.clickable ? source.linkUrl : undefined;
  const externalHttp = href ? /^https?:\/\//i.test(href) : false;
  const circle = (
    <span className="source-icon__circle" aria-hidden="true">
      {source.placeholder}
    </span>
  );

  if (decorative) {
    return (
      <span className={classes} aria-hidden="true">
        {circle}
      </span>
    );
  }

  if (href) {
    return (
      <a
        className={classes}
        href={href}
        target={externalHttp ? "_blank" : undefined}
        rel={externalHttp ? "noopener noreferrer" : undefined}
        title={label}
        aria-label={label}
      >
        {circle}
      </a>
    );
  }

  return (
    <span className={classes} title={label} aria-label={label} aria-disabled="true">
      {circle}
    </span>
  );
}

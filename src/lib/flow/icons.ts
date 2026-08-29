const ICON_INNER: Record<string, string> = {
  start: `<path d="M4 2.5v11L13.5 8Z" />`,
  process: `<rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8h5M8 5.5v5" />`,
  decision: `<path d="M8 1.8 14.2 8 8 14.2 1.8 8Z" />`,
  data: `<ellipse cx="8" cy="4" rx="5" ry="1.8" /><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" /><path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />`,
  output: `<rect x="2.5" y="2.5" width="11" height="11" rx="1.2" /><path d="M5 8h6M9.2 5.8 11.5 8 9.2 10.2" />`,
  identity: `<path d="M2.5 8h11M10.2 5.2 13.2 8l-3 2.8M5.8 5.2 2.8 8l3 2.8" />`,
  string: `<path d="M4 4.2h3.2M5.6 4.2V12M4 12h3.2M9.2 6.5c.7-1 2.8-1 3.4.4.5 1.3-.4 2.6-1.7 3.1L9.2 12" />`,
  integer: `<rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6 6.2 5 10.2M10.2 6.2 9.2 10.2M5.6 8.4h3.6" />`,
  int: `<path d="M3.5 3.5v9M12.5 3.5v9M3.5 8h9" />`,
  list: `<path d="M6.5 4h7M6.5 8h7M6.5 12h7" /><circle cx="3.5" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />`,
  map: `<rect x="2.5" y="3" width="4.5" height="10" rx="1" /><path d="M9 5.5h4.5M9 8h4.5M9 10.5h4.5" />`,
  optional: `<circle cx="8" cy="8" r="5.5" /><path d="M8 7.2V11.5M8 5.2h.01" />`,
  timer: `<circle cx="8" cy="8.2" r="5.3" /><path d="M8 8.2V5.4M8 8.2l3 1.6M6.2 1.8h3.6" />`,
  quantizer: `<path d="M2 12h3V9h3V6h3V3h3" />`,
  sin: `<path d="M1.5 8c1.6-5 3.2-5 4.8 0s3.2 5 4.8 0 3.2-5 3.4 0" />`,
  scope: `<rect x="1.8" y="3" width="12.4" height="10" rx="1.4" /><path d="M3.2 8c1.2-3.4 2.2-3.4 3.2 0s2.2 3.4 3.2 0 2.2-3.4 3 0" />`,
};

export function iconKey(name: string | null | undefined): string {
  return (name ?? "process").replace(/\.(png|svg)$/i, "");
}

export function iconSvgInner(name: string | null | undefined): string {
  const key = iconKey(name);
  return ICON_INNER[key] ?? ICON_INNER.process;
}

export function renderIconSvg(name: string | null | undefined, className = "block-icon"): string {
  return `<svg class="${className}" viewBox="0 0 16 16" fill="none" aria-hidden="true">${iconSvgInner(name)}</svg>`;
}

const modules = import.meta.glob("../../resources/icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function innerFromSvg(svg: string): string {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  return (match?.[1] ?? svg).trim();
}

const byName = new Map<string, string>();
for (const [path, svg] of Object.entries(modules)) {
  const file = path.split("/").at(-1) ?? path;
  const stem = file.replace(/\.svg$/i, "");
  byName.set(stem, innerFromSvg(svg));
}

export function iconKey(name: string | null | undefined): string {
  return (name ?? "process").replace(/\.(png|svg)$/i, "");
}

export function knownBlockIcons(): string[] {
  return [...byName.keys()].sort();
}

export function hasBlockIcon(name: string | null | undefined): boolean {
  return byName.has(iconKey(name));
}

export function iconSvgInner(name: string | null | undefined): string {
  return byName.get(iconKey(name)) ?? byName.get("process") ?? "";
}

export function renderIconSvg(name: string | null | undefined, className = "block-icon"): string {
  return `<svg class="${className}" viewBox="0 0 16 16" fill="none" aria-hidden="true">${iconSvgInner(name)}</svg>`;
}

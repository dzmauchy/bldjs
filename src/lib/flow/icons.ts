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
const fullByName = new Map<string, string>();
for (const [path, svg] of Object.entries(modules)) {
  const file = path.split("/").at(-1) ?? path;
  const stem = file.replace(/\.svg$/i, "");
  fullByName.set(stem, svg);
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
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvgInner(name)}</svg>`;
}

/** Full-color app mark (`bld.svg`), not the 16×16 stroke glyphs. */
export function renderBrandSvg(className = "app-brand-icon"): string {
  const raw = fullByName.get("bld");
  if (!raw) {
    return "";
  }
  return raw.replace(/<svg\b/, `<svg class="${className}" role="img" aria-label="Bld"`);
}

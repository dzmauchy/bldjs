const modules = import.meta.glob("../../resources/icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const byName = new Map<string, string>();
for (const [path, svg] of Object.entries(modules)) {
  const file = path.split("/").at(-1) ?? path;
  const stem = file.replace(/\.svg$/i, "");
  byName.set(stem, svg);
}

export function iconStem(name: string | null | undefined): string {
  return (name ?? "process").replace(/\.(png|svg)$/i, "");
}

export function knownBlockIcons(): string[] {
  return [...byName.keys()].sort();
}

export function hasBlockIcon(name: string | null | undefined): boolean {
  return byName.has(iconStem(name));
}

export function blockIconSvg(name: string | null | undefined): string {
  return byName.get(iconStem(name)) ?? byName.get("process") ?? "";
}

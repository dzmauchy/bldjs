export function diagramFilename(name: string): string {
  const base = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_") || "diagram";
  return base.toLowerCase().endsWith(".xml") ? base : `${base}.xml`;
}

export function downloadTextFile(filename: string, contents: string, mime = "application/xml"): void {
  if (typeof document === "undefined") {
    return;
  }
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

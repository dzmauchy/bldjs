import type { Point } from "./geometry";
import type { NodeLayout, PortSide } from "./types";

export function worldPort(
  block: { x: number; y: number } | undefined,
  layout: NodeLayout | undefined,
  side: PortSide,
  name: string,
): Point | undefined {
  const anchor = layout?.ports[side][name];
  if (!block || !anchor) {
    return undefined;
  }
  return { x: block.x + anchor.x, y: block.y + anchor.y };
}

export function measureHostLayout(host: HTMLElement): NodeLayout {
  const width = host.offsetWidth;
  const height = host.offsetHeight;
  const hostRect = host.getBoundingClientRect();
  const scaleX = width === 0 ? 1 : hostRect.width / width || 1;
  const scaleY = height === 0 ? 1 : hostRect.height / height || 1;
  const ports: NodeLayout["ports"] = { in: {}, out: {} };
  const root = host.shadowRoot;
  if (!root) {
    return { width, height, ports };
  }
  for (const handle of root.querySelectorAll("[data-handle]")) {
    if (!(handle instanceof HTMLElement)) {
      continue;
    }
    const row = handle.closest("[data-port]");
    if (!(row instanceof HTMLElement)) {
      continue;
    }
    const side = row.dataset.side;
    const name = row.dataset.name;
    if ((side !== "in" && side !== "out") || !name) {
      continue;
    }
    const rect = handle.getBoundingClientRect();
    ports[side][name] = {
      x: Math.round((rect.left + rect.width / 2 - hostRect.left) / scaleX),
      y: Math.round((rect.top + rect.height / 2 - hostRect.top) / scaleY),
    };
  }
  return { width, height, ports };
}

export function portFromComposedPath(
  event: Event,
): { host: HTMLElement; side: PortSide; port: string } | undefined {
  for (const item of event.composedPath()) {
    if (!(item instanceof Element) || !item.hasAttribute("data-port")) {
      continue;
    }
    const root = item.getRootNode();
    if (!(root instanceof ShadowRoot) || !(root.host instanceof HTMLElement)) {
      continue;
    }
    if (root.host.localName !== "bld-node") {
      continue;
    }
    const side = item.getAttribute("data-side");
    const port = item.getAttribute("data-name");
    if ((side === "in" || side === "out") && port) {
      return { host: root.host, side, port };
    }
  }
  return undefined;
}

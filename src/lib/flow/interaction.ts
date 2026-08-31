import type { Link } from "$lib/blocks";
import type { AppState } from "$lib/state";
import { nodeFromClientPoint, nodeFromComposedPath, portFromClientPoint, portFromComposedPath } from "./layout";
import { uniqueCompatibleDropPort } from "./link-types";
import { capturePointer, isCanvasPointer, releasePointer } from "./pointer";
import type { Point } from "./geometry";
import type { PortPointerDetail } from "./types";

export const LINK_DRAG = 8;

export type PointerSession =
  | { kind: "pan"; pointerId: number; lastX: number; lastY: number }
  | { kind: "move"; pointerId: number; id: number; lastX: number; lastY: number }
  | { kind: "link"; pointerId: number; fromBlock: number; fromPort: string; startX: number; startY: number; dragged: boolean };

export interface DiagramInteractionHost {
  readonly app: AppState;
  toWorld(clientX: number, clientY: number): Point | undefined;
  viewportElement(): HTMLDivElement | null;
  requestUpdate(): void;
}

export class DiagramInteractionController {
  session: PointerSession | null = null;
  previewTo: Point | null = null;

  constructor(private readonly host: DiagramInteractionHost) {}

  #app(): AppState {
    return this.host.app;
  }

  finishLink(toBlock: number, toIn: string): void {
    const app = this.#app();
    const from = app.linkingFrom;
    if (!from || from.blockId === toBlock) {
      return;
    }
    app.toggleLink(from.blockId, from.port, toBlock, toIn);
    app.linkingFrom = null;
    this.previewTo = null;
    this.endPointer();
    this.host.requestUpdate();
  }

  capture(event: PointerEvent): void {
    capturePointer(this.host.viewportElement(), event.pointerId);
  }

  endPointer(pointerId?: number): void {
    const session = this.session;
    if (!session) {
      return;
    }
    if (pointerId !== undefined && session.pointerId !== pointerId) {
      return;
    }
    releasePointer(this.host.viewportElement(), session.pointerId);
    this.session = null;
  }

  onPortDown(detail: PortPointerDetail): void {
    const app = this.#app();
    if (detail.side === "out") {
      app.linkingFrom = { blockId: detail.blockId, port: detail.port };
      this.previewTo = this.host.toWorld(detail.clientX, detail.clientY) ?? null;
      this.session = {
        kind: "link",
        pointerId: detail.pointerId,
        fromBlock: detail.blockId,
        fromPort: detail.port,
        startX: detail.clientX,
        startY: detail.clientY,
        dragged: false,
      };
      capturePointer(this.host.viewportElement(), detail.pointerId);
      this.host.requestUpdate();
      return;
    }
    if (app.linkingFrom) {
      this.finishLink(detail.blockId, detail.port);
    }
  }

  onPortUp(detail: PortPointerDetail): void {
    if (detail.side === "in" && this.#app().linkingFrom) {
      this.finishLink(detail.blockId, detail.port);
    }
  }

  onPointerMove(event: PointerEvent): void {
    const app = this.#app();
    if (!app) {
      return;
    }
    if (this.session && this.session.pointerId !== event.pointerId) {
      return;
    }
    if (app.linkingFrom) {
      this.previewTo = this.host.toWorld(event.clientX, event.clientY) ?? this.previewTo;
      this.host.requestUpdate();
    }
    if (!this.session) {
      return;
    }
    if (this.session.kind === "pan") {
      const dx = event.clientX - this.session.lastX;
      const dy = event.clientY - this.session.lastY;
      this.session = { ...this.session, lastX: event.clientX, lastY: event.clientY };
      app.panBy(dx, dy);
      return;
    }
    if (this.session.kind === "move") {
      const dx = event.clientX - this.session.lastX;
      const dy = event.clientY - this.session.lastY;
      this.session = { ...this.session, lastX: event.clientX, lastY: event.clientY };
      app.moveBlock(this.session.id, dx / app.zoom, dy / app.zoom);
      return;
    }
    const dist = Math.hypot(event.clientX - this.session.startX, event.clientY - this.session.startY);
    if (dist >= LINK_DRAG) {
      this.session = { ...this.session, dragged: true };
    }
  }

  onPointerUp(event: PointerEvent): void {
    const app = this.#app();
    if (!app) {
      return;
    }
    if (this.session && this.session.pointerId !== event.pointerId) {
      return;
    }
    const hit = portFromComposedPath(event) ?? portFromClientPoint(event.clientX, event.clientY);
    if (this.session?.kind === "link" || app.linkingFrom) {
      if (hit?.side === "in") {
        this.finishLink(Number(hit.host.dataset.blockId), hit.port);
        return;
      }
      const node = nodeFromComposedPath(event) ?? nodeFromClientPoint(event.clientX, event.clientY);
      const toBlock = node ? Number(node.dataset.blockId) : Number.NaN;
      const port = Number.isFinite(toBlock) ? uniqueCompatibleDropPort(app, toBlock) : undefined;
      if (port) {
        this.finishLink(toBlock, port);
        return;
      }
      if (this.session?.kind === "link" && this.session.dragged) {
        app.linkingFrom = null;
        this.previewTo = null;
      }
      this.endPointer(event.pointerId);
      this.host.requestUpdate();
      return;
    }
    this.endPointer(event.pointerId);
    this.host.requestUpdate();
  }

  onViewportPointerDown(event: PointerEvent): void {
    if (!isCanvasPointer(event) || this.session) {
      return;
    }
    const path = event.composedPath();
    if (path.some((item) => item instanceof Element && item.closest(".toolbar"))) {
      return;
    }
    const node = path.find((item) => item instanceof HTMLElement && item.localName === "bld-node");
    const app = this.#app();
    if (node instanceof HTMLElement) {
      if (portFromComposedPath(event) || app.linkingFrom) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const id = Number(node.dataset.blockId);
      app.selectBlock(id);
      this.session = {
        kind: "move",
        pointerId: event.pointerId,
        id,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      this.capture(event);
      this.host.requestUpdate();
      return;
    }
    event.preventDefault();
    if (event.button === 0) {
      app.clearSelection();
      app.linkingFrom = null;
      this.previewTo = null;
    }
    this.session = { kind: "pan", pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    this.capture(event);
    this.host.requestUpdate();
  }

  onLinkPointerDown(link: Link): void {
    const app = this.#app();
    app.selectLink(link);
    app.linkingFrom = null;
    this.previewTo = null;
    this.endPointer();
    this.host.requestUpdate();
  }
}

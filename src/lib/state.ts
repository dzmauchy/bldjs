import {
  type BlockDef,
  Catalog,
  Diagram,
  type Link,
  type NodeSpec,
  type ResolvedBlock,
  SampleBuf,
  type XmlSource,
  associateBuiltinModels,
  blockAttribute,
  compileTimer,
  infer,
  spawnTimer,
  stop,
} from "./blocks";
import { linksEqual } from "./blocks/diagram";
import {
  BLOCK_PLACE_HEIGHT,
  BLOCK_PLACE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  NONE_ID,
  type BlockKindInfo,
  blockKindFromName,
  clampZoom,
  screenToWorld,
  zoomToward,
} from "./model";

export interface BlockInstance {
  id: number;
  defId: string;
  x: number;
  y: number;
}

export interface LinkingFrom {
  blockId: number;
  port: string;
}

function reactiveFields(target: AppState, fields: Record<string, unknown>): void {
  for (const [key, initial] of Object.entries(fields)) {
    let value = initial;
    Object.defineProperty(target, key, {
      get: () => value,
      set(next: unknown) {
        if (Object.is(value, next)) {
          return;
        }
        value = next;
        target.notify();
      },
      enumerable: true,
      configurable: true,
    });
  }
}

export class AppState extends EventTarget {
  declare catalog: Catalog;
  declare sources: XmlSource[];
  declare blocks: BlockInstance[];
  declare links: Link[];
  declare selected: number;
  declare selectedLink: Link | null;
  declare panX: number;
  declare panY: number;
  declare zoom: number;
  declare nextId: number;
  declare viewportW: number;
  declare viewportH: number;
  declare aboutOpen: boolean;
  declare draggingDefId: string | null;
  declare linkingFrom: LinkingFrom | null;
  declare samples: Map<number, SampleBuf>;
  declare scopeOpen: number;
  declare runFlags: Map<number, { value: boolean }>;

  #timerStops = new Map<number, () => void>();
  #lastTimerTopology = "";

  constructor() {
    super();
    const diagram = new Diagram("workspace", "Workspace");
    associateBuiltinModels(diagram);
    reactiveFields(this, {
      catalog: diagram.catalog(),
      sources: [...diagram.sources()],
      blocks: [],
      links: [],
      selected: NONE_ID,
      selectedLink: null,
      panX: 48,
      panY: 48,
      zoom: 1,
      nextId: 1,
      viewportW: 800,
      viewportH: 600,
      aboutOpen: false,
      draggingDefId: null,
      linkingFrom: null,
      samples: new Map(),
      scopeOpen: NONE_ID,
      runFlags: new Map(),
    });
  }

  subscribe(listener: () => void): () => void {
    const wrapped = (): void => {
      listener();
    };
    this.addEventListener("change", wrapped);
    return () => this.removeEventListener("change", wrapped);
  }

  notify(): void {
    this.dispatchEvent(new Event("change"));
  }

  isDragging(): boolean {
    return this.draggingDefId !== null;
  }

  blockDef(defId: string): BlockDef | undefined {
    return this.catalog.block(defId);
  }

  kindOf(def: BlockDef): BlockKindInfo {
    const name = blockAttribute(def, "kind");
    return (name ? blockKindFromName(name) : undefined) ?? blockKindFromName("Process")!;
  }

  addBlock(defId: string, x: number, y: number): void {
    if (!this.blockDef(defId)) {
      return;
    }
    const id = this.nextId;
    this.nextId = id + 1;
    if (defId === "oscilloscope") {
      const next = new Map(this.samples);
      next.set(id, new SampleBuf());
      this.samples = next;
    }
    this.blocks = [...this.blocks, { id, defId, x, y }];
    this.selectBlock(id);
  }

  addBlockAtViewCenter(defId: string): void {
    const n = this.blocks.length;
    const col = n % 2;
    const row = Math.floor(n / 2);
    const [worldX, worldY] = screenToWorld(
      this.viewportW / 2,
      this.viewportH / 2,
      this.panX,
      this.panY,
      this.zoom,
    );
    this.addBlock(
      defId,
      worldX - BLOCK_PLACE_WIDTH - 24 + col * (BLOCK_PLACE_WIDTH + 48),
      worldY - BLOCK_PLACE_HEIGHT + row * (BLOCK_PLACE_HEIGHT + 48),
    );
  }

  clearCanvas(): void {
    this.stopAllTimers();
    this.blocks = [];
    this.links = [];
    this.samples = new Map();
    this.scopeOpen = NONE_ID;
    this.selected = NONE_ID;
    this.selectedLink = null;
    this.linkingFrom = null;
    this.resetView();
  }

  removeBlock(id: number): void {
    if (!this.blocks.some((block) => block.id === id)) {
      return;
    }
    this.stopTimer(id);
    const samples = new Map(this.samples);
    samples.delete(id);
    this.samples = samples;
    if (this.scopeOpen === id) {
      this.scopeOpen = NONE_ID;
    }
    this.blocks = this.blocks.filter((block) => block.id !== id);
    this.links = this.links.filter((link) => link.fromBlock !== id && link.toBlock !== id);
    if (this.selected === id) {
      this.selected = NONE_ID;
    }
    if (this.linkingFrom?.blockId === id) {
      this.linkingFrom = null;
    }
    if (this.selectedLink && (this.selectedLink.fromBlock === id || this.selectedLink.toBlock === id)) {
      this.selectedLink = null;
    }
  }

  deleteSelected(): void {
    if (this.selected !== NONE_ID) {
      this.removeBlock(this.selected);
      return;
    }
    if (this.selectedLink) {
      this.removeLink(this.selectedLink);
      this.selectedLink = null;
    }
  }

  removeLink(link: Link): void {
    this.links = this.links.filter((item) => !linksEqual(item, link));
    if (this.selectedLink && linksEqual(this.selectedLink, link)) {
      this.selectedLink = null;
    }
  }

  resolveAll(): Map<number, ResolvedBlock> {
    const nodes = this.blocks.map((block) => [block.id, block.defId] as const);
    return infer(this.catalog, nodes, this.links);
  }

  openOscilloscope(id: number): void {
    if (this.blocks.some((block) => block.id === id && block.defId === "oscilloscope")) {
      this.scopeOpen = id;
    }
  }

  closeOscilloscope(): void {
    this.scopeOpen = NONE_ID;
  }

  stopTimer(id: number): void {
    const flags = new Map(this.runFlags);
    const flag = flags.get(id);
    if (flag) {
      stop(flag);
      flags.delete(id);
    }
    this.#timerStops.get(id)?.();
    this.#timerStops.delete(id);
    this.runFlags = flags;
  }

  stopAllTimers(): void {
    for (const flag of this.runFlags.values()) {
      stop(flag);
    }
    for (const cancel of this.#timerStops.values()) {
      cancel();
    }
    this.#timerStops.clear();
    this.runFlags = new Map();
    this.#lastTimerTopology = "";
  }

  /** Block ids, definitions, and links — not positions — so moving a block does not restart timers. */
  timerTopologyKey(): string {
    const nodes = this.blocks.map((block) => `${block.id}:${block.defId}`).join(",");
    const links = this.links
      .map((link) => `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`)
      .join(",");
    return `${nodes}|${links}`;
  }

  reconcileTimers(): void {
    const topology = this.timerTopologyKey();
    if (topology === this.#lastTimerTopology) {
      return;
    }
    const nodes: NodeSpec[] = this.blocks.map((block) => ({ id: block.id, defId: block.defId }));
    const wanted = this.blocks
      .filter((block) => block.defId === "timer")
      .filter((block) => compileTimer(block.id, nodes, this.links, this.samples) !== undefined)
      .map((block) => block.id);

    this.stopAllTimers();
    const flags = new Map<number, { value: boolean }>();
    for (const id of wanted) {
      const compiled = compileTimer(id, nodes, this.links, this.samples);
      if (!compiled) {
        continue;
      }
      const running = { value: true };
      const cancel = spawnTimer(compiled, running);
      flags.set(id, running);
      this.#timerStops.set(id, cancel);
    }
    this.runFlags = flags;
    this.#lastTimerTopology = topology;
  }

  toggleLink(fromBlock: number, fromOut: string, toBlock: number, toIn: string): void {
    const link: Link = { fromBlock, fromOut, toBlock, toIn };
    const target = this.blocks.find((block) => block.id === toBlock);
    const def = target ? this.blockDef(target.defId) : undefined;
    const vararg = def?.inputs.find((port) => port.name === toIn)?.vararg ?? false;
    if (this.links.some((item) => linksEqual(item, link))) {
      this.links = this.links.filter((item) => !linksEqual(item, link));
      if (this.selectedLink && linksEqual(this.selectedLink, link)) {
        this.selectedLink = null;
      }
      return;
    }
    let next = this.links;
    if (!vararg) {
      next = next.filter((item) => !(item.toBlock === link.toBlock && item.toIn === link.toIn));
    }
    this.links = [...next, link];
  }

  inputIsGrounded(blockId: number, port: string): boolean {
    return this.links.some((link) => link.toBlock === blockId && link.toIn === port);
  }

  selectBlock(id: number): void {
    this.selected = id;
    this.selectedLink = null;
  }

  selectLink(link: Link): void {
    this.selected = NONE_ID;
    this.selectedLink = link;
  }

  clearSelection(): void {
    this.selected = NONE_ID;
    this.selectedLink = null;
  }

  isLinkSelected(link: Link): boolean {
    return this.selectedLink !== null && linksEqual(this.selectedLink, link);
  }

  resetView(): void {
    this.panX = 48;
    this.panY = 48;
    this.zoom = 1;
  }

  zoomBy(factor: number, cursorX = this.viewportW / 2, cursorY = this.viewportH / 2): void {
    const oldZoom = this.zoom;
    const newZoom = clampZoom(oldZoom * factor);
    if (Math.abs(newZoom - oldZoom) < Number.EPSILON) {
      return;
    }
    const [panX, panY] = zoomToward(oldZoom, newZoom, cursorX, cursorY, this.panX, this.panY);
    this.zoom = newZoom;
    this.panX = panX;
    this.panY = panY;
  }

  zoomIn(): void {
    this.zoomBy(1.15);
  }

  zoomOut(): void {
    this.zoomBy(1 / 1.15);
  }

  zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  canZoomIn(): boolean {
    return this.zoom < MAX_ZOOM - 1e-9;
  }

  canZoomOut(): boolean {
    return this.zoom > MIN_ZOOM + 1e-9;
  }

  moveBlock(id: number, dx: number, dy: number): void {
    this.blocks = this.blocks.map((item) => (item.id === id ? { ...item, x: item.x + dx, y: item.y + dy } : item));
  }

  moveBlockTo(id: number, x: number, y: number): void {
    this.blocks = this.blocks.map((item) => (item.id === id ? { ...item, x, y } : item));
  }
}

export const APP_STATE_KEY = "app-state";

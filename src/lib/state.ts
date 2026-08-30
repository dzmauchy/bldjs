import {
  type BlockDef,
  Catalog,
  Diagram,
  type Link,
  type NodeSpec,
  type ResolvedBlock,
  type XmlSource,
  associateBuiltinModels,
  blockAttribute,
  blockInput,
  assembleGenerator,
  infer,
  planGenerator,
  type ScopeSeries,
  acceptsManyInputs,
  allocateIncomingSlot,
  allocateOutgoingSlot,
  catalogPortName,
  compactLinkSlots,
  findCatalogLink,
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
import { type GeneratorHandle, startGenerator } from "./runtime/generator";

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
  declare scopeOpen: number;
  declare running: boolean;
  declare runError: string | null;

  #generators = new Map<number, GeneratorHandle>();
  #scopeToTimer = new Map<number, number>();
  #scopeChannels = new Map<number, { label: string; ring: number }[]>();
  #runTopology = "";
  #runningOp = 0;

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
      scopeOpen: NONE_ID,
      running: false,
      runError: null,
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
    this.blocks = [...this.blocks, { id, defId, x, y }];
    this.selectBlock(id);
    this.#invalidateRun();
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
    this.stopRun();
    this.blocks = [];
    this.links = [];
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
    if (this.scopeOpen === id) {
      this.scopeOpen = NONE_ID;
    }
    this.blocks = this.blocks.filter((block) => block.id !== id);
    this.#replaceLinks(this.links.filter((link) => link.fromBlock !== id && link.toBlock !== id));
    if (this.selected === id) {
      this.selected = NONE_ID;
    }
    if (this.linkingFrom?.blockId === id) {
      this.linkingFrom = null;
    }
    if (this.selectedLink && (this.selectedLink.fromBlock === id || this.selectedLink.toBlock === id)) {
      this.selectedLink = null;
    }
    this.#invalidateRun();
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
    this.#replaceLinks(
      this.links.filter((item) => !linksEqual(item, link)),
      link,
    );
    this.#invalidateRun();
  }

  resolveAll(): Map<number, ResolvedBlock> {
    const nodes = this.blocks.map((block) => [block.id, block.defId] as const);
    return infer(this.catalog, nodes, this.links);
  }

  isScopeLive(id: number): boolean {
    return this.running && this.#scopeToTimer.has(id);
  }

  openOscilloscope(id: number): void {
    if (!this.isScopeLive(id)) {
      return;
    }
    if (this.blocks.some((block) => block.id === id && block.defId === "oscilloscope")) {
      this.scopeOpen = id;
    }
  }

  closeOscilloscope(): void {
    this.scopeOpen = NONE_ID;
  }

  async snapshotScope(id: number): Promise<ScopeSeries[]> {
    const timerId = this.#scopeToTimer.get(id);
    const channels = this.#scopeChannels.get(id);
    if (timerId === undefined || !channels?.length) {
      return [];
    }
    const handle = this.#generators.get(timerId);
    if (!handle) {
      return [];
    }
    return Promise.all(
      channels.map(async (channel) => ({
        label: channel.label,
        samples: await handle.snapshot(channel.ring),
      })),
    );
  }

  /** Block ids, definitions, and links — not positions — so moving a block does not restart generators. */
  timerTopologyKey(): string {
    const nodes = this.blocks.map((block) => `${block.id}:${block.defId}`).join(",");
    const links = this.links
      .map((link) => `${link.fromBlock}:${link.fromOut}->${link.toBlock}:${link.toIn}`)
      .join(",");
    return `${nodes}|${links}`;
  }

  plannedGenerators() {
    const nodes: NodeSpec[] = this.blocks.map((block) => ({ id: block.id, defId: block.defId }));
    return this.blocks
      .filter((block) => block.defId === "timer")
      .map((block) => planGenerator(block.id, nodes, this.links))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
  }

  canRun(): boolean {
    return this.plannedGenerators().length > 0;
  }

  stopRun(): void {
    this.#runningOp += 1;
    for (const handle of this.#generators.values()) {
      handle.stop();
    }
    this.#generators.clear();
    this.#scopeToTimer.clear();
    this.#scopeChannels.clear();
    this.#runTopology = "";
    this.running = false;
    if (this.scopeOpen !== NONE_ID && !this.isScopeLive(this.scopeOpen)) {
      this.scopeOpen = NONE_ID;
    }
  }

  async runDiagram(): Promise<void> {
    const topology = this.timerTopologyKey();
    const plans = this.plannedGenerators();
    this.stopRun();
    if (plans.length === 0) {
      this.runError = "Wire an Oscilloscope through to a Timer, then Run.";
      return;
    }
    const op = this.#runningOp;
    try {
      for (const plan of plans) {
        const wasm = await assembleGenerator(plan);
        const handle = await startGenerator({ wasm, delayMs: plan.delayMs });
        if (op !== this.#runningOp) {
          handle.stop();
          return;
        }
        this.#generators.set(plan.timerId, handle);
        plan.channels.forEach((channel, index) => {
          this.#scopeToTimer.set(channel.scopeId, plan.timerId);
          const series = this.#scopeChannels.get(channel.scopeId) ?? [];
          series.push({ label: channel.label, ring: index });
          this.#scopeChannels.set(channel.scopeId, series);
        });
      }
      this.#runTopology = topology;
      this.runError = null;
      this.running = true;
    } catch (error) {
      this.stopRun();
      this.runError = error instanceof Error ? error.message : "Run failed";
    }
  }

  #invalidateRun(): void {
    if (!this.running && this.#generators.size === 0) {
      return;
    }
    if (this.timerTopologyKey() === this.#runTopology) {
      return;
    }
    this.stopRun();
  }

  toggleLink(fromBlock: number, fromOut: string, toBlock: number, toIn: string): void {
    const existing = findCatalogLink(this.links, fromBlock, fromOut, toBlock, toIn);
    if (existing) {
      this.removeLink(existing);
      return;
    }
    const target = this.blocks.find((block) => block.id === toBlock);
    const def = target ? this.blockDef(target.defId) : undefined;
    const catalogIn = catalogPortName(toIn);
    const catalogOut = catalogPortName(fromOut);
    const targetPort = def ? blockInput(def, catalogIn) : undefined;
    const many = acceptsManyInputs(targetPort);
    let next = this.links;
    if (!many) {
      next = next.filter((item) => !(item.toBlock === toBlock && catalogPortName(item.toIn) === catalogIn));
    }
    const link: Link = {
      fromBlock,
      fromOut: allocateOutgoingSlot(next, fromBlock, catalogOut),
      toBlock,
      toIn: many ? allocateIncomingSlot(next, toBlock, catalogIn) : catalogIn,
    };
    this.#replaceLinks([...next, link]);
    this.#invalidateRun();
  }

  #replaceLinks(remaining: Link[], removed?: Link): void {
    const compacted = compactLinkSlots(remaining);
    if (removed && this.selectedLink && linksEqual(this.selectedLink, removed)) {
      this.selectedLink = null;
    } else if (this.selectedLink) {
      const index = remaining.findIndex((item) => linksEqual(item, this.selectedLink!));
      this.selectedLink = index >= 0 ? compacted[index] : null;
    }
    this.links = compacted;
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

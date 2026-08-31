import {
  type BlockDef,
  Catalog,
  Diagram,
  type Link,
  type ResolvedBlock,
  type ScopeSeries,
  type XmlSource,
  associateBuiltinModels,
  blockAttribute,
  compactLinkSlots,
} from "@bld/xml";
import { linksEqual } from "@bld/xml";
import { DiagramModel, type BlockInstance } from "./diagram-model";
import {
  type BlockExtras,
  type DiagramRepository,
  type StoredDiagram,
  defaultDiagramRepository,
  diagramFilename,
  downloadTextFile,
  loadDiagramSolution,
  newDiagramId,
  nowIso,
  serializeCanvas,
  blockXmlId,
  documentToCanvas,
  parseDiagramXml,
} from "@bld/xml";
import {
  BLOCK_PLACE_HEIGHT,
  BLOCK_PLACE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  NONE_ID,
  type BlockKindInfo,
  blockKindFromName,
  compactUiMatches,
  screenToWorld,
  zoomViewport,
} from "./model";
import { ObservableState } from "./observable";
import { DiagramRunCancelled, DiagramRunner, EMPTY_RUN_MESSAGE } from "@bld/wasm";
import { plannedGenerators, topologyKey } from "@bld/xml";
import { portAcceptsMany, remapSelectedLink, WiringGraph } from "./wiring";
import { preloadAssembler } from "@bld/wasm";

export type { BlockInstance };

export interface LinkingFrom {
  blockId: number;
  port: string;
}

export type DiagramIoMode = "closed" | "save" | "open";

export class AppState extends ObservableState {
  declare catalog: Catalog;
  declare sources: XmlSource[];
  declare links: Link[];
  declare selected: number;
  declare selectedLink: Link | null;
  declare panX: number;
  declare panY: number;
  declare zoom: number;
  /** Layout size in CSS pixels. Written by the diagram without notifying. */
  viewportW = 800;
  viewportH = 600;
  declare aboutOpen: boolean;
  declare compactUi: boolean;
  declare paletteOpen: boolean;
  declare draggingDefId: string | null;
  declare linkingFrom: LinkingFrom | null;
  declare scopeOpen: number;
  declare running: boolean;
  declare starting: boolean;
  declare runError: string | null;
  declare diagramId: string;
  declare diagramName: string;
  declare ioMode: DiagramIoMode;
  declare ioError: string | null;
  declare saveName: string;
  declare savedDiagrams: StoredDiagram[];

  #diagram = new DiagramModel();
  #runner = new DiagramRunner();
  #repo: DiagramRepository;
  #createdAt = nowIso();
  #updatedAt = this.#createdAt;
  #extras = new Map<number, BlockExtras>();

  constructor(repo: DiagramRepository = defaultDiagramRepository()) {
    super();
    this.#repo = repo;
    const created = nowIso();
    this.#createdAt = created;
    this.#updatedAt = created;
    const diagram = new Diagram("workspace", "Workspace");
    associateBuiltinModels(diagram);
    this.defineFields({
      catalog: diagram.catalog(),
      sources: [...diagram.sources()],
      links: [],
      selected: NONE_ID,
      selectedLink: null,
      panX: 48,
      panY: 48,
      zoom: 1,
      aboutOpen: false,
      compactUi: compactUiMatches(),
      paletteOpen: false,
      draggingDefId: null,
      linkingFrom: null,
      scopeOpen: NONE_ID,
      running: false,
      starting: false,
      runError: null,
      diagramId: newDiagramId(),
      diagramName: "Workspace",
      ioMode: "closed",
      ioError: null,
      saveName: "Workspace",
      savedDiagrams: [],
    });
  }

  get blocks(): BlockInstance[] {
    return this.#diagram.blocks;
  }

  get nextId(): number {
    return this.#diagram.nextId;
  }

  block(id: number): BlockInstance | undefined {
    return this.#diagram.block(id);
  }

  /** Instance `name`, or the XML id when the block has no name. */
  blockDisplayName(id: number): string {
    const extra = this.#extras.get(id);
    const name = extra?.name?.trim();
    if (name) {
      return name;
    }
    return extra?.xmlId ?? String(id);
  }

  isDragging(): boolean {
    return this.draggingDefId !== null;
  }

  paletteVisible(): boolean {
    return !this.compactUi || this.paletteOpen || this.draggingDefId !== null;
  }

  togglePalette(): void {
    this.paletteOpen = !this.paletteOpen;
  }

  closePalette(): void {
    this.paletteOpen = false;
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
    const block = this.#diagram.add(defId, x, y);
    this.#ensureBlockExtras(block.id);
    this.#touchDiagram();
    this.selectBlock(block.id);
    this.#invalidateRun();
    this.#maybePreloadAssembler();
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
    this.#diagram.clear();
    this.#extras.clear();
    this.links = [];
    this.scopeOpen = NONE_ID;
    this.selected = NONE_ID;
    this.selectedLink = null;
    this.linkingFrom = null;
    this.ioError = null;
    this.runError = null;
    this.#resetIdentity();
    this.resetView();
    this.notify();
  }

  removeBlock(id: number): void {
    if (!this.#diagram.remove(id)) {
      return;
    }
    if (this.scopeOpen === id) {
      this.scopeOpen = NONE_ID;
    }
    this.#replaceLinks(this.#wiring().withoutBlock(id).links);
    if (this.selected === id) {
      this.selected = NONE_ID;
    }
    if (this.linkingFrom?.blockId === id) {
      this.linkingFrom = null;
    }
    if (this.selectedLink && (this.selectedLink.fromBlock === id || this.selectedLink.toBlock === id)) {
      this.selectedLink = null;
    }
    this.#extras.delete(id);
    this.#touchDiagram();
    this.notify();
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
    this.#replaceLinks(this.#wiring().disconnect(link).links, link);
    this.#invalidateRun();
  }

  resolveAll(): Map<number, ResolvedBlock> {
    return loadDiagramSolution(this.toDiagramXml(), this.catalog).inferred;
  }

  toDiagramXml(): string {
    return serializeCanvas({
      id: this.diagramId,
      name: this.diagramName,
      createdAt: this.#createdAt,
      updatedAt: this.#updatedAt,
      blocks: this.blocks,
      links: this.links,
      extras: this.#extras,
    });
  }

  loadDiagramXml(xml: string): boolean {
    try {
      const canvas = documentToCanvas(parseDiagramXml(xml));
      const unknown = canvas.blocks.find((block) => !this.blockDef(block.defId));
      if (unknown) {
        throw new Error(`unknown block type \`${unknown.defId}\``);
      }
      this.#applyCanvas(canvas);
      this.ioError = null;
      this.runError = null;
      return true;
    } catch (error) {
      this.ioError = error instanceof Error ? error.message : "Invalid diagram XML";
      this.notify();
      return false;
    }
  }

  exportDiagramXml(): void {
    downloadTextFile(diagramFilename(this.diagramName), this.toDiagramXml());
  }

  openSaveDialog(): void {
    this.saveName = this.diagramName;
    this.ioError = null;
    this.ioMode = "save";
  }

  async openLibraryDialog(): Promise<void> {
    this.ioError = null;
    this.ioMode = "open";
    await this.refreshLibrary();
  }

  closeIo(): void {
    this.ioMode = "closed";
    this.ioError = null;
  }

  async refreshLibrary(): Promise<void> {
    this.savedDiagrams = await this.#repo.list();
  }

  async saveToLibrary(name = this.saveName): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) {
      this.ioError = "Name is required";
      return false;
    }
    this.diagramName = trimmed;
    this.saveName = trimmed;
    this.#touchDiagram();
    try {
      await this.#repo.save({
        id: this.diagramId,
        name: trimmed,
        xml: this.toDiagramXml(),
        createdAt: this.#createdAt,
        updatedAt: this.#updatedAt,
      });
      this.ioError = null;
      this.ioMode = "closed";
      await this.refreshLibrary();
      return true;
    } catch (error) {
      this.ioError = error instanceof Error ? error.message : "Save failed";
      return false;
    }
  }

  async loadFromLibrary(id: string): Promise<boolean> {
    try {
      const record = await this.#repo.get(id);
      if (!record) {
        this.ioError = "Diagram not found";
        return false;
      }
      if (!this.loadDiagramXml(record.xml)) {
        return false;
      }
      this.diagramId = record.id;
      this.diagramName = record.name;
      this.saveName = record.name;
      this.ioMode = "closed";
      return true;
    } catch (error) {
      this.ioError = error instanceof Error ? error.message : "Load failed";
      return false;
    }
  }

  async deleteFromLibrary(id: string): Promise<void> {
    await this.#repo.remove(id);
    await this.refreshLibrary();
  }

  isScopeLive(id: number): boolean {
    return this.runBusy() && (this.#runner.current?.isScopeLive(id) ?? false);
  }

  openScope(id: number): void {
    if (!this.isScopeLive(id)) {
      return;
    }
    if (this.block(id)?.defId === "scope") {
      this.scopeOpen = id;
    }
  }

  closeScope(): void {
    this.scopeOpen = NONE_ID;
  }

  snapshotScope(id: number): ScopeSeries[] {
    return this.#runner.current?.snapshotScope(id) ?? [];
  }

  connectorHz(link: { fromBlock: number; fromOut: string; toBlock: number; toIn: string }): number {
    return this.#runner.current?.connectorHz(link) ?? 0;
  }

  connectorHzForKey(key: string): number {
    return this.#runner.current?.connectorHzForKey(key) ?? 0;
  }

  /** Sample runner intercept counts and update per-connector Hertz. */
  sampleFlowRates(now = performance.now()): void {
    if (!this.running) {
      return;
    }
    this.#runner.current?.sampleFlowRates(now);
  }

  get topologyKey(): string {
    return topologyKey(this.blocks, this.links);
  }

  /** Block ids, definitions, and links — not positions — so moving a block does not restart generators. */
  timerTopologyKey(): string {
    return this.topologyKey;
  }

  plannedGenerators() {
    return plannedGenerators(this.blocks, this.links);
  }

  canRun(): boolean {
    return this.plannedGenerators().length > 0;
  }

  runBusy(): boolean {
    return this.running || this.starting;
  }

  stopRun(): void {
    this.#runner.stop();
    this.starting = false;
    this.running = false;
    if (this.scopeOpen !== NONE_ID && !this.isScopeLive(this.scopeOpen)) {
      this.scopeOpen = NONE_ID;
    }
  }

  async runDiagram(): Promise<void> {
    if (this.runBusy()) {
      return;
    }
    if (this.plannedGenerators().length === 0) {
      this.runError = EMPTY_RUN_MESSAGE;
      return;
    }
    this.stopRun();
    this.starting = true;
    try {
      const solution = loadDiagramSolution(this.toDiagramXml(), this.catalog);
      await this.#runner.start(solution.nodes, solution.links, {
        onArmed: () => this.notify(),
      });
      if (!this.#runner.current) {
        return;
      }
      this.runError = null;
      this.starting = false;
      this.running = true;
    } catch (error) {
      if (error instanceof DiagramRunCancelled) {
        return;
      }
      this.stopRun();
      this.runError = error instanceof Error ? error.message : "Run failed";
    }
  }

  #invalidateRun(): void {
    if (!this.runBusy() && !this.#runner.current) {
      return;
    }
    if (this.topologyKey === this.#runner.current?.topology) {
      return;
    }
    this.stopRun();
  }

  #maybePreloadAssembler(): void {
    if (this.canRun()) {
      preloadAssembler();
    }
  }

  #wiring(): WiringGraph {
    return new WiringGraph(this.links);
  }

  toggleLink(fromBlock: number, fromOut: string, toBlock: number, toIn: string): void {
    const target = this.block(toBlock);
    const def = target ? this.blockDef(target.defId) : undefined;
    const { graph, existing } = this.#wiring().connect(
      fromBlock,
      fromOut,
      toBlock,
      toIn,
      portAcceptsMany(def, toIn),
    );
    this.#replaceLinks(graph.links, existing);
    this.#invalidateRun();
    this.#maybePreloadAssembler();
  }

  #replaceLinks(remaining: Link[], removed?: Link): void {
    const compacted = compactLinkSlots(remaining, (id) => {
      const block = this.block(id);
      return block ? { x: block.x, y: block.y } : undefined;
    });
    this.selectedLink = remapSelectedLink(remaining, compacted, this.selectedLink, removed);
    this.links = compacted;
    this.#touchDiagram();
  }

  inputIsGrounded(blockId: number, port: string): boolean {
    return this.#wiring().inputIsGrounded(blockId, port);
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

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  zoomBy(factor: number, cursorX = this.viewportW / 2, cursorY = this.viewportH / 2): void {
    const next = zoomViewport({ panX: this.panX, panY: this.panY, zoom: this.zoom }, factor, cursorX, cursorY);
    if (!next) {
      return;
    }
    this.zoom = next.zoom;
    this.panX = next.panX;
    this.panY = next.panY;
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
    this.#diagram.moveBy(id, dx, dy);
    this.#touchBlock(id);
    this.notify();
  }

  moveBlockTo(id: number, x: number, y: number): void {
    this.#diagram.moveTo(id, x, y);
    this.#touchBlock(id);
    this.notify();
  }

  #resetIdentity(): void {
    const now = nowIso();
    this.diagramId = newDiagramId();
    this.diagramName = "Workspace";
    this.saveName = "Workspace";
    this.#createdAt = now;
    this.#updatedAt = now;
  }

  #touchDiagram(): void {
    this.#updatedAt = nowIso();
  }

  #touchBlock(id: number): void {
    const extra = this.#ensureBlockExtras(id);
    extra.updatedAt = nowIso();
    this.#touchDiagram();
  }

  #ensureBlockExtras(id: number): BlockExtras {
    let extra = this.#extras.get(id);
    if (!extra) {
      const now = nowIso();
      extra = {
        xmlId: blockXmlId(id),
        createdAt: now,
        updatedAt: now,
        attributes: [],
        parameters: [],
      };
      this.#extras.set(id, extra);
    }
    return extra;
  }

  #applyCanvas(canvas: ReturnType<typeof documentToCanvas>): void {
    this.stopRun();
    this.#diagram.replace(canvas.blocks);
    this.#diagram.nextId = canvas.nextId;
    this.#extras = new Map(canvas.extras);
    this.links = canvas.links;
    this.diagramId = canvas.id;
    this.diagramName = canvas.name;
    this.saveName = canvas.name;
    this.#createdAt = canvas.createdAt;
    this.#updatedAt = canvas.updatedAt;
    this.scopeOpen = NONE_ID;
    this.selected = NONE_ID;
    this.selectedLink = null;
    this.linkingFrom = null;
    this.resetView();
    this.notify();
  }
}

export const APP_STATE_KEY = "app-state";

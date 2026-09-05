import { type BlockDef, type BlockParameterDef, blockAttribute } from "@bld/xml/blocks/ast";
import { associateBuiltinModels, xmlSourcesForFiles } from "@bld/xml/blocks/builtin";
import { Catalog } from "@bld/xml/blocks/catalog";
import { PERIOD_PARAM, PIN_PARAM, WINDOW_PARAM, METER_PARAM, ZETA_PARAM, isEventDrivenGenerator, periodMsFrom, pinFrom, windowSecondsFrom, meterMsFrom, zetaFrom } from "@bld/xml/blocks/cs/ids";
import { Diagram, type Link, type XmlSource, linksEqual } from "@bld/xml/blocks/diagram";
import { compactLinkSlots } from "@bld/xml/blocks/ports";
import type { ResolvedBlock } from "@bld/xml/blocks/resolve";
import { loadDiagramSolution } from "@bld/xml/diagram/compile";
import { blockXmlId, newDiagramId } from "@bld/xml/diagram/ids";
import { type DiagramRepository, defaultDiagramRepository } from "@bld/xml/diagram/store";
import type { BlockExtras, ParameterValue } from "@bld/xml/diagram/types";
import { documentToCanvas, nowIso } from "@bld/xml/diagram/xml";
import { DiagramModel, type BlockInstance } from "./diagram-model";
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
import { catalogChoices, type CatalogChoice } from "./state/catalog";
import { DiagramIo } from "./state/io";
import { RunSession } from "./state/run";
import { DeploySession } from "./state/deploy";
import { portAcceptsMany, remapSelectedLink, WiringGraph } from "./wiring";

export type { BlockInstance, CatalogChoice };
export type { DiagramIoMode } from "./state/io";

export interface LinkingFrom {
  blockId: number;
  port: string;
}

export class AppState extends ObservableState {
  readonly run: RunSession;
  readonly io: DiagramIo;
  readonly deploy: DeploySession;

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
  declare inputsOpen: number;
  declare diagramId: string;
  declare diagramName: string;

  #diagram = new DiagramModel();
  #createdAt = nowIso();
  #updatedAt = this.#createdAt;
  #extras = new Map<number, BlockExtras>();
  #gpioLevels = new Map<number, boolean>();

  constructor(repo: DiagramRepository = defaultDiagramRepository()) {
    super();
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
      inputsOpen: NONE_ID,
      diagramId: newDiagramId(),
      diagramName: "Workspace",
    });
    this.run = new RunSession(this);
    this.io = new DiagramIo(this, repo);
    this.deploy = new DeploySession({
      notify: () => this.notify(),
      prodWasm: () => this.run.prodWasm(),
    });
  }

  get createdAt(): string {
    return this.#createdAt;
  }

  get updatedAt(): string {
    return this.#updatedAt;
  }

  extras(): Map<number, BlockExtras> {
    return this.#extras;
  }

  touch(): void {
    this.#updatedAt = nowIso();
  }

  toDiagramXml(): string {
    return this.io.toXml();
  }

  clearRunError(): void {
    this.run.error = null;
  }

  runNodes(): Array<{
    id: number;
    defId: string;
    periodMs?: number;
    pin?: number;
    zeta?: number;
    windowS?: number;
    meterMs?: number;
  }> {
    return this.blocks.map((block) => ({
      ...block,
      periodMs: this.blockPeriodMs(block.id),
      pin: this.blockPin(block.id),
      zeta: this.blockZeta(block.id),
      windowS: this.blockWindowS(block.id),
      meterMs: this.blockMeterMs(block.id),
    }));
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
    this.#ensureBlockExtras(block.id, defId);
    this.touch();
    this.selectBlock(block.id);
    this.run.invalidate();
    this.run.maybePreload();
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
    this.run.stop();
    this.#diagram.clear();
    this.#extras.clear();
    this.#gpioLevels.clear();
    this.links = [];
    this.#clearInteraction();
    this.io.error = null;
    this.run.error = null;
    this.#resetIdentity();
    this.resetView();
    this.notify();
  }

  removeBlock(id: number): void {
    if (!this.#diagram.remove(id)) {
      return;
    }
    this.#forgetBlock(id);
    this.#replaceLinks(this.#wiring().withoutBlock(id).links);
    this.#extras.delete(id);
    this.#gpioLevels.delete(id);
    this.touch();
    this.notify();
    this.run.invalidate();
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
    this.run.invalidate();
  }

  resolveAll(): Map<number, ResolvedBlock> {
    return loadDiagramSolution(this.io.toXml(), this.catalog).inferred;
  }

  applyIdentity(id: string, name: string): void {
    this.diagramId = id;
    this.diagramName = name;
    this.io.saveName = name;
  }

  applyCanvas(canvas: ReturnType<typeof documentToCanvas>): void {
    this.run.stop();
    this.#diagram.replace(canvas.blocks);
    this.#diagram.nextId = canvas.nextId;
    this.#extras = new Map(canvas.extras);
    this.#gpioLevels.clear();
    this.links = canvas.links;
    this.diagramId = canvas.id;
    this.diagramName = canvas.name;
    this.io.saveName = canvas.name;
    this.#createdAt = canvas.createdAt;
    this.#updatedAt = canvas.updatedAt;
    this.#clearInteraction();
    this.resetView();
    this.notify();
  }

  openScope(id: number): void {
    if (!this.run.isScopeLive(id)) {
      return;
    }
    if (this.block(id)?.defId === "scope") {
      this.scopeOpen = id;
    }
  }

  closeScope(): void {
    this.scopeOpen = NONE_ID;
  }

  openInputs(id: number): void {
    if (this.run.busy()) {
      return;
    }
    const block = this.block(id);
    const def = block ? this.blockDef(block.defId) : undefined;
    if (!def?.parameters.length) {
      return;
    }
    this.inputsOpen = id;
  }

  closeInputs(): void {
    this.inputsOpen = NONE_ID;
  }

  blockInputs(id: number): { def: BlockParameterDef; value: string }[] {
    const block = this.block(id);
    const def = block ? this.blockDef(block.defId) : undefined;
    if (!def) {
      return [];
    }
    const extra = this.#ensureBlockExtras(id, block?.defId);
    return def.parameters.map((param) => ({
      def: param,
      value: extra.parameters.find((item) => item.name === param.name)?.value ?? param.default ?? "",
    }));
  }

  setBlockParameter(id: number, name: string, value: string): void {
    const extra = this.#ensureBlockExtras(id);
    const now = nowIso();
    const existing = extra.parameters.find((param) => param.name === name);
    if (existing) {
      existing.value = value;
      extra.updatedAt = now;
    } else {
      const def = this.blockDef(this.block(id)?.defId ?? "")?.parameters.find((param) => param.name === name);
      extra.parameters.push({
        id: `prm_${id}_${name}`,
        createdAt: now,
        updatedAt: now,
        kind: def?.kind ?? "text-parameter",
        name,
        value,
        attributes: [],
      });
    }
    this.touch();
    this.notify();
    this.run.invalidate();
  }

  blockPeriodMs(id: number): number {
    if (isEventDrivenGenerator(this.block(id)?.defId ?? "")) {
      return 0;
    }
    const extra = this.#extras.get(id);
    const value = extra?.parameters.find((param) => param.name === PERIOD_PARAM)?.value;
    return periodMsFrom(value);
  }

  blockPin(id: number): number {
    const extra = this.#extras.get(id);
    const value = extra?.parameters.find((param) => param.name === PIN_PARAM)?.value;
    const defId = this.block(id)?.defId;
    const fallback = defId === "gpio_out" ? 1 : 0;
    return value == null && defId === "gpio_out" ? fallback : pinFrom(value ?? fallback);
  }

  blockZeta(id: number): number | undefined {
    if (this.block(id)?.defId !== "overshoot") {
      return undefined;
    }
    const extra = this.#extras.get(id);
    const value = extra?.parameters.find((param) => param.name === ZETA_PARAM)?.value;
    return zetaFrom(value);
  }

  blockWindowS(id: number): number | undefined {
    if (this.block(id)?.defId !== "scope") {
      return undefined;
    }
    const extra = this.#extras.get(id);
    const value = extra?.parameters.find((param) => param.name === WINDOW_PARAM)?.value;
    return windowSecondsFrom(value);
  }

  blockMeterMs(id: number): number | undefined {
    if (this.block(id)?.defId !== "scope") {
      return undefined;
    }
    const extra = this.#extras.get(id);
    const value = extra?.parameters.find((param) => param.name === METER_PARAM)?.value;
    return meterMsFrom(value);
  }

  gpioOn(id: number): boolean {
    const pin = this.blockPin(id);
    if (this.run.busy()) {
      return (this.run.gpioLevel(pin) ?? 0) !== 0;
    }
    return this.#gpioLevels.get(id) ?? false;
  }

  toggleGpio(id: number): void {
    if (this.block(id)?.defId !== "gpio_in") {
      return;
    }
    const next = !this.gpioOn(id);
    this.#gpioLevels.set(id, next);
    this.run.setGpio(this.blockPin(id), next ? 1 : 0);
    this.run.tick(id);
    this.notify();
  }

  gpioSnapshot(): Map<number, number> {
    const levels = new Map<number, number>();
    for (const block of this.blocks) {
      if (block.defId !== "gpio_in" && block.defId !== "gpio_out") {
        continue;
      }
      levels.set(this.blockPin(block.id), this.#gpioLevels.get(block.id) ? 1 : 0);
    }
    return levels;
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
    this.run.invalidate();
    this.run.maybePreload();
  }

  #replaceLinks(remaining: Link[], removed?: Link): void {
    const compacted = compactLinkSlots(remaining, (id) => {
      const block = this.block(id);
      return block ? { x: block.x, y: block.y } : undefined;
    });
    this.selectedLink = remapSelectedLink(remaining, compacted, this.selectedLink, removed);
    this.links = compacted;
    this.touch();
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
    this.io.saveName = "Workspace";
    this.#createdAt = now;
    this.#updatedAt = now;
  }

  #touchBlock(id: number): void {
    const extra = this.#ensureBlockExtras(id);
    extra.updatedAt = nowIso();
    this.touch();
  }

  #ensureBlockExtras(id: number, defId?: string): BlockExtras {
    let extra = this.#extras.get(id);
    if (!extra) {
      const now = nowIso();
      extra = {
        xmlId: blockXmlId(id),
        createdAt: now,
        updatedAt: now,
        attributes: [],
        parameters: this.#defaultParameters(id, defId ?? this.block(id)?.defId),
      };
      this.#extras.set(id, extra);
    } else if (extra.parameters.length === 0) {
      extra.parameters = this.#defaultParameters(id, defId ?? this.block(id)?.defId);
    }
    return extra;
  }

  #defaultParameters(id: number, defId: string | undefined): ParameterValue[] {
    const def = defId ? this.blockDef(defId) : undefined;
    const now = nowIso();
    return (def?.parameters ?? []).map((param) => ({
      id: `prm_${id}_${param.name}`,
      createdAt: now,
      updatedAt: now,
      kind: param.kind,
      name: param.name,
      value: param.default ?? "",
      attributes: [],
    }));
  }

  catalogChoices(): CatalogChoice[] {
    return catalogChoices(this.catalog);
  }

  toggleCatalog(file: string): void {
    try {
      const selected = this.sources.some((source) => source.name === file);
      if (selected) {
        this.#applySources(this.sources.filter((source) => source.name !== file));
      } else {
        this.#applySources([...this.sources, ...xmlSourcesForFiles([file])]);
      }
      this.touch();
      this.notify();
    } catch (error) {
      this.io.error = error instanceof Error ? error.message : "Catalog change failed";
    }
  }

  #applySources(sources: XmlSource[]): void {
    const catalog = new Catalog();
    for (const source of sources) {
      catalog.addXml(source.name, source.content);
    }
    const known = new Set(catalog.blocks().map((block) => block.id));
    const kept = this.blocks.filter((block) => known.has(block.defId));
    const live = new Set(kept.map((block) => block.id));
    this.catalog = catalog;
    this.sources = [...sources];
    this.#diagram.replace(kept);
    this.#extras = new Map([...this.#extras].filter(([id]) => live.has(id)));
    this.links = this.links.filter((link) => live.has(link.fromBlock) && live.has(link.toBlock));
    this.#retainLiveBlocks(live);
    this.run.invalidate();
  }

  #clearInteraction(): void {
    this.scopeOpen = NONE_ID;
    this.inputsOpen = NONE_ID;
    this.selected = NONE_ID;
    this.selectedLink = null;
    this.linkingFrom = null;
  }

  #forgetBlock(id: number): void {
    if (this.scopeOpen === id) {
      this.scopeOpen = NONE_ID;
    }
    if (this.inputsOpen === id) {
      this.inputsOpen = NONE_ID;
    }
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

  #retainLiveBlocks(live: Set<number>): void {
    if (this.selected !== NONE_ID && !live.has(this.selected)) {
      this.selected = NONE_ID;
    }
    if (this.selectedLink && (!live.has(this.selectedLink.fromBlock) || !live.has(this.selectedLink.toBlock))) {
      this.selectedLink = null;
    }
    if (this.linkingFrom && !live.has(this.linkingFrom.blockId)) {
      this.linkingFrom = null;
    }
    if (this.scopeOpen !== NONE_ID && !live.has(this.scopeOpen)) {
      this.scopeOpen = NONE_ID;
    }
    if (this.inputsOpen !== NONE_ID && !live.has(this.inputsOpen)) {
      this.inputsOpen = NONE_ID;
    }
  }
}

export const APP_STATE_KEY = "app-state";

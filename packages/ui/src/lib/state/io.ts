import { catalogFromFiles, xmlSourcesForFiles } from "@bld/xml/blocks/builtin";
import type { Catalog } from "@bld/xml/blocks/catalog";
import type { Link, XmlSource } from "@bld/xml/blocks/diagram";
import { diagramFilename, downloadTextFile } from "@bld/xml/diagram/download";
import {
  type DiagramRepository,
  type StoredDiagram,
  defaultDiagramRepository,
} from "@bld/xml/diagram/store";
import type { BlockExtras } from "@bld/xml/diagram/types";
import { documentToCanvas, parseDiagramXml, serializeCanvas } from "@bld/xml/diagram/xml";
import type { BlockInstance } from "../diagram-model";

export type DiagramIoMode = "closed" | "save" | "open";

export interface IoHost {
  notify(): void;
  catalog: Catalog;
  sources: XmlSource[];
  links: Link[];
  blocks: BlockInstance[];
  extras(): Map<number, BlockExtras>;
  applyCanvas(canvas: ReturnType<typeof documentToCanvas>): void;
  applyIdentity(id: string, name: string): void;
  clearRunError(): void;
  get diagramId(): string;
  get diagramName(): string;
  set diagramName(name: string);
  get createdAt(): string;
  get updatedAt(): string;
  touch(): void;
}

/** Save / open / import / export. Keeps IndexedDB and diagram XML off the run path. */
export class DiagramIo {
  #host: IoHost;
  #repo: DiagramRepository;
  #mode: DiagramIoMode = "closed";
  #error: string | null = null;
  #saveName = "Workspace";
  savedDiagrams: StoredDiagram[] = [];

  constructor(host: IoHost, repo: DiagramRepository = defaultDiagramRepository()) {
    this.#host = host;
    this.#repo = repo;
  }

  get mode(): DiagramIoMode {
    return this.#mode;
  }

  set mode(value: DiagramIoMode) {
    if (this.#mode === value) {
      return;
    }
    this.#mode = value;
    this.#host.notify();
  }

  get error(): string | null {
    return this.#error;
  }

  set error(value: string | null) {
    if (this.#error === value) {
      return;
    }
    this.#error = value;
    this.#host.notify();
  }

  get saveName(): string {
    return this.#saveName;
  }

  set saveName(value: string) {
    if (this.#saveName === value) {
      return;
    }
    this.#saveName = value;
    this.#host.notify();
  }

  toXml(): string {
    return serializeCanvas({
      id: this.#host.diagramId,
      name: this.#host.diagramName,
      createdAt: this.#host.createdAt,
      updatedAt: this.#host.updatedAt,
      catalogs: this.#host.sources.map((source) => source.name),
      blocks: this.#host.blocks,
      links: this.#host.links,
      extras: this.#host.extras(),
    });
  }

  loadXml(xml: string): boolean {
    try {
      const canvas = documentToCanvas(parseDiagramXml(xml));
      const sources = xmlSourcesForFiles(canvas.catalogs);
      const catalog = catalogFromFiles(canvas.catalogs);
      const unknown = canvas.blocks.find((block) => !catalog.block(block.defId));
      if (unknown) {
        throw new Error(`unknown block type \`${unknown.defId}\``);
      }
      this.#host.sources = sources;
      this.#host.catalog = catalog;
      this.#host.applyCanvas(canvas);
      this.#error = null;
      this.#host.clearRunError();
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Invalid diagram XML";
      return false;
    }
  }

  exportFile(): void {
    downloadTextFile(diagramFilename(this.#host.diagramName), this.toXml());
  }

  openSave(): void {
    this.#saveName = this.#host.diagramName;
    this.#error = null;
    this.mode = "save";
  }

  async openLibrary(): Promise<void> {
    this.#error = null;
    this.mode = "open";
    await this.refreshLibrary();
  }

  close(): void {
    this.#mode = "closed";
    this.#error = null;
    this.#host.notify();
  }

  async refreshLibrary(): Promise<void> {
    this.savedDiagrams = await this.#repo.list();
    this.#host.notify();
  }

  async save(name = this.#saveName): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) {
      this.error = "Name is required";
      return false;
    }
    this.#host.diagramName = trimmed;
    this.#saveName = trimmed;
    this.#host.touch();
    try {
      await this.#repo.save({
        id: this.#host.diagramId,
        name: trimmed,
        xml: this.toXml(),
        createdAt: this.#host.createdAt,
        updatedAt: this.#host.updatedAt,
      });
      this.#error = null;
      this.#mode = "closed";
      await this.refreshLibrary();
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Save failed";
      return false;
    }
  }

  async load(id: string): Promise<boolean> {
    try {
      const record = await this.#repo.get(id);
      if (!record) {
        this.error = "Diagram not found";
        return false;
      }
      if (!this.loadXml(record.xml)) {
        return false;
      }
      this.#host.applyIdentity(record.id, record.name);
      this.#mode = "closed";
      this.#host.notify();
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Load failed";
      return false;
    }
  }

  async remove(id: string): Promise<void> {
    await this.#repo.remove(id);
    await this.refreshLibrary();
  }
}

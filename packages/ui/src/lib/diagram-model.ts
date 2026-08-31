import type { BlockInstance } from "@bld/xml";

export type { BlockInstance };

/** Placed blocks with O(1) lookup. `blocks` stays an array for rendering order. */
export class DiagramModel {
  #blocks: BlockInstance[] = [];
  #byId = new Map<number, BlockInstance>();
  #nextId = 1;

  get blocks(): BlockInstance[] {
    return this.#blocks;
  }

  get nextId(): number {
    return this.#nextId;
  }

  set nextId(value: number) {
    this.#nextId = value;
  }

  block(id: number): BlockInstance | undefined {
    return this.#byId.get(id);
  }

  replace(blocks: readonly BlockInstance[]): void {
    this.#blocks = [...blocks];
    this.#byId = new Map(this.#blocks.map((block) => [block.id, block]));
  }

  add(defId: string, x: number, y: number): BlockInstance {
    const id = this.#nextId;
    this.#nextId = id + 1;
    const block: BlockInstance = { id, defId, x, y };
    this.replace([...this.#blocks, block]);
    return block;
  }

  remove(id: number): boolean {
    if (!this.#byId.has(id)) {
      return false;
    }
    this.replace(this.#blocks.filter((block) => block.id !== id));
    return true;
  }

  moveBy(id: number, dx: number, dy: number): void {
    this.replace(this.#blocks.map((item) => (item.id === id ? { ...item, x: item.x + dx, y: item.y + dy } : item)));
  }

  moveTo(id: number, x: number, y: number): void {
    this.replace(this.#blocks.map((item) => (item.id === id ? { ...item, x, y } : item)));
  }

  clear(): void {
    this.#blocks = [];
    this.#byId.clear();
    this.#nextId = 1;
  }
}

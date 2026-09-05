import { fork } from "./generators";
import { SampleBuf } from "./samples";
import { mapOnce, OvershootTransformer } from "./transformers";
import type { F64Func, ScopeChannel } from "./types";

/** Push-model consumer tree: `timer(sin(fork(plot[0], plot[1])))`. */
export abstract class ConsumerNode {
  abstract readonly kind: "scope" | "fork" | "map" | "product";

  abstract collectChannels(label: string): ScopeChannel[];

  abstract compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func;

  collectScopeIds(): number[] {
    return [...new Set(this.collectChannels("out").map((channel) => channel.scopeId))];
  }
}

export class ScopeSink extends ConsumerNode {
  readonly kind = "scope" as const;

  constructor(readonly id: number) {
    super();
  }

  collectChannels(label: string): ScopeChannel[] {
    return [{ scopeId: this.id, label }];
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    const ring = next.n;
    next.n += 1;
    const leaf = buffers.get(ring);
    return (value) => leaf?.push(value);
  }
}

export class ForkNode extends ConsumerNode {
  readonly kind = "fork" as const;

  constructor(readonly inner: ConsumerNode[]) {
    super();
  }

  collectChannels(label: string): ScopeChannel[] {
    return this.inner.flatMap((child) => child.collectChannels(label));
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    return fork(...this.inner.map((child) => child.compile(buffers, next)));
  }
}

export class MapNode extends ConsumerNode {
  readonly kind = "map" as const;
  readonly zeta?: number;
  readonly omega?: number;
  readonly timeInput?: boolean;

  constructor(
    readonly defId: string,
    readonly id: number,
    readonly inner: ConsumerNode,
    zeta?: number,
    omega?: number,
    timeInput?: boolean,
  ) {
    super();
    this.zeta = zeta;
    this.omega = omega;
    if (timeInput === false) {
      this.timeInput = false;
    }
  }

  collectChannels(_label: string): ScopeChannel[] {
    return this.inner.collectChannels(this.defId);
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    const inner = this.inner.compile(buffers, next);
    if (this.defId === "overshoot") {
      return new OvershootTransformer(this.zeta, this.omega, this.timeInput ?? true).wrap(inner);
    }
    return (value) => inner(mapOnce(this.defId, value));
  }
}

/** Shared factor slots for one product block. Downstream is compiled once. */
export class ProductGroup {
  readonly values: number[];
  minSlot = Number.POSITIVE_INFINITY;
  private sink: F64Func | undefined;

  constructor(
    readonly id: number,
    count: number,
    readonly def: number,
    readonly inner: ConsumerNode,
  ) {
    this.values = Array.from({ length: Math.max(count, 1) }, () => def);
  }

  noteSlot(slot: number): void {
    this.minSlot = Math.min(this.minSlot, slot);
    while (this.values.length <= slot) {
      this.values.push(this.def);
    }
  }

  collectFrom(slot: number): ScopeChannel[] {
    return slot === this.minSlot ? this.inner.collectChannels("product") : [];
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    this.sink ??= this.inner.compile(buffers, next);
    return this.sink;
  }

  accept(slot: number, value: number): void {
    this.values[slot] = value;
    let p = 1;
    for (const item of this.values) {
      p *= item;
    }
    this.sink?.(p);
  }
}

export class ProductSlot extends ConsumerNode {
  readonly kind = "product" as const;

  constructor(
    readonly group: ProductGroup,
    readonly slot: number,
  ) {
    super();
    this.group.noteSlot(slot);
  }

  get id(): number {
    return this.group.id;
  }

  collectChannels(_label: string): ScopeChannel[] {
    return this.group.collectFrom(this.slot);
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    this.group.compile(buffers, next);
    return (value) => this.group.accept(this.slot, value);
  }
}

export type ConsumerTree = ScopeSink | ForkNode | MapNode | ProductSlot;

export function collectChannels(tree: ConsumerTree, label = "out"): ScopeChannel[] {
  return tree.collectChannels(label);
}

export function collectScopeIds(tree: ConsumerTree): number[] {
  return tree.collectScopeIds();
}

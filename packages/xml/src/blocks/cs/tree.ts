import { fork } from "./generators";
import { SampleBuf } from "./samples";
import { mapOnce, OvershootTransformer } from "./transformers";
import type { F64Func, ScopeChannel } from "./types";

/** Push-model consumer tree: `timer(sin(fork(plot[0], plot[1])))`. */
export abstract class ConsumerNode {
  abstract readonly kind: "scope" | "fork" | "map";

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

  constructor(
    readonly defId: string,
    readonly id: number,
    readonly inner: ConsumerNode,
    readonly zeta?: number,
    readonly omega?: number,
  ) {
    super();
  }

  collectChannels(_label: string): ScopeChannel[] {
    return this.inner.collectChannels(this.defId);
  }

  compile(buffers: Map<number, SampleBuf>, next: { n: number }): F64Func {
    const inner = this.inner.compile(buffers, next);
    if (this.defId === "overshoot") {
      return new OvershootTransformer(this.zeta, this.omega).wrap(inner);
    }
    return (value) => inner(mapOnce(this.defId, value));
  }
}

export type ConsumerTree = ScopeSink | ForkNode | MapNode;

export function collectChannels(tree: ConsumerTree, label = "out"): ScopeChannel[] {
  return tree.collectChannels(label);
}

export function collectScopeIds(tree: ConsumerTree): number[] {
  return tree.collectScopeIds();
}

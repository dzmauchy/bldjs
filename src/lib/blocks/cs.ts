import type { Link } from "./diagram";

export const QUANTIZER_DELAY_MS = 10;
const SAMPLE_CAP = 480;

/** Java `Consumer<T>`. */
export type Consumer<T> = (value: T) => void;
export type DoubleConsumer = Consumer<number>;
/** Java `Consumer<Consumer<Double>>` — a push source. */
export type DoubleSource = Consumer<DoubleConsumer>;

/**
 * Nested `Consumer` expression. Depth matches the catalog:
 *   Nested<3> = c<c<c<f64>>>  (Timer)       — Consumer<Consumer<Consumer<Double>>>
 *   Nested<2> = c<c<f64>>     (Quantizer)   — Consumer<Consumer<Double>>
 *   Nested<1> = c<f64>        (Sin / Scope) — Consumer<Double> / DoubleConsumer
 *
 * The payload is always a source; each function peels one Consumer layer
 * so `oscilloscope(sin(quantizer(timer())))` type-checks like Java.
 */
export interface Nested<D extends 1 | 2 | 3> {
  readonly depth: D;
  readonly source: DoubleSource;
}

export function timer(now: () => number = nowSecs): Nested<3> {
  return { depth: 3, source: (sink) => sink(now()) };
}

export function quantizer(input: Nested<3>, delayMs = QUANTIZER_DELAY_MS): Nested<2> {
  return {
    depth: 2,
    source: (sink) => {
      input.source((value) => {
        park(delayMs);
        sink(value);
      });
    },
  };
}

export function sin(input: Nested<2>): Nested<1> {
  return {
    depth: 1,
    source: (sink) => input.source((value) => sink(Math.sin(value))),
  };
}

export function oscilloscope(input: Nested<1>, sink: DoubleConsumer): void {
  input.source(sink);
}

function park(delayMs: number): void {
  if (delayMs <= 0) {
    return;
  }
}

export class SampleBuf {
  private inner: number[] = [];

  push(value: number): void {
    if (this.inner.length >= SAMPLE_CAP) {
      this.inner.shift();
    }
    this.inner.push(value);
  }

  snapshot(): number[] {
    return [...this.inner];
  }

  clear(): void {
    this.inner = [];
  }
}

export function nowSecs(): number {
  return Date.now() / 1000;
}

export function sinConsumer(sink: DoubleConsumer): DoubleConsumer {
  return (value) => sink(Math.sin(value));
}

type Stage = "sin" | "quantizer";

export interface NodeSpec {
  id: number;
  defId: string;
}

export interface CompiledTimer {
  emit: DoubleConsumer;
  delayMs: number;
}

export function compileTimer(
  timerId: number,
  nodes: NodeSpec[],
  links: Link[],
  buffers: Map<number, SampleBuf>,
): CompiledTimer | undefined {
  const defOf = (id: number): string | undefined => nodes.find((node) => node.id === id)?.defId;
  const outgoing = (from: number, port: string): Link | undefined =>
    links.find((link) => link.fromBlock === from && link.fromOut === port);

  const stages: Stage[] = [];
  let cursor = timerId;
  let scopeId: number | undefined;
  for (let i = 0; i < 64; i += 1) {
    const link = outgoing(cursor, "out");
    if (!link) {
      break;
    }
    const toDef = defOf(link.toBlock);
    if (!toDef) {
      return undefined;
    }
    if (toDef === "quantizer" || toDef === "sin") {
      stages.push(toDef);
      cursor = link.toBlock;
    } else if (toDef === "oscilloscope") {
      scopeId = link.toBlock;
      break;
    } else {
      break;
    }
  }
  if (scopeId === undefined) {
    return undefined;
  }
  const buf = buffers.get(scopeId);
  if (!buf) {
    return undefined;
  }
  let emit: DoubleConsumer = (value) => buf.push(value);
  let delayMs = 0;
  for (const stage of [...stages].reverse()) {
    if (stage === "sin") {
      emit = sinConsumer(emit);
    } else {
      delayMs += QUANTIZER_DELAY_MS;
    }
  }
  return { emit, delayMs };
}

export function spawnTimer(compiled: CompiledTimer, running: { value: boolean }): () => void {
  const delay = Math.max(compiled.delayMs, 1);
  const tick = () => {
    if (!running.value) {
      return;
    }
    compiled.emit(nowSecs());
    handle = setTimeout(tick, delay);
  };
  let handle: ReturnType<typeof setTimeout> | undefined = setTimeout(tick, 0);
  return () => {
    running.value = false;
    if (handle !== undefined) {
      clearTimeout(handle);
    }
  };
}

export function stop(running: { value: boolean }): void {
  running.value = false;
}

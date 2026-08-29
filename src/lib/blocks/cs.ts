import type { Link } from "./diagram";

export const QUANTIZER_DELAY_MS = 10;
const SAMPLE_CAP = 480;

export type DoubleConsumer = (value: number) => void;
export type DoubleSource = (dc: DoubleConsumer) => void;

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

/** Java `Consumer<DoubleConsumer> c(long delay, Consumer<DoubleConsumer> consumer)`. */
export function quantizerSource(delayMs: number, consumer: DoubleSource): DoubleSource {
  return (dc: DoubleConsumer) => {
    consumer((value) => {
      dc(value);
      park(delayMs);
    });
  };
}

export function sinSource(consumer: DoubleSource): DoubleSource {
  return (dc: DoubleConsumer) => {
    consumer((value) => dc(Math.sin(value)));
  };
}

export function timerSource(running: { value: boolean }): DoubleSource {
  return (dc: DoubleConsumer) => {
    while (running.value) {
      dc(nowSecs());
    }
  };
}

function park(delayMs: number): void {
  if (delayMs <= 0) {
    return;
  }
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
  const incoming = (to: number, port: string): Link | undefined =>
    links.find((link) => link.toBlock === to && link.toIn === port);

  const stages: Stage[] = [];
  let cursor = timerId;
  let port = "consumer";
  let scopeId: number | undefined;
  for (let i = 0; i < 64; i += 1) {
    const link = incoming(cursor, port);
    if (!link) {
      break;
    }
    const fromDef = defOf(link.fromBlock);
    if (!fromDef) {
      return undefined;
    }
    if (fromDef === "quantizer") {
      stages.push("quantizer");
      cursor = link.fromBlock;
      port = "consumer";
    } else if (fromDef === "sin") {
      stages.push("sin");
      cursor = link.fromBlock;
      port = "in";
    } else if (fromDef === "oscilloscope") {
      scopeId = link.fromBlock;
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

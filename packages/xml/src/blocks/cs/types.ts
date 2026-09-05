/** MoonBit consumer `(T) -> Unit`. */
export type Func<T> = (value: T) => void;
/** Catalog `(Double) -> Unit`. */
export type DoubleConsumer = Func<number>;
export type F64Func = DoubleConsumer;
/** @deprecated Push model uses {@link DoubleConsumer} on every port. */
export type DoubleSource = DoubleConsumer;
export type F64Source = DoubleConsumer;
/** @deprecated Same as {@link DoubleConsumer}. */
export type Nested = DoubleConsumer;

export interface NodeSpec {
  id: number;
  defId: string;
  periodMs?: number;
  pin?: number;
}

import type { ConsumerTree } from "./tree";

/** Push-model consumer tree: `timer(sin(fork(plot[0], plot[1])))`. */
export type { ConsumerTree };

/** One ring / plot channel on a scope. */
export interface ScopeChannel {
  scopeId: number;
  label: string;
}

/** Live samples for one multi-axis dataset. */
export interface ScopeSeries {
  label: string;
  samples: number[];
}

export interface GeneratorPlan {
  generatorId: number;
  /** @deprecated Use {@link generatorId}. */
  timerId: number;
  defId: string;
  scopeId: number;
  scopeIds: number[];
  channels: ScopeChannel[];
  delayMs: number;
  tree: ConsumerTree;
}

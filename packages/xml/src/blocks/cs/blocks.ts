import {
  DEFAULT_COUNT,
  DEFAULT_OMEGA,
  DEFAULT_PERIOD_MS,
  DEFAULT_PIN,
  DEFAULT_VALUE,
  DEFAULT_WINDOW_S,
  DEFAULT_METER_MS,
  DEFAULT_ZETA,
  countFrom,
  defFrom,
  omegaFrom,
  periodMsFrom,
  pinFrom,
  valueFrom,
  zetaFrom,
} from "./ids";
import { overshootStep } from "./transformers";
import { nowSecs } from "./generators";
import { portSlotIndex } from "../ports";

export interface BlockPort {
  readonly name: string;
  readonly direction: "in" | "out";
  readonly type: string;
}

export interface BlockConnection {
  readonly fromPort: string;
  readonly targetBlock: AbstractBlock;
  readonly toPort: string;
}

/**
 * Base TypeScript block representing an XML block in the catalog.
 * Handles port connections and signal routing/handling.
 */
export abstract class AbstractBlock {
  abstract readonly defId: string;
  abstract readonly name: string;
  id: number;

  abstract readonly inputs: readonly BlockPort[];
  abstract readonly outputs: readonly BlockPort[];

  private readonly _connections: BlockConnection[] = [];

  constructor(id = 0) {
    this.id = id;
  }

  get connections(): readonly BlockConnection[] {
    return this._connections;
  }

  connect(fromPort: string, targetBlock: AbstractBlock, toPort: string): this {
    const existing = this._connections.find(
      (c) => c.fromPort === fromPort && c.targetBlock === targetBlock && c.toPort === toPort,
    );
    if (!existing) {
      this._connections.push({ fromPort, targetBlock, toPort });
    }
    return this;
  }

  disconnect(fromPort: string, targetBlock: AbstractBlock, toPort: string): this {
    const index = this._connections.findIndex(
      (c) => c.fromPort === fromPort && c.targetBlock === targetBlock && c.toPort === toPort,
    );
    if (index >= 0) {
      this._connections.splice(index, 1);
    }
    return this;
  }

  sendSignal(fromPort: string, value: number): void {
    for (const conn of this._connections) {
      if (conn.fromPort === fromPort || conn.fromPort.startsWith(fromPort)) {
        conn.targetBlock.handleSignal(conn.toPort, value);
      }
    }
  }

  abstract handleSignal(toPort: string, value: number): void;
}

export class TimerBlock extends AbstractBlock {
  readonly defId = "timer";
  readonly name = "Timer";
  periodMs: number;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, periodMs = DEFAULT_PERIOD_MS) {
    super(id);
    this.periodMs = periodMsFrom(periodMs);
  }

  sample(time: number = nowSecs()): number {
    return time;
  }

  tick(time: number = nowSecs()): number {
    const val = this.sample(time);
    this.sendSignal("in", val);
    this.sendSignal("out", val);
    return val;
  }

  handleSignal(toPort: string, value: number): void {
    this.sendSignal("out", value);
  }
}

export class RandomBlock extends AbstractBlock {
  readonly defId = "random";
  readonly name = "Random";
  periodMs: number;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, periodMs = DEFAULT_PERIOD_MS) {
    super(id);
    this.periodMs = periodMsFrom(periodMs);
  }

  sample(): number {
    return Math.random();
  }

  tick(): number {
    const val = this.sample();
    this.sendSignal("in", val);
    this.sendSignal("out", val);
    return val;
  }

  handleSignal(toPort: string, value: number): void {
    this.sendSignal("out", value);
  }
}

export class ConstantBlock extends AbstractBlock {
  readonly defId = "constant";
  readonly name = "Constant";
  value: number;
  periodMs: number;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, value = DEFAULT_VALUE, periodMs = DEFAULT_PERIOD_MS) {
    super(id);
    this.value = valueFrom(value);
    this.periodMs = periodMsFrom(periodMs);
  }

  sample(): number {
    return this.value;
  }

  tick(): number {
    const val = this.sample();
    this.sendSignal("in", val);
    this.sendSignal("out", val);
    return val;
  }

  handleSignal(toPort: string, value: number): void {
    this.sendSignal("out", value);
  }
}

export class GpioInBlock extends AbstractBlock {
  readonly defId = "gpio_in";
  readonly name = "GPIO In";
  pin: number;
  private _level = 0;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, pin = DEFAULT_PIN) {
    super(id);
    this.pin = pinFrom(pin);
  }

  get level(): number {
    return this._level;
  }

  setLevel(level: number): void {
    this._level = level ? 1 : 0;
    this.sendSignal("in", this._level);
    this.sendSignal("out", this._level);
  }

  sample(): number {
    return this._level;
  }

  handleSignal(toPort: string, value: number): void {
    this.setLevel(value > 0.5 ? 1 : 0);
  }
}

export class GpioOutBlock extends AbstractBlock {
  readonly defId = "gpio_out";
  readonly name = "GPIO Out";
  pin: number;
  private _level = 0;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, pin = 1) {
    super(id);
    this.pin = pinFrom(pin);
  }

  get level(): number {
    return this._level;
  }

  getLevel(): number {
    return this._level;
  }

  handleSignal(toPort: string, value: number): void {
    this._level = value > 0.5 ? 1 : 0;
    this.sendSignal("out", this._level);
  }
}

export class SinBlock extends AbstractBlock {
  readonly defId = "sin";
  readonly name = "Sin";

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  map(value: number): number {
    return Math.sin(value);
  }

  handleSignal(toPort: string, value: number): void {
    const result = this.map(value);
    this.sendSignal("out", result);
  }
}

export class CosBlock extends AbstractBlock {
  readonly defId = "cos";
  readonly name = "Cos";

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  map(value: number): number {
    return Math.cos(value);
  }

  handleSignal(toPort: string, value: number): void {
    const result = this.map(value);
    this.sendSignal("out", result);
  }
}

export class OvershootBlock extends AbstractBlock {
  readonly defId = "overshoot";
  readonly name = "Overshoot";
  zeta: number;
  omega: number;
  timeInput: boolean;
  private t0?: number;

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "(Double) -> Unit" }];

  constructor(id = 0, zeta = DEFAULT_ZETA, omega = DEFAULT_OMEGA, timeInput = true) {
    super(id);
    this.zeta = zetaFrom(zeta);
    this.omega = omegaFrom(omega);
    this.timeInput = timeInput;
  }

  map(value: number): number {
    if (this.timeInput) {
      this.t0 ??= value;
      return overshootStep(value - this.t0, this.zeta, this.omega);
    }
    return overshootStep(value, this.zeta, this.omega);
  }

  reset(): void {
    this.t0 = undefined;
  }

  handleSignal(toPort: string, value: number): void {
    const result = this.map(value);
    this.sendSignal("out", result);
  }
}

export class ProductBlock extends AbstractBlock {
  readonly defId = "product";
  readonly name = "Product";
  count: number;
  def: number;
  private readonly slots: number[];

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "Array[(Double) -> Unit]" }];

  constructor(id = 0, count = DEFAULT_COUNT, def = DEFAULT_VALUE) {
    super(id);
    this.count = countFrom(count);
    this.def = defFrom(def);
    this.slots = Array.from({ length: this.count }, () => this.def);
  }

  setSlot(index: number, value: number): number {
    if (index >= 0 && index < this.slots.length) {
      this.slots[index] = value;
    }
    return this.product();
  }

  product(): number {
    let p = 1;
    for (const v of this.slots) {
      p *= v;
    }
    return p;
  }

  handleSignal(toPort: string, value: number): void {
    const slot = portSlotIndex(toPort);
    const p = this.setSlot(slot, value);
    this.sendSignal("in", p);
    this.sendSignal("out", p);
  }
}

export class ScopeBlock extends AbstractBlock {
  readonly defId = "scope";
  readonly name = "Scope";
  windowS: number;
  meterMs: number;
  private readonly channels = new Map<number, number[]>();

  readonly inputs: readonly BlockPort[] = [{ name: "in", direction: "in", type: "(Double) -> Unit" }];
  readonly outputs: readonly BlockPort[] = [{ name: "out", direction: "out", type: "Array[(Double) -> Unit]" }];

  constructor(id = 0, windowS = DEFAULT_WINDOW_S, meterMs = DEFAULT_METER_MS) {
    super(id);
    this.windowS = windowS;
    this.meterMs = meterMs;
  }

  record(channel: number, value: number): void {
    const samples = this.channels.get(channel) ?? [];
    samples.push(value);
    this.channels.set(channel, samples);
  }

  getSamples(channel = 0): readonly number[] {
    return this.channels.get(channel) ?? [];
  }

  latest(channel = 0): number | undefined {
    const samples = this.channels.get(channel);
    return samples && samples.length > 0 ? samples[samples.length - 1] : undefined;
  }

  clear(): void {
    this.channels.clear();
  }

  handleSignal(toPort: string, value: number): void {
    const slot = portSlotIndex(toPort);
    this.record(slot, value);
  }
}

export function connectBlocks(
  fromBlock: AbstractBlock,
  fromPort: string,
  toBlock: AbstractBlock,
  toPort: string,
): void {
  fromBlock.connect(fromPort, toBlock, toPort);
}

export interface BlockOptions {
  id?: number;
  periodMs?: number;
  pin?: number;
  zeta?: number;
  omega?: number;
  value?: number;
  count?: number;
  def?: number;
  windowS?: number;
  meterMs?: number;
  timeInput?: boolean;
}

export function createBlock(defId: string, options: BlockOptions = {}): AbstractBlock | undefined {
  const id = options.id ?? 0;
  switch (defId) {
    case "timer":
      return new TimerBlock(id, options.periodMs);
    case "random":
      return new RandomBlock(id, options.periodMs);
    case "constant":
      return new ConstantBlock(id, options.value, options.periodMs);
    case "gpio_in":
      return new GpioInBlock(id, options.pin);
    case "gpio_out":
      return new GpioOutBlock(id, options.pin);
    case "sin":
      return new SinBlock(id);
    case "cos":
      return new CosBlock(id);
    case "overshoot":
      return new OvershootBlock(id, options.zeta, options.omega, options.timeInput);
    case "product":
      return new ProductBlock(id, options.count, options.def);
    case "scope":
      return new ScopeBlock(id, options.windowS, options.meterMs);
    default:
      return undefined;
  }
}

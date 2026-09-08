/** Catalog, types, and ES2025 block implementations executed in the diagram worker. */

export interface BldHost {
  enter(id: number): void;
  currentBlock(): number;
  now(): number;
  random(): number;
  setInterval(cb: () => void, ms: number): number;
  clearInterval(id: number): void;
  tap(index: number, value: number): void;
  postScope(id: number, values: number[], windowS: number, meterMs: number): void;
  pinRead(pin: number): number;
  pinWrite(pin: number, value: number): void;
  onPinChange(pin: number, cb: () => void): void;
}

declare const host: BldHost;

export type TypeMeta = { name?: string; icon?: string; [key: string]: unknown };
export type NamespaceMeta = { name?: string; icon?: string; [key: string]: unknown };
export type CatalogMeta = { id?: string; name?: string; icon?: string; [key: string]: unknown };
export type BlockMeta = {
  name?: string;
  icon?: string;
  kind?: string;
  runnable?: boolean;
  generator?: boolean;
  combiner?: boolean;
  description?: string;
  factory?: string;
  [key: string]: unknown;
};
export type DiagramMeta = {
  id: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  catalogs?: string[];
  attrs?: Record<string, string>;
  [key: string]: unknown;
};
export type DiagramBlockMeta = {
  id: number;
  type: string;
  x: number;
  y: number;
  caption?: string;
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  parameters?: Array<{ kind?: string; name: string; value: string; type?: string }>;
  [key: string]: unknown;
};
export type ConnectionMeta = {
  fromBlock: number;
  fromOut: string;
  toBlock: number;
  toIn: string;
  [key: string]: unknown;
};

function identityDecorator<T>(fn: T): T {
  return fn;
}

export function Type(meta: TypeMeta): (target: Function) => void {
  void meta;
  return identityDecorator;
}

export function Namespace(meta: NamespaceMeta): (target: Function) => void {
  void meta;
  return identityDecorator;
}

export function Catalog(meta: CatalogMeta): (target: Function) => void {
  void meta;
  return identityDecorator;
}

export function Block(meta: BlockMeta): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function Inputs(meta: object): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function Outputs(meta: object): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function Params(meta: object): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function Diagram(meta: DiagramMeta): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function DiagramBlock(meta: DiagramBlockMeta): <T>(fn: T) => T {
  void meta;
  return identityDecorator;
}

export function Connection(from: string, to: string, meta?: ConnectionMeta): <T>(fn: T) => T {
  void from;
  void to;
  void meta;
  return identityDecorator;
}

// Types defined via decorated classes and typed-array element aliases
@Type({ name: "bool", icon: "bool" })
class boolTag {}
type bool = Uint8Array[1];

@Type({ name: "u8", icon: "u8" })
class u8Tag {}
type u8 = Uint8Array[1];

@Type({ name: "u16", icon: "u16" })
class u16Tag {}
type u16 = Uint16Array[1];

@Type({ name: "u32", icon: "u32" })
class u32Tag {}
type u32 = Uint32Array[1];

@Type({ name: "u64", icon: "u64" })
class u64Tag {}
type u64 = BigUint64Array[1];

@Type({ name: "i8", icon: "i8" })
class i8Tag {}
type i8 = Int8Array[1];

@Type({ name: "i16", icon: "i16" })
class i16Tag {}
type i16 = Int16Array[1];

@Type({ name: "i32", icon: "i32" })
class i32Tag {}
type i32 = Int32Array[1];

@Type({ name: "i64", icon: "i64" })
class i64Tag {}
type i64 = BigInt64Array[1];

@Type({ name: "f32", icon: "f32" })
class f32Tag {}
type f32 = Float32Array[1];

@Type({ name: "f64", icon: "f64" })
class f64Tag {}
type f64 = Float64Array[1];

@Type({ name: "char", icon: "char" })
class charTag {}
type char = Uint16Array[1];

@Type({ name: "void", icon: "void" })
class unitTag {}
type unit = void;

@Type({ name: "c", icon: "channel" })
class cTag {}
type c<T> = (arg: T) => void;
type c0 = () => void;
type c1<T> = c<T>;
type c2<T1, T2> = (a: T1, b: T2) => void;
type f0<R> = () => R;
type f1<T, R> = (arg: T) => R;
type f2<T1, T2, R> = (a: T1, b: T2) => R;

@Type({ name: "Multiplexed", icon: "list" })
class MultiplexedTag {}
type Multiplexed<T> = T[];

function sample(value: f64 | f32 | number): number {
  return Number(value);
}

function mux<T>(make: (index: number) => T): Multiplexed<T> {
  const items: T[] = [];
  return new Proxy(items, {
    get(target, prop, recv) {
      if (prop === "length") {
        return target.length;
      }
      if (typeof prop === "string") {
        const i = Number(prop);
        if (i === i && prop === String(i)) {
          while (target.length <= i) {
            target.push(make(target.length));
          }
          return target[i];
        }
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

function slot<T>(value: Multiplexed<T>, index: number): T {
  return value[index]!;
}

function fork<T>(...consumers: c<T>[]): c<T> {
  return (v: T) => {
    for (let i = 0; i < consumers.length; i++) {
      consumers[i]!(v);
    }
  };
}

function tap<T>(index: number, consumer: c<T>): c<T> {
  return (v: T) => {
    host.tap(index, Number(v));
    consumer(v);
  };
}

function nop<T>(_value: T): void {}

function overshootFromValue(ζ: number, ω: number, inp: c<f64>): [out: c<f64>] {
  return com.dauch.cs.tf.overshoot(ζ, ω, inp);
}

@Catalog({ id: "cs", name: "Control Systems" })
class _catalog {}

export namespace com.dauch.cs {
  @Namespace({ name: "Control Systems", icon: "cs" })
  export class Tag {}

  export namespace gen {
    @Namespace({ name: "Gen", icon: "gen" })
    export class Tag {}

    @Block({
      name: "Timer",
      icon: "timer",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Writes timestamps while running.",
      factory: "timer",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({})
    @Params({
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
        type: "number",
      },
    })
    export function timer(period: number, inp: c<f64>): void {
      host.setInterval(() => {
        inp(host.now() as f64);
      }, period);
    }

    @Block({
      name: "Random",
      icon: "random",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Writes random samples in [0, 1).",
      factory: "random",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({})
    @Params({
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
        type: "number",
      },
    })
    export function random(period: number, inp: c<f64>): void {
      host.setInterval(() => {
        inp(host.random() as f64);
      }, period);
    }

    @Block({
      name: "Constant",
      icon: "constant",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Writes constant samples.",
      factory: "constant",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({})
    @Params({
      value: {
        kind: "double-range-parameter",
        name: "value",
        description: "Constant sample value",
        min: -100,
        max: 100,
        step: 0.1,
        default: "1",
        type: "number",
      },
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
        type: "number",
      },
    })
    export function constant(value: number, period: number, inp: c<f64>): void {
      host.setInterval(() => {
        inp(value as f64);
      }, period);
    }
  }

  export namespace gpio {
    @Namespace({ name: "GPIO", icon: "gpio" })
    export class Tag {}

    @Block({
      name: "GPIO In",
      icon: "gpio_in",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Digital input. Pushes pin level (0 or 1) on change.",
      factory: "gpio_in",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({})
    @Params({
      pin: {
        kind: "integer-range-parameter",
        name: "pin",
        description: "GPIO pin number",
        min: 0,
        max: 31,
        step: 1,
        default: "0",
        type: "number",
      },
    })
    export function gpio_in(pin: number, inp: c<f64>): void {
      const samplePin = () => {
        inp((host.pinRead(pin) !== 0 ? 1 : 0) as f64);
      };
      samplePin();
      host.onPinChange(pin, samplePin);
    }

    @Block({
      name: "GPIO Out",
      icon: "gpio_out",
      kind: "Output",
      description: "Digital output. Consumes each sample and writes the pin.",
      factory: "gpio_out",
    })
    @Inputs({})
    @Outputs({ out: { name: "out" } })
    @Params({
      pin: {
        kind: "integer-range-parameter",
        name: "pin",
        description: "GPIO pin number",
        min: 0,
        max: 31,
        step: 1,
        default: "1",
        type: "number",
      },
    })
    export function gpio_out(pin: number): [out: c<f64>] {
      return [
        (v: f64) => {
          host.pinWrite(pin, sample(v) > 0.5 ? 1 : 0);
        },
      ];
    }
  }

  export namespace tf {
    @Namespace({ name: "Transform", icon: "tf" })
    export class Tag {}

    @Block({
      name: "Sin",
      icon: "sin",
      kind: "Process",
      description: "Transformer. Maps each sample with sin.",
      factory: "sin",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out" } })
    export function sin(inp: c<f64>): [out: c<f64>] {
      return [
        (v: f64) => {
          inp(Math.sin(sample(v)) as f64);
        },
      ];
    }

    @Block({
      name: "Cos",
      icon: "cos",
      kind: "Process",
      description: "Transformer. Maps each sample with cos.",
      factory: "cos",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out" } })
    export function cos(inp: c<f64>): [out: c<f64>] {
      return [
        (v: f64) => {
          inp(Math.cos(sample(v)) as f64);
        },
      ];
    }

    @Block({
      name: "Overshoot",
      icon: "overshoot",
      kind: "Process",
      description: "Transformer. Second-order underdamped unit-step response.",
      factory: "overshoot",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out" } })
    @Params({
      ζ: {
        kind: "double-range-parameter",
        name: "ζ",
        description: "Damping ratio ζ",
        min: 0.05,
        max: 0.95,
        step: 0.01,
        default: "0.5",
        type: "number",
      },
      ω: {
        kind: "double-range-parameter",
        name: "ω",
        description: "Natural frequency ω (rad/s)",
        min: 0.1,
        max: 20,
        step: 0.1,
        default: "1",
        type: "number",
      },
    })
    export function overshoot(ζ: number, ω: number, inp: c<f64>): [out: c<f64>] {
      let initialized = 0;
      let tStep = 0;
      let baseY = 0;
      let targetU = 0;
      let currentY = 0;
      return [
        (v: f64) => {
          const u = sample(v);
          const curT = host.now();
          if (initialized === 0) {
            initialized = 1;
            tStep = curT;
            baseY = u;
            targetU = u;
            currentY = u;
            inp(u as f64);
            return;
          }
          const diff = u - targetU;
          if (diff > 0.000001 || diff < -0.000001) {
            tStep = curT;
            baseY = currentY;
            targetU = u;
          }
          const tau = curT - tStep;
          const t = tau < 0 ? 0 : tau;
          const wd = ω * Math.sqrt(1 - ζ * ζ);
          const sigma = ζ * ω;
          const decay = Math.exp(0 - sigma * t);
          const phase = wd * t;
          const factor = 1 - decay * (Math.cos(phase) + (sigma / wd) * Math.sin(phase));
          const y = baseY + (targetU - baseY) * factor;
          currentY = y;
          inp(y as f64);
        },
      ];
    }

    @Block({
      name: "Product",
      icon: "product",
      kind: "Process",
      combiner: true,
      description: "Combiner. Multiplies inputs and pushes product downstream.",
      factory: "product",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out", attrs: { dynamic: "true" } } })
    @Params({
      n: {
        kind: "integer-range-parameter",
        name: "n",
        description: "Output count",
        min: 1,
        max: 8,
        step: 1,
        default: "2",
        type: "number",
      },
      def: {
        kind: "double-range-parameter",
        name: "def",
        description: "Default value of each output",
        min: -100,
        max: 100,
        step: 0.1,
        default: "1",
        type: "number",
      },
    })
    export function product(n: number, def: number, inp: c<f64>): [out: Multiplexed<c<f64>>] {
      const slots: number[] = [];
      const seen: number[] = [];
      for (let i = 0; i < n; i++) {
        slots.push(def);
        seen.push(0);
      }
      let mask = 0;
      const list = mux((index: number) => {
        const bit = 1 << index;
        mask = mask | bit;
        return (v: f64) => {
          slots[index] = sample(v);
          seen[index] = 1;
          let ready = 1;
          let prod = 1;
          for (let i = 0; i < n; i++) {
            prod = prod * slots[i]!;
            if ((mask & (1 << i)) !== 0 && seen[i] === 0) {
              ready = 0;
            }
          }
          if (ready !== 0) {
            inp(prod as f64);
          }
        };
      });
      return [list];
    }
  }

  export namespace sink {
    @Namespace({ name: "Sink", icon: "sink" })
    export class Tag {}

    @Block({
      name: "Scope",
      icon: "scope",
      kind: "Output",
      description: "Plot sink. Collects sliding window and posts samples to main page.",
      factory: "scope",
    })
    @Inputs({})
    @Outputs({ out: { name: "out", attrs: { dynamic: "true" } } })
    @Params({
      n: {
        kind: "integer-range-parameter",
        name: "n",
        description: "Time window width in seconds",
        min: 10,
        max: 600,
        step: 1,
        default: "30",
        type: "number",
      },
      m: {
        kind: "integer-range-parameter",
        name: "m",
        description: "Quantizer period in milliseconds",
        min: 10,
        max: 1000,
        step: 1,
        default: "10",
        type: "number",
      },
    })
    export function scope(n: number, m: number): [out: Multiplexed<c<f64>>] {
      const id = host.currentBlock();
      const latest: number[] = [];
      const windowMs = n * 1000;
      const history: Array<Array<{ t: number; v: number }>> = [];

      const plots = mux((index: number) => {
        latest[index] = Number.NaN;
        history[index] = [];
        return (v: f64) => {
          const s = sample(v);
          latest[index] = s;
          const now = host.now();
          const series = history[index]!;
          series.push({ t: now, v: s });
          const cutoff = now - windowMs;
          while (series.length > 0 && series[0]!.t < cutoff) {
            series.shift();
          }
        };
      });

      host.setInterval(() => {
        host.postScope(id, latest.slice(), n, m);
      }, m);

      return [plots];
    }
  }
}

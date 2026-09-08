/** Catalog, types, and ES2025 block implementations executed in the diagram worker. */

interface Float32Array {
  readonly [index: number]: number;
}
interface Float64Array {
  readonly [index: number]: number;
}
interface Uint8Array {
  readonly [index: number]: number;
}
interface Uint16Array {
  readonly [index: number]: number;
}
interface Uint32Array {
  readonly [index: number]: number;
}
interface Int8Array {
  readonly [index: number]: number;
}
interface Int16Array {
  readonly [index: number]: number;
}
interface Int32Array {
  readonly [index: number]: number;
}
interface BigUint64Array {
  readonly [index: number]: bigint;
}
interface BigInt64Array {
  readonly [index: number]: bigint;
}

interface Array<T> {
  length: number;
  [n: number]: T;
  push(item: T): number;
  slice(start?: number, end?: number): T[];
}

interface ProxyHandler<T extends object> {
  get?(target: T, p: string | symbol, receiver: unknown): unknown;
}

declare const Proxy: {
  new <T extends object>(target: T, handler: ProxyHandler<T>): T;
};

declare const Reflect: {
  get(target: object, p: string | symbol, receiver?: unknown): unknown;
};

declare const Math: {
  sin(x: number): number;
  cos(x: number): number;
  exp(x: number): number;
  sqrt(x: number): number;
};

declare const Number: {
  NaN: number;
  (value: unknown): number;
};

interface BldHost {
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

type TypeMeta = { name?: string; icon?: string; [key: string]: unknown };
type NamespaceMeta = { name?: string; icon?: string; [key: string]: unknown };
type CatalogMeta = { id?: string; name?: string; icon?: string; [key: string]: unknown };
type BlockMeta = {
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
type DiagramMeta = {
  id: string;
  name?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  catalogs?: string[];
  attrs?: Record<string, string>;
  [key: string]: unknown;
};
type DiagramBlockMeta = {
  id: number;
  type: string;
  x: number;
  y: number;
  caption?: string;
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  parameters?: Array<{ kind: string; name: string; value: string }>;
  [key: string]: unknown;
};
type ConnectionMeta = {
  fromBlock: number;
  fromOut: string;
  toBlock: number;
  toIn: string;
  [key: string]: unknown;
};

function identityDecorator<T>(fn: T): T {
  return fn;
}

function Type(meta: TypeMeta): void {
  void meta;
}

function Namespace(meta: NamespaceMeta): (target: Function) => void {
  return identityDecorator;
}

function Catalog(meta: CatalogMeta): (target: Function) => void {
  return identityDecorator;
}

function Block(meta: BlockMeta): <T>(fn: T) => T {
  return identityDecorator;
}

function Inputs(meta: object): <T>(fn: T) => T {
  return identityDecorator;
}

function Outputs(meta: object): <T>(fn: T) => T {
  return identityDecorator;
}

function Params(meta: object): <T>(fn: T) => T {
  return identityDecorator;
}

function Diagram(meta: DiagramMeta): <T>(fn: T) => T {
  return identityDecorator;
}

function DiagramBlock(meta: DiagramBlockMeta): <T>(fn: T) => T {
  return identityDecorator;
}

function Connection(from: string, to: string, meta?: ConnectionMeta): <T>(fn: T) => T {
  void from;
  void to;
  void meta;
  return identityDecorator;
}

Type({ name: "bool", icon: "bool" });
type bool = Uint8Array[1];

Type({ name: "u8", icon: "u8" });
type u8 = Uint8Array[1];

Type({ name: "u16", icon: "u16" });
type u16 = Uint16Array[1];

Type({ name: "u32", icon: "u32" });
type u32 = Uint32Array[1];

Type({ name: "u64", icon: "u64" });
type u64 = BigUint64Array[1];

Type({ name: "i8", icon: "i8" });
type i8 = Int8Array[1];

Type({ name: "i16", icon: "i16" });
type i16 = Int16Array[1];

Type({ name: "i32", icon: "i32" });
type i32 = Int32Array[1];

Type({ name: "i64", icon: "i64" });
type i64 = BigInt64Array[1];

Type({ name: "f32", icon: "f32" });
type f32 = Float32Array[1];

Type({ name: "f64", icon: "f64" });
type f64 = Float64Array[1];

Type({ name: "char", icon: "char" });
type char = Uint16Array[1];

Type({ name: "void", icon: "void" });
type unit = void;

type c<T> = (arg: T) => void;
type c0 = () => void;
type c1<T> = c<T>;
type c2<T1, T2> = (a: T1, b: T2) => void;
type f0<R> = () => R;
type f1<T, R> = (arg: T) => R;
type f2<T1, T2, R> = (a: T1, b: T2) => R;

/** Vector of channels. Distinct from a vararg input so slotted wires stay one consumer each. */
Type({ name: "Array", icon: "list" });
type Multiplexed<T> = T[];
type Array<T> = Multiplexed<T>;

function sample(value: f32): number {
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

@Catalog({ id: "cs", name: "Control Systems" })
class _catalog {}

namespace com.dauch.cs {
  @Namespace({ name: "Control Systems" })
  class _ns {}

  namespace gen {
    @Namespace({ name: "Gen" })
    class _ns {}

    @Block({
      name: "Timer",
      icon: "timer",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Accepts (f32)->void and writes timestamps while running.",
      factory: "timer",
    })
    @Inputs({ in: { name: "in" } })
    @Params({
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
      },
    })
    function timer(period: number, inp: c<f32>): void {
      const ms = period;
      host.setInterval(() => {
        inp(host.now() as f32);
      }, ms);
    }

    @Block({
      name: "Random",
      icon: "random",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Writes a random sample in [0, 1) at the quantization period.",
      factory: "random",
    })
    @Inputs({ in: { name: "in" } })
    @Params({
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
      },
    })
    function random(period: number, inp: c<f32>): void {
      host.setInterval(() => {
        inp(host.random() as f32);
      }, period);
    }

    @Block({
      name: "Constant",
      icon: "constant",
      kind: "Start",
      runnable: true,
      generator: true,
      description: "Push source. Writes a constant sample at the quantization period.",
      factory: "constant",
    })
    @Inputs({ in: { name: "in" } })
    @Params({
      value: {
        kind: "double-range-parameter",
        name: "value",
        description: "Constant sample value",
        min: -100,
        max: 100,
        step: 0.1,
        default: "1",
      },
      period: {
        kind: "integer-range-parameter",
        name: "period",
        description: "Quantization period in milliseconds",
        min: 1,
        max: 1000,
        step: 1,
        default: "10",
      },
    })
    function constant(value: number, period: number, inp: c<f32>): void {
      host.setInterval(() => {
        inp(value as f32);
      }, period);
    }
  }

  namespace gpio {
    @Namespace({ name: "GPIO" })
    class _ns {}

    @Block({
      name: "GPIO In",
      icon: "gpio_in",
      kind: "Start",
      runnable: true,
      generator: true,
      description:
        "Digital input. Pushes the pin level (0 or 1) when the pin changes. In the browser, toggling the switch emits one sample.",
      factory: "gpio_in",
    })
    @Inputs({ in: { name: "in" } })
    @Params({
      pin: {
        kind: "integer-range-parameter",
        name: "pin",
        description: "GPIO pin number",
        min: 0,
        max: 31,
        step: 1,
        default: "0",
      },
    })
    function gpio_in(pin: number, inp: c<f32>): void {
      const samplePin = () => {
        inp((host.pinRead(pin) !== 0 ? 1 : 0) as f32);
      };
      samplePin();
      host.onPinChange(pin, samplePin);
    }

    @Block({
      name: "GPIO Out",
      icon: "gpio_out",
      kind: "Output",
      description:
        "Digital output. Consumes each sample and writes the pin (HIGH when the value is greater than 0.5). In the browser, the switch is a disabled readout of the pin.",
      factory: "gpio_out",
    })
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
      },
    })
    function gpio_out(pin: number): c<f32> {
      return (v: f32) => {
        host.pinWrite(pin, sample(v) > 0.5 ? 1 : 0);
      };
    }
  }

  namespace tf {
    @Namespace({ name: "Transform" })
    class _ns {}

    @Block({
      name: "Sin",
      icon: "sin",
      kind: "Process",
      description: "Transformer. Maps each sample with sin. (f32)->void → (f32)->void.",
      factory: "sin",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out" } })
    function sin(inp: c<f32>): c<f32> {
      return (v: f32) => {
        inp(Math.sin(sample(v)) as f32);
      };
    }

    @Block({
      name: "Cos",
      icon: "cos",
      kind: "Process",
      description: "Transformer. Maps each sample with cos. (f32)->void → (f32)->void.",
      factory: "cos",
    })
    @Inputs({ in: { name: "in" } })
    @Outputs({ out: { name: "out" } })
    function cos(inp: c<f32>): c<f32> {
      return (v: f32) => {
        inp(Math.cos(sample(v)) as f32);
      };
    }

    @Block({
      name: "Overshoot",
      icon: "overshoot",
      kind: "Process",
      description:
        "Transformer. Maps time samples through a classic second-order underdamped unit-step response with damping ratio ζ and natural frequency ω. Damped frequency is ωd = ω√(1−ζ²). (f32)->void → (f32)->void.",
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
      },
      ω: {
        kind: "double-range-parameter",
        name: "ω",
        description: "Natural frequency ω (rad/s)",
        min: 0.1,
        max: 20,
        step: 0.1,
        default: "1",
      },
    })
    function overshoot(ζ: number, ω: number, inp: c<f32>): c<f32> {
      let t0 = 0;
      let on = 0;
      return (v: f32) => {
        const t = sample(v);
        if (on === 0) {
          t0 = t;
          on = 1;
        }
        const tau = t - t0;
        const wd = ω * Math.sqrt(1 - ζ * ζ);
        const sigma = ζ * ω;
        const decay = Math.exp(0 - sigma * tau);
        const phase = wd * tau;
        const y = 1 - decay * (Math.cos(phase) + (sigma / wd) * Math.sin(phase));
        inp((tau < 0 ? 0 : y) as f32);
      };
    }

    @Block({
      name: "Product",
      icon: "product",
      kind: "Process",
      combiner: true,
      description:
        "Combiner. Returns n factor consumers. Each factor updates its slot and pushes the product of all slots into the downstream consumer. Unwired slots stay at def. (f32)->void → Array[(f32)->void].",
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
      },
      def: {
        kind: "double-range-parameter",
        name: "def",
        description: "Default value of each output",
        min: -100,
        max: 100,
        step: 0.1,
        default: "1",
      },
    })
    function product(n: number, def: number, inp: c<f32>): Multiplexed<c<f32>> {
      const slots: number[] = [];
      const seen: number[] = [];
      for (let i = 0; i < n; i++) {
        slots.push(def);
        seen.push(0);
      }
      let mask = 0;
      return mux((index: number) => {
        const bit = 1 << index;
        mask = mask | bit;
        return (v: f32) => {
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
            inp(prod as f32);
          }
        };
      });
    }
  }

  namespace sink {
    @Namespace({ name: "Sink" })
    class _ns {}

    @Block({
      name: "Scope",
      icon: "scope",
      kind: "Output",
      description:
        "Plot sink. Returns a dynamically sized Array[(f32)->void]. Wire into a transformer or generator. After Run, Chart is a sliding multi-axis plot of finite samples.",
      factory: "scope",
    })
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
      },
      m: {
        kind: "integer-range-parameter",
        name: "m",
        description: "Quantizer period in milliseconds",
        min: 10,
        max: 1000,
        step: 1,
        default: "10",
      },
    })
    function scope(n: number, m: number): Multiplexed<c<f32>> {
      const id = host.currentBlock();
      const latest: number[] = [];
      const plots = mux((index: number) => {
        latest[index] = Number.NaN;
        return (v: f32) => {
          latest[index] = sample(v);
        };
      });
      host.setInterval(() => {
        host.postScope(id, latest.slice(), n, m);
      }, m);
      return plots;
    }
  }
}

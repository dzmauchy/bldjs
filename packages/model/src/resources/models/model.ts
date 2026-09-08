/** Catalog, types, and block signatures for the diagram model. */

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
    export function timer(period: number, inp: c<f32>): void {}

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
    export function random(period: number, inp: c<f32>): void {}

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
    export function constant(value: number, period: number, inp: c<f32>): void {}
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
    export function gpio_in(pin: number, inp: c<f32>): void {}

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
    export function gpio_out(pin: number): [out: c<f32>] {
      return [] as any;
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
    export function sin(inp: c<f32>): [out: c<f32>] {
      return [] as any;
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
    export function cos(inp: c<f32>): [out: c<f32>] {
      return [] as any;
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
    export function overshoot(ζ: number, ω: number, inp: c<f32>): [out: c<f32>] {
      return [] as any;
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
    export function product(n: number, def: number, inp: c<f32>): [out: Multiplexed<c<f32>>] {
      return [] as any;
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
    export function scope(n: number, m: number): [out: Multiplexed<c<f32>>] {
      return [] as any;
    }
  }
}

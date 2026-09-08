@Catalog({ id: "cs", name: "Control Systems" })
class _catalog {}

@Type({ name: "bool", icon: "bool" })
class bool {
  declare private brand: "bool";
}

@Type({ name: "u64", icon: "u64" })
class u64 {
  declare private brand: "u64";
}

@Type({ name: "u32", icon: "u32" })
class u32 {
  declare private brand: "u32";
}

@Type({ name: "i64", icon: "i64" })
class i64 {
  declare private brand: "i64";
}

@Type({ name: "i32", icon: "i32" })
class i32 {
  declare private brand: "i32";
}

@Type({ name: "f32", icon: "f32" })
class f32 {
  declare private brand: "f32";
}

@Type({ name: "f64", icon: "f64" })
class f64 {
  declare private brand: "f64";
}

@Type({ name: "char", icon: "char" })
class char {
  declare private brand: "char";
}

@Type({ name: "void", icon: "void" })
class unit {
  declare private brand: "void";
}

type c<T> = (arg: T) => void;
type c0 = () => void;
type c1<T> = c<T>;
type c2<T1, T2> = (a: T1, b: T2) => void;
type f0<R> = () => R;
type f1<T, R> = (arg: T) => R;
type f2<T1, T2, R> = (a: T1, b: T2) => R;
/** Vector of channels. Extracted as `Array[T]` so slotted outputs stay one consumer per wire. */
@Type({ name: "Array", icon: "list" })
class Multiplexed<T> {
  declare private brand: "Multiplexed";
  declare private item: T;
}
type Array<T> = Multiplexed<T>;

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
    function timer(period: number, inp: c<f32>): void {}

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
    function random(period: number, inp: c<f32>): void {}

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
    function constant(value: number, period: number, inp: c<f32>): void {}
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
    function gpio_in(pin: number, inp: c<f32>): void {}

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
      return undefined as unknown as c<f32>;
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
      return inp;
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
      return inp;
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
      return inp;
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
      return undefined as unknown as Multiplexed<c<f32>>;
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
      return undefined as unknown as Multiplexed<c<f32>>;
    }
  }
}

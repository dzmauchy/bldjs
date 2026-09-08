function Type(meta: object): (target: Function) => void {
  void meta;
  return (target) => target;
}
function Namespace(meta: object): (target: Function) => void {
  void meta;
  return (target) => target;
}
function Catalog(meta: object): (target: Function) => void {
  void meta;
  return (target) => target;
}
function Block(meta: object): <T>(fn: T) => T {
  void meta;
  return (fn) => fn;
}
function Inputs(meta: object): <T>(fn: T) => T {
  void meta;
  return (fn) => fn;
}
function Outputs(meta: object): <T>(fn: T) => T {
  void meta;
  return (fn) => fn;
}
function Params(meta: object): <T>(fn: T) => T {
  void meta;
  return (fn) => fn;
}

@Catalog({ id: "fixtures", name: "Test Fixtures" })
class _catalog {}

@Type({ name: "Int", icon: "i32" })
class Int {
  declare private brand: "Int";
}

@Type({ name: "Int64", icon: "i64" })
class Int64 {
  declare private brand: "Int64";
}

@Type({ name: "Float", icon: "f32" })
class Float {
  declare private brand: "Float";
}

@Type({ name: "Double", icon: "f64" })
class Double {
  declare private brand: "Double";
}

@Type({ name: "String", icon: "string" })
class String {
  declare private brand: "String";
}

@Type({ name: "Bool", icon: "bool" })
class Bool {
  declare private brand: "Bool";
}

@Type({ name: "Array", icon: "list" })
class Multiplexed<T> {
  declare private brand: "Multiplexed";
  declare private item: T;
}
type Array<T> = Multiplexed<T>;

namespace types {
  @Namespace({ name: "Types" })
  class _ns {}

  @Block({ name: "Int", icon: "i32", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_Int(): Int {
    return undefined as unknown as Int;
  }

  @Block({ name: "Int64", icon: "i64", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_Int64(): Int64 {
    return undefined as unknown as Int64;
  }

  @Block({ name: "Float", icon: "f32", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_Float(): Float {
    return undefined as unknown as Float;
  }

  @Block({ name: "Double", icon: "f64", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_Double(): Double {
    return undefined as unknown as Double;
  }

  @Block({ name: "String", icon: "string", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_String(): String {
    return undefined as unknown as String;
  }

  @Block({ name: "Bool", icon: "bool", kind: "Data" })
  @Outputs({ value: { name: "value" } })
  function b_Bool(): Bool {
    return undefined as unknown as Bool;
  }

  @Block({
    name: "array",
    icon: "list",
    kind: "Process",
    description: "Vararg elements become Array[T]",
    factory: "Array::from",
  })
  @Inputs({ elems: { name: "elems", vararg: true } })
  @Outputs({ result: { name: "result" } })
  function b_array_of<T>(elems: T): Multiplexed<T> {
    return undefined as unknown as Multiplexed<T>;
  }

  @Block({ name: "array.get", icon: "list", kind: "Process", factory: "Array::get" })
  @Inputs({ array: { name: "array" }, index: { name: "index" } })
  @Outputs({ elem: { name: "elem" } })
  function b_array_get<T>(array: Multiplexed<T>, index: Int): T {
    return undefined as unknown as T;
  }
}

namespace flow {
  @Namespace({ name: "Flow" })
  class _ns {}

  @Block({ name: "Start", icon: "start", kind: "Start", description: "Entry point for a flow" })
  @Outputs({ out: { name: "out" } })
  function b_start<T>(): T {
    return undefined as unknown as T;
  }

  @Block({ name: "Process", icon: "process", kind: "Process", description: "Do some work" })
  @Inputs({ in: { name: "in" } })
  @Outputs({ out: { name: "out" } })
  function b_process<T>(value: T): T {
    return value;
  }

  @Block({ name: "Decision", icon: "decision", kind: "Decision", description: "Branch on a condition" })
  @Inputs({ in: { name: "in" } })
  @Outputs({ true: { name: "true" }, false: { name: "false" } })
  function b_decision<T>(value: T): [true: T, false: T] {
    return [value, value];
  }

  @Block({ name: "Data", icon: "data", kind: "Data", description: "Read or write data" })
  @Inputs({ in: { name: "in" } })
  @Outputs({ out: { name: "out" } })
  function b_data<T>(value: T): T {
    return value;
  }

  @Block({ name: "Output", icon: "output", kind: "Output", description: "Emit a result" })
  @Inputs({ in: { name: "in" } })
  function b_output<T>(_value: T): void {}

  @Block({
    name: "Identity",
    icon: "identity",
    kind: "Process",
    description: "Pass a value through, unifying T",
  })
  @Inputs({ in: { name: "in" } })
  @Outputs({ out: { name: "out" } })
  function b_identity<T>(value: T): T {
    return value;
  }
}

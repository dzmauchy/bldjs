import binaryen from "binaryen";

/** Catalog GC types used by WASM builder blocks (`c1<f64>`, `c<f64>[]`). */
export interface WasmCatalogTypes {
  c1_f64Heap: binaryen.HeapType;
  c1_f64: binaryen.Type;
  array_c1_f64Heap: binaryen.HeapType;
  array_c1_f64: binaryen.Type;
}

const NOP = "c1_f64_nop";

/** `(type $c1_f64 (func (param f64)))` and `(type $array_c1_f64 (array (mut (ref $c1_f64))))`. */
export function addCatalogTypes(bin: typeof binaryen, module: binaryen.Module): WasmCatalogTypes {
  const builder = new bin.TypeBuilder(2);
  builder.setSignatureType(0, bin.f64, bin.none);
  builder.setArrayType(1, builder.getTempRefType(builder.getTempHeapType(0), false), bin.notPacked, true);
  const [c1_f64Heap, array_c1_f64Heap] = builder.buildAndDispose();
  const c1_f64 = bin.getTypeFromHeapType(c1_f64Heap, false);
  const array_c1_f64 = bin.getTypeFromHeapType(array_c1_f64Heap, false);
  module.setTypeName(c1_f64Heap, "c1_f64");
  module.setTypeName(array_c1_f64Heap, "array_c1_f64");
  module.addFunction(NOP, bin.f64, bin.none, [], module.nop());
  return { c1_f64Heap, c1_f64, array_c1_f64Heap, array_c1_f64 };
}

export function nopConsumer(module: binaryen.Module, types: WasmCatalogTypes): number {
  return module.ref.func(NOP, types.c1_f64);
}

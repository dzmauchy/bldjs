import type binaryen from "binaryen";

/**
 * WASM proposals used by the Binaryen block library.
 *
 * - bulk-memory-operations: `memory.copy` / `memory.fill`
 * - exception-handling: tags, `throw` / `try`
 * - extended-const: `i32.add` (and friends) in constant initializers
 * - gc: function types and arrays (`(ref $c1_f64)`, `(ref $array_c1_f64)`)
 * - js-string-builtins: `wasm:js-string` imports for catalog `str` (externref)
 * - multi-value: named results on XML blocks with more than one `<out>`
 * - mutable-global: captured `$in` consumers
 * - reference-types: `ref.func`, `externref`
 * - function-references: typed funcrefs and `call_ref`
 * - js-promise-integration: JS-side `WebAssembly.Suspending` / `Promising`;
 *   generator workers use threads + atomics instead of stack-switching
 * - threads / atomics / waits: shared memory, `i32.atomic.load`,
 *   `memory.atomic.wait32`, `memory.atomic.notify`
 */
function flag(bin: typeof binaryen, name: string): number {
  const value = (bin.Features as unknown as Record<string, number | undefined>)[name];
  return typeof value === "number" ? value : 0;
}

export function wasmFeatures(bin: typeof binaryen): number {
  return (
    flag(bin, "Atomics") |
    flag(bin, "MutableGlobals") |
    flag(bin, "BulkMemory") |
    flag(bin, "BulkMemoryOpt") |
    flag(bin, "ExceptionHandling") |
    flag(bin, "ReferenceTypes") |
    flag(bin, "Multivalue") |
    flag(bin, "GC") |
    flag(bin, "ExtendedConst") |
    flag(bin, "Strings")
  );
}

/** @deprecated Prefer {@link wasmFeatures}. */
export const GC_FEATURES = wasmFeatures;

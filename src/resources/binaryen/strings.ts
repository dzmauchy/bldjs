import binaryen from "binaryen";

/**
 * js-string-builtins for catalog `str` (externref).
 * Instantiation must pass `{ builtins: ["js-string"] }`.
 *
 * @see https://github.com/WebAssembly/js-string-builtins
 */
export const JS_STRING_MODULE = "wasm:js-string";

export function addJsStringBuiltins(module: binaryen.Module): void {
  module.addFunctionImport("js_string_length", JS_STRING_MODULE, "length", binaryen.externref, binaryen.i32);
  module.addFunctionImport(
    "js_string_concat",
    JS_STRING_MODULE,
    "concat",
    binaryen.createType([binaryen.externref, binaryen.externref]),
    binaryen.externref,
  );
  module.addFunctionImport(
    "js_string_fromCharCodeArray",
    JS_STRING_MODULE,
    "fromCharCodeArray",
    binaryen.createType([binaryen.externref, binaryen.i32, binaryen.i32]),
    binaryen.externref,
  );
  module.addFunctionImport(
    "js_string_intoCharCodeArray",
    JS_STRING_MODULE,
    "intoCharCodeArray",
    binaryen.createType([binaryen.externref, binaryen.externref, binaryen.i32]),
    binaryen.i32,
  );
  module.addFunctionImport(
    "js_string_equals",
    JS_STRING_MODULE,
    "equals",
    binaryen.createType([binaryen.externref, binaryen.externref]),
    binaryen.i32,
  );
  module.addFunctionImport(
    "js_string_compare",
    JS_STRING_MODULE,
    "compare",
    binaryen.createType([binaryen.externref, binaryen.externref]),
    binaryen.i32,
  );
}

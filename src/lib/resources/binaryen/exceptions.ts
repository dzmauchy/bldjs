import binaryen from "binaryen";

/** Exception-handling tag used by catalog blocks that need to abort a sample. */
export const FAIL_TAG = "fail";

export function addFailTag(module: binaryen.Module): void {
  module.addTag(FAIL_TAG, binaryen.i32, binaryen.none);
}

export function throwFail(module: binaryen.Module, code: number): number {
  return module.throw(FAIL_TAG, [module.i32.const(code)]);
}

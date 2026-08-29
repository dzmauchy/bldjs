import binaryen from "binaryen";

/** Name function parameters and extra locals in declaration order. */
export function nameLocals(fn: binaryen.FunctionRef, names: readonly string[]): void {
  names.forEach((name, index) => {
    binaryen.Function.setLocalName(fn, index, name);
  });
}

export function exportFunc(module: binaryen.Module, name: string): void {
  module.addFunctionExport(name, name);
}

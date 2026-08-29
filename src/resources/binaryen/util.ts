import binaryen from "binaryen";

type FunctionApi = {
  setLocalName(fn: binaryen.FunctionRef, index: number, name: string): void;
  getLocalName(fn: binaryen.FunctionRef, index: number): string;
  getNumLocals(fn: binaryen.FunctionRef): number;
};

const FunctionApi = (binaryen as unknown as { Function: FunctionApi }).Function;

/** Name function parameters and extra locals in declaration order. */
export function nameLocals(fn: binaryen.FunctionRef, names: readonly string[]): void {
  names.forEach((name, index) => {
    FunctionApi.setLocalName(fn, index, name);
  });
}

export function localNames(fn: binaryen.FunctionRef): string[] {
  const count = FunctionApi.getNumLocals(fn);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    names.push(FunctionApi.getLocalName(fn, i));
  }
  return names;
}

export function exportFunc(module: binaryen.Module, name: string): void {
  module.addFunctionExport(name, name);
}

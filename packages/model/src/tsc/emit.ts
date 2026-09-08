import ts from "typescript";
import { desugarFunctionDecorators } from "./desugar";

/** Transpile TypeScript diagram source to JavaScript using the TypeScript compiler. */
export function compileTypeScript(source: string): string {
  const desugared = desugarFunctionDecorators(source);
  const result = ts.transpileModule(desugared, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2025,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      removeComments: false,
    },
  });
  return result.outputText;
}

export async function compileTypeScriptAsync(source: string): Promise<string> {
  return compileTypeScript(source);
}

export function preloadTsc(): Promise<void> {
  return Promise.resolve();
}

import { desugarFunctionDecorators } from "./desugar";
import { eraseToJavaScript } from "./erase";

/** TypeScript 7 has no JS `transpileModule`; erase types and emit namespace IIFEs. */
export function compileTypeScript(source: string): string {
  return eraseToJavaScript(desugarFunctionDecorators(source));
}

export async function compileTypeScriptAsync(source: string): Promise<string> {
  return compileTypeScript(source);
}

/** Kept so Run can warm the emitter without downloading a JS TypeScript compiler. */
export function preloadTsc(): Promise<void> {
  return Promise.resolve();
}

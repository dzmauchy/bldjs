import ts from "typescript";
import { desugarFunctionDecorators } from "./desugar";
import { LIBRARY_TS, MODEL_TS } from "../blocks/builtin";

export interface CompileSources {
  library?: string;
  model?: string;
  diagram: string;
}

/** Transpile TypeScript diagram source to JavaScript using the TypeScript compiler. */
export function compileTypeScript(
  source: string | CompileSources,
  options?: { library?: string; model?: string },
): string {
  const library =
    typeof source === "object" ? source.library ?? LIBRARY_TS : options?.library ?? LIBRARY_TS;
  const model =
    typeof source === "object" ? source.model ?? MODEL_TS : options?.model ?? MODEL_TS;
  const diagram = typeof source === "object" ? source.diagram : source;

  let combined: string;
  if (diagram.includes("@Catalog({ id: \"cs\"") && diagram.includes("overshootFromValue")) {
    combined = diagram;
  } else if (diagram.includes("@Catalog({ id: \"cs\"")) {
    combined = `${diagram}\n\n${library}`;
  } else {
    combined = `${model.replace(/\s+$/, "")}\n\n${library.replace(/\s+$/, "")}\n\n${diagram.trimStart()}`;
  }

  const desugared = desugarFunctionDecorators(combined);
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

export async function compileTypeScriptAsync(source: string | CompileSources): Promise<string> {
  return compileTypeScript(source);
}

export function preloadTsc(): Promise<void> {
  return Promise.resolve();
}

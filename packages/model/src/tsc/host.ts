import ts, { type Type, type TypeChecker, SignatureKind, TypeFlags } from "typescript";
import { desugarFunctionDecorators } from "./desugar";
import { PRELUDE, PRELUDE_FILE } from "./prelude";

export interface VirtualFile {
  name: string;
  content: string;
}

export const VIRTUAL_ROOT = "/virtual";
export const TSCONFIG_FILE = `${VIRTUAL_ROOT}/tsconfig.json`;

function virtualPath(name: string): string {
  if (name.startsWith("/")) {
    return name;
  }
  return `${VIRTUAL_ROOT}/${name}`;
}

/** TypeScript TypeChecker over an in-memory virtual filesystem. */
export class TscContext {
  readonly typeByText = new Map<string, Type>();

  constructor(
    readonly program: ts.Program,
    readonly files: Map<string, string>,
  ) {}

  get checker(): TypeChecker {
    return this.program.getTypeChecker();
  }

  sourceFile(name: string) {
    return this.program.getSourceFile(virtualPath(name)) ?? this.program.getSourceFile(name);
  }

  registerType(text: string, type: Type): void {
    if (text.length > 0) {
      this.typeByText.set(text, type);
    }
  }

  typeFromText(text: string): Type | undefined {
    return this.typeByText.get(text);
  }

  isTypeAssignableTo(source: Type, target: Type): boolean {
    return this.checker.isTypeAssignableTo(source, target);
  }

  diagnostics() {
    return [...this.program.getSyntacticDiagnostics(), ...this.program.getSemanticDiagnostics()];
  }

  dispose(): void {
    this.typeByText.clear();
    this.files.clear();
  }
}

export { SignatureKind, TypeFlags, VIRTUAL_ROOT as virtualRoot };
export type { TypeChecker as Checker, Type };

export function nativeTscAvailable(): boolean {
  return true;
}

function sourcesDeclareDecorators(sources: readonly VirtualFile[]): boolean {
  return sources.some((source) => /\bfunction Type\(/.test(source.content));
}

export function createTscContext(sources: readonly VirtualFile[]): TscContext {
  const files = new Map<string, string>();
  const usePrelude = !sourcesDeclareDecorators(sources);
  if (usePrelude) {
    files.set(virtualPath(PRELUDE_FILE), PRELUDE);
  }
  for (const source of sources) {
    const path = virtualPath(source.name);
    const content = desugarFunctionDecorators(source.content);
    files.set(path, content);
    files.set(source.name, content);
  }

  const rootNames = sources.map((s) => virtualPath(s.name));
  if (usePrelude) {
    rootNames.unshift(virtualPath(PRELUDE_FILE));
  }

  const compilerHost: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const content = files.get(fileName) ?? files.get(fileName.replace(/^\//, ""));
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      return undefined;
    },
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => VIRTUAL_ROOT,
    getDirectories: () => [],
    fileExists: (fileName) => files.has(fileName) || files.has(fileName.replace(/^\//, "")),
    readFile: (fileName) => files.get(fileName) ?? files.get(fileName.replace(/^\//, "")),
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2025,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    noLib: true,
    experimentalDecorators: true,
    noEmit: true,
    skipLibCheck: true,
  };

  const program = ts.createProgram(rootNames, options, compilerHost);
  return new TscContext(program, files);
}

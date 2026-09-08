import { API, SignatureKind, TypeFlags, type Checker, type Project, type Snapshot, type Type } from "typescript/unstable/sync";
import { createVirtualFileSystem, type FileSystem } from "typescript/unstable/fs";
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

function tsconfigFor(files: string[]): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        strict: true,
        noLib: true,
        experimentalDecorators: true,
        noEmit: true,
        skipLibCheck: true,
      },
      files,
    },
    null,
    2,
  )}\n`;
}

/** TypeScript 7.0.2 native TypeChecker over an in-memory virtual filesystem. */
export class TscContext {
  readonly typeByText = new Map<string, Type>();

  constructor(
    readonly api: API,
    readonly snapshot: Snapshot,
    readonly project: Project,
    readonly files: Map<string, string>,
  ) {}

  get checker(): Checker {
    return this.project.checker;
  }

  get program() {
    return this.project.program;
  }

  sourceFile(name: string) {
    return this.program.getSourceFile(virtualPath(name));
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
    this.snapshot.dispose();
    this.api.close();
  }
}

export { SignatureKind, TypeFlags, VIRTUAL_ROOT as virtualRoot };
export type { Checker, Type };

export function nativeTscAvailable(): boolean {
  const node = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  return typeof node === "string";
}

export function createTscContext(sources: readonly VirtualFile[]): TscContext {
  const files: Record<string, string> = {};
  const names = [PRELUDE_FILE, ...sources.map((source) => source.name)];
  files[TSCONFIG_FILE] = tsconfigFor(names);
  files[virtualPath(PRELUDE_FILE)] = PRELUDE;
  const map = new Map<string, string>();
  map.set(TSCONFIG_FILE, files[TSCONFIG_FILE]!);
  map.set(virtualPath(PRELUDE_FILE), PRELUDE);
  for (const source of sources) {
    const path = virtualPath(source.name);
    const content = desugarFunctionDecorators(source.content);
    files[path] = content;
    map.set(path, content);
  }

  const fs: FileSystem = createVirtualFileSystem(files);
  const api = new API({ cwd: VIRTUAL_ROOT, fs });
  const snapshot = api.updateSnapshot({ openProjects: [TSCONFIG_FILE] });
  const project = snapshot.getProject(TSCONFIG_FILE) ?? snapshot.getProjects()[0];
  if (!project) {
    api.close();
    throw new Error("TypeScript 7.0.2 TypeChecker produced no project");
  }
  return new TscContext(api, snapshot, project, map);
}

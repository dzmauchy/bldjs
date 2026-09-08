/** Browser stub for `typescript/unstable/sync`. The native TypeChecker cannot run in the browser. */
export const TypeFlags = {
  None: 0,
  Void: 16,
  Undefined: 4,
  Never: 262144,
  TypeParameter: 524288,
  Number: 64,
  Boolean: 256,
  String: 32,
} as const;

export const SignatureKind = {
  Call: 0,
  Construct: 1,
} as const;

export class API {
  constructor(_options?: unknown) {
    throw new Error("TypeScript 7.0.2 TypeChecker is not available in the browser");
  }
}

export class Snapshot {
  dispose(): void {}
}

export class Project {}

export class Checker {}

export type Type = never;

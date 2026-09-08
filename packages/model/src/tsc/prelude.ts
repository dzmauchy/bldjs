/** Ambient decorator factories and helpers for catalog/diagram TypeScript. */
export const PRELUDE_FILE = "prelude.ts";

export const PRELUDE = `
declare function Type(meta: object): (target: Function) => void;
declare function Namespace(meta: object): (target: Function) => void;
declare function Catalog(meta: object): (target: Function) => void;
declare function Block(meta: object): <T>(fn: T) => T;
declare function Inputs(meta: object): <T>(fn: T) => T;
declare function Outputs(meta: object): <T>(fn: T) => T;
declare function Params(meta: object): <T>(fn: T) => T;
declare function Diagram(meta: object): <T>(fn: T) => T;
declare function DiagramBlock(meta: object): <T>(fn: T) => T;
declare function Connection(from: string, to: string, meta?: object): <T>(fn: T) => T;
`;

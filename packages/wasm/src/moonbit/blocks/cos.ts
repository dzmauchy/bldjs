import { COS_BLOCK } from "../block";
import type { MoonBlockEmit } from "../types";

export function emitCos(opts: MoonBlockEmit = {}): string {
  return COS_BLOCK.emit(opts);
}

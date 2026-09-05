import { SIN_BLOCK } from "../block";
import type { MoonBlockEmit } from "../types";

export function emitSin(opts: MoonBlockEmit = {}): string {
  return SIN_BLOCK.emit(opts);
}

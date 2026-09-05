import type { BlockScript, MoonBlockEmit } from "./types";

/** One MoonBit function matching an XML catalog block. */
export abstract class MoonBlock {
  abstract readonly defId: string;

  abstract emit(opts?: MoonBlockEmit): string;

  script(): BlockScript {
    return (opts) => this.emit(opts);
  }
}

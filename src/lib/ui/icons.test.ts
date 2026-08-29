import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { blockIconSvg, hasBlockIcon } from "./icons";

describe("block icons", () => {
  it("has an svg file for every catalog block", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    for (const block of diagram.catalog().blocks()) {
      expect(block.icon, `${block.id} is missing icon=`).toBeTruthy();
      expect(hasBlockIcon(block.icon), `${block.id} icon=${block.icon}`).toBe(true);
      expect(blockIconSvg(block.icon)).toContain("<svg");
    }
  });

  it("falls back to the process glyph", () => {
    expect(blockIconSvg("missing-icon")).toBe(blockIconSvg("process"));
  });
});

import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "../blocks/builtin";
import { Diagram } from "../blocks/diagram";
import { hasBlockIcon, iconKey, iconSvgInner, renderIconSvg } from "./icons";

describe("flow icons", () => {
  it("strips raster suffixes and falls back to process", () => {
    expect(iconKey("timer.png")).toBe("timer");
    expect(iconKey("enum.svg")).toBe("enum");
    expect(iconSvgInner("missing")).toBe(iconSvgInner("process"));
    expect(renderIconSvg("string")).toContain("viewBox");
    expect(renderIconSvg("string")).toContain(iconSvgInner("string"));
  });

  it("has an svg file for every catalog block", () => {
    const diagram = new Diagram("ws", "Workspace");
    associateBuiltinModels(diagram);
    for (const block of diagram.catalog().blocks()) {
      expect(block.icon, `${block.id} is missing icon=`).toBeTruthy();
      expect(hasBlockIcon(block.icon), `${block.id} icon=${block.icon}`).toBe(true);
      expect(iconSvgInner(block.icon).length).toBeGreaterThan(0);
    }
  });
});

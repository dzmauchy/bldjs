import { describe, expect, it } from "vitest";
import { associateBuiltinModels } from "@bld/xml/blocks/builtin";
import { Diagram } from "@bld/xml/blocks/diagram";
import { hasBlockIcon, iconKey, iconSvgInner, renderBrandSvg, renderIconSvg } from "./icons";

describe("flow icons", () => {
  it("strips raster suffixes and falls back to process", () => {
    expect(iconKey("timer.png")).toBe("timer");
    expect(iconKey("enum.svg")).toBe("enum");
    expect(iconSvgInner("missing")).toBe(iconSvgInner("process"));
    expect(renderIconSvg("f64")).toContain("viewBox");
    expect(renderIconSvg("f64")).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(renderIconSvg("f64")).toContain(iconSvgInner("f64"));
  });

  it("keeps the full-color bld mark for the site brand", () => {
    expect(renderBrandSvg()).toContain("viewBox=\"0 0 512 512\"");
    expect(renderBrandSvg()).toContain("aria-label=\"Bld\"");
    expect(renderBrandSvg()).not.toContain("viewBox=\"0 0 16 16\"");
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

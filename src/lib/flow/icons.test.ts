import { describe, expect, it } from "vitest";
import { iconKey, iconSvgInner, renderIconSvg } from "./icons";

describe("flow icons", () => {
  it("strips raster suffixes and falls back to process", () => {
    expect(iconKey("timer.png")).toBe("timer");
    expect(iconSvgInner("missing")).toContain("rect");
    expect(renderIconSvg("string")).toContain("viewBox");
    expect(renderIconSvg("string")).toContain(iconSvgInner("string"));
  });
});

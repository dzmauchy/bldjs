import { describe, expect, it, vi } from "vitest";
import { capturePointer, isCanvasPointer, releasePointer } from "./pointer";

function pointer(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    isPrimary: true,
    button: 0,
    pointerId: 1,
    ...overrides,
  } as PointerEvent;
}

describe("canvas pointers", () => {
  it("accepts the primary left button and middle-button pan", () => {
    expect(isCanvasPointer(pointer())).toBe(true);
    expect(isCanvasPointer(pointer({ button: 1 }))).toBe(true);
    expect(isCanvasPointer(pointer({ button: 2 }))).toBe(false);
    expect(isCanvasPointer(pointer({ isPrimary: false }))).toBe(false);
  });

  it("accepts a primary touch contact (button 0)", () => {
    expect(isCanvasPointer(pointer({ pointerType: "touch", button: 0 }))).toBe(true);
  });

  it("captures and releases when the element supports it", () => {
    const el = document.createElement("div");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const hasPointerCapture = vi.fn(() => false);
    Object.assign(el, { setPointerCapture, releasePointerCapture, hasPointerCapture });
    capturePointer(el, 7);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    hasPointerCapture.mockReturnValue(true);
    releasePointer(el, 7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("ignores capture on non-elements", () => {
    expect(() => capturePointer(null, 1)).not.toThrow();
    expect(() => capturePointer(window, 1)).not.toThrow();
  });
});

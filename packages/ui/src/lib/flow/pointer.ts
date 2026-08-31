/** Primary left/middle mouse, or the primary touch/pen contact. */
export function isCanvasPointer(event: PointerEvent): boolean {
  if (event.isPrimary === false) {
    return false;
  }
  return event.button === 0 || event.button === 1;
}

export function capturePointer(target: EventTarget | null, pointerId: number): void {
  if (!(target instanceof Element) || typeof target.setPointerCapture !== "function") {
    return;
  }
  try {
    if (typeof target.hasPointerCapture === "function" && target.hasPointerCapture(pointerId)) {
      return;
    }
    target.setPointerCapture(pointerId);
  } catch {
    // Pointer already went up, or the element is not connected.
  }
}

export function releasePointer(target: EventTarget | null, pointerId: number): void {
  if (!(target instanceof Element) || typeof target.releasePointerCapture !== "function") {
    return;
  }
  try {
    if (typeof target.hasPointerCapture === "function" && !target.hasPointerCapture(pointerId)) {
      return;
    }
    target.releasePointerCapture(pointerId);
  } catch {
    // Already released.
  }
}

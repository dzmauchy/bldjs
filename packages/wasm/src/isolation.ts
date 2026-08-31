/**
 * SharedArrayBuffer and dedicated workers that transfer it require a
 * cross-origin isolated document (COOP + COEP, plus CORP on subresources).
 * A phone opening http://lan-ip:8080 is not a secure context, so isolation
 * never engages even when the dev server sends those headers.
 */

/** True when this agent can construct a shared WebAssembly.Memory. */
export function canShareMemory(): boolean {
  try {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    return memory.buffer instanceof SharedArrayBuffer;
  } catch {
    return false;
  }
}

/**
 * Dedicated workers that post SharedArrayBuffer need `crossOriginIsolated`.
 * JointJS libavoid and the generator worker both fail without it; callers
 * should fall back to the main thread.
 */
export function canUseIsolatedWorker(): boolean {
  return typeof Worker === "function" && canShareMemory() && globalThis.crossOriginIsolated === true;
}

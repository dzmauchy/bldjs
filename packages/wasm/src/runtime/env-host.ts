/** MCU `"env"` ABI used by the linear `wasm` prod module. */
export interface EnvHost {
  wait_event(timeout_ms: number): number;
  pin_mode(pin: number, mode: number): void;
  pin_write(pin: number, val: number): void;
  pin_read(pin: number): number;
  attach_irq(pin: number, mode: number): void;
  timer_start(timer_id: number, period_us: number): void;
  adc_read_raw(channel: number): number;
  usb_write(ptr: number, len: number): number;
}

export function createEnvImports(overrides: Partial<EnvHost> = {}): WebAssembly.Imports {
  const pins = new Map<number, number>();
  const env: EnvHost = {
    wait_event: () => 0,
    pin_mode: () => undefined,
    pin_write(pin, val) {
      pins.set(pin, val !== 0 ? 1 : 0);
    },
    pin_read(pin) {
      return pins.get(pin) ?? 0;
    },
    attach_irq: () => undefined,
    timer_start: () => undefined,
    adc_read_raw: () => 0,
    usb_write: () => 0,
    ...overrides,
  };
  return { env: env as unknown as WebAssembly.ModuleImports };
}

---
name: mcu-runtime-protocol
description: Specification of the target microcontroller's fixed WASM runtime ABI, hot-reload flashing protocol, and binary telemetry wire format.
version: 1.0.0
tags:
  - protocol
  - wasm-abi
  - webusb
  - webserial
  - specification
---

# Microcontroller Runtime ABI & Wire Protocol Specification

This specification defines the contract between the browser IDE and the microcontroller. The target microcontroller runs a pre-flashed runtime (FreeRTOS + WAMR). The browser interacts with it exclusively via binary packets over WebSerial/WebUSB without compiling C files.

---

## 1. Hot-Reload Flashing Protocol (Browser to MCU)

The browser compiles MoonBit into `.wasm` and transmits an 8-byte framed packet:

```text
+-----------------------+-----------------------+-------------------------+
| Magic Header (4B)     | Payload Length (4B)   | WASM Bytecode (N Bytes) |
| 0x57, 0x41, 0x53, 0x4D| uint32 Little Endian  | Raw .wasm Binary        |
| ASCII "WASM"          | (byteLength)          | (Up to 32 KB)           |
+-----------------------+-----------------------+-------------------------+
```

### Loading Sequence
1. Receiver task detects `0x4D534157` ("WASM").
2. Preempts and unloads the current running WASM instance.
3. Buffers `N` bytes into SRAM.
4. Validates and instantiates the module in WAMR, binding symbols under `"env"`.
5. Starts execution at `app_main()`.

---

## 2. Host FFI ABI (Module: `"env"`)

Every MoonBit module imports from `"env"`:

| Function | Signature | Description |
| :--- | :--- | :--- |
| `wait_event` | `(timeout_ms: i32) -> i32` | Blocks task until an event occurs. Returns `(type << 16) \| payload`. Types: `1` = Timer, `2` = GPIO. Returns `0` on timeout. |
| `pin_mode` | `(pin: i32, mode: i32) -> void` | Configures pin: `0` = Input, `1` = Output, `2` = Input with Pull-up. |
| `pin_write` | `(pin: i32, val: i32) -> void` | Sets digital pin state (`0` or `1`). |
| `pin_read` | `(pin: i32) -> i32` | Reads digital pin level (`0` or `1`). |
| `attach_irq` | `(pin: i32, mode: i32) -> void` | Binds edge interrupt: `1` = Rising, `2` = Falling, `3` = Both. |
| `timer_start` | `(timer_id: i32, period_us: i32) -> void` | Starts periodic hardware timer in microseconds. |
| `adc_read_raw` | `(channel: i32) -> i32` | Reads 12-bit ADC value (`0`–`4095`). |
| `usb_write` | `(wasm_ptr: i32, len: i32) -> i32` | Transmits raw bytes from linear memory to the USB endpoint. |

---

## 3. Telemetry Stream Wire Format (MCU to Browser)

Frames sent from the microcontroller to the browser use a 10-byte fixed structure:

```text
Offset | Field       | Type           | Description
-------+-------------+----------------+----------------------------------------
0..1   | Sync Header | uint8[2]       | Constant 0xAA, 0x55
2      | Frame Type  | uint8          | 0x01: Signal Stream, 0x02: GPIO Alert
3      | Sequence    | uint8          | Rolling counter (0–255)
4..5   | ADC Raw     | uint16 (LE)    | Raw 12-bit ADC reading (0–4095)
6..7   | ADC Filtered| uint16 (LE)    | Output of low-pass filter (0–4095)
8      | GPIO State  | uint8          | Bit 0: Button, Bit 1: LED, Bit 7: Alert
9      | Checksum    | uint8          | XOR checksum of bytes 2 through 8
```
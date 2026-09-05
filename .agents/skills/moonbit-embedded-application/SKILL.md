---
name: moonbit-embedded-application
description: MoonBit embedded template for handling 0-200 Hz analog signals with fixed-point low-pass filtering, GPIO pins, hardware timers, and streaming USB telemetry.
version: 1.0.0
tags:
  - moonbit
  - dsp
  - adc
  - gpio
  - timers
  - telemetry
---

# MoonBit Embedded Application Engine

This skill provides the structure for guest MoonBit applications running on the microcontroller. It communicates with the pre-flashed runtime via host FFI imports and does not generate C code.

## Signal Processing & Timing
- 0–200 Hz signals require at least 400 Hz sampling. The hardware timer is set to 1 kHz (1000 µs) for 5× oversampling.
- Telemetry transmission is subscaled to 200 Hz (every 5 timer ticks) to avoid saturating USB-CDC endpoint buffers.
- Fixed-point integer math is used for the Exponential Moving Average (EMA) low-pass filter to eliminate floating-point overhead.

## MoonBit Application (`main.mbt`)

```moonbit
// =============================================================================
// FFI Declarations: Host ABI provided by pre-flashed runtime
// =============================================================================

extern "wasm" fn host_wait_event(timeout_ms : Int) -> Int = "env" "wait_event"
extern "wasm" fn host_pin_mode(pin : Int, mode : Int) = "env" "pin_mode"
extern "wasm" fn host_pin_write(pin : Int, val : Int) = "env" "pin_write"
extern "wasm" fn host_pin_read(pin : Int) -> Int = "env" "pin_read"
extern "wasm" fn host_attach_irq(pin : Int, edge_mode : Int) = "env" "attach_irq"
extern "wasm" fn host_timer_start(timer_id : Int, period_us : Int) = "env" "timer_start"
extern "wasm" fn host_adc_read_raw(channel : Int) -> Int = "env" "adc_read_raw"
extern "wasm" fn host_usb_write(ptr : Int, len : Int) -> Int = "env" "usb_write"

const PIN_OUTPUT : Int = 1
const PIN_INPUT_PULLUP : Int = 2
const IRQ_FALLING : Int = 2

// =============================================================================
// Telemetry Protocol: 10-Byte Binary Frame
// [0xAA, 0x55, TYPE, SEQ, RAW_L, RAW_H, FILT_L, FILT_H, GPIO, CHK]
// =============================================================================

let tx_frame : FixedArray[Byte] = FixedArray::make(10, b'\x00')
let mut seq_num : Byte = b'\x00'

fn emit_telemetry(frame_type : Byte, raw_adc : Int, filt_adc : Int, gpio_bits : Int) -> Unit {
  seq_num = (seq_num.to_int() + 1).to_byte()

  tx_frame[0] = b'\xAA'
  tx_frame[1] = b'\x55'
  tx_frame[2] = frame_type
  tx_frame[3] = seq_num

  tx_frame[4] = (raw_adc & 0xFF).to_byte()
  tx_frame[5] = ((raw_adc >> 8) & 0xFF).to_byte()

  tx_frame[6] = (filt_adc & 0xFF).to_byte()
  tx_frame[7] = ((filt_adc >> 8) & 0xFF).to_byte()

  tx_frame[8] = (gpio_bits & 0xFF).to_byte()

  let mut checksum : Int = 0
  for i = 2; i <= 8; i = i + 1 {
    checksum = checksum ^ tx_frame[i].to_int()
  }
  tx_frame[9] = checksum.to_byte()

  let _ = host_usb_write(tx_frame.as_ptr(), 10)
}

// =============================================================================
// Digital Signal Filter: Fixed-Point EMA Low-Pass Filter
// =============================================================================

struct LowPassFilter {
  mut state : Int
  alpha_num : Int
  alpha_den : Int
}

fn LowPassFilter::new(alpha_num : Int, alpha_den : Int) -> LowPassFilter {
  { state: 0, alpha_num, alpha_den }
}

fn LowPassFilter::process(self : LowPassFilter, input_val : Int) -> Int {
  let delta = input_val - self.state
  self.state = self.state + (delta * self.alpha_num) / self.alpha_den
  self.state
}

// =============================================================================
// Application Entry Point: app_main
// =============================================================================

pub fn app_main() -> Unit {
  let status_led : Int = 13   // PC13
  let button_pin : Int = 0    // PA0
  let adc_channel : Int = 1   // PA1

  host_pin_mode(status_led, PIN_OUTPUT)
  host_pin_mode(button_pin, PIN_INPUT_PULLUP)
  host_attach_irq(button_pin, IRQ_FALLING)

  // Configure hardware timer: 1000 µs = 1 kHz sampling
  host_timer_start(0, 1000)

  let filter = LowPassFilter::new(2, 10)
  let mut led_on = 0
  let mut prescaler = 0

  while true {
    let event = host_wait_event(50)
    let event_type = (event >> 16) & 0xFFFF
    let event_payload = event & 0xFFFF

    match event_type {
      // Timer Event (1 kHz)
      1 => {
        let raw_adc = host_adc_read_raw(adc_channel)
        let filtered_adc = filter.process(raw_adc)

        prescaler = prescaler + 1
        if prescaler >= 5 {
          prescaler = 0
          let gpio_bits = host_pin_read(button_pin) | (led_on << 1)
          emit_telemetry(b'\x01', raw_adc, filtered_adc, gpio_bits)
        }
      }

      // GPIO Interrupt Event
      2 => {
        if event_payload == button_pin {
          led_on = if led_on == 0 { 1 } else { 0 }
          host_pin_write(status_led, led_on)
          emit_telemetry(b'\x02', 0, 0, 0x80 | led_on)
        }
      }

      _ => ()
    }
  }
}
```
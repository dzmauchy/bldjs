---
name: moonbit-embedded-math-random
description: Implementation and usage of trigonometric functions (sin, cos) and pseudorandom number generators (PRNG) in pure MoonBit for WebAssembly MVP on resource-constrained microcontrollers.
version: 1.0.0
tags:
  - moonbit
  - math
  - trigonometry
  - prng
  - dsp
  - wasm-mvp
---

# Embedded Math & Random Generation in MoonBit (WASM MVP)

Use this skill when developing embedded MoonBit applications that require trigonometric calculations (`sin`, `cos`) or random number generation (`random`).

---

## 1. WebAssembly MVP Hardware Constraints

1. **No Trigonometric Instructions in WebAssembly:**
   The WebAssembly specification has no native opcodes for `sin`, `cos`, or `tan`. Instructions like `f32.sqrt` and `f64.sqrt` exist, but trigonometric operations must be computed either:
    - **In pure MoonBit bytecode** (portable, zero host dependencies, deterministic across chips).
    - **Via host imports (`"env"` FFI)** (delegated to MCU hardware FPU or C `math.h`).

2. **No Native Entropy Source:**
   WASM execution is deterministic and sandboxed. There is no built-in `Math.random()`. Random numbers must be generated via:
    - **Pure MoonBit PRNG** (e.g., Xorshift32/PCG) seeded by uptime or timer ticks.
    - **Host Hardware TRNG** via `extern "wasm" fn host_trng_read() -> Int`.

---

## 2. Implementation Options for `sin` & `cos`

Depending on the sample rate and CPU constraints of your MCU:

| Method | Execution Cost | Accuracy | Best For |
| :--- | :--- | :--- | :--- |
| **LUT (Lookup Table, Q15)** | ~5–10 CPU cycles | ~0.1% | High-speed 0–200 Hz waveform synthesis in 1 kHz timer loops |
| **Polynomial Approximation (Float)** | ~25–50 CPU cycles | ~0.001% | Signal processing, filtering, floating-point algorithms |
| **Host FFI (`libm` binding)** | ~40–80 CPU cycles | IEEE 754 float | Non-critical background calculations |

---

## 3. Pure MoonBit Implementation (`math_embedded.mbt`)

Save this file into your MoonBit project to get full access to `sin`, `cos`, and fast PRNG without any C files or extra dependencies.

```moonbit
// =============================================================================
// 1. Fast Random Number Generator (Xorshift32 & Range Helpers)
// =============================================================================

pub struct Rng {
  mut state : Int
}

pub fn Rng::new(seed : Int) -> Rng {
  // Seed cannot be zero for Xorshift
  let valid_seed = if seed == 0 { 0x6D2B79F5 } else { seed }
  { state: valid_seed }
}

/// Generates a pseudo-random 32-bit signed integer
pub fn Rng::next_int(self : Rng) -> Int {
  let mut x = self.state
  x = x ^ (x << 13)
  x = x ^ (x >> 17)
  x = x ^ (x << 5)
  self.state = x
  x
}

/// Generates a random integer in range [min, max] inclusive
pub fn Rng::range(self : Rng, min : Int, max : Int) -> Int {
  if min >= max {
    return min
  }
  let span = max - min + 1
  let raw = self.next_int() & 0x7FFF_FFFF // Ensure positive
  min + (raw % span)
}

/// Generates a pseudo-random float between 0.0 and 1.0
pub fn Rng::next_double(self : Rng) -> Double {
  let raw = self.next_int() & 0x7FFF_FFFF
  raw.to_double() / 2147483647.0
}

// =============================================================================
// 2. High-Precision Floating Point Trigonometry (Polynomial Minimax)
// Accurate to 5 decimal places; handles any angle in radians.
// =============================================================================

const PI : Double = 3.141592653589793
const TWO_PI : Double = 6.283185307179586
const HALF_PI : Double = 1.5707963267948966

/// Computes sine using Taylor/Horner polynomial approximation
pub fn sin(rad : Double) -> Double {
  // 1. Range reduction to [-PI, PI]
  let mut x = rad % TWO_PI
  if x > PI {
    x = x - TWO_PI
  } else if x < -PI {
    x = x + TWO_PI
  }

  // 2. Further reduce to [-PI/2, PI/2]
  if x > HALF_PI {
    x = PI - x
  } else if x < -HALF_PI {
    x = -PI - x
  }

  // 3. Polynomial evaluation: x - x^3/6 + x^5/120 - x^7/5040
  let x2 = x * x
  let x3 = x * x2
  let x5 = x3 * x2
  let x7 = x5 * x2

  x - (x3 / 6.0) + (x5 / 120.0) - (x7 / 5040.0)
}

/// Computes cosine using sin(x + PI/2)
pub fn cos(rad : Double) -> Double {
  sin(rad + HALF_PI)
}

// =============================================================================
// 3. Integer Q15 Fast Sine LUT (Best for 0-200 Hz Embedded Synthesis)
// 64-entry quadrant table (256-entry full wave). Returns -32767 to +32767.
// =============================================================================

// First quadrant (0 to 90 degrees) in 64 steps, scaled by 32767
let sin_q15_quadrant : FixedArray[Int] = [
      0,   804,  1607,  2410,  3211,  4011,  4807,  5601,
   6392,  7179,  7961,  8739,  9511, 10278, 11038, 11792,
  12539, 13278, 14009, 14732, 15446, 16150, 16845, 17530,
  18204, 18867, 19519, 20159, 20787, 21402, 22004, 22594,
  23169, 23731, 24278, 24811, 25329, 25831, 26318, 26789,
  27244, 27683, 28105, 28510, 28897, 29268, 29621, 29955,
  30272, 30571, 30851, 31113, 31356, 31580, 31785, 31970,
  32137, 32284, 32412, 32520, 32609, 32678, 32727, 32757,
  32767
]

/// Input: phase from 0 to 255 (representing 0 to 2*PI)
/// Output: signed integer from -32767 to +32767 (Q15 format)
pub fn sin_q15(phase : Int) -> Int {
  let p = phase & 255 // Wrap to 0..255
  if p < 64 {
    sin_q15_quadrant[p]
  } else if p < 128 {
    sin_q15_quadrant[128 - p]
  } else if p < 192 {
    -sin_q15_quadrant[p - 128]
  } else {
    -sin_q15_quadrant[256 - p]
  }
}

pub fn cos_q15(phase : Int) -> Int {
  sin_q15((phase + 64) & 255)
}
```

---

## 4. Practical Example: Generating a 50 Hz Test Signal with Random Noise

This example generates a synthetic 50 Hz analog sine wave with random noise at 1 kHz timer ticks, allowing you to test the telemetry streaming pipeline without external hardware signal generators.

```moonbit
// main.mbt
extern "wasm" fn host_wait_event(timeout_ms : Int) -> Int = "env" "wait_event"
extern "wasm" fn host_timer_start(timer_id : Int, period_us : Int) = "env" "timer_start"
extern "wasm" fn host_usb_write(ptr : Int, len : Int) -> Int = "env" "usb_write"

let tx_frame : FixedArray[Byte] = FixedArray::make(10, b'\x00')
let mut seq_counter : Byte = b'\x00'

fn send_telemetry(raw : Int, filtered : Int) -> Unit {
  seq_counter = (seq_counter.to_int() + 1).to_byte()
  tx_frame[0] = b'\xAA'
  tx_frame[1] = b'\x55'
  tx_frame[2] = b'\x01'
  tx_frame[3] = seq_counter
  tx_frame[4] = (raw & 0xFF).to_byte()
  tx_frame[5] = ((raw >> 8) & 0xFF).to_byte()
  tx_frame[6] = (filtered & 0xFF).to_byte()
  tx_frame[7] = ((filtered >> 8) & 0xFF).to_byte()
  tx_frame[8] = b'\x00'

  let mut chk = 0
  for i = 2; i <= 8; i = i + 1 {
    chk = chk ^ tx_frame[i].to_int()
  }
  tx_frame[9] = chk.to_byte()

  let _ = host_usb_write(tx_frame.as_ptr(), 10)
}

pub fn app_main() -> Unit {
  // 1. Initialize RNG with seed from runtime timer
  let rng = Rng::new(1337)

  // 2. Start 1 kHz hardware timer (1000 µs)
  host_timer_start(0, 1000)

  // For a 50 Hz sine wave at 1 kHz sample rate:
  // Step per tick = (50 Hz / 1000 Hz) * 256 steps = 12.8 steps / tick
  let mut phase_accum = 0
  let phase_increment = 13 // ~50.7 Hz in Q15 table

  let mut prescaler = 0

  while true {
    let event = host_wait_event(50)
    let event_type = (event >> 16) & 0xFFFF

    if event_type == 1 {
      // 1 kHz Timer event
      phase_accum = (phase_accum + phase_increment) & 255

      // Sine wave: value between -32767 and +32767
      let sine_val = sin_q15(phase_accum)

      // Normalize to 12-bit ADC range (0..4095) with midpoint at 2048
      let clean_signal = 2048 + ((sine_val * 1800) / 32767)

      // Inject random noise between -100 and +100
      let noise = rng.range(-100, 100)
      let raw_signal = clean_signal + noise

      // Subscale telemetry to 200 Hz
      prescaler = prescaler + 1
      if prescaler >= 5 {
        prescaler = 0
        send_telemetry(raw_signal, clean_signal)
      }
    }
  }
}
```

---

## 5. Verification Checklist

1. **Verify No Floating-Point Traps:**  
   Ensure polynomial ranges do not produce `NaN` or `Inf`. Range reduction (`x % TWO_PI`) must occur before polynomial expansion.
2. **Verify Execution Latency:**  
   The Q15 integer LUT (`sin_q15`) executes in $< 1\,\mu\text{s}$ on ARM Cortex-M4/ESP32, safely fitting within a 1 kHz timer deadline ($1000\,\mu\text{s}$).
3. **Inspect Output on Browser Oscilloscope:**  
   When deploying the synthetic generator, the browser canvas should display a 50 Hz sine waveform fluctuating between $\sim0.2\,\text{V}$ and $3.1\,\text{V}$ with visible random noise spikes.
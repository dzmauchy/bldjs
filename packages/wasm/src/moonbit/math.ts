/** Pure MoonBit sin/cos/PRNG for the linear `wasm` MCU target (no JS Math, no core stdlib). */

function emitMathRandom(): string {
  return `fn math_random() -> Double {
  let mut x = mcu.rng
  x = 3.99 * x * (1.0 - x)
  mcu.rng = x
  x
}
`;
}

function emitMathTrig(includeCos: boolean): string {
  const cos = includeCos
    ? `
fn math_cos(rad : Double) -> Double {
  math_sin(rad + 1.5707963267948966)
}
`
    : "";
  return `fn rem_two_pi(rad : Double) -> Double {
  let two_pi = 6.283185307179586
  let mut x = rad
  if x < 0.0 {
    x = -x
  }
  let mut step = two_pi
  while step < x {
    step = step * 2.0
  }
  while step >= two_pi {
    if x >= step {
      x = x - step
    }
    step = step / 2.0
  }
  if rad < 0.0 {
    x = -x
  }
  x
}

fn math_sin(rad : Double) -> Double {
  let pi = 3.141592653589793
  let half_pi = 1.5707963267948966
  let two_pi = 6.283185307179586
  let mut x = rem_two_pi(rad)
  if x > pi {
    x = x - two_pi
  } else if x < -pi {
    x = x + two_pi
  }
  if x > half_pi {
    x = pi - x
  } else if x < -half_pi {
    x = -pi - x
  }
  let x2 = x * x
  let x3 = x * x2
  let x5 = x3 * x2
  let x7 = x5 * x2
  x - (x3 / 6.0) + (x5 / 120.0) - (x7 / 5040.0)
}
${cos}`;
}

function emitMathExp(): string {
  return `fn math_exp(x : Double) -> Double {
  if x < -20.0 {
    return 0.0
  }
  if x > 20.0 {
    return 485165195.4097903
  }
  let mut sum = 1.0
  let mut term = 1.0
  let mut n = 1.0
  while n < 24.0 {
    term = term * x / n
    sum = sum + term
    n = n + 1.0
  }
  sum
}
`;
}

function emitMathSqrt(): string {
  return `fn math_sqrt(x : Double) -> Double {
  if x <= 0.0 {
    return 0.0
  }
  let mut g = x
  let mut i = 0.0
  while i < 16.0 {
    g = 0.5 * (g + x / g)
    i = i + 1.0
  }
  g
}
`;
}

export function emitEmbeddedMath(needs: { sin?: boolean; cos?: boolean; exp?: boolean; sqrt?: boolean; random?: boolean } = {}): string {
  const parts: string[] = [];
  if (needs.random) {
    parts.push(emitMathRandom());
  }
  if (needs.sin || needs.cos) {
    parts.push(emitMathTrig(Boolean(needs.cos)));
  }
  if (needs.exp) {
    parts.push(emitMathExp());
  }
  if (needs.sqrt) {
    parts.push(emitMathSqrt());
  }
  return parts.join("\n");
}

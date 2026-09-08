/** ES2025 block implementations and runtime helpers executed in the diagram runner. */

function sample(value: f64 | f32 | number): number {
  return Number(value);
}

function mux<T>(make: (index: number) => T): Multiplexed<T> {
  const items: T[] = [];
  return new Proxy(items, {
    get(target, prop, recv) {
      if (prop === "length") {
        return target.length;
      }
      if (typeof prop === "string") {
        const i = Number(prop);
        if (i === i && prop === String(i)) {
          while (target.length <= i) {
            target.push(make(target.length));
          }
          return target[i];
        }
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

function slot<T>(value: Multiplexed<T>, index: number): T {
  return value[index]!;
}

function fork<T>(...consumers: c<T>[]): c<T> {
  return (v: T) => {
    for (let i = 0; i < consumers.length; i++) {
      consumers[i]!(v);
    }
  };
}

function tap<T>(index: number, consumer: c<T>): c<T> {
  return (v: T) => {
    host.tap(index, Number(v));
    consumer(v);
  };
}

function nop<T>(_value: T): void {}

function overshootFromValue(ζ: number, ω: number, inp: c<f32>): [out: c<f32>] {
  return com.dauch.cs.tf.overshoot(ζ, ω, inp);
}

export namespace com.dauch.cs.gen {
  export function timer(period: number, inp: c<f32>): void {
    host.setInterval(() => {
      inp(host.now() as f32);
    }, period);
  }

  export function random(period: number, inp: c<f32>): void {
    host.setInterval(() => {
      inp(host.random() as f32);
    }, period);
  }

  export function constant(value: number, period: number, inp: c<f32>): void {
    host.setInterval(() => {
      inp(value as f32);
    }, period);
  }
}

export namespace com.dauch.cs.gpio {
  export function gpio_in(pin: number, inp: c<f32>): void {
    const samplePin = () => {
      inp((host.pinRead(pin) !== 0 ? 1 : 0) as f32);
    };
    samplePin();
    host.onPinChange(pin, samplePin);
  }

  export function gpio_out(pin: number): [out: c<f32>] {
    return [
      (v: f32) => {
        host.pinWrite(pin, sample(v) > 0.5 ? 1 : 0);
      },
    ];
  }
}

export namespace com.dauch.cs.tf {
  export function sin(inp: c<f32>): [out: c<f32>] {
    return [
      (v: f32) => {
        inp(Math.sin(sample(v)) as f32);
      },
    ];
  }

  export function cos(inp: c<f32>): [out: c<f32>] {
    return [
      (v: f32) => {
        inp(Math.cos(sample(v)) as f32);
      },
    ];
  }

  export function overshoot(ζ: number, ω: number, inp: c<f32>): [out: c<f32>] {
    let initialized = 0;
    let tStep = 0;
    let baseY = 0;
    let targetU = 0;
    let currentY = 0;
    return [
      (v: f32) => {
        const u = sample(v);
        const curT = host.now();
        if (initialized === 0) {
          initialized = 1;
          tStep = curT;
          baseY = u;
          targetU = u;
          currentY = u;
          inp(u as f32);
          return;
        }
        const diff = u - targetU;
        if (diff > 0.000001 || diff < -0.000001) {
          tStep = curT;
          baseY = currentY;
          targetU = u;
        }
        const tau = curT - tStep;
        const t = tau < 0 ? 0 : tau;
        const wd = ω * Math.sqrt(1 - ζ * ζ);
        const sigma = ζ * ω;
        const decay = Math.exp(0 - sigma * t);
        const phase = wd * t;
        const factor = 1 - decay * (Math.cos(phase) + (sigma / wd) * Math.sin(phase));
        const y = baseY + (targetU - baseY) * factor;
        currentY = y;
        inp(y as f32);
      },
    ];
  }

  export function product(n: number, def: number, inp: c<f32>): [out: Multiplexed<c<f32>>] {
    const slots: number[] = [];
    const seen: number[] = [];
    for (let i = 0; i < n; i++) {
      slots.push(def);
      seen.push(0);
    }
    let mask = 0;
    const list = mux((index: number) => {
      const bit = 1 << index;
      mask = mask | bit;
      return (v: f32) => {
        slots[index] = sample(v);
        seen[index] = 1;
        let ready = 1;
        let prod = 1;
        for (let i = 0; i < n; i++) {
          prod = prod * slots[i]!;
          if ((mask & (1 << i)) !== 0 && seen[i] === 0) {
            ready = 0;
          }
        }
        if (ready !== 0) {
          inp(prod as f32);
        }
      };
    });
    return [list];
  }
}

export namespace com.dauch.cs.sink {
  export function scope(n: number, m: number): [out: Multiplexed<c<f32>>] {
    const id = host.currentBlock();
    const latest: number[] = [];
    const windowMs = n * 1000;
    const history: Array<Array<{ t: number; v: number }>> = [];

    const plots = mux((index: number) => {
      latest[index] = Number.NaN;
      history[index] = [];
      return (v: f32) => {
        const s = sample(v);
        latest[index] = s;
        const now = host.now();
        const series = history[index]!;
        series.push({ t: now, v: s });
        const cutoff = now - windowMs;
        while (series.length > 0 && series[0]!.t < cutoff) {
          series.shift();
        }
      };
    });

    host.setInterval(() => {
      host.postScope(id, latest.slice(), n, m);
    }, m);

    return [plots];
  }
}

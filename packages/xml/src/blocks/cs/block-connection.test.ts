import { describe, expect, it } from "vitest";
import {
  AbstractBlock,
  ConstantBlock,
  CosBlock,
  GpioInBlock,
  GpioOutBlock,
  OvershootBlock,
  ProductBlock,
  RandomBlock,
  ScopeBlock,
  SinBlock,
  TimerBlock,
  connectBlocks,
  createBlock,
} from "./blocks";
import { overshootStep } from "./transformers";

describe("TS Blocks reflecting XML Blocks", () => {
  it("creates all 10 catalog blocks with matching XML defIds and ports", () => {
    const timer = createBlock("timer", { periodMs: 20 });
    expect(timer).toBeInstanceOf(TimerBlock);
    expect(timer?.defId).toBe("timer");
    expect(timer?.name).toBe("Timer");
    expect((timer as TimerBlock).periodMs).toBe(20);
    expect(timer?.inputs).toHaveLength(1);

    const random = createBlock("random");
    expect(random).toBeInstanceOf(RandomBlock);
    expect(random?.defId).toBe("random");

    const constant = createBlock("constant", { value: 3.14 });
    expect(constant).toBeInstanceOf(ConstantBlock);
    expect((constant as ConstantBlock).value).toBe(3.14);

    const gpioIn = createBlock("gpio_in", { pin: 4 });
    expect(gpioIn).toBeInstanceOf(GpioInBlock);
    expect((gpioIn as GpioInBlock).pin).toBe(4);

    const gpioOut = createBlock("gpio_out", { pin: 12 });
    expect(gpioOut).toBeInstanceOf(GpioOutBlock);
    expect((gpioOut as GpioOutBlock).pin).toBe(12);

    const sin = createBlock("sin");
    expect(sin).toBeInstanceOf(SinBlock);

    const cos = createBlock("cos");
    expect(cos).toBeInstanceOf(CosBlock);

    const overshoot = createBlock("overshoot", { zeta: 0.7, omega: 5 });
    expect(overshoot).toBeInstanceOf(OvershootBlock);
    expect((overshoot as OvershootBlock).zeta).toBe(0.7);
    expect((overshoot as OvershootBlock).omega).toBe(5);

    const product = createBlock("product", { count: 3, def: 2 });
    expect(product).toBeInstanceOf(ProductBlock);
    expect((product as ProductBlock).count).toBe(3);
    expect((product as ProductBlock).def).toBe(2);

    const scope = createBlock("scope", { windowS: 60, meterMs: 50 });
    expect(scope).toBeInstanceOf(ScopeBlock);
    expect((scope as ScopeBlock).windowS).toBe(60);
    expect((scope as ScopeBlock).meterMs).toBe(50);

    expect(createBlock("unknown_block")).toBeUndefined();
  });
});

describe("Block Connection", () => {
  it("connects and disconnects ports between blocks", () => {
    const timer = new TimerBlock(1);
    const sin = new SinBlock(2);

    timer.connect("out", sin, "in");
    expect(timer.connections).toHaveLength(1);
    expect(timer.connections[0]).toEqual({ fromPort: "out", targetBlock: sin, toPort: "in" });

    // Idempotent connect
    timer.connect("out", sin, "in");
    expect(timer.connections).toHaveLength(1);

    // Disconnect
    timer.disconnect("out", sin, "in");
    expect(timer.connections).toHaveLength(0);
  });

  it("connectBlocks helper function connects blocks cleanly", () => {
    const sin = new SinBlock(1);
    const scope = new ScopeBlock(2);

    connectBlocks(sin, "out", scope, "in");
    expect(sin.connections).toHaveLength(1);
    expect(sin.connections[0]!.targetBlock).toBe(scope);
  });
});

describe("Signal Handling", () => {
  it("routes timer signal through sin transformer to scope sink", () => {
    const timer = new TimerBlock(1);
    const sin = new SinBlock(2);
    const scope = new ScopeBlock(3);

    timer.connect("out", sin, "in");
    sin.connect("out", scope, "in");

    // Send signals at specific timestamps
    timer.tick(0);
    expect(scope.latest(0)).toBeCloseTo(Math.sin(0));

    timer.tick(Math.PI / 6);
    expect(scope.latest(0)).toBeCloseTo(0.5);

    timer.tick(Math.PI / 2);
    expect(scope.latest(0)).toBeCloseTo(1.0);

    timer.tick(Math.PI);
    expect(scope.latest(0)).toBeCloseTo(0.0);

    const samples = scope.getSamples(0);
    expect(samples).toHaveLength(4);
    expect(samples[1]).toBeCloseTo(0.5);
    expect(samples[2]).toBeCloseTo(1.0);
  });

  it("routes timer signal through cos transformer to scope sink", () => {
    const timer = new TimerBlock(1);
    const cos = new CosBlock(2);
    const scope = new ScopeBlock(3);

    timer.connect("out", cos, "in");
    cos.connect("out", scope, "in");

    timer.tick(0);
    expect(scope.latest(0)).toBeCloseTo(1.0);

    timer.tick(Math.PI / 3);
    expect(scope.latest(0)).toBeCloseTo(0.5);

    timer.tick(Math.PI);
    expect(scope.latest(0)).toBeCloseTo(-1.0);
  });

  it("routes timer signal through overshoot transformer", () => {
    const timer = new TimerBlock(1);
    const overshoot = new OvershootBlock(2, 0.5, 2, false);
    const scope = new ScopeBlock(3);

    timer.connect("out", overshoot, "in");
    overshoot.connect("out", scope, "in");

    timer.tick(0);
    expect(scope.latest(0)).toBeCloseTo(overshootStep(0, 0.5, 2));

    timer.tick(1.0);
    expect(scope.latest(0)).toBeCloseTo(overshootStep(1.0, 0.5, 2));

    timer.tick(2.5);
    expect(scope.latest(0)).toBeCloseTo(overshootStep(2.5, 0.5, 2));
  });

  it("handles product combination across multiple slots", () => {
    const prod = new ProductBlock(1, 3, 1);
    const scope = new ScopeBlock(2);

    prod.connect("out", scope, "in");

    // Unwired slots default to 1.0 (1 * 1 * 1 = 1)
    expect(prod.product()).toBe(1);

    // Slot 0 updated to 2.0 -> (2 * 1 * 1 = 2)
    prod.handleSignal("in", 2.0); // portSlotIndex("in") == 0
    expect(scope.latest(0)).toBe(2.0);

    // Slot 1 updated to 3.0 -> (2 * 3 * 1 = 6)
    prod.handleSignal("in[1]", 3.0);
    expect(scope.latest(0)).toBe(6.0);

    // Slot 2 updated to 4.0 -> (2 * 3 * 4 = 24)
    prod.handleSignal("in[2]", 4.0);
    expect(scope.latest(0)).toBe(24.0);

    expect(scope.getSamples(0)).toEqual([2.0, 6.0, 24.0]);
  });

  it("handles GPIO In level change and routes to GPIO Out", () => {
    const gpioIn = new GpioInBlock(1, 0);
    const gpioOut = new GpioOutBlock(2, 1);

    gpioIn.connect("out", gpioOut, "in");

    expect(gpioIn.level).toBe(0);
    expect(gpioOut.getLevel()).toBe(0);

    // Turn GPIO In on
    gpioIn.setLevel(1);
    expect(gpioIn.level).toBe(1);
    expect(gpioOut.getLevel()).toBe(1);

    // Turn GPIO In off
    gpioIn.setLevel(0);
    expect(gpioIn.level).toBe(0);
    expect(gpioOut.getLevel()).toBe(0);
  });

  it("forks signals to multiple downstream blocks simultaneously", () => {
    const timer = new TimerBlock(1);
    const sin = new SinBlock(2);
    const cos = new CosBlock(3);
    const scope = new ScopeBlock(4);

    // Fork timer output to both sin and cos
    timer.connect("out", sin, "in");
    timer.connect("out", cos, "in");

    // Feed sin to scope slot 0 and cos to scope slot 1
    sin.connect("out", scope, "out[0]");
    cos.connect("out", scope, "out[1]");

    timer.tick(Math.PI / 4);

    expect(scope.latest(0)).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(scope.latest(1)).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it("reflects parameter updates in signal handling", () => {
    const constant = new ConstantBlock(1, 5.0);
    const scope = new ScopeBlock(2);

    constant.connect("out", scope, "in");
    constant.tick();
    expect(scope.latest(0)).toBe(5.0);

    // Change constant value parameter
    constant.value = 10.5;
    constant.tick();
    expect(scope.latest(0)).toBe(10.5);

    // Test overshoot parameter updates
    const overshoot = new OvershootBlock(3, 0.2, 1.0, false);
    const valBefore = overshoot.map(1.0);
    overshoot.zeta = 0.8;
    overshoot.omega = 4.0;
    const valAfter = overshoot.map(1.0);
    expect(valBefore).not.toBeCloseTo(valAfter);
  });
});

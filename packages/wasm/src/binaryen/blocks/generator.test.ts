import binaryen from "binaryen";
import { describe, expect, it } from "vitest";
import {
  BLOCK_SCRIPTS,
  FAIL_TAG,
  JS_STRING_MODULE,
  QUANTIZER_PERIOD_NS,
  addCatalogTypes,
  addFailTag,
  addJsStringBuiltins,
  addWait,
  wasmFeatures,
} from "../index";
import { addRandom, addTimer } from "./generator";
import { addSin } from "./sin";

describe("generator catalog", () => {
  it("repeats the XML signature plus $ctx and parks with atomic.wait when shared", () => {
    const module = new binaryen.Module();
    try {
      module.setFeatures(wasmFeatures(binaryen));
      const types = addCatalogTypes(binaryen, module);
      addWait(module);
      addTimer(module, types, { sharedMemory: true });
      const text = module.emitText();
      expect(text).toContain("(param $ctx i32)");
      expect(text).toContain("(param $in (ref $c1_f64))");
      expect(text).not.toContain("(result (ref $c1_f64))");
      expect(text).toContain("memory.atomic.wait32");
      expect(QUANTIZER_PERIOD_NS).toBe(10_000_000);
    } finally {
      module.dispose();
    }
  });

  it("skips wait on non-shared memory", () => {
    const module = new binaryen.Module();
    try {
      module.setFeatures(wasmFeatures(binaryen));
      const types = addCatalogTypes(binaryen, module);
      addTimer(module, types, { sharedMemory: false });
      expect(module.emitText()).not.toContain("memory.atomic.wait32");
    } finally {
      module.dispose();
    }
  });

  it("samples random through host_random", () => {
    const module = new binaryen.Module();
    try {
      module.setFeatures(wasmFeatures(binaryen));
      const types = addCatalogTypes(binaryen, module);
      addRandom(module, types, { sharedMemory: false });
      expect(module.emitText()).toContain("call $host_random");
    } finally {
      module.dispose();
    }
  });
});

describe("transformer catalog", () => {
  it("repeats the XML c<f64> → c<f64> signature plus $ctx", () => {
    const module = new binaryen.Module();
    try {
      module.setFeatures(wasmFeatures(binaryen));
      const types = addCatalogTypes(binaryen, module);
      addSin(module, types);
      const text = module.emitText();
      expect(text).toContain("(param $ctx i32)");
      expect(text).toContain("(param $in (ref $c1_f64))");
      expect(text).toContain("(result (ref $c1_f64))");
      expect(text).toContain("call $host_sin");
      expect(text).not.toContain("memory.atomic.wait32");
    } finally {
      module.dispose();
    }
  });
});

describe("binaryen feature library", () => {
  it("enables the WASM proposals used by the block library", () => {
    const flags = wasmFeatures(binaryen);
    expect(flags & binaryen.Features.Atomics).toBeTruthy();
    expect(flags & binaryen.Features.MutableGlobals).toBeTruthy();
    expect(flags & binaryen.Features.BulkMemory).toBeTruthy();
    expect(flags & binaryen.Features.ExceptionHandling).toBeTruthy();
    expect(flags & binaryen.Features.ReferenceTypes).toBeTruthy();
    expect(flags & binaryen.Features.Multivalue).toBeTruthy();
    expect(flags & binaryen.Features.GC).toBeTruthy();
    expect(flags & binaryen.Features.ExtendedConst).toBeTruthy();
    expect(Object.keys(BLOCK_SCRIPTS).sort()).toEqual(["cos", "random", "scope", "sin", "timer"]);
  });

  it("declares js-string-builtins and an exception tag", () => {
    const module = new binaryen.Module();
    try {
      module.setFeatures(wasmFeatures(binaryen));
      addJsStringBuiltins(module);
      addFailTag(module);
      const text = module.emitText();
      expect(text).toContain(`(import "${JS_STRING_MODULE}" "length"`);
      expect(text).toContain(`(import "${JS_STRING_MODULE}" "concat"`);
      expect(text).toContain(`(tag $${FAIL_TAG}`);
    } finally {
      module.dispose();
    }
  });
});

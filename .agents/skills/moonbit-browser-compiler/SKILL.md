---
name: moonbit-browser-compiler
description: In-browser compilation pipeline using moonc.wasm in a Web Worker, producing linear-memory WebAssembly MVP binaries without generating C files or relying on a backend.
version: 1.0.0
tags:
  - moonbit
  - webassembly
  - browser-compiler
  - web-worker
---

# MoonBit In-Browser Compiler Pipeline

This skill compiles MoonBit code directly into standalone `.wasm` binaries inside the browser. The output targets linear-memory WebAssembly MVP, ready to stream over USB to an MCU running a pre-flashed runtime.

## Requirements
- Target must strictly be `wasm` (linear-memory MVP). Embedded engines (WAMR/Wasm3) do not support `wasm-gc`.
- Compiles source strings directly into `.wasm` bytes; no intermediate C files or backend toolchains are involved.
- Runs in a dedicated Web Worker to isolate compilation from the IDE editor thread.

## Web Worker (`compiler.worker.js`)

```javascript
importScripts("[https://try.moonbitlang.com/moonc.js](https://try.moonbitlang.com/moonc.js)");

let compiler = null;

async function initCompiler() {
  compiler = await MoonbitCompiler.create({
    coreLibUrl: "[https://try.moonbitlang.com/core.tar.gz](https://try.moonbitlang.com/core.tar.gz)",
    target: "wasm"
  });
  postMessage({ type: "READY" });
}

self.onmessage = async (event) => {
  const { type, sourceCode } = event.data;

  if (type === "INIT") {
    await initCompiler();
    return;
  }

  if (type === "COMPILE") {
    try {
      const result = await compiler.compile({
        files: {
          "moon.mod.json": JSON.stringify({
            name: "embedded_app",
            version: "0.1.0",
            "preferred-target": "wasm"
          }),
          "moon.pkg.json": JSON.stringify({
            "link": {
              "wasm": {
                "export-memory-name": "memory",
                "memory-limits": { "min": 2, "max": 8 }
              }
            }
          }),
          "main.mbt": sourceCode
        },
        target: "wasm",
        optLevel: 3
      });

      if (result.errors && result.errors.length > 0) {
        postMessage({ type: "COMPILE_ERROR", errors: result.errors });
      } else {
        postMessage(
          { type: "COMPILE_SUCCESS", wasmBinary: result.wasm },
          [result.wasm.buffer]
        );
      }
    } catch (err) {
      postMessage({ type: "FATAL_ERROR", message: err.toString() });
    }
  }
};
```

## Compilation Helper (`compiler_client.js`)

```javascript
export function compileMoonBit(worker, sourceCode) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      const { type, wasmBinary, errors, message } = event.data;
      if (type === "COMPILE_SUCCESS") {
        worker.removeEventListener("message", handler);
        resolve(wasmBinary);
      } else if (type === "COMPILE_ERROR") {
        worker.removeEventListener("message", handler);
        reject(new Error(JSON.stringify(errors, null, 2)));
      } else if (type === "FATAL_ERROR") {
        worker.removeEventListener("message", handler);
        reject(new Error(message));
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "COMPILE", sourceCode });
  });
}
```
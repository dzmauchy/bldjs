import { describe, expect, it } from "vitest";
import { serializeCanvas } from "../diagram/json";
import { compileTypeScript } from "./emit";
import { createRuntimeHost, runCompiledDiagram } from "../runtime/host";

describe("TypeScript diagram emit", () => {
  it("keeps typed-array aliases in the source and erases them in JS", () => {
    const source = serializeCanvas({
      id: "diag",
      name: "Pipe",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "timer", x: 180, y: 0 },
      ],
      links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    });
    expect(source).toContain("type f32 = Float32Array[1]");
    expect(source).toContain("type c<T> = (arg: T) => void");
    const js = compileTypeScript(source);
    expect(js).not.toContain("type f32");
    expect(js).not.toMatch(/:\s*c</);
    expect(js).toContain("com.dauch.cs.gen.timer");
    expect(js).toContain("com.dauch.cs.sink.scope");
    expect(js).not.toMatch(/<T>/);
    expect(js).not.toMatch(/\w\?[,)]/);
  });

  it("runs erased diagram JS against a host", () => {
    const source = serializeCanvas({
      id: "diag",
      name: "Pipe",
      createdAt: "2026-08-31T05:00:00Z",
      updatedAt: "2026-08-31T05:00:00Z",
      blocks: [
        { id: 1, defId: "scope", x: 0, y: 0 },
        { id: 2, defId: "timer", x: 180, y: 0 },
      ],
      links: [{ fromBlock: 1, fromOut: "out", toBlock: 2, toIn: "in" }],
    });
    const messages: Array<{ type: string }> = [];
    const host = createRuntimeHost({
      connectorCount: 1,
      delayMs: 10,
      post(message) {
        messages.push(message);
      },
    });
    runCompiledDiagram(compileTypeScript(source), host);
    expect(messages.some((item) => item.type === "scope")).toBe(true);
    host.stop();
  });
});

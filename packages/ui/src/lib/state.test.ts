import { describe, expect, it } from "vitest";
import { BLOCK_PLACE_HEIGHT, BLOCK_PLACE_WIDTH } from "./model";
import { AppState } from "./state";
import { MemoryDiagramRepository } from "@bld/xml";

function wireCsPipeline(app: AppState): { timerId: number; scopeId: number } {
  const timerId = app.nextId;
  app.addBlock("timer", 0, 0);
  const quantizerId = app.nextId;
  app.addBlock("quantizer", 180, 0);
  const sinId = app.nextId;
  app.addBlock("sin", 360, 0);
  const scopeId = app.nextId;
  app.addBlock("scope", 540, 0);
  app.toggleLink(scopeId, "out", quantizerId, "in");
  app.toggleLink(quantizerId, "out", sinId, "in");
  app.toggleLink(sinId, "out", timerId, "in");
  return { timerId, scopeId };
}

describe("AppState placement", () => {
  it("indexes placed blocks by id", () => {
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("timer", 8, 4);
    expect(app.block(id)).toEqual({ id, defId: "timer", x: 8, y: 4 });
    expect(app.block(id + 1)).toBeUndefined();
  });

  it("tiles double-clicked blocks so they do not overlap", () => {
    const app = new AppState();
    app.viewportW = 800;
    app.viewportH = 600;
    app.addBlockAtViewCenter("scope");
    app.addBlockAtViewCenter("quantizer");
    app.addBlockAtViewCenter("sin");
    app.addBlockAtViewCenter("timer");
    for (let i = 0; i < app.blocks.length; i++) {
      for (let j = i + 1; j < app.blocks.length; j++) {
        const a = app.blocks[i];
        const b = app.blocks[j];
        const overlapX = Math.abs(a.x - b.x) < BLOCK_PLACE_WIDTH;
        const overlapY = Math.abs(a.y - b.y) < BLOCK_PLACE_HEIGHT;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("does not notify subscribers when the viewport size changes", () => {
    const app = new AppState();
    const seen: string[] = [];
    app.subscribe(() => seen.push("change"));
    app.viewportW = 1024;
    app.viewportH = 768;
    expect(seen).toEqual([]);
    expect(app.viewportW).toBe(1024);
    expect(app.viewportH).toBe(768);
    app.zoom = 1.15;
    expect(seen).toEqual(["change"]);
  });

  it("hides the palette on compact screens until it is opened or a drag starts", () => {
    const app = new AppState();
    app.compactUi = false;
    expect(app.paletteVisible()).toBe(true);
    app.compactUi = true;
    expect(app.paletteVisible()).toBe(false);
    app.togglePalette();
    expect(app.paletteOpen).toBe(true);
    expect(app.paletteVisible()).toBe(true);
    app.closePalette();
    expect(app.paletteVisible()).toBe(false);
    app.draggingDefId = "sin";
    expect(app.paletteVisible()).toBe(true);
  });
});

describe("AppState wiring", () => {
  it("keeps multiple c<f64> wires into one input", () => {
    const app = new AppState();
    const scopeA = app.nextId;
    app.addBlock("scope", 0, 0);
    const scopeB = app.nextId;
    app.addBlock("scope", 0, 120);
    const timerId = app.nextId;
    app.addBlock("timer", 300, 0);
    app.toggleLink(scopeA, "out", timerId, "in");
    app.toggleLink(scopeB, "out", timerId, "in");
    expect(app.links).toEqual([
      { fromBlock: scopeA, fromOut: "out", toBlock: timerId, toIn: "in" },
      { fromBlock: scopeB, fromOut: "out", toBlock: timerId, toIn: "in[1]" },
    ]);
    expect(app.canRun()).toBe(true);
  });

  it("inserts a new fan-in slot above when the source is above an existing wire", () => {
    const app = new AppState();
    const lower = app.nextId;
    app.addBlock("sin", 0, 120);
    const upper = app.nextId;
    app.addBlock("cos", 0, 0);
    const timerId = app.nextId;
    app.addBlock("timer", 300, 40);
    app.toggleLink(lower, "out", timerId, "in");
    app.toggleLink(upper, "out", timerId, "in");
    expect(app.links).toEqual([
      { fromBlock: lower, fromOut: "out", toBlock: timerId, toIn: "in[1]" },
      { fromBlock: upper, fromOut: "out", toBlock: timerId, toIn: "in" },
    ]);
  });

  it("keeps two vector channels from one scope", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    const timerId = app.nextId;
    app.addBlock("timer", 360, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.toggleLink(sinId, "out", timerId, "in");
    app.toggleLink(cosId, "out", timerId, "in");
    expect(app.links).toEqual([
      { fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" },
      { fromBlock: scopeId, fromOut: "out[1]", toBlock: cosId, toIn: "in" },
      { fromBlock: sinId, fromOut: "out", toBlock: timerId, toIn: "in" },
      { fromBlock: cosId, fromOut: "out", toBlock: timerId, toIn: "in[1]" },
    ]);
    expect(app.canRun()).toBe(true);
    expect(app.plannedGenerators()[0].channels).toEqual([
      { scopeId, label: "sin" },
      { scopeId, label: "cos" },
    ]);
  });

  it("drops extra slots when an extra connector is removed", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    const timerId = app.nextId;
    app.addBlock("timer", 360, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.toggleLink(sinId, "out", timerId, "in");
    app.toggleLink(cosId, "out", timerId, "in");
    app.removeLink({ fromBlock: scopeId, fromOut: "out[1]", toBlock: cosId, toIn: "in" });
    expect(app.links).toEqual([
      { fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" },
      { fromBlock: sinId, fromOut: "out", toBlock: timerId, toIn: "in" },
      { fromBlock: cosId, fromOut: "out", toBlock: timerId, toIn: "in[1]" },
    ]);
    app.removeLink({ fromBlock: cosId, fromOut: "out", toBlock: timerId, toIn: "in[1]" });
    expect(app.links).toEqual([
      { fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" },
      { fromBlock: sinId, fromOut: "out", toBlock: timerId, toIn: "in" },
    ]);
  });

  it("compacts remaining slots after the first extra wire is removed", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.removeLink({ fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" });
    expect(app.links).toEqual([{ fromBlock: scopeId, fromOut: "out", toBlock: cosId, toIn: "in" }]);
  });

  it("toggles an extra slotted wire off from the catalog ports", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    expect(app.links).toEqual([{ fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" }]);
  });

  it("grounds scope into quantizer", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(scopeId, "out", quantizerId, "in");
    expect(app.links).toEqual([
      { fromBlock: scopeId, fromOut: "out", toBlock: quantizerId, toIn: "in" },
    ]);
  });

  it("deletes a selected connector without removing blocks", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(scopeId, "out", quantizerId, "in");
    app.selectLink({ fromBlock: scopeId, fromOut: "out", toBlock: quantizerId, toIn: "in" });
    app.deleteSelected();
    expect(app.links).toEqual([]);
    expect(app.blocks).toHaveLength(2);
    expect(app.selectedLink).toBeNull();
  });

  it("removes a block and its links", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const quantizerId = app.nextId;
    app.addBlock("quantizer", 300, 0);
    app.toggleLink(scopeId, "out", quantizerId, "in");
    app.removeBlock(scopeId);
    expect(app.blocks.map((block) => block.defId)).toEqual(["quantizer"]);
    expect(app.links).toEqual([]);
  });
});

describe("AppState run", () => {
  it("keeps the same topology key when a block is only moved", () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    const before = app.timerTopologyKey();
    app.moveBlock(timerId, 40, -12);
    expect(app.timerTopologyKey()).toBe(before);
  });

  it("does not start generators until Run", () => {
    const app = new AppState();
    const { scopeId } = wireCsPipeline(app);
    expect(app.running).toBe(false);
    expect(app.canRun()).toBe(true);
    expect(app.isScopeLive(scopeId)).toBe(false);
    app.openScope(scopeId);
    expect(app.scopeOpen).toBe(-1);
  });

  it("enables the scope chart and wire rates as soon as Run starts", async () => {
    const app = new AppState();
    const { timerId, scopeId } = wireCsPipeline(app);
    const link = app.links.find((item) => item.toBlock === timerId)!;
    const pending = app.runDiagram();
    expect(app.starting).toBe(true);
    expect(app.running).toBe(false);
    expect(app.isScopeLive(scopeId)).toBe(true);
    expect(app.connectorHz(link)).toBeGreaterThan(0);
    await pending;
    expect(app.running).toBe(true);
    expect(app.starting).toBe(false);
    expect(app.isScopeLive(scopeId)).toBe(true);
    app.stopRun();
  });

  it("run compiles wasm and enables the scope chart", async () => {
    const app = new AppState();
    const { timerId, scopeId } = wireCsPipeline(app);
    await app.runDiagram();
    expect(app.running).toBe(true);
    expect(app.runError).toBeNull();
    expect(app.isScopeLive(scopeId)).toBe(true);
    app.openScope(scopeId);
    expect(app.scopeOpen).toBe(scopeId);

    app.moveBlockTo(timerId, 24, 16);
    expect(app.running).toBe(true);
    expect(app.isScopeLive(scopeId)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.snapshotScope(scopeId);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("sin → quantizer");
    expect(series[0].samples.length).toBeGreaterThan(0);
    app.stopRun();
    expect(app.running).toBe(false);
    expect(app.isScopeLive(scopeId)).toBe(false);
  });

  it("seeds connector frequency on run and measures runner intercepts", async () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    await app.runDiagram();
    const link = app.links.find((item) => item.toBlock === timerId)!;
    expect(app.connectorHz(link)).toBeGreaterThan(0);
    const t0 = 1_000;
    app.sampleFlowRates(t0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    app.sampleFlowRates(t0 + 40);
    expect(app.connectorHz(link)).toBeGreaterThan(0);
    app.stopRun();
    expect(app.connectorHz(link)).toBe(0);
  });

  it("ignores a second Run until Stop", async () => {
    const app = new AppState();
    const { scopeId } = wireCsPipeline(app);
    await app.runDiagram();
    expect(app.running).toBe(true);
    expect(app.starting).toBe(false);
    expect(app.isScopeLive(scopeId)).toBe(true);
    await app.runDiagram();
    expect(app.running).toBe(true);
    expect(app.isScopeLive(scopeId)).toBe(true);
    app.stopRun();
    expect(app.running).toBe(false);
    expect(app.starting).toBe(false);
    await app.runDiagram();
    expect(app.running).toBe(true);
    app.stopRun();
  });

  it("run snapshots two series for an scope vector", async () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 180, 0);
    const cosId = app.nextId;
    app.addBlock("cos", 180, 120);
    const timerId = app.nextId;
    app.addBlock("timer", 360, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.toggleLink(sinId, "out", timerId, "in");
    app.toggleLink(cosId, "out", timerId, "in");
    await app.runDiagram();
    expect(app.running).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.snapshotScope(scopeId);
    expect(series.map((channel) => channel.label)).toEqual(["sin", "cos"]);
    expect(series[0].samples.length).toBeGreaterThan(0);
    expect(series[1].samples.length).toBeGreaterThan(0);
    app.stopRun();
  });

  it("stops the run when the wiring changes", async () => {
    const app = new AppState();
    const { timerId } = wireCsPipeline(app);
    await app.runDiagram();
    expect(app.running).toBe(true);

    app.toggleLink(app.blocks.find((block) => block.defId === "sin")!.id, "out", timerId, "in");
    expect(app.running).toBe(false);
    expect(app.canRun()).toBe(false);
  });
});

describe("AppState diagram XML", () => {
  it("exports and imports a wired canvas through diagram XML", () => {
    const app = new AppState();
    wireCsPipeline(app);
    const xml = app.toDiagramXml();
    expect(xml).toContain("<diagram");
    expect(xml).toContain("<catalog>types.xml</catalog>");
    expect(xml).toContain("<catalog>control-systems.xml</catalog>");
    expect(xml).toContain('type="timer"');
    expect(xml).toContain("<connector");

    const other = new AppState();
    expect(other.loadDiagramXml(xml)).toBe(true);
    expect(other.blocks.map((block) => block.defId)).toEqual(["timer", "quantizer", "sin", "scope"]);
    expect(other.links).toHaveLength(3);
    expect(other.canRun()).toBe(true);
    expect(other.diagramName).toBe("Workspace");
  });

  it("uses a block name when present and the XML id otherwise", () => {
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    expect(app.blockDisplayName(id)).toBe(`blk_${id}`);

    expect(
      app.loadDiagramXml(`<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_named" name="Named" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <blocks>
    <block id="blk_probe" type="scope" name="Probe" x="0" y="0" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z"/>
    <block id="blk_plain" type="scope" x="180" y="0" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z"/>
  </blocks>
</diagram>`),
    ).toBe(true);
    const named = app.blocks.find((block) => app.blockDisplayName(block.id) === "Probe");
    const plain = app.blocks.find((block) => app.blockDisplayName(block.id) === "blk_plain");
    expect(named?.defId).toBe("scope");
    expect(plain?.defId).toBe("scope");
  });

  it("rejects unknown block types on import", () => {
    const app = new AppState();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_bad" name="Bad" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <blocks>
    <block id="blk_1" type="sensor_source" x="0" y="0" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z"/>
  </blocks>
</diagram>`;
    expect(app.loadDiagramXml(xml)).toBe(false);
    expect(app.ioError).toMatch(/unknown block type/);
    expect(app.blocks).toHaveLength(0);
  });

  it("toggles catalogs for the current solution by file name", () => {
    const app = new AppState();
    wireCsPipeline(app);
    expect(app.catalogChoices().map((item) => [item.name, item.selected])).toEqual([
      ["Types", true],
      ["Control Systems", true],
    ]);
    app.toggleCatalog("control-systems.xml");
    expect(app.blockDef("timer")).toBeUndefined();
    expect(app.blocks).toHaveLength(0);
    expect(app.catalogChoices().find((item) => item.file === "control-systems.xml")?.selected).toBe(false);
    expect(app.toDiagramXml()).toContain("<catalog>types.xml</catalog>");
    expect(app.toDiagramXml()).not.toContain("control-systems.xml");
    app.toggleCatalog("control-systems.xml");
    expect(app.blockDef("timer")).toBeDefined();
  });

  it("loads catalog files listed in diagram XML", () => {
    const app = new AppState();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_types" name="Types only" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <catalogs>
    <catalog>types.xml</catalog>
  </catalogs>
</diagram>`;
    expect(app.loadDiagramXml(xml)).toBe(true);
    expect(app.sources.map((source) => source.name)).toEqual(["types.xml"]);
    expect(app.blockDef("timer")).toBeUndefined();
    expect(app.catalog.catalogs().map((item) => item.name)).toEqual(["Types"]);
  });

  it("rejects unknown catalog files on import", () => {
    const app = new AppState();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_missing" name="Missing" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <catalogs>
    <catalog>missing.xml</catalog>
  </catalogs>
</diagram>`;
    expect(app.loadDiagramXml(xml)).toBe(false);
    expect(app.ioError).toMatch(/unknown catalog/);
    expect(app.sources.map((source) => source.name)).toEqual(["types.xml", "control-systems.xml"]);
  });

  it("saves and loads diagrams from the library by hand", async () => {
    const repo = new MemoryDiagramRepository();
    const app = new AppState(repo);
    wireCsPipeline(app);
    expect(await app.saveToLibrary("Pipeline")).toBe(true);
    expect(app.ioMode).toBe("closed");
    expect((await repo.list()).map((item) => item.name)).toEqual(["Pipeline"]);

    app.clearCanvas();
    expect(app.blocks).toHaveLength(0);
    const id = (await repo.list())[0]!.id;
    expect(await app.loadFromLibrary(id)).toBe(true);
    expect(app.blocks.map((block) => block.defId)).toEqual(["timer", "quantizer", "sin", "scope"]);
    expect(app.diagramName).toBe("Pipeline");
    expect(app.canRun()).toBe(true);
  });
});

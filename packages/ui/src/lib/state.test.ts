import { describe, expect, it } from "vitest";
import { BLOCK_PLACE_HEIGHT, BLOCK_PLACE_WIDTH } from "./model";
import { AppState } from "./state";
import { MemoryDiagramRepository } from "@bld/xml/diagram/store";

function wireCsPipeline(app: AppState): { generatorId: number; scopeId: number; transformerId: number } {
  const generatorId = app.nextId;
  app.addBlock("timer", 360, 0);
  const transformerId = app.nextId;
  app.addBlock("sin", 180, 0);
  const scopeId = app.nextId;
  app.addBlock("scope", 0, 0);
  app.toggleLink(scopeId, "out", transformerId, "in");
  app.toggleLink(transformerId, "out", generatorId, "in");
  return { generatorId, scopeId, transformerId };
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
    app.addBlockAtViewCenter("sin");
    app.addBlockAtViewCenter("cos");
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
  it("keeps multiple (Double) -> Unit wires into one input", () => {
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
    expect(app.run.canStart()).toBe(true);
  });

  it("inserts a new fan-in slot above when the source is above an existing wire", () => {
    const app = new AppState();
    const lower = app.nextId;
    app.addBlock("scope", 0, 120);
    const upper = app.nextId;
    app.addBlock("scope", 0, 0);
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
    app.addBlock("timer", 360, 40);
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
    expect(app.run.canStart()).toBe(true);
    expect(app.run.planned().flatMap((plan) => plan.channels.map((channel) => channel.label))).toEqual([
      "sin",
      "cos",
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
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.removeLink({ fromBlock: scopeId, fromOut: "out[1]", toBlock: cosId, toIn: "in" });
    expect(app.links).toEqual([{ fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" }]);
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

  it("grounds scope into sin", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 300, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    expect(app.links).toEqual([
      { fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" },
    ]);
  });

  it("deletes a selected connector without removing blocks", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 300, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.selectLink({ fromBlock: scopeId, fromOut: "out", toBlock: sinId, toIn: "in" });
    app.deleteSelected();
    expect(app.links).toEqual([]);
    expect(app.blocks).toHaveLength(2);
    expect(app.selectedLink).toBeNull();
  });

  it("removes a block and its links", () => {
    const app = new AppState();
    const scopeId = app.nextId;
    app.addBlock("scope", 0, 0);
    const sinId = app.nextId;
    app.addBlock("sin", 300, 0);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.removeBlock(scopeId);
    expect(app.blocks.map((block) => block.defId)).toEqual(["sin"]);
    expect(app.links).toEqual([]);
  });
});

describe("AppState run", () => {
  it("keeps the same topology key when a block is only moved", () => {
    const app = new AppState();
    const { generatorId } = wireCsPipeline(app);
    const before = app.run.topologyKey();
    app.moveBlock(generatorId, 40, -12);
    expect(app.run.topologyKey()).toBe(before);
  });

  it("does not start generators until Run", () => {
    const app = new AppState();
    const { scopeId } = wireCsPipeline(app);
    expect(app.run.running).toBe(false);
    expect(app.run.canStart()).toBe(true);
    expect(app.run.isScopeLive(scopeId)).toBe(false);
    app.openScope(scopeId);
    expect(app.scopeOpen).toBe(-1);
  });

  it("enables the scope chart and wire rates as soon as Run starts", async () => {
    const app = new AppState();
    const { generatorId, scopeId } = wireCsPipeline(app);
    const link = app.links.find((item) => item.toBlock === generatorId)!;
    const pending = app.run.start();
    expect(app.run.starting).toBe(true);
    expect(app.run.running).toBe(false);
    expect(app.run.isScopeLive(scopeId)).toBe(true);
    expect(app.run.connectorHz(link)).toBeGreaterThan(0);
    await pending;
    expect(app.run.running).toBe(true);
    expect(app.run.starting).toBe(false);
    expect(app.run.isScopeLive(scopeId)).toBe(true);
    app.run.stop();
  });

  it("run compiles wasm and enables the scope chart", async () => {
    const app = new AppState();
    const { generatorId, scopeId } = wireCsPipeline(app);
    await app.run.start();
    expect(app.run.running).toBe(true);
    expect(app.run.error).toBeNull();
    expect(app.run.isScopeLive(scopeId)).toBe(true);
    app.openScope(scopeId);
    expect(app.scopeOpen).toBe(scopeId);

    app.moveBlockTo(generatorId, 24, 16);
    expect(app.run.running).toBe(true);
    expect(app.run.isScopeLive(scopeId)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.run.snapshotScope(scopeId);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("sin");
    expect(series[0].samples.length).toBeGreaterThan(0);
    app.run.stop();
    expect(app.run.running).toBe(false);
    expect(app.run.isScopeLive(scopeId)).toBe(false);
  });

  it("seeds connector frequency on run and measures runner intercepts", async () => {
    const app = new AppState();
    const { generatorId } = wireCsPipeline(app);
    await app.run.start();
    const link = app.links.find((item) => item.toBlock === generatorId)!;
    expect(app.run.connectorHz(link)).toBeGreaterThan(0);
    const t0 = 1_000;
    app.run.sampleFlowRates(t0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    app.run.sampleFlowRates(t0 + 40);
    expect(app.run.connectorHz(link)).toBeGreaterThan(0);
    app.run.stop();
    expect(app.run.connectorHz(link)).toBe(0);
  });

  it("ignores a second Run until Stop", async () => {
    const app = new AppState();
    const { scopeId } = wireCsPipeline(app);
    await app.run.start();
    expect(app.run.running).toBe(true);
    expect(app.run.starting).toBe(false);
    expect(app.run.isScopeLive(scopeId)).toBe(true);
    await app.run.start();
    expect(app.run.running).toBe(true);
    expect(app.run.isScopeLive(scopeId)).toBe(true);
    app.run.stop();
    expect(app.run.running).toBe(false);
    expect(app.run.starting).toBe(false);
    await app.run.start();
    expect(app.run.running).toBe(true);
    app.run.stop();
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
    app.addBlock("timer", 360, 40);
    app.toggleLink(scopeId, "out", sinId, "in");
    app.toggleLink(scopeId, "out", cosId, "in");
    app.toggleLink(sinId, "out", timerId, "in");
    app.toggleLink(cosId, "out", timerId, "in");
    await app.run.start();
    expect(app.run.error).toBeNull();
    expect(app.run.running).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const series = await app.run.snapshotScope(scopeId);
    expect(series.map((channel) => channel.label)).toEqual(["sin", "cos"]);
    expect(series[0].samples.length).toBeGreaterThan(0);
    expect(series[1].samples.length).toBeGreaterThan(0);
    app.run.stop();
  });

  it("stops the run when the wiring changes", async () => {
    const app = new AppState();
    const { generatorId, transformerId } = wireCsPipeline(app);
    await app.run.start();
    expect(app.run.running).toBe(true);

    app.toggleLink(transformerId, "out", generatorId, "in");
    expect(app.run.running).toBe(false);
    expect(app.run.canStart()).toBe(false);
  });

  it("seeds generator period at 10 ms and updates it", () => {
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("timer", 0, 0);
    expect(app.blockPeriodMs(id)).toBe(10);
    expect(app.blockInputs(id).map((input) => [input.def.name, input.value])).toEqual([["period", "10"]]);
    app.setBlockParameter(id, "period", "25");
    expect(app.blockPeriodMs(id)).toBe(25);
    expect(app.toDiagramXml()).toContain('name="period"');
    expect(app.toDiagramXml()).toContain('value="25"');
  });

  it("seeds scope window N=30 s and quantizer M=10 ms", () => {
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    expect(app.blockWindowS(id)).toBe(30);
    expect(app.blockMeterMs(id)).toBe(10);
    expect(app.blockInputs(id).map((input) => [input.def.name, input.value])).toEqual([
      ["n", "30"],
      ["m", "10"],
    ]);
    app.setBlockParameter(id, "n", "60");
    app.setBlockParameter(id, "m", "20");
    expect(app.blockWindowS(id)).toBe(60);
    expect(app.blockMeterMs(id)).toBe(20);
    expect(app.toDiagramXml()).toContain('name="n"');
    expect(app.toDiagramXml()).toContain('value="60"');
    expect(app.toDiagramXml()).toContain('name="m"');
    expect(app.toDiagramXml()).toContain('value="20"');
  });

  it("closes and ignores input configuration while a run is busy", async () => {
    const app = new AppState();
    const { generatorId } = wireCsPipeline(app);
    app.openInputs(generatorId);
    expect(app.inputsOpen).toBe(generatorId);
    const pending = app.run.start();
    expect(app.run.busy()).toBe(true);
    expect(app.inputsOpen).toBe(-1);
    app.openInputs(generatorId);
    expect(app.inputsOpen).toBe(-1);
    await pending;
    expect(app.run.running).toBe(true);
    app.openInputs(generatorId);
    expect(app.inputsOpen).toBe(-1);
    app.run.stop();
    app.openInputs(generatorId);
    expect(app.inputsOpen).toBe(generatorId);
    app.closeInputs();
  });

  it("toggles only GPIO In simulated pin levels", () => {
    const app = new AppState();
    const inId = app.nextId;
    app.addBlock("gpio_in", 0, 0);
    const outId = app.nextId;
    app.addBlock("gpio_out", 120, 0);
    expect(app.gpioOn(inId)).toBe(false);
    app.toggleGpio(inId);
    expect(app.gpioOn(inId)).toBe(true);
    app.toggleGpio(outId);
    expect(app.gpioOn(outId)).toBe(false);
  });

  it("pushes GPIO In only when the switch is toggled while running", async () => {
    const app = new AppState();
    const outId = app.nextId;
    app.addBlock("gpio_out", 0, 0);
    const inId = app.nextId;
    app.addBlock("gpio_in", 120, 0);
    app.toggleLink(outId, "out", inId, "in");
    expect(app.blockPeriodMs(inId)).toBe(0);
    await app.run.start();
    expect(app.run.running).toBe(true);
    expect(app.gpioOn(outId)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(app.gpioOn(outId)).toBe(false);
    app.toggleGpio(inId);
    expect(app.gpioOn(inId)).toBe(true);
    expect(app.gpioOn(outId)).toBe(true);
    app.toggleGpio(inId);
    expect(app.gpioOn(inId)).toBe(false);
    expect(app.gpioOn(outId)).toBe(false);
    app.run.stop();
  });

  it("stops GPIO connector animation after the level stops changing", async () => {
    const app = new AppState();
    const outId = app.nextId;
    app.addBlock("gpio_out", 0, 0);
    const inId = app.nextId;
    app.addBlock("gpio_in", 120, 0);
    app.toggleLink(outId, "out", inId, "in");
    await app.run.start();
    const link = app.links[0]!;
    const t0 = 1_000;
    app.run.sampleFlowRates(t0);
    app.toggleGpio(inId);
    app.run.sampleFlowRates(t0 + 50);
    expect(app.run.connectorHz(link)).toBeGreaterThan(0);
    app.run.sampleFlowRates(t0 + 150);
    expect(app.run.connectorHz(link)).toBe(0);
    app.run.stop();
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
    expect(xml).toContain('type="sin"');
    expect(xml).toContain("<connector");

    const other = new AppState();
    expect(other.io.loadXml(xml)).toBe(true);
    expect(other.blocks.map((block) => block.defId)).toEqual(["timer", "sin", "scope"]);
    expect(other.links).toHaveLength(2);
    expect(other.run.canStart()).toBe(true);
    expect(other.diagramName).toBe("Workspace");
  });

  it("uses a block name when present and the XML id otherwise", () => {
    const app = new AppState();
    const id = app.nextId;
    app.addBlock("scope", 0, 0);
    expect(app.blockDisplayName(id)).toBe(`blk_${id}`);

    expect(
      app.io.loadXml(`<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_named" name="Named" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <catalogs>
    <catalog>types.xml</catalog>
    <catalog>control-systems.xml</catalog>
  </catalogs>
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
    expect(app.io.loadXml(xml)).toBe(false);
    expect(app.io.error).toMatch(/unknown block type/);
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
    expect(app.io.loadXml(xml)).toBe(true);
    expect(app.sources.map((source) => source.name)).toEqual(["types.xml"]);
    expect(app.blockDef("timer")).toBeUndefined();
    expect(app.catalog.catalogs().map((item) => item.name)).toEqual(["Types"]);
  });

  it("loads no catalogs when the diagram omits them", () => {
    const app = new AppState();
    expect(app.blockDef("timer")).toBeDefined();
    expect(
      app.io.loadXml(`<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_none" name="None" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z"/>`),
    ).toBe(true);
    expect(app.sources).toEqual([]);
    expect(app.catalog.catalogs()).toEqual([]);
    expect(app.blockDef("timer")).toBeUndefined();
  });

  it("rejects unknown catalog files on import", () => {
    const app = new AppState();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<diagram id="diag_missing" name="Missing" createdAt="2026-08-31T05:00:00Z" updatedAt="2026-08-31T05:00:00Z">
  <catalogs>
    <catalog>missing.xml</catalog>
  </catalogs>
</diagram>`;
    expect(app.io.loadXml(xml)).toBe(false);
    expect(app.io.error).toMatch(/unknown catalog/);
    expect(app.sources.map((source) => source.name)).toEqual(["types.xml", "control-systems.xml"]);
  });

  it("saves and loads diagrams from the library by hand", async () => {
    const repo = new MemoryDiagramRepository();
    const app = new AppState(repo);
    wireCsPipeline(app);
    expect(await app.io.save("Pipeline")).toBe(true);
    expect(app.io.mode).toBe("closed");
    expect((await repo.list()).map((item) => item.name)).toEqual(["Pipeline"]);

    app.clearCanvas();
    expect(app.blocks).toHaveLength(0);
    const id = (await repo.list())[0]!.id;
    expect(await app.io.load(id)).toBe(true);
    expect(app.blocks.map((block) => block.defId)).toEqual(["timer", "sin", "scope"]);
    expect(app.diagramName).toBe("Pipeline");
    expect(app.run.canStart()).toBe(true);
  });
});

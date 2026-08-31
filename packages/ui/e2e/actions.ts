import { expect, type Locator, type Page } from "@playwright/test";

export async function waitDeep(page: Page, selector: string): Promise<Locator> {
  const el = page.locator(selector);
  await el.first().waitFor({ state: "attached" });
  return el.first();
}

export async function openWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("bld-diagram").waitFor();
  await page.locator('[data-testid="diagram-canvas"]').waitFor();
  await page.locator('[data-testid="palette-timer"]').waitFor();
}

export function diagramRoot(page: Page): Locator {
  return page.locator("bld-diagram");
}

export function diagramCss(page: Page, selector: string): Locator {
  return page.locator("bld-diagram").locator(selector);
}

export async function openAppMenu(page: Page): Promise<void> {
  const dropdown = page.locator('[data-testid="toolbar-menu-dropdown"]');
  const classes = (await dropdown.getAttribute("class")) ?? "";
  if (classes.includes("show")) {
    return;
  }
  await page.locator('[data-testid="toolbar-menu"]').click();
  await page.locator('[data-testid="toolbar-menu-dropdown"].show').waitFor();
}

export async function newCanvas(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
    await expect(
    page.locator('[data-testid="scope-modal"], [data-testid="about-modal"], [data-testid="inputs-modal"]'),
  ).toHaveCount(0);
  await openAppMenu(page);
  await page.locator('[data-testid="menu-new-canvas"]').click();
  await expect(page.locator('[data-testid="status-blocks"]')).toHaveText("0 blocks");
}

export async function statusBlocks(page: Page): Promise<string> {
  return (await page.locator('[data-testid="status-blocks"]').innerText()).trim();
}

export async function statusLinks(page: Page): Promise<string> {
  return (await page.locator('[data-testid="status-links"]').innerText()).trim();
}

export async function statusZoom(page: Page): Promise<string> {
  return (await page.locator('[data-testid="status-zoom"]').innerText()).trim();
}

export async function waitForLinks(page: Page, expected: string): Promise<void> {
  await expect(page.locator('[data-testid="status-links"]')).toHaveText(expected);
}

export async function waitForAvoidRouter(page: Page): Promise<void> {
  await expect(page.locator("bld-diagram")).toHaveAttribute("data-router", "avoid");
}

export async function doubleClickPalette(page: Page, defId: string): Promise<void> {
  await page.locator(`[data-testid="palette-${defId}"]`).dblclick();
}

export async function waitForBlock(page: Page, defId: string): Promise<void> {
  await page.locator(`bld-node[data-block-def="${defId}"]`).first().waitFor({ state: "attached" });
}

export function nodeHost(page: Page, defId: string, index = 0): Locator {
  return page.locator(`bld-node[data-block-def="${defId}"]`).nth(index);
}

export async function portTypeText(
  page: Page,
  blockDef: string,
  testId: string,
): Promise<string | null> {
  const hints = nodeHost(page, blockDef).locator(`[data-testid="${testId}-type"]`);
  if ((await hints.count()) === 0) {
    return null;
  }
  return (await hints.first().innerText()).trim();
}

export async function clickPortHandle(
  page: Page,
  blockDef: string,
  testId: string,
  index = 0,
): Promise<void> {
  const handle = nodeHost(page, blockDef, index).locator(`[data-testid="${testId}"]`);
  await handle.scrollIntoViewIfNeeded();
  await handle.click();
}

export async function clickConnector(page: Page): Promise<void> {
  const hit = page.locator("bld-connector .path-hit");
  await hit.evaluate((el) => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerId: 1 }));
  });
}

export async function connectorPath(page: Page): Promise<string> {
  const stroke = page.locator("bld-connector:not([data-preview]) .path-stroke");
  return stroke.evaluate((el) => (el as HTMLElement).style.clipPath);
}

export async function connectorPaths(page: Page): Promise<string[]> {
  return page.locator("bld-connector:not([data-preview]) .path-stroke").evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).style.clipPath),
  );
}

export async function connectorWorldPolylines(page: Page): Promise<{ x: number; y: number }[][]> {
  return page.evaluate(() => {
    const parse = (raw: string) =>
      raw
        .split(" ")
        .filter(Boolean)
        .map((token) => {
          const [x, y] = token.split(",").map(Number);
          return { x: x ?? 0, y: y ?? 0 };
        });
    const walk = (root: ParentNode, selector: string): Element | null => {
      const match = root.querySelector(selector);
      if (match) {
        return match;
      }
      for (const node of root.querySelectorAll("*")) {
        if (node.shadowRoot) {
          const found = walk(node.shadowRoot, selector);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    const diagram = walk(document, "bld-diagram");
    const hosts = [...(diagram?.shadowRoot?.querySelectorAll("bld-connector:not([data-preview])") ?? [])];
    return hosts.map((host) => parse((host as HTMLElement).dataset.points ?? ""));
  });
}

export async function dragNodeBy(page: Page, defId: string, dx: number, dy: number, index = 0): Promise<void> {
  const icon = nodeHost(page, defId, index).locator(".flow-node-icon");
  const box = await icon.boundingBox();
  if (!box) {
    throw new Error(`dragNodeBy: ${defId} icon is not visible`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + Math.round(dx), startY + Math.round(dy));
  await page.mouse.up();
}

export async function pressDelete(page: Page): Promise<void> {
  await page.keyboard.press("Delete");
}

export async function placeBlock(page: Page, defId: string): Promise<void> {
  await doubleClickPalette(page, defId);
  await waitForBlock(page, defId);
}

export async function runDiagram(page: Page): Promise<void> {
  await page.locator('[data-testid="toolbar-run"]').click();
  await expect(page.locator('[data-testid="status-run"]')).toHaveText("Running", { timeout: 15_000 });
}

export async function dropOnDiagram(page: Page, defId: string): Promise<void> {
  await page.evaluate((id) => {
    const walk = (root: ParentNode, selector: string): Element | null => {
      const match = (root as Element).querySelector?.(selector) ?? null;
      if (match) {
        return match;
      }
      for (const node of root.querySelectorAll("*")) {
        if (node.shadowRoot) {
          const found = walk(node.shadowRoot, selector);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    const diagram = walk(document, "bld-diagram");
    if (!diagram) {
      throw new Error("dropOnDiagram: bld-diagram not found");
    }
    const rect = diagram.getBoundingClientRect();
    const data = new DataTransfer();
    data.setData("application/x-bld-block", id);
    diagram.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: data,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  }, defId);
}

export async function scopeChartHasInk(page: Page): Promise<boolean> {
  const canvas = page.locator('[data-testid="scope-chart"] canvas');
  await canvas.waitFor({ state: "visible" });
  return canvas.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement) || el.width < 8 || el.height < 8) {
      return false;
    }
    const ctx = el.getContext("2d");
    if (!ctx) {
      return false;
    }
    const { data } = ctx.getImageData(
      Math.floor(el.width * 0.22),
      Math.floor(el.height * 0.12),
      Math.max(1, Math.floor(el.width * 0.56)),
      Math.max(1, Math.floor(el.height * 0.76)),
    );
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (a > 8 && (r > 80 || g > 80 || b > 80)) {
        return true;
      }
    }
    return false;
  });
}

export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("boxOf: element is not visible");
  }
  return box;
}

export async function worldPan(page: Page): Promise<{ x: number; y: number }> {
  return page.locator("bld-diagram").evaluate((diagram) => {
    const world = diagram.shadowRoot?.querySelector(".world");
    if (!(world instanceof HTMLElement)) {
      throw new Error("worldPan: world missing");
    }
    const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(world.style.transform);
    return { x: Number(match?.[1] ?? Number.NaN), y: Number(match?.[2] ?? Number.NaN) };
  });
}

export async function fireCanvasPan(page: Page, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ({ dx, dy }) => {
      const walk = (root: ParentNode, selector: string): Element | null => {
        const match = (root as Element).querySelector?.(selector) ?? null;
        if (match) {
          return match;
        }
        for (const node of root.querySelectorAll("*")) {
          if (node.shadowRoot) {
            const found = walk(node.shadowRoot, selector);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      const diagram = walk(document, "bld-diagram");
      const viewport = diagram?.shadowRoot?.querySelector(".viewport");
      if (!(viewport instanceof HTMLElement)) {
        throw new Error("fireCanvasPan: viewport missing");
      }
      const rect = viewport.getBoundingClientRect();
      const startX = rect.left + Math.min(28, rect.width / 2);
      const startY = rect.top + Math.min(28, rect.height / 2);
      const fire = (target: EventTarget, type: string, clientX: number, clientY: number, extra: Record<string, number>) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 77,
            pointerType: "touch",
            isPrimary: true,
            view: window,
            clientX,
            clientY,
            ...extra,
          }),
        );
      };
      fire(viewport, "pointerdown", startX, startY, { button: 0, buttons: 1 });
      fire(window, "pointermove", startX + dx, startY + dy, { button: -1, buttons: 1 });
      fire(window, "pointerup", startX + dx, startY + dy, { button: 0, buttons: 0 });
    },
    { dx, dy },
  );
}

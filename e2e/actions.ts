import { By, Key, until, type WebDriver, type WebElement } from "selenium-webdriver";
import { BASE_URL } from "./harness";

const DEEP_QUERY = `
  const selector = arguments[0];
  const walk = (root) => {
    const match = root.querySelector(selector);
    if (match) return match;
    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) {
        const found = walk(node.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(document);
`;

const DEEP_QUERY_ALL = `
  const selector = arguments[0];
  const out = [];
  const walk = (root) => {
    out.push(...root.querySelectorAll(selector));
    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) walk(node.shadowRoot);
    }
  };
  walk(document);
  return out;
`;

export async function queryDeep(driver: WebDriver, selector: string): Promise<WebElement | null> {
  const el = await driver.executeScript(DEEP_QUERY, selector);
  return (el as WebElement) ?? null;
}

export async function queryDeepAll(driver: WebDriver, selector: string): Promise<WebElement[]> {
  return (await driver.executeScript(DEEP_QUERY_ALL, selector)) as WebElement[];
}

export async function waitDeep(driver: WebDriver, selector: string, timeout = 20000): Promise<WebElement> {
  await driver.wait(async () => (await queryDeep(driver, selector)) !== null, timeout);
  const el = await queryDeep(driver, selector);
  if (!el) {
    throw new Error(`waitDeep: ${selector} not found`);
  }
  return el;
}

export async function openWorkspace(driver: WebDriver): Promise<void> {
  await driver.get(BASE_URL);
  await waitDeep(driver, "bld-diagram");
  await waitDeep(driver, '[data-testid="diagram-canvas"]');
  await waitDeep(driver, '[data-testid="palette-timer"]');
}

export async function diagramRoot(driver: WebDriver) {
  const host = await waitDeep(driver, "bld-diagram");
  return host.getShadowRoot();
}

export async function diagramCss(driver: WebDriver, selector: string) {
  const root = await diagramRoot(driver);
  return root.findElement(By.css(selector));
}

export async function openAppMenu(driver: WebDriver): Promise<void> {
  const dropdown = await queryDeep(driver, '[data-testid="toolbar-menu-dropdown"]');
  const open = dropdown !== null && (await dropdown.getAttribute("class")).includes("show");
  if (open) {
    return;
  }
  await (await waitDeep(driver, '[data-testid="toolbar-menu"]')).click();
  await waitDeep(driver, '[data-testid="toolbar-menu-dropdown"].show');
}

export async function newCanvas(driver: WebDriver): Promise<void> {
  await driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
  await driver.wait(async () => {
    const modals = await queryDeepAll(
      driver,
      '[data-testid="oscilloscope-modal"], [data-testid="about-modal"]',
    );
    return modals.length === 0;
  }, 5000);
  await openAppMenu(driver);
  await (await waitDeep(driver, '[data-testid="menu-new-canvas"]')).click();
  await driver.wait(async () => (await statusBlocks(driver)) === "0 blocks", 5000);
}

export async function statusBlocks(driver: WebDriver): Promise<string> {
  return (await waitDeep(driver, '[data-testid="status-blocks"]')).getText();
}

export async function statusLinks(driver: WebDriver): Promise<string> {
  return (await waitDeep(driver, '[data-testid="status-links"]')).getText();
}

export async function statusZoom(driver: WebDriver): Promise<string> {
  return (await waitDeep(driver, '[data-testid="status-zoom"]')).getText();
}

export async function waitForLinks(driver: WebDriver, expected: string): Promise<void> {
  await driver.wait(async () => (await statusLinks(driver)) === expected, 8000);
}

export async function waitForAvoidRouter(driver: WebDriver): Promise<void> {
  const host = await waitDeep(driver, "bld-diagram");
  await driver.wait(async () => (await host.getAttribute("data-router")) === "avoid", 10000);
}

export async function doubleClickPalette(driver: WebDriver, defId: string): Promise<void> {
  const item = await waitDeep(driver, `[data-testid="palette-${defId}"]`);
  await driver.actions({ async: true }).doubleClick(item).perform();
}

export async function waitForBlock(driver: WebDriver, defId: string): Promise<void> {
  await driver.wait(async () => {
    const nodes = await queryDeepAll(driver, `bld-node[data-block-def="${defId}"]`);
    return nodes.length > 0;
  }, 10000);
}

export async function nodeHost(driver: WebDriver, defId: string, index = 0) {
  if (index === 0) {
    return waitDeep(driver, `bld-node[data-block-def="${defId}"]`);
  }
  await waitForBlock(driver, defId);
  const nodes = await queryDeepAll(driver, `bld-node[data-block-def="${defId}"]`);
  if (!nodes[index]) {
    throw new Error(`nodeHost: ${defId}[${index}] not found`);
  }
  return nodes[index];
}

export async function portTypeText(
  driver: WebDriver,
  blockDef: string,
  testId: string,
): Promise<string | null> {
  const host = await nodeHost(driver, blockDef);
  const nodeShadow = await host.getShadowRoot();
  const hints = await nodeShadow.findElements(By.css(`[data-testid="${testId}-type"]`));
  if (hints.length === 0) {
    return null;
  }
  return hints[0].getText();
}

export async function clickPortHandle(
  driver: WebDriver,
  blockDef: string,
  testId: string,
  index = 0,
): Promise<void> {
  const host = await nodeHost(driver, blockDef, index);
  const nodeShadow = await host.getShadowRoot();
  const handle = await nodeShadow.findElement(By.css(`[data-testid="${testId}"]`));
  await driver.wait(until.elementIsVisible(handle), 5000);
  await driver.executeScript("arguments[0].scrollIntoView({block:'nearest', inline:'nearest'});", handle);
  await driver.actions({ async: true }).move({ origin: handle }).click().perform();
}

export async function clickConnector(driver: WebDriver): Promise<void> {
  const host = await diagramCss(driver, "bld-connector");
  const root = await host.getShadowRoot();
  const hit = await root.findElement(By.css(".path-hit"));
  await driver.executeScript(
    `arguments[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerId: 1 }));`,
    hit,
  );
}

export async function connectorPath(driver: WebDriver): Promise<string> {
  const host = await diagramCss(driver, "bld-connector:not([data-preview])");
  const root = await host.getShadowRoot();
  const stroke = await root.findElement(By.css(".path-stroke"));
  return (await stroke.getAttribute("d")) ?? "";
}

export async function connectorPaths(driver: WebDriver): Promise<string[]> {
  const root = await diagramRoot(driver);
  const hosts = await root.findElements(By.css("bld-connector:not([data-preview])"));
  const paths: string[] = [];
  for (const host of hosts) {
    const stroke = await (await host.getShadowRoot()).findElement(By.css(".path-stroke"));
    paths.push((await stroke.getAttribute("d")) ?? "");
  }
  return paths;
}

export async function connectorWorldPolylines(driver: WebDriver): Promise<{ x: number; y: number }[][]> {
  return (await driver.executeScript(`
    const parse = (d) => {
      const points = [];
      const tokens = d.match(/[MLC]|-?\\d*\\.?\\d+(?:e[-+]?\\d+)?/gi) || [];
      let command = "";
      const nums = [];
      const flush = () => {
        if ((command === "M" || command === "L") && nums.length >= 2) {
          points.push({ x: nums[nums.length - 2], y: nums[nums.length - 1] });
        } else if (command === "C" && nums.length >= 6) {
          points.push({ x: nums[nums.length - 2], y: nums[nums.length - 1] });
        }
      };
      for (const token of tokens) {
        if (/^[MLCmlc]$/.test(token)) {
          flush();
          command = token.toUpperCase();
          nums.length = 0;
          continue;
        }
        nums.push(Number(token));
      }
      flush();
      return points;
    };
    const walk = (root, selector) => {
      const match = root.querySelector(selector);
      if (match) return match;
      for (const node of root.querySelectorAll("*")) {
        if (node.shadowRoot) {
          const found = walk(node.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const diagram = walk(document, "bld-diagram");
    const hosts = [...diagram.shadowRoot.querySelectorAll("bld-connector:not([data-preview])")];
    return hosts.map((host) => {
      const d = host.shadowRoot.querySelector(".path-stroke")?.getAttribute("d") ?? "";
      const left = Number.parseFloat(host.style.left) || 0;
      const top = Number.parseFloat(host.style.top) || 0;
      return parse(d).map((point) => ({ x: point.x + left, y: point.y + top }));
    });
  `)) as { x: number; y: number }[][];
}

export async function dragNodeBy(driver: WebDriver, defId: string, dx: number, dy: number): Promise<void> {
  const host = await nodeHost(driver, defId);
  const icon = await (await host.getShadowRoot()).findElement(By.css(".flow-node-icon"));
  await driver
    .actions({ async: true })
    .dragAndDrop(icon, { x: Math.round(dx), y: Math.round(dy) })
    .perform();
}

export async function pressDelete(driver: WebDriver): Promise<void> {
  await driver.actions({ async: true }).sendKeys(Key.DELETE).perform();
}

export async function placeBlock(driver: WebDriver, defId: string): Promise<void> {
  await doubleClickPalette(driver, defId);
  await waitForBlock(driver, defId);
}

export async function runDiagram(driver: WebDriver): Promise<void> {
  await (await waitDeep(driver, '[data-testid="toolbar-run"]')).click();
  await driver.wait(async () => {
    const status = await queryDeep(driver, '[data-testid="status-run"]');
    return status !== null && (await status.getText()) === "Running";
  }, 15000);
}

export async function dropOnDiagram(driver: WebDriver, defId: string): Promise<void> {
  await driver.executeScript(
    `
    const defId = arguments[0];
    const walk = (root, selector) => {
      const match = root.querySelector(selector);
      if (match) return match;
      for (const node of root.querySelectorAll("*")) {
        if (node.shadowRoot) {
          const found = walk(node.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const diagram = walk(document, "bld-diagram");
    const rect = diagram.getBoundingClientRect();
    const data = new DataTransfer();
    data.setData("application/x-bld-block", defId);
    diagram.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: data,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
    `,
    defId,
  );
}

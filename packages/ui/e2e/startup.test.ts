import { expect, test } from "@playwright/test";
import { openWorkspace } from "./actions";

/** binaryen.js is ~15MB. JointJS and Chart.js are smaller but still block first paint. */
const HUGE_SCRIPT_BYTES = 600_000;
const HEAVY = /binaryen|chart\.js|@joint\/|joint[.-]|libavoid/i;

test("does not download assembler, JointJS, or Chart.js on first paint", async ({ page }) => {
  const scripts: { url: string; bytes: number }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    const type = `${response.headers()["content-type"] ?? ""} ${response.request().resourceType()}`;
    if (!/javascript|script|wasm/i.test(type) && !/\.(m?js|wasm)(\?|$)/.test(url)) {
      return;
    }
    const body = await response.body().catch(() => Buffer.alloc(0));
    scripts.push({ url, bytes: body.length });
  });
  await openWorkspace(page);
  await expect(page.locator('[data-testid="palette-timer"]')).toBeVisible();
  const huge = scripts.filter((item) => item.bytes > HUGE_SCRIPT_BYTES);
  const heavy = scripts.filter((item) => HEAVY.test(item.url));
  const largest = [...scripts]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
    .map((item) => `${(item.bytes / 1024).toFixed(0)}kb ${item.url}`)
    .join("\n");
  expect(huge, `unexpected large scripts on first paint:\n${largest}`).toEqual([]);
  expect(heavy, `heavy libraries on first paint:\n${largest}`).toEqual([]);
});

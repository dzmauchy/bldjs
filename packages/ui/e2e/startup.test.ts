import { expect, test } from "@playwright/test";
import { openWorkspace } from "./actions";

/** moonc-worker is ~5.6MB. First paint must not download it (or any similarly huge script). */
const HUGE_SCRIPT_BYTES = 1_500_000;

test("does not download moonc-worker on first paint", async ({ page }) => {
  const scripts: { url: string; bytes: number }[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    const type = `${response.headers()["content-type"] ?? ""} ${response.request().resourceType()}`;
    if (!/javascript|script/i.test(type) && !/\.m?js(\?|$)/.test(url)) {
      return;
    }
    const body = await response.body().catch(() => Buffer.alloc(0));
    scripts.push({ url, bytes: body.length });
  });
  await openWorkspace(page);
  await expect(page.locator('[data-testid="palette-timer"]')).toBeVisible();
  const huge = scripts.filter((item) => item.bytes > HUGE_SCRIPT_BYTES);
  const largest = [...scripts]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
    .map((item) => `${(item.bytes / 1024).toFixed(0)}kb ${item.url}`)
    .join("\n");
  expect(huge, `unexpected large scripts on first paint:\n${largest}`).toEqual([]);
});

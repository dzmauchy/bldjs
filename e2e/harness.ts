import { existsSync } from "node:fs";
import { Builder, type WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";

export function chromeOptions(): chrome.Options {
  const options = new chrome.Options();
  options.addArguments(
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1400,900",
  );
  const binary = process.env.CHROME_BIN ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
  if (binary) {
    options.setChromeBinaryPath(binary);
  }
  return options;
}

export async function createDriver(): Promise<WebDriver> {
  return new Builder().forBrowser("chrome").setChromeOptions(chromeOptions()).build();
}

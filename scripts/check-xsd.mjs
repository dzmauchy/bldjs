import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/resources/models");
const schema = join(modelsDir, "blocks.xsd");
const xmlFiles = readdirSync(modelsDir)
  .filter((name) => name.endsWith(".xml"))
  .map((name) => join(modelsDir, name))
  .sort();

if (xmlFiles.length === 0) {
  console.error(`No XML models found in ${modelsDir}`);
  process.exit(1);
}

const result = spawnSync("xmllint", ["--noout", "--schema", schema, ...xmlFiles], {
  encoding: "utf8",
});

if (result.error) {
  console.error("xmllint is required to check model XML against blocks.xsd.");
  console.error("Install libxml2-utils (Debian/Ubuntu) or libxml2 (macOS).");
  console.error(result.error.message);
  process.exit(1);
}

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(result.status === 0 ? 0 : (result.status ?? 1));

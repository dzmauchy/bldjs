import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(packageDir, "src/resources/models");
const fixturesXml = join(packageDir, "src/blocks/fixtures.xml");

function xmlFiles(names) {
  return names.map((name) => join(modelsDir, name));
}

function assertSchemaHint(file, schemaName) {
  const xml = readFileSync(file, "utf8");
  const match = xml.match(/xsi:noNamespaceSchemaLocation="([^"]+)"/);
  if (!match) {
    console.error(`${file} is missing xsi:noNamespaceSchemaLocation`);
    process.exit(1);
  }
  const location = match[1];
  const resolved = resolve(dirname(file), location);
  if (!existsSync(resolved)) {
    console.error(`${file} schema location \`${location}\` does not resolve`);
    process.exit(1);
  }
  if (basename(resolved) !== schemaName) {
    console.error(`${file} schema location \`${location}\` does not point at ${schemaName}`);
    process.exit(1);
  }
}

function validate(schemaName, files) {
  const schema = join(modelsDir, schemaName);
  const result = spawnSync("xmllint", ["--noout", "--schema", schema, ...files], {
    encoding: "utf8",
  });

  if (result.error) {
    console.error("xmllint is required to check model XML against XSD.");
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

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const catalogXml = readdirSync(modelsDir)
  .filter((name) => name.endsWith(".xml") && name !== "diagram.xml")
  .sort();
const diagramXml = readdirSync(modelsDir).filter((name) => name === "diagram.xml");

if (catalogXml.length === 0) {
  console.error(`No catalog XML models found in ${modelsDir}`);
  process.exit(1);
}
if (!existsSync(fixturesXml)) {
  console.error(`Fixture catalog not found: ${fixturesXml}`);
  process.exit(1);
}

const catalogFiles = [...xmlFiles(catalogXml), fixturesXml];
const typeFiles = catalogFiles.filter((file) => basename(file) === "types.xml");
const blockFiles = catalogFiles.filter((file) => basename(file) !== "types.xml");

for (const file of typeFiles) {
  assertSchemaHint(file, "types.xsd");
}
validate("types.xsd", typeFiles);

for (const file of blockFiles) {
  assertSchemaHint(file, "blocks.xsd");
}
validate("blocks.xsd", blockFiles);

if (diagramXml.length > 0) {
  for (const file of xmlFiles(diagramXml)) {
    assertSchemaHint(file, "diagram.xsd");
  }
  validate("diagram.xsd", xmlFiles(diagramXml));
}

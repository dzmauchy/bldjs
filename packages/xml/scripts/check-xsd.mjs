import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "../src/resources/models");

function xmlFiles(names) {
  return names.map((name) => join(modelsDir, name));
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

validate("blocks.xsd", xmlFiles(catalogXml));
if (diagramXml.length > 0) {
  validate("diagram.xsd", xmlFiles(diagramXml));
}

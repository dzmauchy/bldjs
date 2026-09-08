import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { serializeBlocksDoc } from "../blocks/serialize";
import { extractCatalog } from "./extract";
import { createTscContext } from "./host";

const MODEL_FILE = fileURLToPath(new URL("../resources/models/model.ts", import.meta.url));

/** Extract `model.ts` with TypeScript 7.0.2 in Node and inline the catalog for the browser bundle. */
export function bldCatalogPlugin(): Plugin {
  return {
    name: "bld-catalog",
    enforce: "pre",
    transform(_code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/blocks/builtin-docs.ts")) {
        return undefined;
      }
      const ctx = createTscContext([{ name: "model.ts", content: readFileSync(MODEL_FILE, "utf8") }]);
      try {
        const docs = [serializeBlocksDoc(extractCatalog(ctx, "model.ts"))];
        return {
          code: `
import { hydrateBlocksDoc } from "./catalog";
export const BROWSER_CATALOG_DOCS = ${JSON.stringify(docs)}.map((doc) => hydrateBlocksDoc(doc));
`,
          map: null,
        };
      } finally {
        ctx.dispose();
      }
    },
  };
}

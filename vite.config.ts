import { fileURLToPath, URL } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

function isFlowCustomElement(filename = ""): boolean {
  return filename.replaceAll("\\", "/").includes("/src/lib/flow/") && filename.endsWith(".svelte");
}

export default defineConfig({
  plugins: [
    svelte({
      dynamicCompileOptions({ filename }) {
        return { customElement: isFlowCustomElement(filename) };
      },
    }),
  ],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    port: 8080,
    host: true,
  },
  preview: {
    port: 8080,
    host: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});

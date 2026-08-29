import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

function isFlowCustomElement(filename = "") {
  return filename.replaceAll("\\", "/").includes("/src/lib/flow/") && filename.endsWith(".svelte");
}

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Per-file override: svelte-check reads this; Vite uses dynamicCompileOptions below.
    customElement: ({ filename }) => isFlowCustomElement(filename),
  },
  vitePlugin: {
    dynamicCompileOptions({ filename }) {
      return { customElement: isFlowCustomElement(filename) };
    },
  },
};

export default config;

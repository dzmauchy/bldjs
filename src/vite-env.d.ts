/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module "*.xml?raw" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

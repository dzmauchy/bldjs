/// <reference types="vite/client" />

declare module "*.xml?raw" {
  const content: string;
  export default content;
}

declare module "*.wat?raw" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}


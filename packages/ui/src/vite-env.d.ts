/// <reference types="vite/client" />

declare module "*.json?raw" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
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

import "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}


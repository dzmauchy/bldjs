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

declare namespace svelteHTML {
  interface IntrinsicElements {
    "bld-diagram": svelteHTML.HTMLAttributes<HTMLElement> & {
      app?: import("./lib/state.svelte").AppState;
      style?: string;
    };
    "bld-node": svelteHTML.HTMLAttributes<HTMLElement> & {
      view?: import("./lib/flow").BldNodeState | null;
      x?: number;
      y?: number;
      dragging?: boolean;
      style?: string;
      onportpointerdown?: (event: CustomEvent<import("./lib/flow").PortPointerDetail>) => void;
      onportpointerup?: (event: CustomEvent<import("./lib/flow").PortPointerDetail>) => void;
      onchartclick?: (event: CustomEvent<void>) => void;
      onnoderesize?: (event: CustomEvent<import("./lib/flow").NodeLayout>) => void;
    };
    "bld-connector": svelteHTML.HTMLAttributes<HTMLElement> & {
      from?: import("./lib/flow").Point;
      to?: import("./lib/flow").Point;
      selected?: boolean;
      preview?: boolean;
      style?: string;
      onlinkpointerdown?: (event: CustomEvent<{ clientX: number; clientY: number }>) => void;
    };
  }
}

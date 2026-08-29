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
    "bld-node": svelteHTML.HTMLAttributes<import("./lib/flow").BldNode> & {
      state?: import("./lib/flow").BldNodeState | null;
      onportpointerdown?: (event: CustomEvent<import("./lib/flow").PortPointerDetail>) => void;
      onportpointerup?: (event: CustomEvent<import("./lib/flow").PortPointerDetail>) => void;
      onchartclick?: (event: CustomEvent<void>) => void;
      onnoderesize?: (event: CustomEvent<{ blockId: number; width: number; height: number }>) => void;
    };
    "bld-connector": svelteHTML.HTMLAttributes<import("./lib/flow").BldConnector> & {
      endpoints?: import("./lib/flow").ConnectorEndpoints;
      selected?: boolean;
      preview?: boolean;
      onlinkpointerdown?: (event: CustomEvent<{ clientX: number; clientY: number }>) => void;
    };
  }
}

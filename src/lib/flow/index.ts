import { BldConnector } from "./connector";
import { BldNode } from "./node";

export { BldConnector, type ConnectorEndpoints } from "./connector";
export {
  clientToWorld,
  cubicLink,
  cubicLinkBounds,
  linkKey,
  translatePath,
  type CubicLink,
  type Point,
  type Rect,
} from "./geometry";
export { iconKey, iconSvgInner, renderIconSvg } from "./icons";
export {
  BldNode,
  type BldNodeState,
  type PortPointerDetail,
  type PortSide,
  type PortView,
} from "./node";

export const FLOW_MIME = "application/x-bld-block";

export function registerFlowElements(): void {
  const defs: ReadonlyArray<readonly [string, CustomElementConstructor]> = [
    [BldNode.tagName, BldNode],
    [BldConnector.tagName, BldConnector],
  ];
  for (const [tag, ctor] of defs) {
    if (customElements.get(tag) === undefined) {
      customElements.define(tag, ctor);
    }
  }
}

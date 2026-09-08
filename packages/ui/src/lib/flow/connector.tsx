import { createEffect, For, type JSX } from "solid-js";
import { defineElementProps, SolidElement } from "$lib/ui/app-host";
import {
  connectorWorldBounds,
  connectorWorldPolyline,
  cssPolygon,
  formatPolyline,
  strokePolygon,
  strokeRuns,
  translatePolyline,
  type Point,
  type RoutedLink,
} from "./geometry";
import { flowPeriodMs } from "@bld/model/flow";

const PAD = 16;
const HIT_WIDTH = 14;
const STROKE_WIDTH = 2.2;
const SELECTED_WIDTH = 3;
const DASH = 8;
const GAP = 6;
const DASH_CYCLE = DASH + GAP;

export class BldConnector extends SolidElement {
  declare from: Point;
  declare to: Point;
  declare points: Point[];
  declare crossings: RoutedLink[];
  declare selected: boolean;
  declare preview: boolean;
  declare push: boolean;
  declare hz: number;

  constructor() {
    super();
    defineElementProps(this, {
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      points: [] as Point[],
      crossings: [] as RoutedLink[],
      selected: false,
      preview: false,
      push: false,
      hz: 0,
    });
  }

  #geom() {
    const world = connectorWorldPolyline(this.from, this.to, this.points, this.crossings);
    const box = connectorWorldBounds(this.from, this.to, this.points, this.crossings, PAD);
    return { world, box };
  }

  #onHitPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("linkpointerdown", {
        bubbles: true,
        composed: true,
        detail: { clientX: event.clientX, clientY: event.clientY },
      }),
    );
  };

  override render(): JSX.Element {
    createEffect(() => {
      const { world, box } = this.#geom();
      this.style.left = `${box.left}px`;
      this.style.top = `${box.top}px`;
      this.style.width = `${box.width}px`;
      this.style.height = `${box.height}px`;
      this.dataset.testid = this.preview ? "connector-preview" : "connector";
      this.dataset.points = formatPolyline(world);
      this.toggleAttribute("data-selected", this.selected);
      this.toggleAttribute("data-preview", this.preview);
      this.toggleAttribute("data-push", this.push);
      const period = !this.preview ? flowPeriodMs(this.hz) : null;
      if (period !== null) {
        this.style.setProperty("--flow-period", `${period}ms`);
        this.setAttribute("data-flow", "");
        this.dataset.hz = String(Math.round(this.hz));
      } else {
        this.style.removeProperty("--flow-period");
        this.removeAttribute("data-flow");
        delete this.dataset.hz;
      }
    });

    const data = () => {
      const { world, box } = this.#geom();
      const local = translatePolyline(world, { x: box.left, y: box.top });
      const strokeW = this.selected ? SELECTED_WIDTH : STROKE_WIDTH;
      const period = !this.preview ? flowPeriodMs(this.hz) : null;
      const dashed = period !== null || this.preview;
      let traveled = 0;
      const segs = dashed
        ? strokeRuns(local).map((seg) => {
            const start = -(traveled % DASH_CYCLE);
            traveled += seg.length;
            return { seg, start };
          })
        : [];
      return { local, strokeW, dashed, segs };
    };

    return (
      <>
        <div
          class="path-hit"
          style={{ "clip-path": cssPolygon(strokePolygon(data().local, HIT_WIDTH)) }}
          role="button"
          tabindex="-1"
          onPointerDown={this.#onHitPointerDown}
        />
        <div
          class={`path-stroke${data().dashed ? " is-dashed" : ""}`}
          style={{ "clip-path": cssPolygon(strokePolygon(data().local, data().strokeW)) }}
        >
          <For each={data().segs}>
            {({ seg, start }) => (
              <div
                class="seg"
                style={{
                  left: `${seg.x}px`,
                  top: `${seg.y - data().strokeW / 2}px`,
                  width: `${seg.length}px`,
                  height: `${data().strokeW}px`,
                  transform: `rotate(${seg.angleDeg}deg)`,
                  "background-image": `repeating-linear-gradient(90deg, var(--stroke) 0 ${DASH}px, transparent ${DASH}px ${DASH_CYCLE}px)`,
                  "background-position": `${start}px 0`,
                }}
              />
            )}
          </For>
        </div>
      </>
    );
  }
}

customElements.define("bld-connector", BldConnector);

declare global {
  interface HTMLElementTagNameMap {
    "bld-connector": BldConnector;
  }
}

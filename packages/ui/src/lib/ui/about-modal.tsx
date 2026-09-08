import type { JSX } from "solid-js";
import { BldModal } from "./modal";

export class BldAboutModal extends BldModal {
  protected isOpen(): boolean {
    return this.app?.aboutOpen ?? false;
  }

  protected closeModal(): void {
    this.app.aboutOpen = false;
  }

  override render(): JSX.Element {
    return this.renderDialog({
      testId: "about-modal",
      title: "About Bld",
      body: (
        <>
          <p>
            A block diagram: drag icons from the palette, then ground inputs by wiring handles to infer types.
          </p>
          <ul class="about-modal-list">
            <li>Scroll to zoom toward the cursor</li>
            <li>Drag empty space to pan</li>
            <li>Drag a placed block to move it</li>
            <li>Click or drag from an output handle to an input handle to ground a type</li>
            <li>Run serializes the canvas to TypeScript, infers types with tsc, compiles the diagram, and runs it in a worker</li>
            <li>Each Timer or Constant ticks with setInterval (a worker thread when available)</li>
            <li>GPIO In emits one sample when you toggle the switch, not on a quantization period; GPIO Out shows the same switch as a disabled readout</li>
            <li>Live wires animate at the frequency of value changes on that connector, not the generator tick rate</li>
            <li>After Run, Chart on Scope samples the last pushed value every M ms into an N-second window (default 10 ms × 30 s). NaN is stored when nothing has been pushed yet and is not drawn</li>
            <li>Delete or Backspace removes the selection</li>
            <li>Ctrl/Cmd + 0 resets the view</li>
          </ul>
        </>
      ),
      footer: (
        <wa-button variant="brand" on:click={() => this.closeModal()}>Close</wa-button>
      ),
    });
  }
}

customElements.define("bld-about-modal", BldAboutModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-about-modal": BldAboutModal;
  }
}

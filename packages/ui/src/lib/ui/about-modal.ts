import { html } from "lit";
import { BldModal } from "./modal";

export class BldAboutModal extends BldModal {
  protected isOpen(): boolean {
    return this.app?.aboutOpen ?? false;
  }

  protected closeModal(): void {
    this.app.aboutOpen = false;
  }

  protected override render() {
    return this.renderDialog({
      testId: "about-modal",
      title: "About Bld",
      body: html`
        <div class="modal-body">
          <p class="mb-2">
            A block diagram: drag icons from the palette, then ground inputs by wiring handles to infer types.
          </p>
          <ul class="small mb-0">
            <li>Scroll to zoom toward the cursor</li>
            <li>Drag empty space to pan</li>
            <li>Drag a placed block to move it</li>
            <li>Click or drag from an output handle to an input handle to ground a type</li>
            <li>Run writes diagram XML, infers types, then compiles MoonBit twice: wasm-gc for the browser and linear wasm for the MCU</li>
            <li>Each Timer ticks with the imported browser setInterval (a worker thread when the page is cross-origin isolated)</li>
            <li>GPIO In emits one sample when you toggle the switch, not on a quantization period; GPIO Out shows the same switch as a disabled readout</li>
            <li>File → Hardware can deploy the MCU wasm over WebSerial</li>
            <li>After Run, Chart on Scope reads samples from that buffer</li>
            <li>Delete or Backspace removes the selection</li>
            <li>Ctrl/Cmd + 0 resets the view</li>
          </ul>
        </div>
      `,
      footer: html`
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" @click=${() => this.closeModal()}>Close</button>
        </div>
      `,
    });
  }
}

customElements.define("bld-about-modal", BldAboutModal);

declare global {
  interface HTMLElementTagNameMap {
    "bld-about-modal": BldAboutModal;
  }
}

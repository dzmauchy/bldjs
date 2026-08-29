<script lang="ts">
  import { getAppState } from "$lib/context";

  const app = getAppState();
</script>

{#if app.aboutOpen}
  <div
    class="modal-backdrop fade show"
    role="button"
    tabindex="0"
    onclick={() => (app.aboutOpen = false)}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        app.aboutOpen = false;
      }
    }}
  ></div>
  <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="about-modal">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">About Bld</h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            onclick={() => (app.aboutOpen = false)}
          ></button>
        </div>
        <div class="modal-body">
          <p class="mb-2">
            A Svelte TypeScript canvas. Svelte Flow manages the diagram: associate XML type/block
            models, drag blocks onto the workspace, then ground inputs by wiring ports to infer types.
          </p>
          <ul class="small mb-0">
            <li>Scroll to zoom toward the cursor</li>
            <li>Drag empty space to pan</li>
            <li>Drag a placed block to move it</li>
            <li>Click or drag from an output handle to an input handle to ground a type</li>
            <li>Delete or Backspace removes the selection</li>
            <li>Ctrl/Cmd + 0 resets the view</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" onclick={() => (app.aboutOpen = false)}>Close</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { NONE_ID } from "$lib/model";
  import { provideAppState } from "$lib/context";
  import { AppState } from "$lib/state.svelte";
  import AboutModal from "$lib/ui/AboutModal.svelte";
  import DragGhost from "$lib/ui/DragGhost.svelte";
  import MenuBar from "$lib/ui/MenuBar.svelte";
  import OscilloscopeChart from "$lib/ui/OscilloscopeChart.svelte";
  import Palette from "$lib/ui/Palette.svelte";
  import StatusBar from "$lib/ui/StatusBar.svelte";
  import Workspace from "$lib/ui/Workspace.svelte";

  const app = provideAppState(new AppState());

  $effect(() => {
    void app.timerTopologyKey();
    untrack(() => app.reconcileTimers());
  });

  onMount(() => {
    const onMove = (event: PointerEvent) => {
      if (app.draggingDefId === null) {
        return;
      }
      app.dragX = event.clientX;
      app.dragY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (app.draggingDefId === null) {
        return;
      }
      const clientX = event.clientX;
      const clientY = event.clientY;
      const fromTarget =
        event.target instanceof Element ? event.target.closest(".canvas-viewport") : null;
      const fromPoint = document.elementFromPoint(clientX, clientY)?.closest(".canvas-viewport") ?? null;
      const viewport = fromTarget ?? fromPoint;
      if (!(viewport instanceof Element)) {
        app.draggingDefId = null;
        app.draggingId = NONE_ID;
        return;
      }
      app.dropPaletteBlock(clientX, clientY, viewport.getBoundingClientRect());
    };
    const onCancel = () => {
      app.draggingDefId = null;
      app.draggingId = NONE_ID;
    };
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      switch (event.key) {
        case "Delete":
        case "Backspace":
          app.deleteSelected();
          break;
        case "Escape":
          app.selected = NONE_ID;
          app.aboutOpen = false;
          app.draggingDefId = null;
          app.draggingId = NONE_ID;
          app.linkingFrom = null;
          app.closeOscilloscope();
          break;
        case "0":
          if (meta) {
            event.preventDefault();
            app.resetView();
          }
          break;
        case "=":
        case "+":
          if (meta) {
            event.preventDefault();
            app.zoomIn();
          }
          break;
        case "-":
          if (meta) {
            event.preventDefault();
            app.zoomOut();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<div class="app-shell d-flex flex-column" class:is-dragging={app.isDragging()}>
  <MenuBar />
  <div class="app-body d-flex flex-grow-1 min-h-0">
    <Palette />
    <Workspace />
  </div>
  <StatusBar />
</div>
<AboutModal />
<OscilloscopeChart />
<DragGhost />

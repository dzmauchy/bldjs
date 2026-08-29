<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { NONE_ID } from "$lib/model";
  import { provideAppState } from "$lib/context";
  import { AppState } from "$lib/state.svelte";
  import AboutModal from "$lib/ui/AboutModal.svelte";
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
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      switch (event.key) {
        case "Escape":
          app.selected = NONE_ID;
          app.aboutOpen = false;
          app.draggingDefId = null;
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

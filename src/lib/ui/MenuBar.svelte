<script lang="ts">
  import { onMount } from "svelte";
  import { getAppState } from "$lib/context";

  const app = getAppState();
  let openMenu = $state<string | null>(null);

  function close(): void {
    openMenu = null;
  }

  function toggle(name: string): void {
    openMenu = openMenu === name ? null : name;
  }

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (openMenu === null) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest(".app-menubar")) {
        return;
      }
      openMenu = null;
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  });
</script>

<nav class="app-menubar border-bottom d-flex align-items-center px-2">
  <span class="app-brand me-3">Bld</span>

  <div class="menu-item-wrap position-relative">
    <button class="menu-item btn btn-sm" class:active={openMenu === "file"} type="button" onclick={() => toggle("file")}>
      File
    </button>
    <div class="dropdown-menu app-menu-dropdown" class:show={openMenu === "file"} class:d-block={openMenu === "file"}>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.clearCanvas();
          close();
        }}
      >
        New canvas
      </button>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.deleteSelected();
          close();
        }}
      >
        Delete selected
      </button>
      <div class="dropdown-divider"></div>
      <div class="dropdown-header">Associated models</div>
      {#each app.sources as source (source.name)}
        <div class="dropdown-item-text small font-monospace">{source.name}</div>
      {/each}
    </div>
  </div>

  <div class="menu-item-wrap position-relative">
    <button class="menu-item btn btn-sm" class:active={openMenu === "view"} type="button" onclick={() => toggle("view")}>
      View
    </button>
    <div class="dropdown-menu app-menu-dropdown" class:show={openMenu === "view"} class:d-block={openMenu === "view"}>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.zoomIn();
          close();
        }}
      >
        Zoom in
      </button>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.zoomOut();
          close();
        }}
      >
        Zoom out
      </button>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.resetView();
          close();
        }}
      >
        Reset view
      </button>
    </div>
  </div>

  <div class="menu-item-wrap position-relative">
    <button class="menu-item btn btn-sm" class:active={openMenu === "help"} type="button" onclick={() => toggle("help")}>
      Help
    </button>
    <div class="dropdown-menu app-menu-dropdown" class:show={openMenu === "help"} class:d-block={openMenu === "help"}>
      <button
        class="dropdown-item"
        type="button"
        onclick={() => {
          app.aboutOpen = true;
          close();
        }}
      >
        About
      </button>
    </div>
  </div>
</nav>

<script lang="ts">
  import { getAppState } from "$lib/context";

  const app = getAppState();

  function countLabel(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
  }
</script>

<footer class="app-statusbar border-top d-flex align-items-center px-3 small text-secondary">
  <span class="me-3" data-testid="status-blocks">{countLabel(app.blocks.length, "block", "blocks")}</span>
  <span class="me-3" data-testid="status-links">{countLabel(app.links.length, "link", "links")}</span>
  <span class="me-3">{countLabel(app.sources.length, "model", "models")}</span>
  <span class="me-3" data-testid="status-zoom">{app.zoomPercent()}%</span>
  <span class="ms-auto">
    {#if app.linkingFrom}
      Click an input handle to ground its type · Esc cancels
    {:else}
      Click or drag output → input handles · scroll to zoom
    {/if}
  </span>
</footer>

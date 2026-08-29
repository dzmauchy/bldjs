<script lang="ts">
  import { getAppState } from "$lib/context";
  import BlockCard from "./BlockCard.svelte";

  const app = getAppState();
  const def = $derived(app.draggingDefId ? app.blockDef(app.draggingDefId) : undefined);
</script>

{#if app.draggingDefId && def}
  <div class="drag-ghost" style:position="fixed" style:left={`${app.dragX}px`} style:top={`${app.dragY}px`}>
    <BlockCard {def} compact={true} />
  </div>
{/if}

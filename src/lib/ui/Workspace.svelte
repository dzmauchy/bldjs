<script lang="ts">
  import { getAppState } from "$lib/context";
  import "$lib/flow/BldDiagram.svelte";

  const app = getAppState();
</script>

<div class="workspace">
  <bld-diagram {app}></bld-diagram>
</div>

<style>
  .workspace {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
</style>

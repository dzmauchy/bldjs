<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import FlowCanvas from "./FlowCanvas.svelte";
</script>

<SvelteFlowProvider>
  <FlowCanvas />
</SvelteFlowProvider>

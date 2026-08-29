<script lang="ts">
  import type { Node, NodeProps } from "@xyflow/svelte";
  import { getAppState } from "$lib/context";
  import BlockCard from "./BlockCard.svelte";

  type BlockNode = Node<{ defId: string }, "block">;

  let { id, data, selected }: NodeProps<BlockNode> = $props();

  const app = getAppState();
  const numericId = $derived(Number(id));
  const def = $derived(app.blockDef(data.defId));
  const resolved = $derived(app.resolveAll().get(numericId));
</script>

{#if def}
  <div
    class="canvas-block"
    class:selected
    data-testid="node"
    data-block-id={numericId}
    data-block-def={data.defId}
  >
    <BlockCard {def} id={numericId} {resolved} useHandles={true} />
  </div>
{/if}

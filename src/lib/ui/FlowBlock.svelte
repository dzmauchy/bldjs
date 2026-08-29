<script lang="ts">
  import { Handle, Position, type Node, type NodeProps } from "@xyflow/svelte";
  import {
    isResolvedCompatible,
    resolvedInput,
    resolvedOutput,
    typeToString,
    type BlockDef,
    type ResolvedBlock,
  } from "$lib/blocks";
  import { getAppState } from "$lib/context";

  type BlockNode = Node<{ defId: string }, "block">;

  let { id, data, selected }: NodeProps<BlockNode> = $props();

  const app = getAppState();
  const numericId = $derived(Number(id));
  const def = $derived(app.blockDef(data.defId));
  const kind = $derived(def ? app.kindOf(def) : undefined);
  const resolved = $derived(app.resolveAll().get(numericId));
  const isScope = $derived(data.defId === "oscilloscope");
  const paramsLine = $derived(resolved ? paramLine(resolved) : "");

  function paramLine(block: ResolvedBlock): string {
    if (block.params.size === 0) {
      return "";
    }
    return [...block.params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ty]) => `${name} = ${typeToString(ty)}`)
      .join(" · ");
  }

  function portType(block: BlockDef, portName: string, fallback: BlockDef["inputs"][number]["ty"], output: boolean): string {
    if (!resolved) {
      return typeToString(fallback);
    }
    const ty = output ? resolvedOutput(resolved, portName) : resolvedInput(resolved, portName);
    return typeToString(ty ?? fallback);
  }
</script>

{#if def && kind}
  <div
    class={`flow-node ${kind.className}`}
    class:selected
    data-testid="node"
    data-block-id={numericId}
    data-block-def={data.defId}
  >
    <div class="flow-node-header">
      <span class="flow-node-icon" aria-hidden="true">{kind.glyph}</span>
      <span class="flow-node-title">{def.name}</span>
      {#if isScope}
        <button
          class="flow-node-chart nodrag nopan"
          type="button"
          title="Open live chart"
          data-testid={`chart-${numericId}`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => {
            event.stopPropagation();
            app.openOscilloscope(numericId);
          }}
        >
          Chart
        </button>
      {/if}
    </div>
    {#if paramsLine}
      <div class="flow-node-params">{paramsLine}</div>
    {/if}
    <div class="flow-node-ports nodrag nopan">
      <div class="flow-node-port-col">
        {#each def.inputs as port (port.name)}
          {@const ty = portType(def, port.name, port.ty, false)}
          {@const ok = resolved ? isResolvedCompatible(resolved, port.name) : true}
          {@const grounded = app.inputIsGrounded(numericId, port.name)}
          <div class="block-port-row is-in" class:is-bad={!ok} class:is-grounded={grounded} title={ty}>
            <Handle
              type="target"
              id={port.name}
              position={Position.Left}
              class="block-handle"
              data-testid={`input-${port.name}`}
            />
            <span class="block-port-meta">
              <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
              <span class="block-port-type">{ty}</span>
            </span>
          </div>
        {/each}
      </div>
      <div class="flow-node-port-col is-out">
        {#each def.outputs as port (port.name)}
          {@const ty = portType(def, port.name, port.ty, true)}
          {@const linking =
            app.linkingFrom?.blockId === numericId && app.linkingFrom.port === port.name}
          <div class="block-port-row is-out" class:is-linking={linking} title={ty}>
            <span class="block-port-meta">
              <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
              <span class="block-port-type">{ty}</span>
            </span>
            <Handle
              type="source"
              id={port.name}
              position={Position.Right}
              class="block-handle"
              data-testid={`output-${port.name}`}
            />
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

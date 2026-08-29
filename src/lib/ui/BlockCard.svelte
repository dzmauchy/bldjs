<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import { type BlockDef, type ResolvedBlock, isResolvedCompatible, resolvedInput, resolvedOutput, typeToString } from "$lib/blocks";
  import { NONE_ID, isNoneId } from "$lib/model";
  import { getAppState } from "$lib/context";

  interface Props {
    def: BlockDef;
    id?: number;
    compact?: boolean;
    resolved?: ResolvedBlock;
  }

  let { def, id = NONE_ID, compact = false, resolved }: Props = $props();

  const app = getAppState();
  const kind = $derived(app.kindOf(def));
  const isScope = $derived(def.id === "oscilloscope");
  const hint = $derived(def.attributes.find((a) => a.name === "description")?.value ?? kind.hint);
  const live = $derived(!isNoneId(id));
  const paramsLine = $derived(resolved ? paramLine(resolved) : "");

  function signature(block: BlockDef): string {
    const inputs = block.inputs
      .map((port) => (port.vararg ? `${port.name}: ${typeToString(port.ty)}…` : `${port.name}: ${typeToString(port.ty)}`))
      .join(", ");
    const outputs = block.outputs.map((port) => `${port.name}: ${typeToString(port.ty)}`).join(", ");
    return outputs.length === 0 ? `(${inputs})` : `(${inputs}) → ${outputs}`;
  }

  function paramLine(block: ResolvedBlock): string {
    if (block.params.size === 0) {
      return "";
    }
    return [...block.params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, ty]) => `${name} = ${typeToString(ty)}`)
      .join(" · ");
  }

  function portType(portName: string, fallback: typeof def.inputs[number]["ty"], output: boolean): string {
    if (!resolved) {
      return typeToString(fallback);
    }
    const ty = output ? resolvedOutput(resolved, portName) : resolvedInput(resolved, portName);
    return typeToString(ty ?? fallback);
  }
</script>

<article class={`card block-card ${kind.className} ${compact ? "block-card-compact" : ""}`}>
  <div class="card-header d-flex align-items-center gap-2 py-1 px-2">
    <span class="block-glyph" aria-hidden="true">{kind.glyph}</span>
    <span class={`badge ${kind.badgeClass}`}>{def.name}</span>
    {#if live}
      <span class="ms-auto d-flex align-items-center gap-1">
        {#if isScope}
          <button
            class="btn btn-sm btn-outline-info py-0 px-1 nodrag nopan"
            type="button"
            title="Open live chart"
            data-testid={`chart-${id}`}
            onpointerdown={(event) => event.stopPropagation()}
            onclick={(event) => {
              event.stopPropagation();
              app.openOscilloscope(id);
            }}
          >
            Chart
          </button>
        {/if}
        <span class="small text-secondary">#{id}</span>
      </span>
    {/if}
  </div>
  {#if compact}
    <div class="card-body py-2 px-2">
      <p class="card-text small text-secondary mb-1">{hint}</p>
      <div class="small font-monospace text-secondary">{signature(def)}</div>
    </div>
  {:else}
    <div class="card-body py-1 px-2">
      {#if paramsLine}
        <div class="small font-monospace text-info mb-1">{paramsLine}</div>
      {/if}
      <div class="d-flex justify-content-between gap-2 block-ports nodrag nopan">
        <div class="d-flex flex-column gap-1 flex-grow-1">
          {#each def.inputs as port (port.name)}
            {@const ty = portType(port.name, port.ty, false)}
            {@const ok = resolved ? isResolvedCompatible(resolved, port.name) : true}
            {@const grounded = app.inputIsGrounded(id, port.name)}
            <div
              class="block-port-row is-in"
              class:is-bad={!ok}
              class:is-grounded={grounded}
              title={ty}
            >
              <Handle
                type="target"
                id={port.name}
                position={Position.Left}
                class="block-handle"
                data-testid={`input-${port.name}`}
              />
              <span class="block-port-meta">
                <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                <span class="block-port-type font-monospace">{ty}</span>
              </span>
            </div>
          {/each}
        </div>
        <div class="d-flex flex-column gap-1 align-items-end flex-grow-1">
          {#each def.outputs as port (port.name)}
            {@const ty = portType(port.name, port.ty, true)}
            {@const linking =
              app.linkingFrom?.blockId === id && app.linkingFrom.port === port.name}
            <div
              class="block-port-row is-out"
              class:is-linking={linking}
              title={ty}
            >
              <span class="block-port-meta">
                <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                <span class="block-port-type font-monospace">{ty}</span>
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
</article>

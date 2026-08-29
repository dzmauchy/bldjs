<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import { type BlockDef, type ResolvedBlock, isResolvedCompatible, resolvedInput, resolvedOutput, typeToString } from "$lib/blocks";
  import { NONE_ID, isNoneId } from "$lib/model";
  import { getAppState } from "$lib/context";

  interface Props {
    def: BlockDef;
    id?: number;
    compact?: boolean;
    useHandles?: boolean;
    resolved?: ResolvedBlock;
  }

  let { def, id = NONE_ID, compact = false, useHandles = false, resolved }: Props = $props();

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

  function onPortPointerDown(event: PointerEvent, name: string, output: boolean): void {
    if (isNoneId(id)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    if (output) {
      app.onOutputPort(id, name);
    } else {
      app.onInputPort(id, name);
    }
  }

  function onPortPointerUp(event: PointerEvent, name: string, output: boolean): void {
    if (isNoneId(id) || output) {
      return;
    }
    event.stopPropagation();
    app.onInputPort(id, name);
  }

  function onHandleClick(event: MouseEvent | KeyboardEvent, name: string, output: boolean): void {
    if (isNoneId(id)) {
      return;
    }
    event.stopPropagation();
    if (output) {
      app.onOutputPort(id, name);
    } else {
      app.onInputPort(id, name);
    }
  }

  function onPortKeyDown(event: KeyboardEvent, name: string, output: boolean): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onHandleClick(event, name, output);
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
      <div class="d-flex justify-content-between gap-2 block-ports">
        <div class="d-flex flex-column gap-1 flex-grow-1">
          {#each def.inputs as port (port.name)}
            {@const ty = portType(port.name, port.ty, false)}
            {@const ok = resolved ? isResolvedCompatible(resolved, port.name) : true}
            {@const grounded = app.inputIsGrounded(id, port.name)}
            {#if useHandles}
              <div
                class="block-port-row is-in nodrag nopan"
                class:is-bad={!ok}
                class:is-grounded={grounded}
                data-testid={`input-${port.name}`}
                title={ty}
                role="button"
                tabindex="0"
                onclick={(event) => onHandleClick(event, port.name, false)}
                onkeydown={(event) => onPortKeyDown(event, port.name, false)}
                onpointerdown={(event) => event.stopPropagation()}
              >
                <Handle
                  type="target"
                  id={port.name}
                  position={Position.Left}
                  class="block-handle nodrag nopan"
                  isConnectable={true}
                  style="position: relative; top: auto; left: auto; right: auto; bottom: auto; transform: none; pointer-events: all;"
                />
                <span class="block-port-meta">
                  <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                  <span class="block-port-type font-monospace">{ty}</span>
                </span>
              </div>
            {:else}
              <button
                class="block-port-row is-in"
                class:is-bad={!ok}
                class:is-grounded={grounded}
                type="button"
                title={ty}
                onpointerdown={(event) => onPortPointerDown(event, port.name, false)}
                onpointerup={(event) => onPortPointerUp(event, port.name, false)}
              >
                <span class="block-port block-port-in"></span>
                <span class="block-port-meta">
                  <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                  <span class="block-port-type font-monospace">{ty}</span>
                </span>
              </button>
            {/if}
          {/each}
        </div>
        <div class="d-flex flex-column gap-1 align-items-end flex-grow-1">
          {#each def.outputs as port (port.name)}
            {@const ty = portType(port.name, port.ty, true)}
            {@const linking =
              app.linkingFrom?.blockId === id && app.linkingFrom.port === port.name}
            {#if useHandles}
              <div
                class="block-port-row is-out nodrag nopan"
                class:is-linking={linking}
                data-testid={`output-${port.name}`}
                title={ty}
                role="button"
                tabindex="0"
                onclick={(event) => onHandleClick(event, port.name, true)}
                onkeydown={(event) => onPortKeyDown(event, port.name, true)}
                onpointerdown={(event) => event.stopPropagation()}
              >
                <span class="block-port-meta">
                  <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                  <span class="block-port-type font-monospace">{ty}</span>
                </span>
                <Handle
                  type="source"
                  id={port.name}
                  position={Position.Right}
                  class="block-handle nodrag nopan"
                  isConnectable={true}
                  style="position: relative; top: auto; left: auto; right: auto; bottom: auto; transform: none; pointer-events: all;"
                />
              </div>
            {:else}
              <button
                class="block-port-row is-out"
                class:is-linking={linking}
                type="button"
                title={ty}
                onpointerdown={(event) => onPortPointerDown(event, port.name, true)}
                onpointerup={(event) => onPortPointerUp(event, port.name, true)}
              >
                <span class="block-port-meta">
                  <span class="block-port-name">{port.vararg ? `${port.name}…` : port.name}</span>
                  <span class="block-port-type font-monospace">{ty}</span>
                </span>
                <span class="block-port block-port-out"></span>
              </button>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</article>

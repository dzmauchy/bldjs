<script lang="ts">
  import { type BlockDef } from "$lib/blocks";
  import { getAppState } from "$lib/context";
  import BlockIcon from "./BlockIcon.svelte";

  const app = getAppState();
  let open = $state(new Set(["cs", "flow", "java.lang", "java.util"]));

  const groups = $derived.by(() => {
    const map = new Map<string, BlockDef[]>();
    for (const block of app.catalog.blocks()) {
      const list = map.get(block.ns) ?? [];
      list.push(block);
      map.set(block.ns, list);
    }
    for (const blocks of map.values()) {
      blocks.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  function toggleNs(ns: string): void {
    const next = new Set(open);
    if (next.has(ns)) {
      next.delete(ns);
    } else {
      next.add(ns);
    }
    open = next;
  }

  function onDragStart(event: DragEvent, defId: string): void {
    app.draggingDefId = defId;
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.setData("application/svelteflow", defId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd(): void {
    app.draggingDefId = null;
  }
</script>

<aside class="palette border-end d-flex flex-column">
  <div class="palette-header px-3 py-2 border-bottom">
    <div class="small text-uppercase text-secondary fw-semibold">Blocks</div>
    <div class="small text-secondary">Drag onto the canvas</div>
  </div>
  <div class="palette-list flex-grow-1 overflow-auto">
    {#each groups as [ns, blocks] (ns)}
      <div class="palette-ns">
        <button
          class="palette-ns-toggle"
          class:open={open.has(ns)}
          type="button"
          data-testid={`ns-${ns}`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={() => toggleNs(ns)}
        >
          {app.catalog.namespaceLabel(ns)}
        </button>
        {#if open.has(ns)}
          <div class="palette-ns-body">
            {#each blocks as def (def.id)}
              {@const kind = app.kindOf(def)}
              {@const hint = def.attributes.find((a) => a.name === "description")?.value ?? kind.hint}
              <div
                class={`palette-item ${kind.className}`}
                role="button"
                tabindex="0"
                draggable="true"
                class:is-drag-source={app.draggingDefId === def.id}
                data-testid={`palette-${def.id}`}
                title={`${hint} — drag onto the canvas, or double-click to drop at the center`}
                ondragstart={(event) => onDragStart(event, def.id)}
                ondragend={onDragEnd}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    app.addBlockAtViewCenter(def.id);
                  }
                }}
                ondblclick={() => {
                  app.draggingDefId = null;
                  app.addBlockAtViewCenter(def.id);
                }}
              >
                <span class="palette-item-icon" aria-hidden="true">
                  <BlockIcon name={def.icon} />
                </span>
                <span class="palette-item-label">{def.name}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</aside>

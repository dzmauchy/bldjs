<script lang="ts">
  import { type BlockDef } from "$lib/blocks";
  import { NONE_ID } from "$lib/model";
  import { getAppState } from "$lib/context";
  import BlockCard from "./BlockCard.svelte";

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

  function startDrag(defId: string, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    app.draggingDefId = defId;
    app.dragX = event.clientX;
    app.dragY = event.clientY;
  }
</script>

<aside class="palette border-end d-flex flex-column">
  <div class="palette-header px-3 py-2 border-bottom">
    <div class="small text-uppercase text-secondary fw-semibold">Blocks</div>
    <div class="small text-secondary">Namespaces from associated XML models</div>
  </div>
  <div class="palette-list flex-grow-1 overflow-auto">
    {#each groups as [ns, blocks] (ns)}
      <div class="palette-ns">
        <button
          class="palette-ns-toggle"
          class:open={open.has(ns)}
          type="button"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={() => toggleNs(ns)}
        >
          {app.catalog.namespaceLabel(ns)}
        </button>
        {#if open.has(ns)}
          <div class="palette-ns-body d-flex flex-column gap-2 p-3 pt-2">
            {#each blocks as def (def.id)}
              <div
                class="palette-block"
                role="button"
                tabindex="0"
                class:is-drag-source={app.draggingDefId === def.id}
                title="Drag to the canvas, or double-click to drop at the center"
                onpointerdown={(event) => startDrag(def.id, event)}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    app.addBlockAtViewCenter(def.id);
                  }
                }}
                ondblclick={() => {
                  app.draggingDefId = null;
                  app.draggingId = NONE_ID;
                  app.addBlockAtViewCenter(def.id);
                }}
              >
                <BlockCard {def} compact={true} />
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</aside>

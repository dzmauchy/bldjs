<script lang="ts">
  import { blockIconSvg } from "./icons";

  interface Props {
    name: string | null | undefined;
    class?: string;
  }

  let { name, class: className = "block-icon" }: Props = $props();
  const svg = $derived(blockIconSvg(name));
</script>

<span class={className} aria-hidden="true">
  {@html svg}
</span>

<style>
  span :global(svg) {
    width: 1em;
    height: 1em;
    display: block;
    flex: 0 0 auto;
    overflow: visible;
  }
</style>

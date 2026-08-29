<script lang="ts">
  import { iconSvgInner } from "$lib/flow";

  interface Props {
    name: string | null | undefined;
    class?: string;
  }

  let { name, class: className = "block-icon" }: Props = $props();
</script>

<svg class={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
  {@html iconSvgInner(name)}
</svg>

<style>
  svg {
    width: 1em;
    height: 1em;
    flex: 0 0 auto;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    overflow: visible;
  }
</style>

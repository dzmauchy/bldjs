<script lang="ts">
  import { onDestroy } from "svelte";
  import { isNoneId } from "$lib/model";
  import { getAppState } from "$lib/context";

  const app = getAppState();
  let canvas: HTMLCanvasElement | undefined = $state();
  let handle: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    const id = app.scopeOpen;
    if (handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
    if (isNoneId(id)) {
      return;
    }
    handle = setInterval(() => {
      if (!canvas) {
        return;
      }
      const samples = app.samples.get(id)?.snapshot() ?? [];
      draw(canvas, samples);
    }, 50);
  });

  onDestroy(() => {
    if (handle !== undefined) {
      clearInterval(handle);
    }
  });

  function draw(target: HTMLCanvasElement, samples: number[]): void {
    const ctx = target.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = target.width;
    const height = target.height;
    ctx.fillStyle = "#14171a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    if (samples.length < 2) {
      ctx.fillStyle = "#6c757d";
      ctx.fillText("Waiting for samples — wire Oscilloscope → Sin → Quantizer → Timer", 16, height / 2);
      return;
    }
    const min = samples.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    const max = samples.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
    const span = Math.max(max - min, 1e-6);
    ctx.strokeStyle = "#0dcaf0";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const last = samples.length - 1;
    samples.forEach((value, index) => {
      const x = (index / last) * (width - 8) + 4;
      const y = height - 8 - ((value - min) / span) * (height - 16);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }
</script>

{#if !isNoneId(app.scopeOpen)}
  <div
    class="modal-backdrop fade show"
    role="button"
    tabindex="0"
    onclick={() => app.closeOscilloscope()}
    onkeydown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        app.closeOscilloscope();
      }
    }}
  ></div>
  <div class="modal fade show d-block" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Oscilloscope #{app.scopeOpen}</h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            onclick={() => app.closeOscilloscope()}
          ></button>
        </div>
        <div class="modal-body p-2">
          <canvas class="scope-canvas" bind:this={canvas} width="720" height="280"></canvas>
        </div>
      </div>
    </div>
  </div>
{/if}

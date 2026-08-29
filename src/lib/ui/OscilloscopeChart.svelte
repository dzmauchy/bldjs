<script lang="ts">
  import { Chart, type ChartConfiguration } from "chart.js/auto";
  import { isNoneId } from "$lib/model";
  import { getAppState } from "$lib/context";

  const app = getAppState();
  let canvas: HTMLCanvasElement | undefined = $state();

  const darkGrid = "rgba(255, 255, 255, 0.08)";
  const darkTick = "#adb5bd";

  $effect(() => {
    const canvasEl = canvas;
    const id = app.scopeOpen;
    if (!canvasEl || isNoneId(id)) {
      return;
    }

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "samples",
            data: [],
            borderColor: "#0dcaf0",
            backgroundColor: "rgba(13, 202, 240, 0.16)",
            fill: true,
            pointRadius: 0,
            borderWidth: 1.8,
            tension: 0.25,
            spanGaps: true,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        color: darkTick,
        font: { family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "#1c2125",
            titleColor: "#f8f9fa",
            bodyColor: "#0dcaf0",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            display: false,
            grid: { color: darkGrid },
          },
          y: {
            grid: { color: darkGrid },
            border: { color: darkGrid },
            ticks: { color: darkTick, maxTicksLimit: 6 },
          },
        },
      },
    };

    const chart = new Chart(canvasEl, config);
    const tick = () => {
      const samples = app.samples.get(id)?.snapshot() ?? [];
      chart.data.labels = samples.map((_, index) => index);
      chart.data.datasets[0].data = samples;
      chart.update("none");
    };
    tick();
    const handle = setInterval(tick, 50);
    return () => {
      clearInterval(handle);
      chart.destroy();
    };
  });
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
  <div class="modal fade show d-block" tabindex="-1" role="dialog" data-testid="oscilloscope-modal">
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
        <div class="modal-body p-3">
          <div class="scope-chart">
            <canvas bind:this={canvas}></canvas>
          </div>
          <div class="small text-secondary mt-2">
            Push chain: Timer → Quantizer → Sin → Oscilloscope
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

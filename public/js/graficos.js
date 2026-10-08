// Nova Gol Analytics — gráficos (Chart.js) con la paleta validada para fondo césped
(function () {
  const C = {
    azul: "#3987e5",      // serie 1: el equipo / local / casa / a favor
    naranja: "#d95926",   // serie 2: rival / visitante / fuera / en contra
    ref: "#8fa699",       // referencia neutra: líder, promedio de liga
    tiza: "#eef2ea",
    tiza2: "#b9cbbf",
    tiza3: "#93ad9e",
    linea: "rgba(238,242,234,0.12)",
    panel: "#123a2b",
  };

  const activos = new Map(); // canvas -> Chart

  function base(exportar) {
    const tam = exportar ? 26 : 12;
    return {
      responsive: !exportar,
      maintainAspectRatio: false,
      animation: exportar ? false : { duration: 350 },
      devicePixelRatio: exportar ? 1 : undefined,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false }, // leyenda propia en HTML
        tooltip: {
          enabled: !exportar,
          backgroundColor: "#0b2a1f", borderColor: "rgba(238,242,234,0.32)", borderWidth: 1,
          titleColor: C.tiza, bodyColor: C.tiza2, padding: 10, cornerRadius: 6,
          titleFont: { family: "Barlow", weight: "600" }, bodyFont: { family: "Barlow" },
          boxPadding: 4,
        },
      },
      scales: {
        x: { grid: { color: C.linea, drawTicks: false }, border: { color: C.linea }, ticks: { color: C.tiza3, font: { family: "Barlow", size: tam }, padding: 6, maxRotation: 0, autoSkipPadding: 10 } },
        y: { grid: { color: C.linea, drawTicks: false }, border: { display: false }, ticks: { color: C.tiza3, font: { family: "Barlow", size: tam }, padding: 8 } },
      },
    };
  }

  function destruir(canvas) {
    const g = activos.get(canvas);
    if (g) { g.destroy(); activos.delete(canvas); }
  }
  function crear(canvas, config) {
    destruir(canvas);
    const g = new Chart(canvas, config);
    activos.set(canvas, g);
    return g;
  }

  const fusionar = (a, b) => {
    for (const k in b) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") fusionar(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  };

  // Líneas: series [{ label, data, color, grosor }]
  function linea(canvas, etiquetas, series, op = {}) {
    const o = base(op.exportar);
    if (op.invertirY) { o.scales.y.reverse = true; o.scales.y.min = 1; o.scales.y.ticks.precision = 0; }
    if (op.sufijo) o.scales.y.ticks.callback = (v) => v + op.sufijo;
    if (op.yMin !== undefined) o.scales.y.min = op.yMin;
    o.plugins.tooltip.callbacks = op.tooltip || {};
    return crear(canvas, {
      type: "line",
      data: {
        labels: etiquetas,
        datasets: series.map((s) => ({
          label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color,
          borderWidth: op.exportar ? 5 : (s.grosor || 2), tension: 0.25, spanGaps: true,
          pointRadius: op.exportar ? 0 : (s.puntos === false ? 0 : 2.5), pointHoverRadius: 5,
          pointBorderColor: C.panel, pointBorderWidth: 2,
        })),
      },
      options: fusionar(o, op.extra || {}),
    });
  }

  // Barras: series [{ label, data, color }]
  function barras(canvas, etiquetas, series, op = {}) {
    const o = base(op.exportar);
    if (op.horizontal) {
      o.indexAxis = "y";
      o.interaction = { mode: "nearest", axis: "y", intersect: false };
      o.scales.y.grid.display = false;
      if (op.sufijo) o.scales.x.ticks.callback = (v) => v + op.sufijo;
      if (op.max !== undefined) o.scales.x.max = op.max;
      o.scales.x.min = 0;
    } else {
      o.scales.x.grid.display = false;
      if (op.sufijo) o.scales.y.ticks.callback = (v) => v + op.sufijo;
      if (op.max !== undefined) o.scales.y.max = op.max;
    }
    if (op.divergente) {
      o.scales.x.stacked = true; o.scales.y.stacked = true;
      o.scales.y.ticks.callback = (v) => Math.abs(v);
      o.plugins.tooltip.callbacks = { label: (c) => `${c.dataset.label}: ${Math.abs(c.raw)}` };
    }
    if (op.tooltip) o.plugins.tooltip.callbacks = op.tooltip;
    return crear(canvas, {
      type: "bar",
      data: {
        labels: etiquetas,
        datasets: series.map((s) => ({
          label: s.label, data: s.data, backgroundColor: s.color,
          borderRadius: op.divergente ? 3 : 4, borderSkipped: op.divergente ? false : "start",
          barPercentage: 0.82, categoryPercentage: series.length > 1 && !op.divergente ? 0.72 : 0.8,
          maxBarThickness: op.exportar ? 64 : 30,
        })),
      },
      options: fusionar(o, op.extra || {}),
    });
  }

  window.GRAF = { C, linea, barras, destruir };
})();

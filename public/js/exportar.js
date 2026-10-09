// Nova Gol Analytics — láminas para redes (carrusel 1080x1350, historia 1080x1920)
(function () {
  const t = (k, v) => I18N.t(k, v);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ANCHO = 1080;

  const estiloBase = `
    width:${ANCHO}px; position:relative; overflow:hidden; color:#eef2ea; font-family:Barlow, sans-serif;
    background:#0b2a1f; background-image:repeating-linear-gradient(90deg,#0b2a1f 0 120px,#0d3124 120px 240px);
    display:flex; flex-direction:column; padding:72px 72px 56px; box-sizing:border-box;`;
  const cond = (px, peso = 800) => `font-family:'Barlow Condensed',sans-serif; font-weight:${peso}; font-size:${px}px; line-height:0.95;`;

  const marca = () => `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:48px">
      <svg width="58" height="58" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="#e9b949" stroke-width="2.5"/><path d="M16 9.5l5.4 3.9-2 6.3h-6.8l-2-6.3z" fill="#e9b949"/></svg>
      <span style="${cond(44, 700)}letter-spacing:.02em">NOVA <span style="color:#e9b949">GOL</span> ANALYTICS</span>
      <span style="font-size:24px;color:#b9cbbf;margin-left:8px">${esc(t("lema"))}</span>
    </div>`;
  const pie = (extra = "") => `
    <div style="margin-top:auto;padding-top:28px;border-top:2px solid rgba(238,242,234,.25);display:flex;justify-content:space-between;gap:24px;font-size:24px;color:#b9cbbf">
      <span>${esc(t("ex.fuente"))}</span>${extra}
    </div>`;
  const escudo = (url, px) => (url ? `<img src="${esc(API.escudo(url))}" crossorigin="anonymous" style="width:${px}px;height:${px}px;object-fit:contain" onerror="this.remove()">` : "");
  const letra = (r, px = 44) => {
    const fondo = r === "V" ? "#eef2ea" : r === "E" ? "rgba(238,242,234,.25)" : "#d03b3b";
    const color = r === "V" ? "#0b2a1f" : r === "E" ? "#eef2ea" : "#fff";
    return `<span style="display:inline-grid;place-items:center;width:${px}px;height:${px}px;border-radius:8px;background:${fondo};color:${color};font-weight:700;font-size:${px * 0.55}px">${esc(t("r." + r))}</span>`;
  };
  const cifra = (valor, etiqueta, color = "#eef2ea") =>
    `<div><div style="${cond(110)}color:${color}">${esc(valor)}</div><div style="font-size:28px;color:#b9cbbf;margin-top:8px">${esc(etiqueta)}</div></div>`;
  const leyenda = (items) =>
    `<div style="display:flex;gap:32px;font-size:28px;color:#b9cbbf;margin-top:20px">${items.map((i) => `<span><i style="display:inline-block;width:24px;height:24px;border-radius:5px;background:${i.color};margin-right:12px;vertical-align:-3px"></i>${esc(i.texto)}</span>`).join("")}</div>`;

  function lamina(alto, html) {
    const el = document.createElement("div");
    el.style.cssText = estiloBase + `height:${alto}px;`;
    el.innerHTML = html;
    return el;
  }

  // Inserta un canvas de gráfico de tamaño fijo dentro de una lámina
  function huecoGrafico(id, alto = 640) {
    return `<div style="background:rgba(18,58,43,.92);border:2px solid rgba(238,242,234,.14);border-radius:18px;padding:28px"><canvas id="${id}" width="880" height="${alto}" style="width:880px;height:${alto}px"></canvas></div>`;
  }

  // Espera los escudos y los convierte a PNG: muchos escudos son SVG sin tamaño propio
  // y la captura no los dibujaría.
  async function esperarImagenes(el) {
    const imgs = [...el.querySelectorAll("img")];
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    for (const img of imgs) {
      if (!img.isConnected) continue; // el escudo no cargó y se quitó
      try {
        const lado = 256;
        const c = document.createElement("canvas");
        c.width = lado; c.height = lado;
        const ctx = c.getContext("2d");
        const w = img.naturalWidth || lado, h = img.naturalHeight || lado;
        const k = Math.min(lado / w, lado / h);
        ctx.drawImage(img, (lado - w * k) / 2, (lado - h * k) / 2, w * k, h * k);
        const png = c.toDataURL("image/png");
        await new Promise((r) => { img.onload = img.onerror = r; img.src = png; });
      } catch (e) { /* si no se puede convertir, se deja como está */ }
    }
  }

  async function renderizar(laminas, nombreBase) {
    MODAL.abrir(t("ex.titulo"), t("ex.generando"), `<p class="nota">${esc(t("ex.generando"))}</p>`);
    const escenario = document.getElementById("escenario");
    const resultados = [];
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      for (let i = 0; i < laminas.length; i++) {
        const { alto, html, graficos } = laminas[i];
        escenario.innerHTML = "";
        const el = lamina(alto, html);
        escenario.appendChild(el);
        if (graficos) graficos(el);
        await esperarImagenes(el);
        const canvas = await html2canvas(el, { backgroundColor: "#0b2a1f", scale: 1, useCORS: true, logging: false, width: ANCHO, height: alto });
        resultados.push(canvas.toDataURL("image/png"));
        el.querySelectorAll("canvas").forEach((c) => GRAF.destruir(c));
      }
    } catch (e) {
      MODAL.abrir(t("ex.titulo"), "", `<p class="error">${esc(e.message)}</p>`);
      return;
    } finally {
      escenario.innerHTML = "";
    }
    const html = `<div class="galeria">${resultados.map((src, i) => `
      <figure><img src="${src}" alt="${i + 1}">
      <a class="btn btn-chico" href="${src}" download="${nombreBase}-${i + 1}.png">${esc(t("ex.descargar"))} ${i + 1}</a></figure>`).join("")}</div>`;
    MODAL.abrir(t("ex.titulo"), t("ex.sub"), html);
  }

  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  // ---------- Carrusel de la ficha de equipo ----------
  function carruselEquipo(f) {
    const I = f.indicadores, S = f.serie, C = GRAF.C, P = f.promediosLiga;
    const nombre = f.equipo.nombre;
    const encabezado = (titulo) => `
      <div style="display:flex;align-items:center;gap:24px;margin-bottom:36px">
        ${escudo(f.equipo.escudo, 84)}
        <div><div style="${cond(64)}">${esc(nombre)}</div><div style="font-size:28px;color:#b9cbbf;margin-top:6px">${esc(titulo)}</div></div>
      </div>`;
    const ALTO = 1350;
    const pos = f.posicion.total;

    const laminas = [
      {
        alto: ALTO,
        html: `${marca()}
          <div style="display:flex;flex-direction:column;gap:28px;margin-top:40px">
            ${escudo(f.equipo.escudo, 200)}
            <div style="${cond(150)}">${esc(nombre)}</div>
            <div style="font-size:34px;color:#b9cbbf">${esc(f.liga.nombre)}${pos ? `. ${esc(t("fi.pos", { p: APP.ordinal(pos), n: f.posicion.equipos }))}` : ""}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:64px">
            ${cifra(`${I.total.v}-${I.total.e}-${I.total.d}`, t("ex.recordVED"))}
            ${cifra(I.total.pts, t("i.pts"), "#e9b949")}
            ${cifra(`${I.total.gf}-${I.total.gc}`, t("grp.goles"))}
          </div>
          <div style="margin-top:56px"><div style="font-size:28px;color:#b9cbbf;margin-bottom:14px">${esc(t("ex.forma"))}</div>
            <div style="display:flex;gap:12px">${f.forma.ult5.resultados.map((r) => letra(r, 64)).join("")}</div>
            <div style="font-size:24px;color:#b9cbbf;margin-top:14px;white-space:pre">${esc(t("ex.leyendaVED"))}</div></div>
          ${pie("1/5")}`,
      },
      {
        alto: ALTO,
        html: `${marca()}${encabezado(t("g.goles"))}
          ${huecoGrafico("ex-goles", 560)}
          ${leyenda([{ color: C.azul, texto: t("s.aFavor") }, { color: C.naranja, texto: t("s.enContra") }])}
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:36px">
            ${cifra(APP.fmtNum(I.total.gf_prom), t("i.gf_prom"))}
            ${cifra(APP.fmtNum(I.total.gc_prom), t("i.gc_prom"))}
            ${cifra(APP.fmtNum(I.total.goles_partido), t("i.goles_partido"), "#e9b949")}
          </div>
          ${pie("2/5")}`,
        graficos: (el) => GRAF.barras(el.querySelector("#ex-goles"), S.map((x) => String(x.n)), [
          { label: t("s.aFavor"), data: S.map((x) => x.gf), color: C.azul },
          { label: t("s.enContra"), data: S.map((x) => -x.gc), color: C.naranja },
        ], { divergente: true, exportar: true }),
      },
      {
        alto: ALTO,
        html: `${marca()}${encabezado(t("g.mercados"))}
          ${huecoGrafico("ex-merc", 720)}
          ${leyenda([{ color: C.azul, texto: nombre }, { color: C.ref, texto: t("s.liga") }])}
          ${pie("3/5")}`,
        graficos: (el) => {
          const k = ["over05", "over15", "over25", "over35", "btts", "porteria_cero", "over05_1t"];
          GRAF.barras(el.querySelector("#ex-merc"), k.map((x) => t("i." + x)), [
            { label: nombre, data: k.map((x) => I.total[x]), color: C.azul },
            { label: t("s.liga"), data: k.map((x) => P[x] ?? 0), color: C.ref },
          ], { horizontal: true, sufijo: "%", max: 100, exportar: true });
        },
      },
      {
        alto: ALTO,
        html: `${marca()}${encabezado(t("g.casaFuera"))}
          ${huecoGrafico("ex-cf", 620)}
          ${leyenda([{ color: C.azul, texto: t("s.casa") }, { color: C.naranja, texto: t("s.fuera") }])}
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:36px">
            ${cifra(`${I.casa.v}-${I.casa.e}-${I.casa.d}`, `${t("ex.recordVED")} ${t("s.casa").toLowerCase()}`)}
            ${cifra(`${I.fuera.v}-${I.fuera.e}-${I.fuera.d}`, `${t("ex.recordVED")} ${t("s.fuera").toLowerCase()}`)}
          </div>
          ${pie("4/5")}`,
        graficos: (el) => {
          const k = ["pct_v", "over15", "over25", "btts", "porteria_cero"];
          GRAF.barras(el.querySelector("#ex-cf"), k.map((x) => t("i." + x)), [
            { label: t("s.casa"), data: k.map((x) => I.casa[x]), color: C.azul },
            { label: t("s.fuera"), data: k.map((x) => I.fuera[x]), color: C.naranja },
          ], { sufijo: "%", max: 100, exportar: true });
        },
      },
      {
        alto: ALTO,
        html: `${marca()}${encabezado(`${t("grp.tiempos")} / ${t("grp.rachas")}`)}
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:40px 24px;margin-top:12px">
            ${cifra(`${I.total.marca_1t}%`, t("i.marca_1t"))}
            ${cifra(`${I.total.over05_1t}%`, t("i.over05_1t"), "#e9b949")}
            ${cifra(`${I.total.pct_goles_2t}%`, t("i.pct_goles_2t"))}
            ${cifra(I.total.remontadas, t("i.remontadas"))}
            ${cifra(f.rachas.total.invicto, t("ra.invicto"))}
            ${cifra(f.rachas.total.marcando, t("ra.marcando"))}
          </div>
          ${pie("5/5")}`,
      },
    ];
    return renderizar(laminas, `nova-gol-${slug(nombre)}`);
  }

  // ---------- Historia de previa de partido ----------
  function historiaPartido(m, s) {
    const L = m.local, V = m.visita;
    const prob = (valor, etiqueta, alto) => `<div style="text-align:center;padding:24px 8px;border:2px solid rgba(238,242,234,.18);border-radius:18px;background:rgba(11,42,31,.85)">
      <div style="${cond(118)}color:${alto ? "#e9b949" : "#eef2ea"}">${valor}%</div><div style="font-size:28px;color:#b9cbbf;margin-top:8px">${esc(etiqueta)}</div></div>`;
    const filas = APP_filasDuelo(m).slice(0, 7).map((f) => {
      const max = f.pct ? 100 : Math.max(3, f.a, f.b);
      const fmt = (x) => (f.pct ? `${x}%` : APP.fmtNum(x));
      return `<div style="display:grid;grid-template-columns:110px 1fr 250px 1fr 110px;gap:14px;align-items:center;font-size:26px">
        <span style="${cond(42, 700)}">${fmt(f.a)}</span>
        <span style="height:22px;background:rgba(238,242,234,.1);border-radius:6px;display:flex;justify-content:flex-end"><i style="display:block;height:100%;width:${(f.a / max) * 100}%;background:#3987e5;border-radius:6px"></i></span>
        <span style="text-align:center;color:#b9cbbf">${esc(t(f.k))}</span>
        <span style="height:22px;background:rgba(238,242,234,.1);border-radius:6px;display:flex"><i style="display:block;height:100%;width:${(f.b / max) * 100}%;background:#d95926;border-radius:6px"></i></span>
        <span style="${cond(42, 700)}text-align:right">${fmt(f.b)}</span>
      </div>`;
    }).join("");
    const html = `${marca()}
      <div style="font-size:32px;color:#b9cbbf">${esc(m.liga)}</div>
      <div style="${cond(44, 700)}margin:8px 0 48px">${esc(APP.fmtFechaHora(m.fechaISO))}</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:center;text-align:center">
        <div style="display:grid;justify-items:center;gap:18px">${escudo(L.escudo, 170)}<div style="${cond(70)}">${esc(L.nombre)}</div><div style="font-size:26px;color:#b9cbbf">${esc(t("c.local"))}</div></div>
        <div style="${cond(64, 700)}color:#b9cbbf">vs</div>
        <div style="display:grid;justify-items:center;gap:18px">${escudo(V.escudo, 170)}<div style="${cond(70)}">${esc(V.nombre)}</div><div style="font-size:26px;color:#b9cbbf">${esc(t("c.visita"))}</div></div>
      </div>
      ${s.golden ? `<div style="margin:44px auto 0;padding:14px 32px;border-radius:999px;background:#e9b949;color:#231b04;font-weight:700;font-size:32px">${esc(t("ex.goldenTxt"))}</div>` : ""}
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:48px">
        ${prob(s.o15, t("m.o15"), s.o15 >= 85)}${prob(s.o25, t("m.o25"), s.o25 >= 65)}
        ${prob(s.u25, t("m.u25"), s.u25 >= 60)}${prob(s.btts, t("m.btts"), s.btts >= 65)}
      </div>
      ${s.o15 >= 85 || s.o25 >= 65 || s.u25 >= 60 || s.btts >= 65 ? `<div style="font-size:24px;color:#e9b949;margin-top:18px">${esc(t("ex.notaDorado"))}</div>` : ""}
      <div style="display:grid;gap:22px;margin-top:44px">${filas}</div>
      ${pie()}`;
    return renderizar([{ alto: 1920, html }], `nova-gol-${slug(L.nombre)}-${slug(V.nombre)}`);
  }

  // ---------- Top 5 de ranking ----------
  function top5(r, met, filas, fmt) {
    const max = met.pct ? 100 : Math.max(...filas.map((e) => e[met.k]), 1);
    const html = `${marca()}
      <div style="font-size:32px;color:#b9cbbf">${esc(r.liga.nombre)}</div>
      <div style="${cond(120)}margin:10px 0 56px">${esc(t("ex.top5"))}: ${esc(t("mk." + met.k))}</div>
      <div style="display:grid;gap:30px">
        ${filas.map((e, i) => `
          <div style="display:grid;grid-template-columns:70px 90px 1fr 170px;gap:20px;align-items:center">
            <span style="${cond(80)}color:${i === 0 ? "#e9b949" : "#b9cbbf"}">${i + 1}</span>
            ${escudo(e.escudo, 80) || "<span></span>"}
            <div><div style="${cond(52, 700)}">${esc(e.nombre)}</div>
              <div style="height:18px;margin-top:12px;background:rgba(238,242,234,.1);border-radius:6px"><i style="display:block;height:100%;width:${(e[met.k] / max) * 100}%;background:#3987e5;border-radius:6px"></i></div></div>
            <span style="${cond(76)}text-align:right">${esc(fmt(e[met.k]))}</span>
          </div>`).join("")}
      </div>
      ${pie()}`;
    return renderizar([{ alto: 1350, html }], `nova-gol-top5-${slug(r.liga.nombre)}-${met.k}`);
  }

  // ---------- Historial de aciertos ----------
  function historial(h) {
    const G = h.mercados.golden_o15;
    const ult = (h.senales || []).filter((x) => x.mercado === "golden_o15" && (x.estado === "acierto" || x.estado === "fallo")).slice(0, 8);
    const html = `${marca()}
      <div style="${cond(110)}">${esc(t("h.titulo"))}</div>
      <div style="font-size:30px;color:#b9cbbf;margin:16px 0 48px">${esc(t("h.m.golden_o15"))}${h.desde ? `. ${esc(t("h.desde"))}: ${esc(APP.fmtFecha(h.desde))}` : ""}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">
        ${cifra(`${G.pct}%`, t("h.pctGolden"), "#e9b949")}
        ${cifra(G.aciertos, t("h.aciertos"))}
        ${cifra(G.fallos, t("h.fallos"))}
      </div>
      <div style="font-size:28px;color:#b9cbbf;margin:56px 0 18px">${esc(t("h.ultimas"))}</div>
      <div style="display:grid;gap:14px">
        ${ult.map((x) => `<div style="display:grid;grid-template-columns:1fr 120px 170px;gap:16px;align-items:center;font-size:28px;padding-bottom:12px;border-bottom:1px solid rgba(238,242,234,.14)">
          <span>${esc(x.local)} vs ${esc(x.visita)}</span>
          <span style="${cond(40, 700)}text-align:right">${esc(x.marcador)}</span>
          <span style="text-align:right;font-weight:700;color:${x.estado === "acierto" ? "#8fe0ad" : "#ff9b8f"}">${x.estado === "acierto" ? "✓" : "✗"} ${esc(t("h.e." + x.estado))}</span>
        </div>`).join("")}
      </div>
      ${pie()}`;
    return renderizar([{ alto: 1350, html }], "nova-gol-historial");
  }

  window.EXPORTAR = { carruselEquipo, historiaPartido, top5, historial };
})();

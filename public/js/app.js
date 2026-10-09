// Nova Gol Analytics — aplicación
(function () {
  const t = (k, v) => I18N.t(k, v);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MIN_MUESTRA = 4;

  const estado = {
    datos: null,          // respuesta de /api/partidos
    cargaPartidos: null,  // promesa en curso
    planes: {},
    demoDias: 0,
    filtros: { rango: "semana", buscar: "", liga: "ALL", mercado: "ALL", golden: false },
    ranking: { liga: null, metrica: "over25" },
    fichaCache: new Map(),
    ligaCache: new Map(),
  };

  // ---------- Utilidades de presentación ----------
  const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const diaMas = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return claveDia(d); };
  function diasFinDeSemana() {
    const dow = new Date().getDay(); // 0 domingo
    const aViernes = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
    return [aViernes, aViernes + 1, aViernes + 2].filter((o) => o >= 0).map(diaMas);
  }
  const fmtFechaHora = (iso) => new Intl.DateTimeFormat(I18N.locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtHora = (iso) => new Intl.DateTimeFormat(I18N.locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const fmtNum = (n, dec = 2) => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: dec }).format(n);
  const pais = (codigo, fallback) => { const k = "pais." + codigo; const v = t(k); return v === k ? fallback || "" : v; };
  const escudo = (url, cls = "escudo") => (url ? `<img class="${cls}" src="${esc(API.escudo(url))}" alt="" loading="lazy" onerror="this.remove()">` : "");
  const letra = (r) => `<span class="r r-${r}">${esc(t("r." + r))}</span>`;
  const forma = (arr) => (arr && arr.length ? `<span class="forma">${arr.map(letra).join("")}</span>` : "");
  const ordinal = (n) => (I18N.idioma === "en" ? n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th") : String(n));

  // ---------- Métricas combinadas de un partido ----------
  function metricas(m) {
    const L = m.local, V = m.visita;
    const div = (a, b) => (b ? a / b : 0);
    const gfL = div(L.gf_casa, L.pj_casa), gcL = div(L.gc_casa, L.pj_casa);
    const gfV = div(V.gf_fuera, V.pj_fuera), gcV = div(V.gc_fuera, V.pj_fuera);
    const o15 = Math.round(L.over15_pct * 0.55 + V.over15_pct * 0.45);
    const o25 = Math.round(L.over25_pct * 0.55 + V.over25_pct * 0.45);
    const btts = Math.round(L.btts_pct * 0.5 + V.btts_pct * 0.5);
    const muestraOk = L.pj_casa >= MIN_MUESTRA && V.pj_fuera >= MIN_MUESTRA;
    return {
      gfL, gcL, gfV, gcV,
      esperados: (gfL + gcV) / 2 + (gfV + gcL) / 2,
      o15, o25, u25: 100 - o25, btts,
      ganaCasa: Math.round(div(L.v_casa, L.pj_casa) * 100),
      pierdeFuera: Math.round(div(V.d_fuera, V.pj_fuera) * 100),
      muestraOk,
      golden: muestraOk && o15 >= 95,
    };
  }

  // ---------- Modal ----------
  let focoPrevio = null;
  function abrirModal(titulo, sub, html) {
    focoPrevio = document.activeElement;
    $("#modalTitulo").textContent = titulo;
    $("#modalSub").textContent = sub || "";
    $("#modalCuerpo").innerHTML = html;
    $("#modal").hidden = false;
    $("#modalCerrar").focus();
  }
  function cerrarModal() {
    $("#modal").hidden = true;
    $("#modalCuerpo").innerHTML = "";
    if (focoPrevio) focoPrevio.focus();
  }
  window.MODAL = { abrir: abrirModal, cerrar: cerrarModal };

  // ---------- Estado de datos en la barra ----------
  function estadoDatos(tipo, hora) {
    $("#puntoDatos").className = "punto" + (tipo === "ok" ? " ok" : tipo === "mal" ? " mal" : "");
    const el = $("#estadoDatos");
    el.dataset.t = tipo === "ok" ? "" : tipo === "mal" ? "d.mal" : "d.cargando";
    el.textContent = tipo === "ok" ? t("d.ok", { h: hora }) : t(el.dataset.t);
    if (tipo === "ok") delete el.dataset.t;
  }

  async function cargarPartidos(forzar) {
    if (estado.datos && !forzar) return estado.datos;
    if (estado.cargaPartidos) return estado.cargaPartidos;
    estadoDatos("cargando");
    estado.cargaPartidos = API.partidos()
      .then((d) => {
        estado.datos = d;
        estado.cargadoEn = Date.now();
        estadoDatos("ok", fmtHora(d.actualizado));
        const f = d.fuentes && d.fuentes.length ? d.fuentes.join(" + ") : "football-data.org";
        $("#pieFuente").textContent = `${t("pie.fuente").replace("football-data.org", f)}`;
        return d;
      })
      .catch((e) => { estadoDatos("mal"); throw e; })
      .finally(() => { estado.cargaPartidos = null; });
    return estado.cargaPartidos;
  }

  function manejarError(e, contenedor) {
    if (e && e.status === 401 || (e && (e.codigo === "inactivo" || e.codigo === "sesion_invalida" || e.codigo === "demo_terminada"))) {
      API.salir();
      mostrarPortada(e.message, e.codigo === "demo_terminada" ? "demo" : "entrar");
      return;
    }
    contenedor.innerHTML = `<div class="vacio">${esc(t("x.errorDatos", { m: e.message }))}</div>`;
  }

  // =========================================================
  // VISTA: PARTIDOS
  // =========================================================
  function filasPartidos() {
    const f = estado.filtros;
    const d = estado.datos;
    if (!d) return [];
    let dias = null;
    if (f.rango === "hoy") dias = [diaMas(0)];
    if (f.rango === "manana") dias = [diaMas(1)];
    if (f.rango === "finde") dias = diasFinDeSemana();
    const hoy = diaMas(0);
    const q = f.buscar.trim().toLowerCase();
    return d.partidos.filter((m) => {
      const dia = claveDia(new Date(m.fechaISO));
      if (dias ? !dias.includes(dia) : dia < hoy && !m.enVivo) return false;
      if (q && !`${m.local.nombre} ${m.visita.nombre} ${m.liga} ${pais(m.ligaCodigo, m.pais)}`.toLowerCase().includes(q)) return false;
      if (f.liga !== "ALL" && m.liga !== f.liga) return false;
      const s = metricas(m);
      if (f.golden && !s.golden) return false;
      if (f.mercado === "O15" && s.o15 < 80) return false;
      if (f.mercado === "O25" && s.o25 < 65) return false;
      if (f.mercado === "U25" && s.u25 < 60) return false;
      if (f.mercado === "BTTS" && s.btts < 65) return false;
      return true;
    });
  }

  function bloqueEquipo(m, lado) {
    const casa = lado === "local";
    const e = casa ? m.local : m.visita;
    const pj = casa ? e.pj_casa : e.pj_fuera;
    const v = casa ? e.v_casa : e.v_fuera, em = casa ? e.e_casa : e.e_fuera, d = casa ? e.d_casa : e.d_fuera;
    const gf = casa ? e.gf_casa : e.gf_fuera, gc = casa ? e.gc_casa : e.gc_fuera;
    const enlace = e.equipoId ? `#/equipo/${encodeURIComponent(m.ligaCodigo)}/${encodeURIComponent(e.equipoId)}` : null;
    return `
      <div class="equipo ${casa ? "" : "visita"}">
        <div class="equipo-nombre">${escudo(e.escudo)}${enlace ? `<a href="${enlace}">${esc(e.nombre)}</a>` : `<span>${esc(e.nombre)}</span>`}</div>
        <div class="lado">${esc(t(casa ? "c.local" : "c.visita"))}, ${esc(t("c.pj", { n: pj }))}</div>
        <div class="registro"><b>${v}-${em}-${d}</b> &nbsp; ${esc(t("c.golesFC", { f: gf, c: gc }))}</div>
        ${forma(e.ultimos_5)}
      </div>`;
  }

  function tarjetaPartido(m) {
    const s = metricas(m);
    const jornada = m.jornada ? (typeof m.jornada === "number" ? t("c.jornada", { n: m.jornada }) : m.jornada) : "";
    const prob = (valor, etiqueta, umbral) => `<div class="prob ${valor >= umbral ? "alto" : ""}"><b>${valor}%</b><span>${esc(t(etiqueta))}</span></div>`;
    return `
      <article class="marcador ${s.golden ? "golden" : ""}">
        <div class="marcador-meta">
          <span class="liga">${esc(m.liga)}</span>
          <span>${esc(pais(m.ligaCodigo, m.pais))}</span>
          ${jornada ? `<span>${esc(jornada)}</span>` : ""}
          <span>${esc(fmtFechaHora(m.fechaISO))}</span>
          <span class="etiquetas">
            ${m.enVivo ? `<span class="chip chip-vivo">${esc(t("c.vivo"))}</span>` : ""}
            ${!s.muestraOk ? `<span class="chip" title="${esc(t("c.muestraTit"))}">${esc(t("c.muestra"))}</span>` : ""}
            ${s.golden ? `<span class="chip chip-oro">${esc(t("c.golden"))}</span>` : ""}
          </span>
        </div>
        ${bloqueEquipo(m, "local")}
        <div class="probs">
          ${prob(s.o15, "m.o15", 85)}${prob(s.o25, "m.o25", 65)}${prob(s.u25, "m.u25", 60)}${prob(s.btts, "m.btts", 65)}
        </div>
        ${bloqueEquipo(m, "visita")}
        <div class="marcador-pie">
          <span>${esc(t("c.goles", { g: fmtNum(s.esperados) }))}</span>
          <span>${esc(t("c.ganaCasa", { a: s.ganaCasa }))}</span>
          <span>${esc(t("c.pierdeFuera", { b: s.pierdeFuera }))}</span>
          <a class="btn btn-chico" href="#/partido/${encodeURIComponent(m.id)}">${esc(t("c.previa"))}</a>
        </div>
      </article>`;
  }

  function pintarListaPartidos() {
    const filas = filasPartidos();
    const lista = $("#listaPartidos");
    if (!lista) return;
    let o15 = 0, o25 = 0, g = 0;
    filas.forEach((m) => { const s = metricas(m); if (s.o15 >= 85) o15++; if (s.o25 >= 70) o25++; if (s.golden) g++; });
    $("#kTotal").textContent = filas.length; $("#kO15").textContent = o15; $("#kO25").textContent = o25; $("#kGolden").textContent = g;
    lista.innerHTML = filas.length ? filas.map(tarjetaPartido).join("") : `<div class="vacio">${esc(t("x.vacio"))}</div>`;
  }

  async function vistaPartidos(v) {
    const f = estado.filtros;
    const pest = (id, k) => `<button type="button" data-rango="${id}" aria-pressed="${f.rango === id}">${esc(t(k))}</button>`;
    v.innerHTML = `
      <div class="titulo-vista"><div><h1>${esc(t("v.partidosTitulo"))}</h1><p>${esc(t("v.partidosSub"))}</p></div></div>
      <div class="contadores">
        <div class="contador"><b id="kTotal">0</b><span>${esc(t("k.total"))}</span></div>
        <div class="contador"><b id="kO15">0</b><span>${esc(t("k.o15"))}</span></div>
        <div class="contador"><b id="kO25">0</b><span>${esc(t("k.o25"))}</span></div>
        <div class="contador oro"><b id="kGolden">0</b><span>${esc(t("k.golden"))}</span></div>
      </div>
      <div class="filtros">
        <div class="pestanas" role="group">${pest("hoy", "f.hoy")}${pest("manana", "f.manana")}${pest("finde", "f.finde")}${pest("semana", "f.semana")}</div>
        <input class="buscar" id="fBuscar" type="search" value="${esc(f.buscar)}" placeholder="${esc(t("f.buscar"))}" aria-label="${esc(t("f.buscar"))}">
        <select class="selector" id="fLiga" aria-label="${esc(t("f.todasLigas"))}"><option value="ALL">${esc(t("f.todasLigas"))}</option></select>
        <select class="selector" id="fMercado" aria-label="${esc(t("f.todosMercados"))}">
          <option value="ALL">${esc(t("f.todosMercados"))}</option>
          <option value="O15">${esc(t("f.mO15"))}</option><option value="O25">${esc(t("f.mO25"))}</option>
          <option value="U25">${esc(t("f.mU25"))}</option><option value="BTTS">${esc(t("f.mBTTS"))}</option>
        </select>
        <label class="interruptor"><input type="checkbox" id="fGolden" ${f.golden ? "checked" : ""}>${esc(t("f.golden"))}</label>
      </div>
      <div id="avisos"></div>
      <div class="partidos" id="listaPartidos"><div class="vacio">${esc(t("x.cargando"))}</div></div>`;

    $("#fMercado", v).value = f.mercado;
    $$("[data-rango]", v).forEach((b) => b.addEventListener("click", () => {
      f.rango = b.dataset.rango;
      $$("[data-rango]", v).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      pintarListaPartidos();
    }));
    $("#fBuscar", v).addEventListener("input", (e) => { f.buscar = e.target.value; pintarListaPartidos(); });
    $("#fLiga", v).addEventListener("change", (e) => { f.liga = e.target.value; pintarListaPartidos(); });
    $("#fMercado", v).addEventListener("change", (e) => { f.mercado = e.target.value; pintarListaPartidos(); });
    $("#fGolden", v).addEventListener("change", (e) => { f.golden = e.target.checked; pintarListaPartidos(); });

    try {
      const d = await cargarPartidos();
      const sel = $("#fLiga", v);
      if (!sel) return;
      sel.innerHTML = `<option value="ALL">${esc(t("f.todasLigas"))}</option>` + (d.ligas || []).map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
      sel.value = (d.ligas || []).includes(f.liga) ? f.liga : "ALL";
      if (d.avisos && d.avisos.length) $("#avisos", v).innerHTML = `<div class="aviso"><b>${esc(t("x.avisos"))}</b><br>${d.avisos.map(esc).join("<br>")}</div>`;
      pintarListaPartidos();
    } catch (e) { manejarError(e, $("#listaPartidos", v)); }
  }

  // =========================================================
  // VISTA: PREVIA DEL PARTIDO
  // =========================================================
  function filasDuelo(m) {
    const L = m.local, V = m.visita, s = metricas(m);
    const pctV = (e, pj) => (pj ? Math.round((e / pj) * 100) : 0);
    return [
      { k: "i.pct_v", a: pctV(L.v_casa, L.pj_casa), b: pctV(V.v_fuera, V.pj_fuera), pct: true },
      { k: "i.gf_prom", a: s.gfL, b: s.gfV },
      { k: "i.gc_prom", a: s.gcL, b: s.gcV },
      { k: "i.over15", a: L.over15_pct, b: V.over15_pct, pct: true },
      { k: "i.over25", a: L.over25_pct, b: V.over25_pct, pct: true },
      { k: "i.btts", a: L.btts_pct, b: V.btts_pct, pct: true },
      { k: "i.porteria_cero", a: L.porteria_cero_pct ?? 0, b: V.porteria_cero_pct ?? 0, pct: true },
      { k: "i.sin_marcar", a: L.sin_marcar_pct ?? 0, b: V.sin_marcar_pct ?? 0, pct: true },
      { k: "i.over05_1t", a: L.over05_1t_pct ?? 0, b: V.over05_1t_pct ?? 0, pct: true },
    ];
  }
  window.APP_filasDuelo = filasDuelo;

  function htmlDuelo(m) {
    return filasDuelo(m).map((f) => {
      const max = f.pct ? 100 : Math.max(3, f.a, f.b);
      const fmt = (x) => (f.pct ? `${x}%` : fmtNum(x));
      return `<div class="duelo-fila">
        <span class="v">${fmt(f.a)}</span>
        <span class="barra-l"><i style="width:${(f.a / max) * 100}%"></i></span>
        <span class="et">${esc(t(f.k))}</span>
        <span class="barra-r"><i style="width:${(f.b / max) * 100}%"></i></span>
        <span class="v der">${fmt(f.b)}</span>
      </div>`;
    }).join("");
  }

  function textoEditorial(m) {
    const s = metricas(m), L = m.local, V = m.visita;
    return [
      `⚽ ${t("ed.cab")} ⚽`,
      `🏆 ${m.liga.toUpperCase()} | ${fmtFechaHora(m.fechaISO)}`,
      `🏟️ ${L.nombre} vs ${V.nombre}`,
      "",
      `📊 ${t("ed.desglose")}`,
      `• ${L.nombre} (${t("ed.casa")}, ${t("c.pj", { n: L.pj_casa })}): ${L.v_casa}-${L.e_casa}-${L.d_casa} | ${L.gf_casa} ${t("ed.anotados")} / ${L.gc_casa} ${t("ed.recibidos")}`,
      `• ${V.nombre} (${t("ed.fuera")}, ${t("c.pj", { n: V.pj_fuera })}): ${V.v_fuera}-${V.e_fuera}-${V.d_fuera} | ${V.gf_fuera} ${t("ed.anotados")} / ${V.gc_fuera} ${t("ed.recibidos")}`,
      "",
      `🎯 ${t("ed.proyeccion")}`,
      `🔥 ${t("m.o15")}: ${s.o15}%`,
      `📈 ${t("m.o25")}: ${s.o25}%`,
      `🛡️ ${t("m.u25")}: ${s.u25}%`,
      `⚡ ${t("m.btts")}: ${s.btts}%`,
      `⚽ ${t("ed.esperados")}: ${fmtNum(s.esperados)}`,
      ...(s.golden ? ["", `⭐ ${t("ex.goldenTxt")}`] : []),
      "",
      `📌 ${t("ed.publicado")}`,
      `${t("ex.fuente")}`,
    ].join("\n");
  }

  async function vistaPrevia(v, id) {
    v.innerHTML = `<div class="vacio">${esc(t("x.cargando"))}</div>`;
    let d;
    try { d = await cargarPartidos(); } catch (e) { return manejarError(e, v); }
    const m = d.partidos.find((p) => p.id === id);
    if (!m) { v.innerHTML = `<div class="vacio">${esc(t("pv.noEncontrado"))} <a href="#/partidos">${esc(t("n.partidos"))}</a></div>`; return; }
    const s = metricas(m);
    const fichaL = `#/equipo/${encodeURIComponent(m.ligaCodigo)}/${encodeURIComponent(m.local.equipoId)}`;
    const fichaV = `#/equipo/${encodeURIComponent(m.ligaCodigo)}/${encodeURIComponent(m.visita.equipoId)}`;
    v.innerHTML = `
      <p><a href="#/partidos">${esc(t("fi.volver"))}</a></p>
      <div class="titulo-vista">
        <div><h1>${esc(m.local.nombre)} vs ${esc(m.visita.nombre)}</h1>
        <p>${esc(m.liga)}, ${esc(fmtFechaHora(m.fechaISO))}</p></div>
        <div class="heroe-acciones"><button class="btn btn-oro" id="btnHistoria" type="button">${esc(t("pv.historia"))}</button></div>
      </div>
      <div class="partidos" style="margin-bottom:16px">${tarjetaPartido(m).replace(/<a class="btn btn-chico"[^>]*>.*?<\/a>/, "")}</div>
      <div class="rejilla">
        <section class="panel">
          <div class="panel-cab"><div><h2>${esc(t("pv.comparativo"))}</h2></div></div>
          <div class="leyenda" style="margin:0 0 12px"><span><i style="background:${GRAF.C.azul}"></i>${esc(m.local.nombre)} (${esc(t("s.casa"))})</span><span><i style="background:${GRAF.C.naranja}"></i>${esc(m.visita.nombre)} (${esc(t("s.fuera"))})</span></div>
          <div class="duelo">${htmlDuelo(m)}</div>
          <div class="heroe-acciones" style="margin-top:16px">
            <a class="btn btn-chico" href="${fichaL}">${esc(t("pv.verFicha"))}: ${esc(m.local.nombre)}</a>
            <a class="btn btn-chico" href="${fichaV}">${esc(t("pv.verFicha"))}: ${esc(m.visita.nombre)}</a>
          </div>
        </section>
        <section class="panel">
          <div class="panel-cab"><h2>${esc(t("pv.fichaTexto"))}</h2><button class="btn btn-chico" id="btnCopiar" type="button">${esc(t("pv.copiar"))}</button></div>
          <textarea class="ficha-texto" id="textoEd" readonly>${esc(textoEditorial(m))}</textarea>
          <p class="nota" id="copiado" aria-live="polite"></p>
        </section>
      </div>`;
    $("#btnCopiar", v).addEventListener("click", async () => {
      const ta = $("#textoEd", v);
      try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); }
      $("#copiado", v).textContent = t("pv.copiado");
    });
    $("#btnHistoria", v).addEventListener("click", () => EXPORTAR.historiaPartido(m, metricas(m)));
    void s;
  }

  // =========================================================
  // VISTA: FICHA DE EQUIPO
  // =========================================================
  function panelGrafico(id, titulo, nota, leyenda, tabla) {
    return `
      <section class="panel" id="panel-${id}">
        <div class="panel-cab">
          <div><h3>${esc(t(titulo))}</h3><p class="nota">${esc(t(nota))}</p></div>
          <button class="enlace-tabla" type="button" data-alternar="${id}">${esc(t("fi.verTabla"))}</button>
        </div>
        <div class="lienzo" id="lz-${id}"><canvas id="cv-${id}" role="img" aria-label="${esc(t(titulo))}"></canvas></div>
        <div class="tabla-scroll" id="tb-${id}" hidden>${tabla}</div>
        ${leyenda.length > 1 ? `<div class="leyenda">${leyenda.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.texto)}</span>`).join("")}</div>` : ""}
      </section>`;
  }
  const tablaSimple = (cab, filas) =>
    `<table class="datos"><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  const GRUPOS = [
    ["grp.rend", ["pj", "v", "e", "d", "pts", "pts_partido", "pct_v", "pct_e", "pct_d"]],
    ["grp.goles", ["gf", "gc", "dg", "gf_prom", "gc_prom", "goles_partido"]],
    ["grp.merc", ["over05", "over15", "over25", "over35", "over45", "under15", "under25", "under35", "btts", "btts_no", "porteria_cero", "sin_marcar", "gana_sin_recibir"]],
    ["grp.tiempos", ["gf_1t_prom", "gc_1t_prom", "gf_2t_prom", "gc_2t_prom", "marca_1t", "recibe_1t", "marca_2t", "over05_1t", "over15_1t", "over05_2t", "gana_descanso", "empata_descanso", "pierde_descanso", "remontadas", "ventajas_perdidas", "pct_goles_2t"]],
  ];
  const ES_PCT = (k) => /^(pct_|over|under|btts|porteria|sin_marcar|gana_sin|marca_|recibe_|gana_descanso|empata_descanso|pierde_descanso)/.test(k);
  const RACHAS = ["victorias", "invicto", "sin_ganar", "derrotas", "marcando", "sin_recibir", "over15", "over25", "btts", "max_invicto"];

  function tablaIndicadores(f) {
    const I = f.indicadores, P = f.promediosLiga || {};
    const val = (k, x) => (x === undefined || x === null ? "—" : ES_PCT(k) ? `${x}%` : fmtNum(x));
    let html = `<table class="datos"><thead><tr><th></th><th>${esc(t("fi.total"))}</th><th>${esc(t("fi.casa"))}</th><th>${esc(t("fi.fuera"))}</th><th>${esc(t("fi.liga"))}</th></tr></thead><tbody>`;
    for (const [g, claves] of GRUPOS) {
      html += `<tr class="grupo"><td colspan="5">${esc(t(g))}</td></tr>`;
      for (const k of claves) {
        html += `<tr><td>${esc(t("i." + k))}</td><td>${val(k, I.total[k])}</td><td>${val(k, I.casa[k])}</td><td>${val(k, I.fuera[k])}</td><td>${P[k] !== undefined ? val(k, P[k]) : "—"}</td></tr>`;
      }
    }
    html += `<tr class="grupo"><td colspan="5">${esc(t("grp.rachas"))}</td></tr>`;
    for (const k of RACHAS) {
      html += `<tr><td>${esc(t("ra." + k))}</td><td>${f.rachas.total[k]}</td><td>${f.rachas.casa[k]}</td><td>${f.rachas.fuera[k]}</td><td>—</td></tr>`;
    }
    return html + "</tbody></table>";
  }

  function graficosEquipo(f) {
    const C = GRAF.C, S = f.serie, I = f.indicadores, P = f.promediosLiga;
    const nums = S.map((x) => String(x.n));
    // 1. Puntos acumulados
    const series1 = [{ label: f.equipo.nombre, data: S.map((x) => x.pts_acum), color: C.azul }];
    if (f.lider) series1.push({ label: `${t("s.lider")}: ${f.lider.nombre}`, data: nums.map((_, i) => f.lider.serie[i]?.pts_acum ?? null), color: C.ref, puntos: false });
    GRAF.linea($("#cv-puntos"), nums, series1, { tooltip: { title: (it) => `${t("s.partido")} ${it[0].label}` } });
    // 2. Posición
    GRAF.linea($("#cv-posicion"), nums, [{ label: t("g.posicion"), data: S.map((x) => x.pos_tabla), color: C.azul }], { invertirY: true, tooltip: { title: (it) => `${t("s.partido")} ${it[0].label}: ${S[it[0].dataIndex].rival}` } });
    // 3. Goles por partido (divergente)
    GRAF.barras($("#cv-goles"), nums, [
      { label: t("s.aFavor"), data: S.map((x) => x.gf), color: C.azul },
      { label: t("s.enContra"), data: S.map((x) => -x.gc), color: C.naranja },
    ], { divergente: true, tooltip: { title: (it) => `${S[it[0].dataIndex].casa ? t("s.casa") : t("s.fuera")}: ${S[it[0].dataIndex].rival}`, label: (c) => `${c.dataset.label}: ${Math.abs(c.raw)}` } });
    // 4. Tendencia
    GRAF.linea($("#cv-movil"), nums, [
      { label: t("s.aFavor"), data: S.map((x) => x.gf_movil5), color: C.azul },
      { label: t("s.enContra"), data: S.map((x) => x.gc_movil5), color: C.naranja },
    ], { yMin: 0, tooltip: { title: (it) => `${t("s.partido")} ${it[0].label}` } });
    // 5. Casa vs fuera
    const kCF = ["pct_v", "over15", "over25", "btts", "porteria_cero"];
    GRAF.barras($("#cv-casafuera"), kCF.map((k) => t("i." + k)), [
      { label: t("s.casa"), data: kCF.map((k) => I.casa[k]), color: C.azul },
      { label: t("s.fuera"), data: kCF.map((k) => I.fuera[k]), color: C.naranja },
    ], { sufijo: "%", max: 100, tooltip: { label: (c) => `${c.dataset.label}: ${c.raw}%` } });
    // 6. Mercados vs liga
    const kM = ["over05", "over15", "over25", "over35", "btts", "porteria_cero", "over05_1t"];
    GRAF.barras($("#cv-mercados"), kM.map((k) => t("i." + k)), [
      { label: f.equipo.nombre, data: kM.map((k) => I.total[k]), color: C.azul },
      { label: t("s.liga"), data: kM.map((k) => P[k] ?? 0), color: C.ref },
    ], { horizontal: true, sufijo: "%", max: 100, tooltip: { label: (c) => `${c.dataset.label}: ${c.raw}%` } });
    // 7. Goles por tiempo
    GRAF.barras($("#cv-tiempos"), [t("s.primerT"), t("s.segundoT")], [
      { label: t("s.aFavor"), data: [I.total.gf_1t, I.total.gf_2t], color: C.azul },
      { label: t("s.enContra"), data: [I.total.gc_1t, I.total.gc_2t], color: C.naranja },
    ], {});
  }

  async function vistaEquipo(v, liga, id) {
    v.innerHTML = `<div class="vacio">${esc(t("x.cargando"))}</div>`;
    const clave = `${liga}|${id}`;
    let f = estado.fichaCache.get(clave);
    if (!f) {
      try { f = await API.equipo(liga, id); estado.fichaCache.set(clave, f); } catch (e) { return manejarError(e, v); }
    }
    const I = f.indicadores, S = f.serie, C = GRAF.C;
    const pos = f.posicion;
    const sub = [
      `${f.liga.nombre}, ${pais(f.liga.codigo, f.liga.pais)}`,
      pos.total ? t("fi.pos", { p: ordinal(pos.total), n: pos.equipos }) : "",
      pos.casa ? t("fi.posCasa", { p: ordinal(pos.casa) }) : "",
      pos.fuera ? t("fi.posFuera", { p: ordinal(pos.fuera) }) : "",
    ].filter(Boolean).join(". ");
    const prox = f.proximo ? t("fi.proximo", { r: f.proximo.rival, l: f.proximo.casa ? t("s.casa") : t("s.fuera"), f: f.proximo.fecha }) : "";
    const tablaSerie = tablaSimple([t("s.partido"), t("s.rival"), "", t("s.aFavor"), t("s.enContra"), t("g.posicion"), t("g.puntos")],
      S.map((x) => [x.n, x.rival, x.casa ? t("s.casa") : t("s.fuera"), x.gf, x.gc, x.pos_tabla ?? "—", x.pts_acum]));
    const kCF = ["pct_v", "over15", "over25", "btts", "porteria_cero"];
    const kM = ["over05", "over15", "over25", "over35", "btts", "porteria_cero", "over05_1t"];

    v.innerHTML = `
      <p><a href="javascript:history.back()">${esc(t("fi.volver"))}</a></p>
      <div class="ficha-cab">
        ${f.equipo.escudo ? `<img src="${esc(API.escudo(f.equipo.escudo))}" alt="" onerror="this.remove()">` : "<span></span>"}
        <div><h1>${esc(f.equipo.nombre)}</h1><p>${esc(sub)}</p>${prox ? `<p>${esc(prox)}</p>` : ""}</div>
        <div class="acciones"><button class="btn btn-oro" id="btnCarrusel" type="button">${esc(t("fi.exportar"))}</button></div>
      </div>
      ${f.muestraBaja ? `<div class="aviso">${esc(t("c.muestraTit"))}</div>` : ""}
      <div class="resumen">
        <div><b>${pos.total ? ordinal(pos.total) : "—"}</b><span>${esc(t("rk.pos"))}</span></div>
        <div><b>${I.total.pts}</b><span>${esc(t("i.pts"))}</span></div>
        <div><b>${I.total.v}-${I.total.e}-${I.total.d}</b><span>${esc(t("ex.record"))}</span></div>
        <div><b>${I.total.gf}-${I.total.gc}</b><span>${esc(t("grp.goles"))}</span></div>
        <div><b>${I.total.over25}%</b><span>${esc(t("i.over25"))}</span></div>
        <div><b>${forma(f.forma.ult5.resultados) || "—"}</b><span>${esc(t("ex.forma"))}</span></div>
      </div>
      <div class="rejilla">
        ${panelGrafico("puntos", "g.puntos", "g.puntosNota", [{ color: C.azul, texto: f.equipo.nombre }, ...(f.lider ? [{ color: C.ref, texto: `${t("s.lider")}: ${f.lider.nombre}` }] : [])], tablaSerie)}
        ${panelGrafico("posicion", "g.posicion", "g.posicionNota", [], tablaSerie)}
        ${panelGrafico("goles", "g.goles", "g.golesNota", [{ color: C.azul, texto: t("s.aFavor") }, { color: C.naranja, texto: t("s.enContra") }], tablaSerie)}
        ${panelGrafico("movil", "g.movil", "g.movilNota", [{ color: C.azul, texto: t("s.aFavor") }, { color: C.naranja, texto: t("s.enContra") }],
          tablaSimple([t("s.partido"), t("s.aFavor"), t("s.enContra")], S.map((x) => [x.n, fmtNum(x.gf_movil5), fmtNum(x.gc_movil5)])))}
        ${panelGrafico("casafuera", "g.casaFuera", "g.casaFueraNota", [{ color: C.azul, texto: t("s.casa") }, { color: C.naranja, texto: t("s.fuera") }],
          tablaSimple(["", t("s.casa"), t("s.fuera")], kCF.map((k) => [t("i." + k), I.casa[k] + "%", I.fuera[k] + "%"])))}
        ${panelGrafico("mercados", "g.mercados", "g.mercadosNota", [{ color: C.azul, texto: f.equipo.nombre }, { color: C.ref, texto: t("s.liga") }],
          tablaSimple(["", f.equipo.nombre, t("s.liga")], kM.map((k) => [t("i." + k), I.total[k] + "%", (f.promediosLiga[k] ?? "—") + "%"])))}
        ${panelGrafico("tiempos", "g.tiempos", "g.tiemposNota", [{ color: C.azul, texto: t("s.aFavor") }, { color: C.naranja, texto: t("s.enContra") }],
          tablaSimple(["", t("s.aFavor"), t("s.enContra")], [[t("s.primerT"), I.total.gf_1t, I.total.gc_1t], [t("s.segundoT"), I.total.gf_2t, I.total.gc_2t]]))}
        <section class="panel">
          <div class="panel-cab"><div><h3>${esc(t("grp.rachas"))}</h3></div></div>
          ${tablaSimple(["", t("fi.total"), t("fi.casa"), t("fi.fuera")], RACHAS.map((k) => [t("ra." + k), f.rachas.total[k], f.rachas.casa[k], f.rachas.fuera[k]]))}
        </section>
      </div>
      <section class="panel" style="margin-top:16px">
        <div class="panel-cab"><div><h2>${esc(t("fi.indicadores"))}</h2><p class="nota">${esc(t("fi.indicadoresNota"))}</p></div></div>
        <div class="tabla-scroll">${tablaIndicadores(f)}</div>
      </section>`;

    $$("[data-alternar]", v).forEach((b) => b.addEventListener("click", () => {
      const id2 = b.dataset.alternar;
      const tb = $("#tb-" + id2), lz = $("#lz-" + id2);
      const verTabla = tb.hidden;
      tb.hidden = !verTabla; lz.hidden = verTabla;
      b.textContent = t(verTabla ? "fi.verGrafico" : "fi.verTabla");
    }));
    if (S.length) graficosEquipo(f);
    $("#btnCarrusel", v).addEventListener("click", () => EXPORTAR.carruselEquipo(f));
  }

  // =========================================================
  // VISTA: RANKINGS
  // =========================================================
  const METRICAS = [
    { k: "over25", pct: true }, { k: "over15", pct: true }, { k: "goles_partido" }, { k: "btts", pct: true },
    { k: "porteria_cero", pct: true }, { k: "pts_partido_casa", min: "pj_casa" }, { k: "pct_d_fuera", pct: true, min: "pj_fuera" },
    { k: "over05_1t", pct: true }, { k: "gf_prom" }, { k: "sin_marcar", pct: true },
  ];
  function ordenarRanking(equipos, met) {
    return equipos
      .filter((e) => (met.min ? e[met.min] >= 3 : e.pj >= 3))
      .sort((a, b) => b[met.k] - a[met.k] || a.nombre.localeCompare(b.nombre));
  }
  window.APP_ranking = { METRICAS, ordenarRanking };

  async function vistaRanking(v, ligaRuta) {
    v.innerHTML = `<div class="vacio">${esc(t("x.cargando"))}</div>`;
    let d;
    try { d = await cargarPartidos(); } catch (e) { return manejarError(e, v); }
    const ligas = d.ligasDisponibles || [];
    if (!ligas.length) { v.innerHTML = `<div class="vacio">${esc(t("d.mal"))}</div>`; return; }
    const liga = ligas.some((l) => l.codigo === ligaRuta) ? ligaRuta : (estado.ranking.liga && ligas.some((l) => l.codigo === estado.ranking.liga) ? estado.ranking.liga : ligas[0].codigo);
    estado.ranking.liga = liga;
    let r = estado.ligaCache.get(liga);
    if (!r) {
      try { r = await API.liga(liga); estado.ligaCache.set(liga, r); } catch (e) { return manejarError(e, v); }
    }
    const met = METRICAS.find((m) => m.k === estado.ranking.metrica) || METRICAS[0];
    const orden = ordenarRanking(r.equipos, met);
    const top = orden.slice(0, 10);
    const fmt = (x) => (met.pct ? `${x}%` : fmtNum(x));
    const unidad = t("mk.u." + met.k) !== "mk.u." + met.k ? t("mk.u." + met.k) : "";

    v.innerHTML = `
      <div class="titulo-vista">
        <div><h1>${esc(t("rk.titulo"))}</h1><p>${esc(t("rk.sub"))}</p></div>
        <div class="heroe-acciones">
          <select class="selector" id="rLiga" aria-label="${esc(t("fi.liga"))}">${ligas.map((l) => `<option value="${esc(l.codigo)}" ${l.codigo === liga ? "selected" : ""}>${esc(l.nombre)}</option>`).join("")}</select>
          <button class="btn btn-oro" id="btnTop5" type="button">${esc(t("rk.exportar"))}</button>
        </div>
      </div>
      <div class="metricas" role="group">${METRICAS.map((m) => `<button type="button" data-met="${m.k}" aria-pressed="${m.k === met.k}">${esc(t("mk." + m.k))}</button>`).join("")}</div>
      <div class="rejilla">
        <section class="panel">
          <div class="panel-cab"><div><h3>${esc(t("mk." + met.k))}</h3><p class="nota">${esc(r.liga.nombre)}${unidad ? `, ${esc(unidad)}` : ""}</p></div>
          <button class="enlace-tabla" type="button" data-alternar="rk">${esc(t("fi.verTabla"))}</button></div>
          <div class="lienzo" id="lz-rk" style="height:${Math.max(220, top.length * 34 + 40)}px"><canvas id="cv-rk" role="img" aria-label="${esc(t("mk." + met.k))}"></canvas></div>
          <div class="tabla-scroll" id="tb-rk" hidden>${tablaSimple([t("rk.pos"), t("rk.eq"), t("rk.valor")], top.map((e, i) => [i + 1, e.nombre, fmt(e[met.k])]))}</div>
        </section>
        <section class="panel">
          <div class="panel-cab"><h3>${esc(t("rk.tablaTitulo"))}</h3></div>
          <div class="tabla-scroll"><table class="datos"><thead><tr><th>#</th><th class="izq">${esc(t("rk.eq"))}</th><th>${esc(t("rk.valor"))}</th><th class="izq">${esc(t("rk.forma"))}</th></tr></thead><tbody>
            ${orden.map((e, i) => `<tr><td>${i + 1}</td><td class="izq"><a href="#/equipo/${encodeURIComponent(liga)}/${encodeURIComponent(e.id)}">${esc(e.nombre)}</a></td><td>${fmt(e[met.k])}</td><td class="izq">${forma(e.forma5)}</td></tr>`).join("")}
          </tbody></table></div>
        </section>
      </div>`;

    $("#rLiga", v).addEventListener("change", (e) => { location.hash = `#/ranking/${e.target.value}`; });
    $$("[data-met]", v).forEach((b) => b.addEventListener("click", () => { estado.ranking.metrica = b.dataset.met; vistaRanking(v, liga); }));
    $("[data-alternar='rk']", v).addEventListener("click", (e) => {
      const tb = $("#tb-rk"), lz = $("#lz-rk"); const ver = tb.hidden; tb.hidden = !ver; lz.hidden = ver;
      e.target.textContent = t(ver ? "fi.verGrafico" : "fi.verTabla");
    });
    if (top.length) {
      GRAF.barras($("#cv-rk"), top.map((e) => e.nombre), [{ label: t("mk." + met.k), data: top.map((e) => e[met.k]), color: GRAF.C.azul }],
        { horizontal: true, sufijo: met.pct ? "%" : "", max: met.pct ? 100 : undefined, tooltip: { label: (c) => fmt(c.raw) } });
      $("#cv-rk").onclick = (ev) => {
        const g = Chart.getChart($("#cv-rk"));
        const p = g && g.getElementsAtEventForMode(ev, "nearest", { intersect: false, axis: "y" }, false)[0];
        if (p) location.hash = `#/equipo/${encodeURIComponent(liga)}/${encodeURIComponent(top[p.index].id)}`;
      };
    }
    $("#btnTop5", v).addEventListener("click", () => EXPORTAR.top5(r, met, orden.slice(0, 5), fmt));
  }


  // =========================================================
  // VISTA: HISTORIAL DE ACIERTOS
  // =========================================================
  const fmtFecha = (iso) => new Intl.DateTimeFormat(I18N.locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const chipEstado = (e) => `<span class="chip ${e === "acierto" ? "chip-ok" : e === "fallo" ? "chip-fallo" : ""}">${e === "acierto" ? "✓ " : e === "fallo" ? "✗ " : ""}${esc(t("h.e." + e))}</span>`;

  async function vistaHistorial(v) {
    v.innerHTML = `<div class="vacio">${esc(t("x.cargando"))}</div>`;
    let h;
    try { h = await API.aciertos(); } catch (e) { return manejarError(e, v); }
    const G = h.mercados.golden_o15, O = h.mercados.o25_70;
    const pct = (x) => (x === null || x === undefined ? "—" : `${x}%`);
    const senales = h.senales || [];
    v.innerHTML = `
      <div class="titulo-vista">
        <div><h1>${esc(t("h.titulo"))}</h1><p>${esc(t("h.sub"))}</p></div>
        <div class="heroe-acciones"><button class="btn btn-oro" id="btnHist" type="button" ${G.resueltas ? "" : "disabled"}>${esc(t("h.exportar"))}</button></div>
      </div>
      <div class="contadores">
        <div class="contador oro"><b>${pct(G.pct)}</b><span>${esc(t("h.pctGolden"))}</span></div>
        <div class="contador"><b>${G.aciertos}-${G.fallos}</b><span>${esc(t("h.aciertos"))} / ${esc(t("h.fallos"))}</span></div>
        <div class="contador"><b>${pct(G.pct30)}</b><span>${esc(t("h.pct30"))}</span></div>
        <div class="contador"><b>${pct(O.pct)}</b><span>${esc(t("h.o25"))}</span></div>
      </div>
      ${!senales.length ? `<div class="vacio">${esc(t("h.vacio"))}</div>` : `
      <div class="rejilla">
        <section class="panel">
          <div class="panel-cab"><div><h3>${esc(t("h.semanal"))}</h3><p class="nota">${esc(t("h.semanalNota"))}</p></div>
          <button class="enlace-tabla" type="button" data-alternar="hs">${esc(t("fi.verTabla"))}</button></div>
          <div class="lienzo" id="lz-hs"><canvas id="cv-hs" role="img" aria-label="${esc(t("h.semanal"))}"></canvas></div>
          <div class="tabla-scroll" id="tb-hs" hidden>${tablaSimple([t("h.fecha"), t("h.aciertos"), t("h.fallos"), "%"], G.semanas.map((w) => [fmtFecha(w.semana + "T12:00:00Z"), w.aciertos, w.total - w.aciertos, w.pct + "%"]))}</div>
        </section>
        <section class="panel">
          <div class="panel-cab"><div><h3>${esc(t("h.pendientes"))}</h3></div></div>
          <div class="contadores" style="margin:0">
            <div class="contador"><b>${G.pendientes}</b><span>${esc(t("h.m.golden_o15"))}</span></div>
            <div class="contador"><b>${O.pendientes}</b><span>${esc(t("h.m.o25_70"))}</span></div>
          </div>
          ${h.desde ? `<p class="nota" style="margin-top:12px">${esc(t("h.desde"))}: ${esc(fmtFecha(h.desde))}</p>` : ""}
        </section>
      </div>
      <section class="panel" style="margin-top:16px">
        <div class="panel-cab"><h3>${esc(t("h.senales"))}</h3></div>
        <div class="tabla-scroll"><table class="datos"><thead><tr>
          <th class="izq">${esc(t("h.fecha"))}</th><th class="izq">${esc(t("h.partido"))}</th><th class="izq">${esc(t("h.mercado"))}</th>
          <th>${esc(t("h.prob"))}</th><th>${esc(t("h.resultado"))}</th><th>${esc(t("h.estado"))}</th></tr></thead><tbody>
          ${senales.map((x) => `<tr><td class="izq">${esc(fmtFechaHora(x.fechaISO))}</td><td class="izq">${esc(x.local)} vs ${esc(x.visita)}<br><span class="nota">${esc(x.liga)}</span></td>
            <td class="izq">${esc(t("h.m." + x.mercado))}</td><td>${x.prob}%</td><td>${esc(x.marcador || "—")}</td><td>${chipEstado(x.estado)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>`}`;
    if (senales.length && G.semanas.length) {
      GRAF.barras($("#cv-hs"), G.semanas.map((w) => fmtFecha(w.semana + "T12:00:00Z")), [{ label: t("h.pctGolden"), data: G.semanas.map((w) => w.pct), color: GRAF.C.azul }],
        { sufijo: "%", max: 100, tooltip: { label: (c) => `${c.raw}% (${G.semanas[c.dataIndex].aciertos}/${G.semanas[c.dataIndex].total})` } });
      $("[data-alternar='hs']", v).addEventListener("click", (e) => {
        const tb = $("#tb-hs"), lz = $("#lz-hs"); const ver = tb.hidden; tb.hidden = !ver; lz.hidden = ver;
        e.target.textContent = t(ver ? "fi.verGrafico" : "fi.verTabla");
      });
    }
    const b = $("#btnHist", v);
    if (b) b.addEventListener("click", () => EXPORTAR.historial(h));
  }

  // Resumen público en la portada (solo con al menos 10 señales Golden resueltas)
  async function historialPublico() {
    try {
      const h = await API.aciertosPublico();
      const G = h.mercados && h.mercados.golden_o15;
      const sec = $("#historialPublico");
      if (!G || G.resueltas < 10) { sec.hidden = true; return; }
      $(".js-h-pct").textContent = `${G.pct}%`;
      $(".js-h-ac").textContent = G.aciertos;
      $(".js-h-fa").textContent = G.fallos;
      $(".js-h-desde").textContent = h.desde ? fmtFecha(h.desde) : "—";
      sec.hidden = false;
    } catch (e) { /* sin historial público */ }
  }

  // =========================================================
  // RUTAS Y ARRANQUE
  // =========================================================
  async function enrutar() {
    if ($("#app").hidden) return;
    const v = $("#vista");
    const partes = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const ruta = partes[0] || "partidos";
    $$(".nav a").forEach((a) => (a.dataset.ruta === (ruta === "partido" || ruta === "equipo" ? "partidos" : ruta) ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    window.scrollTo(0, 0);
    if (ruta === "partido" && partes[1]) return vistaPrevia(v, partes[1]);
    if (ruta === "equipo" && partes[1] && partes[2]) return vistaEquipo(v, partes[1], partes[2]);
    if (ruta === "ranking") return vistaRanking(v, partes[1]);
    if (ruta === "historial") return vistaHistorial(v);
    return vistaPartidos(v);
  }

  // ---------- Actualizar (botón y automático cada 30 min) ----------
  const CADA_MS = 30 * 60 * 1000;
  async function actualizar() {
    if ($("#app").hidden || estado.cargaPartidos) return;
    const b = $("#actualizar");
    b.disabled = true;
    estado.fichaCache.clear();
    estado.ligaCache.clear();
    try { await cargarPartidos(true); } catch (e) { /* el estado rojo ya lo indica */ }
    finally { b.disabled = false; }
    // vuelve a dibujar la vista actual con los datos nuevos, sin cerrar ventanas abiertas
    if ($("#modal").hidden) {
      const y = window.scrollY; // mantiene la posición de lectura
      await enrutar();
      window.scrollTo(0, y);
    }
  }
  setInterval(() => { if (document.visibilityState === "visible") actualizar(); }, CADA_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && estado.cargadoEn && Date.now() - estado.cargadoEn > CADA_MS) actualizar();
  });

  function mostrarPortada(mensaje, donde = "entrar") {
    historialPublico();
    $("#app").hidden = true;
    $("#portada").hidden = false;
    $("#bannerDemo").hidden = true;
    $("#errorEntrar").textContent = donde === "entrar" ? mensaje || "" : "";
    $("#errorDemo").textContent = donde === "demo" ? mensaje || "" : "";
    if (mensaje) (donde === "demo" && !$("#prueba").hidden ? $("#prueba") : $("#entrar")).scrollIntoView();
  }

  // Cartel de días restantes de la prueba
  function pintarBannerDemo() {
    const s = API.sesion();
    const b = $("#bannerDemo");
    if ($("#app").hidden || !s || s.tipo !== "demo" || !s.finDemo) { b.hidden = true; return; }
    const dias = Math.max(1, Math.ceil((s.finDemo - Date.now()) / 86400000));
    $(".js-demo-banner").textContent = dias === 1 ? t("demo.bannerUno") : t("demo.banner", { n: dias });
    const url = estado.planes.anual?.url;
    $(".js-ver-planes").hidden = !url;
    if (url) $(".js-ver-planes").href = url;
    b.hidden = false;
  }
  function mostrarApp() {
    $("#portada").hidden = true;
    $("#app").hidden = false;
    pintarBannerDemo();
    enrutar();
  }

  // Glosario de abreviaturas al pie de cada página
  function pintarGlosario() {
    const items = [];
    // la nota de las cifras en dorado va justo después de los mercados
    for (const i of [1, 2, 3, 4, 5, 6, 7, 14, 8, 9, 10, 11, 12, 13]) {
      const [termino, significado] = t("glo." + i).split("|");
      items.push(`<div><dt>${esc(termino)}</dt><dd>${esc(significado)}</dd></div>`);
    }
    $$(".js-glosario").forEach((el) => { el.innerHTML = `<h2>${esc(t("glo.titulo"))}</h2><dl>${items.join("")}</dl>`; });
    $$(".js-aviso").forEach((el) => {
      el.innerHTML = `<h2><span class="sello18" aria-hidden="true">18+</span>${esc(t("aviso.titulo"))}</h2>
        <p><b>${esc(t("aviso.18"))}</b></p><p>${esc(t("aviso.ref"))}</p><p>${esc(t("aviso.criterio"))}</p>`;
    });
  }

  function iniciar() {
    I18N.aplicar();
    pintarGlosario();
    const tituloActualizar = () => { $("#actualizar").title = t("d.actualizar"); };
    tituloActualizar();
    document.addEventListener("idioma", () => { pintarGlosario(); tituloActualizar(); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-idioma]");
      if (b) I18N.cambiar(b.dataset.idioma);
    });
    document.addEventListener("idioma", () => { if (!$("#app").hidden) enrutar(); });

    $("#modalCerrar").addEventListener("click", cerrarModal);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") cerrarModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) cerrarModal(); });

    $$(".js-comprar").forEach((a) => a.addEventListener("click", (e) => {
      if (a.getAttribute("href") === "#planes") return;
      const url = estado.planes[a.dataset.plan]?.url;
      if (!url) { e.preventDefault(); $("#sinUrl").hidden = false; }
    }));

    $("#formEntrar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter || $("#formEntrar button");
      const email = $("#email").value.trim(), codigo = $("#codigo").value.trim();
      $("#errorEntrar").textContent = "";
      if (!email || !codigo) { $("#errorEntrar").textContent = t("e.faltan_datos"); return; }
      if (!$("#mayorEdad").checked) { $("#errorEntrar").textContent = t("e.menor"); $("#mayorEdad").focus(); return; }
      btn.disabled = true;
      try { await API.entrar(email, codigo); location.hash = "#/partidos"; mostrarApp(); }
      catch (err) { $("#errorEntrar").textContent = err.message; }
      finally { btn.disabled = false; }
    });

    $("#formDemo").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter || $("#formDemo button");
      const email = $("#emailDemo").value.trim();
      $("#errorDemo").textContent = "";
      if (!email) { $("#errorDemo").textContent = t("e.correo_invalido"); return; }
      if (!$("#mayorEdadDemo").checked) { $("#errorDemo").textContent = t("e.menor"); $("#mayorEdadDemo").focus(); return; }
      btn.disabled = true;
      try { await API.demo(email); location.hash = "#/partidos"; mostrarApp(); }
      catch (err) { $("#errorDemo").textContent = err.message; }
      finally { btn.disabled = false; }
    });

    $("#salir").addEventListener("click", () => {
      API.salir();
      estado.datos = null; estado.fichaCache.clear(); estado.ligaCache.clear();
      location.hash = "";
      mostrarPortada();
    });

    window.addEventListener("hashchange", enrutar);
    $("#actualizar").addEventListener("click", actualizar);

    const pintarPlanes = () => {
      const pl = estado.planes;
      $$(".js-comprar[data-plan]").forEach((a) => { const u = pl[a.dataset.plan]?.url; a.href = u || "#"; });
      $$(".js-precio-anual").forEach((el) => (el.textContent = pl.anual?.precio || ""));
      $$(".js-precio-mensual").forEach((el) => (el.textContent = pl.mensual?.precio || ""));
      // Equivalencia mensual del plan anual (p. ej. "USD 97" -> "USD 8,08")
      const m = String(pl.anual?.precio || "").match(/^(\D*)([\d.,]+)(\D*)$/);
      const n = m ? parseFloat(m[2].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : NaN;
      $$(".js-equivale").forEach((el) => (el.textContent = Number.isFinite(n) ? t("p.equivale", { m: `${m[1]}${fmtNum(n / 12)}${m[3]}`.trim() }) : ""));
      // Sin plan mensual configurado, se oculta su tarjeta
      $$(".js-comprar[data-plan=mensual]").forEach((a) => (a.closest(".plan").hidden = !pl.mensual?.url));
    };
    const pintarDemo = () => {
      const d = estado.demoDias;
      $("#prueba").hidden = !d;
      $(".js-cta-demo").hidden = !d;
      $(".js-cta-comprar").hidden = !!d;
      if (d) {
        $(".js-cta-demo").textContent = t("demo.heroe", { d });
        $(".js-demo-titulo").textContent = t("demo.titulo", { d });
        $(".js-demo-sub").textContent = t("demo.sub", { d });
      }
      pintarBannerDemo();
    };
    API.config().then((c) => {
      estado.planes = c.planes || { anual: { url: c.hotmartUrl } };
      estado.demoDias = c.demoDias || 0;
      pintarPlanes(); pintarDemo();
    });
    document.addEventListener("idioma", () => { pintarPlanes(); pintarDemo(); });

    API.sesionValida()
      .then((s) => (s ? mostrarApp() : mostrarPortada()))
      .catch((e) => mostrarPortada(e.message, e.codigo === "demo_terminada" ? "demo" : "entrar"));
  }

  window.APP = { metricas, textoEditorial, fmtFechaHora, fmtNum, pais, ordinal, esc, fmtFecha: (iso) => new Intl.DateTimeFormat(I18N.locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) };
  document.addEventListener("DOMContentLoaded", iniciar);
})();

// Nova Gol Analytics — Motor de datos y estadísticas (compartido por todas las funciones)
//
// Fuentes:
//   football-data.org  (FOOTBALL_DATA_TOKEN, obligatoria)  -> ligas europeas, Champions, Brasil
//   API-Football       (API_FOOTBALL_KEY, opcional)        -> LigaPro Ecuador (código "ECU")
//
// Todos los indicadores son FRECUENCIAS HISTÓRICAS de la temporada en curso.

const FD_BASE = "https://api.football-data.org/v4";
const AF_BASE = "https://v3.football.api-sports.io";
export const ZONA = "America/Guayaquil";
export const MIN_MUESTRA = 4;

export const LIGAS = {
  PL:  { nombre: "Premier League",   pais: "Inglaterra" },
  PD:  { nombre: "La Liga",          pais: "España" },
  SA:  { nombre: "Serie A",          pais: "Italia" },
  BL1: { nombre: "Bundesliga",       pais: "Alemania" },
  FL1: { nombre: "Ligue 1",          pais: "Francia" },
  CL:  { nombre: "Champions League", pais: "Europa" },
  PPL: { nombre: "Primeira Liga",    pais: "Portugal" },
  DED: { nombre: "Eredivisie",       pais: "Países Bajos" },
  BSA: { nombre: "Brasileirão",      pais: "Brasil" },
  ELC: { nombre: "Championship",     pais: "Inglaterra" },
  ECU: { nombre: "LigaPro Ecuador",  pais: "Ecuador", afId: 242 },
};

export function ligasConfiguradas() {
  const fd = (process.env.LIGAS || "PL,PD,SA,BL1,FL1,CL,PPL,DED,BSA")
    .split(",").map((s) => s.trim().toUpperCase()).filter((c) => c && c !== "ECU" && LIGAS[c]).slice(0, 10);
  if (process.env.API_FOOTBALL_KEY) fd.push("ECU");
  return fd;
}

// ---------- Respuestas HTTP ----------
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export const SIN_SESION = () => json({ error: "Tu sesión terminó. Vuelve a entrar.", sinSesion: true }, 401);

export function fechaLocal(iso) {
  const d = new Date(iso);
  return {
    fecha: new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    hora: new Intl.DateTimeFormat("es-EC", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
  };
}

async function pedirJSON(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  const texto = await r.text();
  let data = null;
  try { data = JSON.parse(texto); } catch { /* no JSON */ }
  if (!r.ok) {
    const msg = (data && (data.message || (data.errors && JSON.stringify(data.errors)))) || texto.slice(0, 200);
    throw new Error(`HTTP ${r.status}: ${msg}`);
  }
  return data;
}

// ---------- Normalización ----------
// Partido común:
// { id, fechaISO, estado:'FIN'|'PROX'|'OTRO', enVivo, liga, ligaCodigo, pais, jornada, fase:'LIGA'|'OTRA',
//   local:{id,nombre,escudo}, visita:{...}, gl, gv, htl, htv }
function normalizarFD(m, code) {
  const fin = m.status === "FINISHED";
  const prox = ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED"].includes(m.status);
  const ft = (m.score && (m.score.regularTime || m.score.fullTime)) || {};
  const ht = (m.score && m.score.halfTime) || {};
  return {
    id: `fd-${m.id}`,
    fechaISO: m.utcDate,
    estado: fin ? "FIN" : prox ? "PROX" : "OTRO",
    enVivo: ["IN_PLAY", "PAUSED"].includes(m.status),
    liga: LIGAS[code]?.nombre || m.competition?.name || code,
    ligaCodigo: code,
    pais: LIGAS[code]?.pais || m.area?.name || "",
    jornada: m.matchday ?? null,
    fase: !m.stage || ["REGULAR_SEASON", "LEAGUE_STAGE", "GROUP_STAGE"].includes(m.stage) ? "LIGA" : "OTRA",
    local:  { id: `fd-${m.homeTeam?.id}`, nombre: m.homeTeam?.shortName || m.homeTeam?.name || "Por definir", escudo: m.homeTeam?.crest || "" },
    visita: { id: `fd-${m.awayTeam?.id}`, nombre: m.awayTeam?.shortName || m.awayTeam?.name || "Por definir", escudo: m.awayTeam?.crest || "" },
    gl: ft.home ?? null, gv: ft.away ?? null,
    htl: ht.home ?? null, htv: ht.away ?? null,
  };
}

function normalizarAF(f, code) {
  const st = f.fixture?.status?.short;
  const vivo = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(st);
  const ft = f.score?.fulltime || {};
  const ht = f.score?.halftime || {};
  const ronda = f.league?.round || "";
  const num = parseInt((ronda.match(/(\d+)\s*$/) || [])[1], 10);
  return {
    id: `af-${f.fixture.id}`,
    fechaISO: f.fixture.date,
    estado: ["FT", "AET", "PEN"].includes(st) ? "FIN" : (st === "NS" || st === "TBD" || vivo) ? "PROX" : "OTRO",
    enVivo: vivo,
    liga: LIGAS[code].nombre,
    ligaCodigo: code,
    pais: LIGAS[code].pais,
    jornada: Number.isFinite(num) ? num : ronda || null,
    fase: /regular season/i.test(ronda) || !ronda ? "LIGA" : "OTRA",
    local:  { id: `af-${f.teams.home.id}`, nombre: f.teams.home.name, escudo: f.teams.home.logo || "" },
    visita: { id: `af-${f.teams.away.id}`, nombre: f.teams.away.name, escudo: f.teams.away.logo || "" },
    gl: ft.home ?? f.goals?.home ?? null, gv: ft.away ?? f.goals?.away ?? null,
    htl: ht.home ?? null, htv: ht.away ?? null,
  };
}

// ---------- Carga con caché ----------
// 1) memoria de la instancia (10 min)  2) Netlify Blobs compartido entre usuarios (30 min)
// 3) API.  Si la API falla, usa la última copia guardada (hasta 24 h) para no dejar la app vacía.
const MEM_MS = 10 * 60 * 1000;
const BLOB_MS = 30 * 60 * 1000;
const RESPALDO_MS = 24 * 3600 * 1000;
const cache = new Map(); // code -> { t, partidos }

async function storeDatos() {
  try {
    if (globalThis.__ALMACEN_PRUEBA__) return globalThis.__ALMACEN_PRUEBA__("datos");
    const { getStore } = await import("@netlify/blobs");
    return getStore("datos");
  } catch { return null; }
}

async function descargarLiga(code) {
  if (code === "ECU") {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) throw new Error("Falta API_FOOTBALL_KEY para LigaPro Ecuador");
    const temporada = new Date().getUTCFullYear();
    const data = await pedirJSON(`${AF_BASE}/fixtures?league=${LIGAS.ECU.afId}&season=${temporada}`, { "x-apisports-key": key });
    const nErr = data?.errors && (Array.isArray(data.errors) ? data.errors.length : Object.keys(data.errors).length);
    if (nErr) throw new Error(JSON.stringify(data.errors));
    return (data.response || []).map((f) => normalizarAF(f, code));
  }
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("Falta configurar FOOTBALL_DATA_TOKEN en las variables de entorno de Netlify.");
  const data = await pedirJSON(`${FD_BASE}/competitions/${code}/matches`, { "X-Auth-Token": token });
  return (data.matches || []).filter((m) => m.homeTeam?.id && m.awayTeam?.id).map((m) => normalizarFD(m, code));
}

export async function partidosDeLiga(code) {
  const c = cache.get(code);
  if (c && Date.now() - c.t < MEM_MS) return c.partidos;

  const store = await storeDatos();
  let guardado = null;
  if (store) { try { guardado = await store.get(`liga_${code}`, { type: "json" }); } catch { /* sin blobs */ } }
  if (guardado && Date.now() - guardado.t < BLOB_MS) {
    cache.set(code, guardado);
    return guardado.partidos;
  }
  try {
    const partidos = await descargarLiga(code);
    const registro = { t: Date.now(), partidos };
    cache.set(code, registro);
    if (store) { try { await store.setJSON(`liga_${code}`, registro); } catch { /* sin blobs */ } }
    return partidos;
  } catch (e) {
    if (guardado && Date.now() - guardado.t < RESPALDO_MS) return guardado.partidos;
    throw e;
  }
}

// ---------- Utilidades de cálculo ----------
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const r2 = (n) => Math.round(n * 100) / 100;
const div = (a, b) => (b ? a / b : 0);

export function terminados(partidos) {
  return partidos
    .filter((p) => p.estado === "FIN" && p.gl !== null && p.gv !== null)
    .sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));
}

// Vista de un partido desde la perspectiva de un equipo
function perspectiva(p, equipoId) {
  const casa = p.local.id === equipoId;
  const tieneHT = p.htl !== null && p.htv !== null;
  return {
    id: p.id,
    fechaISO: p.fechaISO,
    casa,
    rival: casa ? p.visita : p.local,
    gf: casa ? p.gl : p.gv,
    gc: casa ? p.gv : p.gl,
    gf1: tieneHT ? (casa ? p.htl : p.htv) : null,
    gc1: tieneHT ? (casa ? p.htv : p.htl) : null,
    jornada: p.jornada,
  };
}

const resultado = (gf, gc) => (gf > gc ? "V" : gf === gc ? "E" : "D");

// ---------- Indicadores de un conjunto de partidos (total, casa o fuera) ----------
export function indicadores(lista) {
  const n = lista.length;
  let v = 0, e = 0, d = 0, gf = 0, gc = 0;
  const cuenta = { o05: 0, o15: 0, o25: 0, o35: 0, o45: 0, btts: 0, cs: 0, sm: 0, gsr: 0 };
  // medio tiempo
  let nHT = 0, gf1 = 0, gc1 = 0, gf2 = 0, gc2 = 0;
  const ht = { marca1: 0, recibe1: 0, o05ht: 0, o15ht: 0, gana1: 0, empata1: 0, pierde1: 0, remontadas: 0, ventajasPerdidas: 0, marca2: 0, o05_2t: 0 };

  for (const x of lista) {
    const t = x.gf + x.gc;
    const res = resultado(x.gf, x.gc);
    if (res === "V") v++; else if (res === "E") e++; else d++;
    gf += x.gf; gc += x.gc;
    if (t >= 1) cuenta.o05++;
    if (t >= 2) cuenta.o15++;
    if (t >= 3) cuenta.o25++;
    if (t >= 4) cuenta.o35++;
    if (t >= 5) cuenta.o45++;
    if (x.gf > 0 && x.gc > 0) cuenta.btts++;
    if (x.gc === 0) cuenta.cs++;
    if (x.gf === 0) cuenta.sm++;
    if (res === "V" && x.gc === 0) cuenta.gsr++;

    if (x.gf1 !== null) {
      nHT++;
      const f2 = x.gf - x.gf1, c2 = x.gc - x.gc1;
      gf1 += x.gf1; gc1 += x.gc1; gf2 += f2; gc2 += c2;
      if (x.gf1 > 0) ht.marca1++;
      if (x.gc1 > 0) ht.recibe1++;
      if (x.gf1 + x.gc1 >= 1) ht.o05ht++;
      if (x.gf1 + x.gc1 >= 2) ht.o15ht++;
      if (f2 > 0) ht.marca2++;
      if (f2 + c2 >= 1) ht.o05_2t++;
      const r1 = resultado(x.gf1, x.gc1);
      if (r1 === "V") ht.gana1++; else if (r1 === "E") ht.empata1++; else ht.pierde1++;
      if (r1 === "D" && res === "V") ht.remontadas++;
      if (r1 === "V" && res !== "V") ht.ventajasPerdidas++;
    }
  }
  const pts = v * 3 + e;
  return {
    // Rendimiento
    pj: n, v, e, d, pts,
    pts_partido: r2(div(pts, n)),
    pct_v: pct(v, n), pct_e: pct(e, n), pct_d: pct(d, n),
    // Goles
    gf, gc, dg: gf - gc,
    gf_prom: r2(div(gf, n)), gc_prom: r2(div(gc, n)), goles_partido: r2(div(gf + gc, n)),
    // Mercados (frecuencia histórica %)
    over05: pct(cuenta.o05, n), over15: pct(cuenta.o15, n), over25: pct(cuenta.o25, n),
    over35: pct(cuenta.o35, n), over45: pct(cuenta.o45, n),
    under05: n ? 100 - pct(cuenta.o05, n) : 0, under15: n ? 100 - pct(cuenta.o15, n) : 0,
    under25: n ? 100 - pct(cuenta.o25, n) : 0, under35: n ? 100 - pct(cuenta.o35, n) : 0,
    under45: n ? 100 - pct(cuenta.o45, n) : 0,
    btts: pct(cuenta.btts, n), btts_no: n ? 100 - pct(cuenta.btts, n) : 0,
    porteria_cero: pct(cuenta.cs, n), sin_marcar: pct(cuenta.sm, n), gana_sin_recibir: pct(cuenta.gsr, n),
    // Por tiempos
    pj_ht: nHT,
    gf_1t: gf1, gc_1t: gc1, gf_2t: gf2, gc_2t: gc2,
    gf_1t_prom: r2(div(gf1, nHT)), gc_1t_prom: r2(div(gc1, nHT)),
    gf_2t_prom: r2(div(gf2, nHT)), gc_2t_prom: r2(div(gc2, nHT)),
    marca_1t: pct(ht.marca1, nHT), recibe_1t: pct(ht.recibe1, nHT), marca_2t: pct(ht.marca2, nHT),
    over05_1t: pct(ht.o05ht, nHT), over15_1t: pct(ht.o15ht, nHT), over05_2t: pct(ht.o05_2t, nHT),
    gana_descanso: pct(ht.gana1, nHT), empata_descanso: pct(ht.empata1, nHT), pierde_descanso: pct(ht.pierde1, nHT),
    remontadas: ht.remontadas, ventajas_perdidas: ht.ventajasPerdidas,
    pct_goles_2t: pct(gf2, gf1 + gf2),
  };
}

// ---------- Rachas (sobre la lista cronológica) ----------
export function rachas(lista) {
  const actual = (cond) => { let c = 0; for (let i = lista.length - 1; i >= 0 && cond(lista[i]); i--) c++; return c; };
  const maxima = (cond) => { let m = 0, c = 0; for (const x of lista) { c = cond(x) ? c + 1 : 0; m = Math.max(m, c); } return m; };
  const gana = (x) => x.gf > x.gc, noPierde = (x) => x.gf >= x.gc, noGana = (x) => x.gf <= x.gc, pierde = (x) => x.gf < x.gc;
  const marca = (x) => x.gf > 0, cs = (x) => x.gc === 0, over15 = (x) => x.gf + x.gc >= 2, over25 = (x) => x.gf + x.gc >= 3, btts = (x) => x.gf > 0 && x.gc > 0;
  return {
    victorias: actual(gana), invicto: actual(noPierde), sin_ganar: actual(noGana), derrotas: actual(pierde),
    marcando: actual(marca), sin_recibir: actual(cs), over15: actual(over15), over25: actual(over25), btts: actual(btts),
    max_victorias: maxima(gana), max_invicto: maxima(noPierde), max_sin_ganar: maxima(noGana),
  };
}

function forma(lista, k) {
  const ult = lista.slice(-k);
  return {
    partidos: ult.length,
    resultados: ult.map((x) => resultado(x.gf, x.gc)),
    pts: ult.reduce((s, x) => s + (x.gf > x.gc ? 3 : x.gf === x.gc ? 1 : 0), 0),
    gf: ult.reduce((s, x) => s + x.gf, 0),
    gc: ult.reduce((s, x) => s + x.gc, 0),
  };
}

// ---------- Tabla de posiciones (total / casa / fuera) ----------
export function tabla(partidos, modo = "total", hastaISO = null) {
  const filas = new Map();
  const fila = (eq) => {
    if (!filas.has(eq.id)) filas.set(eq.id, { id: eq.id, nombre: eq.nombre, escudo: eq.escudo, pj: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0, pts: 0 });
    return filas.get(eq.id);
  };
  for (const p of terminados(partidos)) {
    if (p.fase !== "LIGA") continue;
    if (hastaISO && p.fechaISO > hastaISO) break;
    const sumar = (eq, gf, gc) => {
      const f = fila(eq);
      f.pj++; f.gf += gf; f.gc += gc;
      if (gf > gc) { f.v++; f.pts += 3; } else if (gf === gc) { f.e++; f.pts += 1; } else f.d++;
    };
    if (modo !== "fuera") sumar(p.local, p.gl, p.gv);
    if (modo !== "casa") sumar(p.visita, p.gv, p.gl);
  }
  return [...filas.values()]
    .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf || a.nombre.localeCompare(b.nombre))
    .map((f, i) => ({ ...f, dg: f.gf - f.gc, pos: i + 1 }));
}

// ---------- Promedios de la liga (para comparar) ----------
function promediosLiga(partidos) {
  const fin = terminados(partidos);
  const comoLocal = fin.map((p) => perspectiva(p, p.local.id));
  const i = indicadores(comoLocal); // perspectiva neutra: los mercados de goles totales no dependen del lado
  return {
    partidos: fin.length,
    goles_partido: i.goles_partido,
    over05: i.over05, over15: i.over15, over25: i.over25, over35: i.over35, over45: i.over45,
    btts: i.btts,
    victoria_local: i.pct_v, empate: i.pct_e, victoria_visita: i.pct_d,
    over05_1t: i.over05_1t,
  };
}

// ---------- Ficha completa de un equipo ----------
export function fichaEquipo(partidos, equipoId) {
  const fin = terminados(partidos);
  const propios = fin.filter((p) => p.local.id === equipoId || p.visita.id === equipoId);
  const cualquiera = partidos.find((p) => p.local.id === equipoId || p.visita.id === equipoId);
  if (!cualquiera) return null;
  const equipo = cualquiera.local.id === equipoId ? cualquiera.local : cualquiera.visita;

  const lista = propios.map((p) => perspectiva(p, equipoId));
  const casa = lista.filter((x) => x.casa);
  const fuera = lista.filter((x) => !x.casa);

  const tTotal = tabla(partidos, "total"), tCasa = tabla(partidos, "casa"), tFuera = tabla(partidos, "fuera");
  const pos = (t) => t.find((f) => f.id === equipoId)?.pos ?? null;

  // Serie cronológica para gráficos
  let acum = 0;
  const serie = lista.map((x, idx) => {
    const res = resultado(x.gf, x.gc);
    acum += res === "V" ? 3 : res === "E" ? 1 : 0;
    const ventana = lista.slice(Math.max(0, idx - 4), idx + 1);
    const p = propios[idx];
    const { fecha } = fechaLocal(x.fechaISO);
    return {
      n: idx + 1, fecha, jornada: x.jornada, casa: x.casa,
      rival: x.rival.nombre, gf: x.gf, gc: x.gc, gf1: x.gf1, gc1: x.gc1, res,
      pts_acum: acum,
      pos_tabla: p.fase === "LIGA" ? pos(tabla(partidos, "total", x.fechaISO)) : null,
      gf_movil5: r2(ventana.reduce((s, y) => s + y.gf, 0) / ventana.length),
      gc_movil5: r2(ventana.reduce((s, y) => s + y.gc, 0) / ventana.length),
    };
  });

  // Puntos acumulados del líder actual (referencia en el gráfico)
  const lider = tTotal[0];
  let serieLider = [];
  if (lider && lider.id !== equipoId) {
    let a = 0;
    serieLider = fin.filter((p) => p.fase === "LIGA" && (p.local.id === lider.id || p.visita.id === lider.id))
      .map((p, i) => { const x = perspectiva(p, lider.id); a += x.gf > x.gc ? 3 : x.gf === x.gc ? 1 : 0; return { n: i + 1, pts_acum: a }; });
  }

  // Próximo partido
  const prox = partidos
    .filter((p) => p.estado === "PROX" && (p.local.id === equipoId || p.visita.id === equipoId))
    .sort((a, b) => a.fechaISO.localeCompare(b.fechaISO))[0];

  return {
    equipo: { id: equipoId, nombre: equipo.nombre, escudo: equipo.escudo },
    liga: { codigo: cualquiera.ligaCodigo, nombre: cualquiera.liga, pais: cualquiera.pais },
    posicion: { total: pos(tTotal), casa: pos(tCasa), fuera: pos(tFuera), equipos: tTotal.length },
    indicadores: { total: indicadores(lista), casa: indicadores(casa), fuera: indicadores(fuera) },
    rachas: { total: rachas(lista), casa: rachas(casa), fuera: rachas(fuera) },
    forma: { ult5: forma(lista, 5), ult10: forma(lista, 10), casa5: forma(casa, 5), fuera5: forma(fuera, 5) },
    serie,
    lider: lider && lider.id !== equipoId ? { nombre: lider.nombre, serie: serieLider } : null,
    promediosLiga: promediosLiga(partidos),
    proximo: prox ? { ...fechaLocal(prox.fechaISO), rival: prox.local.id === equipoId ? prox.visita.nombre : prox.local.nombre, casa: prox.local.id === equipoId } : null,
    muestraBaja: casa.length < MIN_MUESTRA || fuera.length < MIN_MUESTRA,
  };
}

// ---------- Resumen de liga para rankings ----------
export function resumenLiga(partidos) {
  const fin = terminados(partidos);
  const equipos = new Map();
  for (const p of fin) { equipos.set(p.local.id, p.local); equipos.set(p.visita.id, p.visita); }
  const tTotal = tabla(partidos, "total");
  const pos = (id) => tTotal.find((f) => f.id === id)?.pos ?? null;
  const filas = [...equipos.values()].map((eq) => {
    const lista = fin.filter((p) => p.local.id === eq.id || p.visita.id === eq.id).map((p) => perspectiva(p, eq.id));
    const t = indicadores(lista), c = indicadores(lista.filter((x) => x.casa)), f = indicadores(lista.filter((x) => !x.casa));
    return {
      id: eq.id, nombre: eq.nombre, escudo: eq.escudo, pos: pos(eq.id),
      pj: t.pj, pts: t.pts, gf_prom: t.gf_prom, gc_prom: t.gc_prom, goles_partido: t.goles_partido,
      over15: t.over15, over25: t.over25, over35: t.over35, btts: t.btts,
      porteria_cero: t.porteria_cero, sin_marcar: t.sin_marcar, over05_1t: t.over05_1t,
      pj_casa: c.pj, pts_partido_casa: c.pts_partido, pct_v_casa: c.pct_v, over25_casa: c.over25,
      pj_fuera: f.pj, pts_partido_fuera: f.pts_partido, pct_v_fuera: f.pct_v, pct_d_fuera: f.pct_d, over25_fuera: f.over25,
      forma5: lista.slice(-5).map((x) => resultado(x.gf, x.gc)),
    };
  });
  const cualquiera = partidos[0];
  return {
    liga: { codigo: cualquiera?.ligaCodigo, nombre: cualquiera?.liga, pais: cualquiera?.pais },
    promediosLiga: promediosLiga(partidos),
    tabla: tTotal,
    equipos: filas,
  };
}

// ---------- Ficha resumida de equipo para la tarjeta de partido ----------
export function fichaCorta(equipo, listaLado, sufijo) {
  const i = indicadores(listaLado);
  return {
    equipoId: equipo.id,
    nombre: equipo.nombre,
    escudo: equipo.escudo,
    [`pj_${sufijo}`]: i.pj,
    [`v_${sufijo}`]: i.v, [`e_${sufijo}`]: i.e, [`d_${sufijo}`]: i.d,
    [`gf_${sufijo}`]: i.gf, [`gc_${sufijo}`]: i.gc,
    [`pts_${sufijo}`]: i.pts,
    over15_pct: i.over15, over25_pct: i.over25, btts_pct: i.btts,
    porteria_cero_pct: i.porteria_cero, sin_marcar_pct: i.sin_marcar, over05_1t_pct: i.over05_1t,
    ultimos_5: listaLado.slice(-5).map((x) => resultado(x.gf, x.gc)),
  };
}

export function ladoDeEquipo(partidos, equipoId, enCasa) {
  return terminados(partidos)
    .filter((p) => (enCasa ? p.local.id : p.visita.id) === equipoId)
    .map((p) => perspectiva(p, equipoId));
}

// ---------- Métricas combinadas de un partido (mismas reglas que la app) ----------
// L: ficha corta del local (lado casa), V: ficha corta del visitante (lado fuera)
export function metricasPartido(L, V) {
  const o15 = Math.round(L.over15_pct * 0.55 + V.over15_pct * 0.45);
  const o25 = Math.round(L.over25_pct * 0.55 + V.over25_pct * 0.45);
  const btts = Math.round(L.btts_pct * 0.5 + V.btts_pct * 0.5);
  const muestraOk = L.pj_casa >= MIN_MUESTRA && V.pj_fuera >= MIN_MUESTRA;
  return { o15, o25, u25: 100 - o25, btts, muestraOk, golden: muestraOk && o15 >= 95 };
}

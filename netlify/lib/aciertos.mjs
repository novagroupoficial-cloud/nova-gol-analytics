// Nova Gol Analytics — Historial de aciertos verificable
//
// Reglas para que el historial sea honesto:
//  1. Solo se registran partidos que AÚN NO han empezado. La señal queda guardada con la hora de registro.
//  2. Una señal registrada no se modifica nunca (ni su porcentaje ni el mercado).
//  3. Se resuelve con el resultado oficial al terminar el partido. Aplazados o cancelados quedan "anulados".
//  4. No hay datos retroactivos: el historial empieza el día en que se publica la app.

import { ligasConfiguradas, partidosDeLiga, ladoDeEquipo, fichaCorta, metricasPartido } from "./futbol.mjs";

const CLAVE = "registro";

// Mercados que se registran
export const MERCADOS = {
  golden_o15: { cumple: (m) => m.golden, acierta: (gl, gv) => gl + gv >= 2, prob: (m) => m.o15 },
  o25_70: { cumple: (m) => m.muestraOk && m.o25 >= 70, acierta: (gl, gv) => gl + gv >= 3, prob: (m) => m.o25 },
};

async function store() {
  if (globalThis.__ALMACEN_PRUEBA__) return globalThis.__ALMACEN_PRUEBA__("aciertos");
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "aciertos", consistency: "strong" });
}

export async function leerRegistro() {
  const s = await store();
  return (await s.get(CLAVE, { type: "json" })) || { senales: [] };
}
async function guardarRegistro(r) {
  const s = await store();
  await s.setJSON(CLAVE, r);
}

// Registra señales nuevas a partir de los partidos de las ligas (solo partidos no iniciados)
export async function registrarSenales(partidosPorLiga) {
  const ahora = Date.now();
  const r = await leerRegistro();
  const existentes = new Set(r.senales.map((x) => x.id));
  let nuevas = 0;
  for (const [, partidos] of partidosPorLiga) {
    for (const p of partidos) {
      if (p.estado !== "PROX" || p.enVivo) continue;
      if (Date.parse(p.fechaISO) <= ahora + 5 * 60 * 1000) continue; // al menos 5 min antes del inicio
      const L = fichaCorta(p.local, ladoDeEquipo(partidos, p.local.id, true), "casa");
      const V = fichaCorta(p.visita, ladoDeEquipo(partidos, p.visita.id, false), "fuera");
      const m = metricasPartido(L, V);
      for (const [mercado, def] of Object.entries(MERCADOS)) {
        const id = `${p.id}:${mercado}`;
        if (existentes.has(id) || !def.cumple(m)) continue;
        r.senales.push({
          id, partido: p.id, mercado, prob: def.prob(m),
          liga: p.liga, ligaCodigo: p.ligaCodigo, fechaISO: p.fechaISO,
          local: p.local.nombre, visita: p.visita.nombre,
          registrado: new Date(ahora).toISOString(),
          estado: "pendiente",
        });
        existentes.add(id);
        nuevas++;
      }
    }
  }
  if (nuevas) await guardarRegistro(r);
  return nuevas;
}

// Resuelve señales pendientes con el resultado oficial
export async function resolverSenales(partidosPorLiga) {
  const r = await leerRegistro();
  const indice = new Map();
  for (const [, partidos] of partidosPorLiga) for (const p of partidos) indice.set(p.id, p);
  let cambios = 0;
  for (const s of r.senales) {
    if (s.estado !== "pendiente") continue;
    const p = indice.get(s.partido);
    if (!p) continue;
    if (p.estado === "FIN" && p.gl !== null && p.gv !== null) {
      s.marcador = `${p.gl}-${p.gv}`;
      s.estado = MERCADOS[s.mercado].acierta(p.gl, p.gv) ? "acierto" : "fallo";
      s.resuelto = new Date().toISOString();
      cambios++;
    } else if (p.estado === "OTRO" && Date.parse(s.fechaISO) < Date.now()) {
      s.estado = "anulado"; // aplazado, cancelado o suspendido
      s.resuelto = new Date().toISOString();
      cambios++;
    }
  }
  if (cambios) await guardarRegistro(r);
  return r;
}

export async function cargarLigas() {
  const codigos = ligasConfiguradas();
  const res = await Promise.allSettled(codigos.map((c) => partidosDeLiga(c)));
  return codigos.map((c, i) => [c, res[i].status === "fulfilled" ? res[i].value : []]);
}

// Lunes de la semana (UTC) de una fecha, para agrupar
function lunes(iso) {
  const d = new Date(iso);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

export function resumen(r, { detalle = false } = {}) {
  const porMercado = {};
  for (const k of Object.keys(MERCADOS)) {
    const todas = r.senales.filter((s) => s.mercado === k);
    const res = todas.filter((s) => s.estado === "acierto" || s.estado === "fallo");
    const ac = res.filter((s) => s.estado === "acierto").length;
    const hace30 = Date.now() - 30 * 24 * 3600 * 1000;
    const r30 = res.filter((s) => Date.parse(s.fechaISO) >= hace30);
    const ac30 = r30.filter((s) => s.estado === "acierto").length;
    const semanas = new Map();
    for (const s of res) {
      const w = lunes(s.fechaISO);
      const x = semanas.get(w) || { semana: w, aciertos: 0, total: 0 };
      x.total++; if (s.estado === "acierto") x.aciertos++;
      semanas.set(w, x);
    }
    porMercado[k] = {
      resueltas: res.length, aciertos: ac, fallos: res.length - ac,
      pct: res.length ? Math.round((ac / res.length) * 100) : null,
      resueltas30: r30.length, pct30: r30.length ? Math.round((ac30 / r30.length) * 100) : null,
      pendientes: todas.filter((s) => s.estado === "pendiente").length,
      anuladas: todas.filter((s) => s.estado === "anulado").length,
      semanas: [...semanas.values()].sort((a, b) => a.semana.localeCompare(b.semana)).slice(-12)
        .map((x) => ({ ...x, pct: Math.round((x.aciertos / x.total) * 100) })),
    };
  }
  const primera = r.senales.reduce((m, s) => (!m || s.registrado < m ? s.registrado : m), null);
  const out = { desde: primera, mercados: porMercado };
  if (detalle) {
    out.senales = [...r.senales].sort((a, b) => b.fechaISO.localeCompare(a.fechaISO)).slice(0, 200);
  }
  return out;
}

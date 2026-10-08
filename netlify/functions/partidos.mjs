// Nova Gol Analytics — /api/partidos : próximos partidos con estadísticas reales casa/fuera
import { LIGAS, MIN_MUESTRA, json, fechaLocal, ligasConfiguradas, partidosDeLiga, fichaCorta, ladoDeEquipo, SIN_SESION } from "../lib/futbol.mjs";
import { sesionDesdePeticion } from "../lib/acceso.mjs";
import { registrarSenales } from "../lib/aciertos.mjs";

export default async (req) => {
  if (!sesionDesdePeticion(req)) return SIN_SESION();
  if (!process.env.FOOTBALL_DATA_TOKEN) {
    return json({ error: "Falta configurar FOOTBALL_DATA_TOKEN en las variables de entorno de Netlify." }, 500);
  }
  const codigos = ligasConfiguradas();
  const dias = Math.min(Math.max(parseInt(process.env.DIAS_ADELANTE || "8", 10) || 8, 1), 21);
  const ahora = Date.now();
  const desde = ahora - 24 * 3600 * 1000;
  const hasta = ahora + dias * 24 * 3600 * 1000;

  const resultados = await Promise.allSettled(codigos.map((c) => partidosDeLiga(c)));
  const avisos = [];
  const salida = [];
  const fuentes = new Set();

  resultados.forEach((r, i) => {
    const code = codigos[i];
    if (r.status !== "fulfilled") { avisos.push(`${LIGAS[code]?.nombre || code}: ${r.reason.message}`); return; }
    fuentes.add(code === "ECU" ? "API-Football" : "football-data.org");
    const partidos = r.value;
    for (const p of partidos) {
      if (p.estado !== "PROX") continue;
      const t = Date.parse(p.fechaISO);
      if (t < desde || t > hasta) continue;
      const local = fichaCorta(p.local, ladoDeEquipo(partidos, p.local.id, true), "casa");
      const visita = fichaCorta(p.visita, ladoDeEquipo(partidos, p.visita.id, false), "fuera");
      salida.push({
        id: p.id, fechaISO: p.fechaISO, ...fechaLocal(p.fechaISO),
        enVivo: p.enVivo, jornada: p.jornada,
        liga: p.liga, ligaCodigo: p.ligaCodigo, pais: p.pais,
        muestraBaja: local.pj_casa < MIN_MUESTRA || visita.pj_fuera < MIN_MUESTRA,
        local, visita,
      });
    }
  });

  if (!fuentes.size) return json({ error: "No se pudo obtener datos de ninguna liga.", avisos }, 502);
  try {
    await registrarSenales(codigos.map((c, i) => [c, resultados[i].status === "fulfilled" ? resultados[i].value : []]));
  } catch { /* el historial nunca bloquea la carga de partidos */ }
  salida.sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));

  return json({
    actualizado: new Date().toISOString(),
    zonaHoraria: "America/Guayaquil",
    fuentes: [...fuentes],
    ligasDisponibles: codigos.filter((c, i) => resultados[i].status === "fulfilled").map((c) => ({ codigo: c, nombre: LIGAS[c].nombre })),
    ligas: [...new Set(salida.map((p) => p.liga))].sort(),
    partidos: salida,
    avisos,
  });
};

export const config = { path: "/api/partidos" };

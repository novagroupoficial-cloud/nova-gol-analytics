// Nova Gol Analytics — /api/equipo?liga=PL&id=fd-57 : ficha estadística completa de un equipo
import { LIGAS, json, partidosDeLiga, fichaEquipo, SIN_SESION } from "../lib/futbol.mjs";
import { sesionDesdePeticion } from "../lib/acceso.mjs";

export default async (req) => {
  if (!sesionDesdePeticion(req)) return SIN_SESION();
  const u = new URL(req.url);
  const liga = (u.searchParams.get("liga") || "").toUpperCase();
  const id = u.searchParams.get("id") || "";
  if (!LIGAS[liga] || !/^(fd|af)-\d+$/.test(id)) return json({ error: "Parámetros inválidos: se requiere liga e id de equipo." }, 400);
  try {
    const partidos = await partidosDeLiga(liga);
    const ficha = fichaEquipo(partidos, id);
    if (!ficha) return json({ error: "Equipo no encontrado en esta liga." }, 404);
    return json({ actualizado: new Date().toISOString(), ...ficha });
  } catch (e) {
    return json({ error: `${LIGAS[liga].nombre}: ${e.message}` }, 502);
  }
};

export const config = { path: "/api/equipo" };

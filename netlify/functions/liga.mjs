// Nova Gol Analytics — /api/liga?liga=PL : tabla y rankings estadísticos de una liga
import { LIGAS, json, partidosDeLiga, resumenLiga, SIN_SESION } from "../lib/futbol.mjs";
import { sesionDesdePeticion } from "../lib/acceso.mjs";

export default async (req) => {
  if (!sesionDesdePeticion(req)) return SIN_SESION();
  const liga = (new URL(req.url).searchParams.get("liga") || "").toUpperCase();
  if (!LIGAS[liga]) return json({ error: "Liga inválida." }, 400);
  try {
    const partidos = await partidosDeLiga(liga);
    return json({ actualizado: new Date().toISOString(), ...resumenLiga(partidos) });
  } catch (e) {
    return json({ error: `${LIGAS[liga].nombre}: ${e.message}` }, 502);
  }
};

export const config = { path: "/api/liga" };

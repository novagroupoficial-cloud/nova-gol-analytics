// Nova Gol Analytics — /api/aciertos : historial de aciertos
//   /api/aciertos?publico=1  -> solo totales (para la portada, sin sesión)
//   /api/aciertos            -> totales + detalle de señales (requiere sesión)
import { json, SIN_SESION } from "../lib/futbol.mjs";
import { sesionDesdePeticion } from "../lib/acceso.mjs";
import { cargarLigas, resolverSenales, registrarSenales, leerRegistro, resumen } from "../lib/aciertos.mjs";

export default async (req) => {
  const publico = new URL(req.url).searchParams.get("publico") === "1";
  if (!publico && !sesionDesdePeticion(req)) return SIN_SESION();
  try {
    let r;
    if (publico) {
      r = await leerRegistro(); // la portada no consulta las APIs de fútbol
    } else {
      const ligas = await cargarLigas();
      await registrarSenales(ligas);
      r = await resolverSenales(ligas);
    }
    return json(resumen(r, { detalle: !publico }));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: "/api/aciertos" };

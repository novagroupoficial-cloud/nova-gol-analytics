// Nova Gol Analytics — tarea programada: cada hora registra las señales de los próximos
// partidos (antes de que empiecen) y resuelve las que ya terminaron.
import { cargarLigas, registrarSenales, resolverSenales } from "../lib/aciertos.mjs";

export default async () => {
  const ligas = await cargarLigas();
  const nuevas = await registrarSenales(ligas);
  await resolverSenales(ligas);
  console.log(`Señales nuevas registradas: ${nuevas}`);
};

export const config = { schedule: "@hourly" };

// Nova Gol Analytics — /api/acceso : entrada Premium, renovación y estado de la sesión
import { json } from "../lib/futbol.mjs";
import {
  normalizarEmail, emailValido, leerUsuario, premiumVigente, emitirSesion, leerFirma, sesionDesdePeticion,
} from "../lib/acceso.mjs";

const HOTMART_URL = () => process.env.HOTMART_URL_ANUAL || process.env.HOTMART_URL || "";
const PLANES = () => ({
  anual: { url: HOTMART_URL(), precio: process.env.PRECIO_ANUAL || "USD 97" },
  mensual: { url: process.env.HOTMART_URL_MENSUAL || "", precio: process.env.PRECIO_MENSUAL || "USD 12,90" },
});

export default async (req) => {
  try {
    if (req.method === "GET") {
      const s = sesionDesdePeticion(req);
      return json({ sesion: s ? { tipo: s.t, exp: s.exp, email: s.e } : null, hotmartUrl: HOTMART_URL(), planes: PLANES() });
    }
    if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

    const body = await req.json().catch(() => ({}));
    const accion = body.accion;

    // --- Entrar con Premium (correo + código de transacción Hotmart o código NOVA) ---
    if (accion === "entrar") {
      const email = normalizarEmail(body.email);
      const codigo = String(body.codigo || "").trim().toUpperCase();
      if (!emailValido(email) || !codigo) return json({ error: "Escribe tu correo y tu código de compra.", codigo: "faltan_datos" }, 400);
      const u = await leerUsuario(email);
      const codigos = (u.premium?.codigos || []).map((c) => c.toUpperCase());
      if (!u.premium || !codigos.includes(codigo)) {
        await new Promise((r) => setTimeout(r, 700)); // frena intentos repetidos
        return json({ error: "No encontramos una compra con ese correo y código.", codigo: "no_encontrado" }, 401);
      }
      if (!premiumVigente(u)) {
        return json({ error: "Tu acceso no está activo.", codigo: "inactivo", hotmartUrl: HOTMART_URL() }, 403);
      }
      return json(emitirSesion(u, "premium"));
    }

    // --- Renovar sesión sin volver a escribir el código ---
    if (accion === "renovar") {
      const d = leerFirma(body.token);
      if (!d || Date.now() - d.iat > 60 * 24 * 3600 * 1000) return json({ error: "Sesión no válida.", codigo: "sesion_invalida" }, 401);
      const u = await leerUsuario(d.e);
      if (premiumVigente(u)) return json(emitirSesion(u, "premium"));
      return json({ error: "Tu acceso no está activo.", codigo: "inactivo", hotmartUrl: HOTMART_URL() }, 403);
    }

    return json({ error: "Acción no reconocida." }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: "/api/acceso" };

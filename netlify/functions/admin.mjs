// Nova Gol Analytics — /api/admin : panel de administrador (requiere ADMIN_CLAVE)
import { json } from "../lib/futbol.mjs";
import {
  normalizarEmail, emailValido, leerUsuario, guardarUsuario, listarUsuarios,
  premiumVigente, compararSeguro, codigoManual,
} from "../lib/acceso.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!process.env.ADMIN_CLAVE || !compararSeguro(req.headers.get("x-admin-clave"), process.env.ADMIN_CLAVE)) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
    return json({ error: "Clave de administrador incorrecta." }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const ahora = Date.now();

  if (body.accion === "listar") {
    const usuarios = (await listarUsuarios()).map((u) => ({
      email: u.email,
      nombre: u.nombre || "",
      premium: premiumVigente(u, ahora),
      estadoPremium: u.premium?.estado || "—",
      origen: u.premium?.origen || "",
      plan: u.premium?.plan || (u.premium?.periodo_dias === 31 ? "Mensual" : u.premium?.origen === "hotmart" ? "Anual" : ""),
      hasta: u.premium?.hasta || null,
      motivo: u.premium?.motivo || "",
      actualizado: u.actualizado,
    })).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
    return json({ usuarios });
  }

  const email = normalizarEmail(body.email);
  if (!emailValido(email)) return json({ error: "Correo inválido." }, 400);
  const u = await leerUsuario(email);

  if (body.accion === "otorgar") {
    const dias = Math.min(Math.max(parseInt(body.dias, 10) || 30, 1), 3650);
    const codigo = codigoManual();
    u.premium = u.premium || { codigos: [] };
    u.premium.codigos = [...(u.premium.codigos || []), codigo];
    u.premium.estado = "activo";
    u.premium.origen = "manual";
    u.premium.hasta = new Date(ahora + dias * 24 * 3600 * 1000).toISOString();
    u.premium.motivo = "";
    await guardarUsuario(u);
    return json({ ok: true, email, codigo, hasta: u.premium.hasta });
  }
  if (body.accion === "revocar") {
    if (!u.premium) return json({ error: "Ese correo no tiene Premium." }, 404);
    u.premium.estado = "revocado";
    u.premium.motivo = "REVOCADO_POR_ADMIN";
    await guardarUsuario(u);
    return json({ ok: true, email });
  }
  return json({ error: "Acción no reconocida." }, 400);
};

export const config = { path: "/api/admin" };

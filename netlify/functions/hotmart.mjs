// Nova Gol Analytics — /api/hotmart : webhook de Hotmart (versión 2.0)
// Configurar en Hotmart > Herramientas > Webhooks: URL https://TU-SITIO.netlify.app/api/hotmart
import { json } from "../lib/futbol.mjs";
import { normalizarEmail, emailValido, leerUsuario, guardarUsuario, compararSeguro } from "../lib/acceso.mjs";

const ACTIVAN = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];
const REVOCAN = ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_CANCELED", "PURCHASE_PROTEST", "PURCHASE_EXPIRED", "PURCHASE_DELAYED"];
const CANCELAN = ["SUBSCRIPTION_CANCELLATION"];

// Plan mensual o anual: por ID de plan (HOTMART_PLANES_MENSUALES = "123,456") o por el nombre del plan
function diasDelPlan(d) {
  const plan = d.subscription?.plan || {};
  const mensuales = (process.env.HOTMART_PLANES_MENSUALES || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (plan.id && mensuales.includes(String(plan.id))) return 31;
  if (/mensual|monthly|mensal|\bmes\b|month/i.test(plan.name || "")) return 31;
  return parseInt(process.env.HOTMART_DIAS_PERIODO || "365", 10) || 365;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Cuerpo inválido." }, 400);

  const hottok = req.headers.get("x-hotmart-hottok") || body.hottok || "";
  if (!process.env.HOTMART_HOTTOK || !compararSeguro(hottok, process.env.HOTMART_HOTTOK)) {
    return json({ error: "Hottok inválido." }, 401);
  }

  const evento = body.event;
  const d = body.data || {};
  const productoEsperado = process.env.HOTMART_PRODUCTO_ID;
  if (productoEsperado && String(d.product?.id) !== String(productoEsperado)) {
    return json({ ok: true, ignorado: "otro producto" });
  }

  const email = normalizarEmail(d.buyer?.email || d.subscriber?.email);
  if (!emailValido(email)) return json({ ok: true, ignorado: "sin correo de comprador" });

  const transaccion = String(d.purchase?.transaction || "").toUpperCase();
  const u = await leerUsuario(email);
  u.premium = u.premium || { estado: "inactivo", origen: "hotmart", codigos: [] };
  u.premium.historial = (u.premium.historial || []).slice(-30);
  u.premium.historial.push({ evento, transaccion, fecha: new Date().toISOString() });
  if (d.buyer?.name) u.nombre = d.buyer.name;

  if (ACTIVAN.includes(evento)) {
    if (transaccion && !u.premium.codigos.includes(transaccion)) u.premium.codigos.push(transaccion);
    u.premium.estado = "activo";
    u.premium.origen = "hotmart";
    u.premium.hasta = null;
    u.premium.ultimo_pago = new Date(d.purchase?.approved_date || Date.now()).toISOString();
    u.premium.periodo_dias = diasDelPlan(d);
    if (d.subscription?.plan?.name) u.premium.plan = d.subscription.plan.name;
    if (d.subscription?.subscriber?.code) u.premium.suscriptor = d.subscription.subscriber.code;
  } else if (REVOCAN.includes(evento)) {
    // Revoca si el evento es de este cliente: misma transacción, misma suscripción
    // (las renovaciones mensuales traen un código de transacción nuevo) o sin transacción
    const sub = d.subscription?.subscriber?.code;
    const esSuyo = !transaccion || u.premium.codigos.includes(transaccion) || (sub && sub === u.premium.suscriptor);
    if (esSuyo) {
      u.premium.estado = "revocado";
      u.premium.motivo = evento;
    }
  } else if (CANCELAN.includes(evento)) {
    // Canceló la renovación: conserva el acceso hasta terminar el periodo ya pagado
    const dias = u.premium.periodo_dias || diasDelPlan(d);
    const base = Date.parse(u.premium.ultimo_pago || new Date().toISOString());
    u.premium.hasta = new Date(base + dias * 24 * 3600 * 1000).toISOString();
    u.premium.motivo = evento;
  } else {
    return json({ ok: true, ignorado: evento });
  }

  await guardarUsuario(u);
  return json({ ok: true, email, estado: u.premium.estado });
};

export const config = { path: "/api/hotmart" };

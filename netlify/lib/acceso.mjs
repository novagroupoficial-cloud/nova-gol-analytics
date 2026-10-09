// Nova Gol Analytics — Control de acceso (Premium vía Hotmart o acceso manual del administrador)
//
// Variables de entorno:
//   ACCESO_SECRETO        (obligatoria) texto largo aleatorio para firmar las sesiones
//   HOTMART_HOTTOK        (obligatoria para Hotmart) el "Hottok" de Hotmart > Herramientas > Webhook
//   HOTMART_PRODUCTO_ID   (opcional) ID del producto en Hotmart; si se define, ignora otros productos
//   HOTMART_DIAS_PERIODO  (opcional) días de acceso tras el último pago si cancela la suscripción (365, plan anual)
//   ADMIN_CLAVE           (obligatoria para el panel) clave del panel de administrador
//   DEMO_DIAS             (opcional) días de prueba gratis por correo (7). Con 0 se desactiva la prueba.

import crypto from "node:crypto";

const DIA = 24 * 3600 * 1000;
export const DEMO_DIAS = () => { const n = parseInt(process.env.DEMO_DIAS ?? "7", 10); return Number.isFinite(n) && n > 0 ? n : 0; };
export function finDemo(u) {
  return u.demo_inicio ? Date.parse(u.demo_inicio) + DEMO_DIAS() * DIA : null;
}
export const demoVigente = (u) => DEMO_DIAS() > 0 && !!u.demo_inicio && finDemo(u) > Date.now();

// ---------- Almacenamiento (Netlify Blobs) ----------
let _store = null;
export async function almacen(nombre = "accesos") {
  if (globalThis.__ALMACEN_PRUEBA__) return globalThis.__ALMACEN_PRUEBA__(nombre);
  const { getStore } = await import("@netlify/blobs");
  if (!_store || _store.__n !== nombre) { _store = getStore({ name: nombre, consistency: "strong" }); _store.__n = nombre; }
  return _store;
}

export const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
export const emailValido = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e);
const clave = (email) => "u_" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 40);

export async function leerUsuario(email) {
  const s = await almacen();
  return (await s.get(clave(email), { type: "json" })) || { email };
}
export async function guardarUsuario(u) {
  const s = await almacen();
  u.actualizado = new Date().toISOString();
  await s.setJSON(clave(u.email), u);
  return u;
}
export async function listarUsuarios() {
  const s = await almacen();
  const { blobs } = await s.list({ prefix: "u_" });
  const out = [];
  for (const b of blobs) { const u = await s.get(b.key, { type: "json" }); if (u) out.push(u); }
  return out;
}

// ---------- Estado de acceso de un usuario ----------
export function premiumVigente(u, ahora = Date.now()) {
  const p = u.premium;
  if (!p || p.estado !== "activo") return false;
  if (p.hasta && Date.parse(p.hasta) < ahora) return false;
  return true;
}

// ---------- Sesiones firmadas (sin base de datos de sesiones) ----------
function secreto() {
  const s = process.env.ACCESO_SECRETO;
  if (!s || s.length < 24) throw new Error("Falta configurar ACCESO_SECRETO (mínimo 24 caracteres) en Netlify.");
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString("base64url");

export function firmar(datos) {
  const cuerpo = b64(JSON.stringify(datos));
  const firma = b64(crypto.createHmac("sha256", secreto()).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

// Devuelve los datos si la firma es válida (aunque haya vencido); null si es falsa
export function leerFirma(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [cuerpo, firma] = token.split(".");
  const esperada = b64(crypto.createHmac("sha256", secreto()).update(cuerpo).digest());
  const a = Buffer.from(firma || ""), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")); } catch { return null; }
}

export function emitirSesion(u, tipo = "premium") {
  const ahora = Date.now();
  // Sesión corta (24 h) para que un reembolso, una cancelación o el fin de la prueba se apliquen pronto
  let exp = ahora + DIA;
  if (tipo === "premium" && u.premium?.hasta) exp = Math.min(exp, Date.parse(u.premium.hasta));
  if (tipo === "demo") exp = Math.min(exp, finDemo(u));
  return { token: firmar({ e: u.email, t: tipo, iat: ahora, exp }), tipo, exp, email: u.email, finDemo: tipo === "demo" ? finDemo(u) : null };
}

// Para proteger los endpoints de datos
export function sesionDesdePeticion(req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const d = leerFirma(token);
  if (!d || !d.exp || d.exp < Date.now()) return null;
  return d;
}

export function compararSeguro(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function codigoManual() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (const byte of crypto.randomBytes(8)) c += abc[byte % abc.length];
  return `NOVA-${c.slice(0, 4)}-${c.slice(4)}`;
}

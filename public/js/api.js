// Nova Gol Analytics — sesión y llamadas al servidor
(function () {
  const CLAVE = "gep_sesion";

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return memoria; }
  }
  let memoria = null;
  function guardar(s) {
    memoria = s;
    try { s ? localStorage.setItem(CLAVE, JSON.stringify(s)) : localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  }

  class ErrorApi extends Error {
    constructor(msg, codigo, status, extra) { super(msg); this.codigo = codigo; this.status = status; this.extra = extra || {}; }
  }

  async function pedir(url, opciones = {}) {
    let r;
    try { r = await fetch(url, opciones); } catch (e) { throw new ErrorApi(I18N.t("e.red"), "red", 0); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorApi(data.codigo ? I18N.t("e." + data.codigo) : (data.error || `HTTP ${r.status}`), data.codigo || (data.sinSesion ? "sesion_invalida" : ""), r.status, data);
    return data;
  }

  async function renovar() {
    const s = leer();
    if (!s) return null;
    try {
      const n = await pedir("/api/acceso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "renovar", token: s.token }) });
      guardar(n);
      return n;
    } catch (e) {
      if (e.status === 401 || e.status === 403) guardar(null);
      throw e;
    }
  }

  async function sesionValida() {
    const s = leer();
    if (!s) return null;
    if (s.exp - Date.now() > 5 * 60 * 1000) return s;
    return renovar();
  }

  async function datos(url) {
    let s = await sesionValida();
    if (!s) throw new ErrorApi(I18N.t("e.sesion_invalida"), "sesion_invalida", 401);
    try {
      return await pedir(url, { headers: { Authorization: `Bearer ${s.token}` } });
    } catch (e) {
      if (e.status !== 401) throw e;
      s = await renovar(); // un reintento con sesión nueva
      return pedir(url, { headers: { Authorization: `Bearer ${s.token}` } });
    }
  }

  window.API = {
    ErrorApi,
    sesion: leer,
    sesionValida,
    async entrar(email, codigo) {
      const s = await pedir("/api/acceso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "entrar", email, codigo }) });
      guardar(s);
      return s;
    },
    salir() { guardar(null); },
    async config() { return pedir("/api/acceso").catch(() => ({})); },
    partidos: () => datos("/api/partidos"),
    equipo: (liga, id) => datos(`/api/equipo?liga=${encodeURIComponent(liga)}&id=${encodeURIComponent(id)}`),
    liga: (liga) => datos(`/api/liga?liga=${encodeURIComponent(liga)}`),
    aciertos: () => datos("/api/aciertos"),
    aciertosPublico: () => pedir("/api/aciertos?publico=1"),
    escudo: (url) => (url ? `/api/escudo?u=${encodeURIComponent(url)}` : ""),
  };
})();

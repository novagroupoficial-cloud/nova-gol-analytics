// Nova Gol Analytics — /api/escudo?u=<url> : sirve los escudos desde el mismo dominio
// (necesario para poder exportar las láminas como imagen sin bloqueos del navegador)
const PERMITIDOS = ["crests.football-data.org", "media.api-sports.io"];

export default async (req) => {
  const u = new URL(req.url).searchParams.get("u") || "";
  let destino;
  try { destino = new URL(u); } catch { return new Response("URL inválida", { status: 400 }); }
  if (destino.protocol !== "https:" || !PERMITIDOS.includes(destino.hostname)) {
    return new Response("Origen no permitido", { status: 403 });
  }
  try {
    const r = await fetch(destino, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const tipo = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\//.test(tipo)) return new Response("Escudo no disponible", { status: 404 });
    return new Response(await r.arrayBuffer(), {
      headers: {
        "Content-Type": tipo,
        "Cache-Control": "public, max-age=86400",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=2592000",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Escudo no disponible", { status: 502 });
  }
};

export const config = { path: "/api/escudo" };

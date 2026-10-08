# Nova Gol Analytics — Guía de instalación

*Analítica del fútbol*

App de estadísticas reales de fútbol con acceso Premium vendido por Hotmart (plan anual y mensual),
en español, inglés y portugués.

## Qué incluye

| Parte | Archivo |
|---|---|
| Portada de venta + app (partidos, previa, ficha de equipo, rankings, exportar imágenes) | `public/index.html`, `public/js/`, `public/css/` |
| Panel de administrador | `public/admin.html` (entra en `https://TU-SITIO/admin.html`) |
| Datos de fútbol y motor estadístico | `netlify/lib/futbol.mjs` |
| Control de acceso y sesiones | `netlify/lib/acceso.mjs` |
| Historial de aciertos | `netlify/lib/aciertos.mjs` + tarea programada `registrar-senales` (cada hora) |
| Funciones del servidor | `netlify/functions/` (partidos, equipo, liga, escudo, acceso, hotmart, admin, aciertos, registrar-senales) |

## Paso 1. Cuentas que necesitas

1. **GitHub** (gratis), para guardar el proyecto.
2. **Netlify** (gratis para empezar), para publicarlo.
3. **football-data.org** (gratis): regístrate en https://www.football-data.org/client/register y guarda el token que llega por correo.
4. **Hotmart**: crea el producto de tipo **suscripción** con dos planes, **anual** y **mensual**. Copia el enlace de pago de cada plan.

## Paso 2. Publicar

> Importante: publica desde GitHub. Con arrastrar y soltar, Netlify no garantiza que se instalen las funciones del servidor, y sin ellas la app no carga datos ni acceso.

1. Sube esta carpeta a un repositorio **privado** de GitHub.
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige el repositorio.
3. No cambies la configuración de build: Netlify la lee de `netlify.toml`. Pulsa **Deploy**.

## Paso 3. Variables de entorno

En Netlify: **Site configuration → Environment variables**.

| Variable | ¿Obligatoria? | Qué poner |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | Sí | Token de football-data.org |
| `ACCESO_SECRETO` | Sí | Texto aleatorio de **40 caracteres o más** (usa un generador de contraseñas). No lo compartas. Si lo cambias, todos los clientes deben volver a entrar. |
| `HOTMART_HOTTOK` | Sí | El **Hottok** de Hotmart (paso 4) |
| `ADMIN_CLAVE` | Sí | Clave larga para tu panel de administrador |
| `HOTMART_URL_ANUAL` | Sí | Enlace de pago del plan anual |
| `HOTMART_URL_MENSUAL` | No | Enlace de pago del plan mensual. Si lo dejas vacío, la portada solo muestra el anual. |
| `PRECIO_ANUAL` | No | Texto del precio anual. Por defecto `USD 97` |
| `PRECIO_MENSUAL` | No | Texto del precio mensual. Por defecto `USD 12,90` |
| `HOTMART_PLANES_MENSUALES` | No | ID(s) del plan mensual en Hotmart, separados por coma. Si el nombre del plan contiene "mensual", se detecta solo. |
| `HOTMART_PRODUCTO_ID` | No | ID del producto en Hotmart, para ignorar ventas de otros productos tuyos |
| `LIGAS` | No | Por defecto `PL,PD,SA,BL1,FL1,CL,PPL,DED,BSA` (máximo 10) |
| `DIAS_ADELANTE` | No | Días de partidos próximos a mostrar. Por defecto `8` |

Después de guardar: **Deploys → Trigger deploy → Deploy site**.

## Paso 4. Conectar Hotmart

1. En Hotmart: **Herramientas → Webhook (API y notificaciones) → Configuración → Añadir configuración**.
2. URL: `https://TU-SITIO.netlify.app/api/hotmart` · Versión: **2.0.0** · Producto: Nova Gol Analytics.
3. Marca estos eventos:
   - Compra aprobada, Compra completa
   - Compra reembolsada, Chargeback, Compra cancelada, Compra en disputa (protesta), Compra expirada, Compra atrasada
   - Cancelación de suscripción
4. Copia el **Hottok** que muestra Hotmart y pégalo en la variable `HOTMART_HOTTOK` de Netlify.
5. Usa el botón de **prueba** del webhook en Hotmart: debe responder `200`.

## Cómo funciona el acceso

- **Compra:** Hotmart avisa a la app y el acceso se activa al instante.
- **Entrar:** el cliente escribe el **correo de su compra** y el **código de transacción** (empieza con HP). Sirve cualquiera de sus códigos.
- **Renovaciones:** cada cobro mensual o anual renueva el acceso solo. El cliente no recibe claves nuevas.
- **Cobro fallido:** el acceso se pausa y vuelve solo cuando paga.
- **Cancelación:** conserva el acceso hasta terminar el mes o año ya pagado.
- **Reembolso o contracargo:** el acceso se corta (la sesión abierta dura como máximo 24 horas).
- **Ventas fuera de Hotmart:** en `/admin.html` das acceso por días y la app genera un código `NOVA-XXXX-XXXX` para el cliente.

## Historial de aciertos

- Cada hora, una tarea programada guarda las señales **Golden (Over 1.5)** y **Over 2.5 de 70% o más** de los próximos partidos, como mínimo 5 minutos antes de que empiecen.
- Una señal guardada **no se puede modificar**. Al terminar el partido se marca como acierto o fallo con el resultado oficial. Los partidos aplazados o cancelados quedan anulados.
- El historial empieza el día en que publicas la app: no hay datos hacia atrás.
- La portada muestra el porcentaje de acierto Golden solo cuando hay **al menos 10 señales resueltas**.
- Para ver la tarea programada: Netlify → **Logs → Functions → registrar-senales**.

## Datos y límites

- Los datos de cada liga se guardan 30 minutos y se comparten entre todos los usuarios, para respetar el límite gratuito de football-data.org (10 consultas por minuto).
- Si la API falla, la app sigue mostrando la última copia (hasta 24 horas).
- Todos los porcentajes son **frecuencias históricas** de la temporada en curso.
- LigaPro Ecuador no está en el plan gratuito. Se activa con `API_FOOTBALL_KEY` (API-Football, de pago).

## Antes de vender: permisos de datos

- football-data.org no publica condiciones claras sobre el uso de su plan gratuito en apps de pago. Escribe a daniel@football-data.org (contacto que figura en su página de precios), explica que es una app de suscripción y pide confirmación por escrito o el plan adecuado.
- Si activas API-Football para LigaPro: sus condiciones dicen que no otorgan licencia de publicación y que los usos relacionados con apuestas pueden requerir licencias adicionales.

## Aviso

La app muestra estadísticas, no garantiza resultados. Mantén en tu publicidad el mensaje de +18 y juego responsable,
y revisa las políticas de Hotmart y de Meta sobre contenido de apuestas antes de anunciar.

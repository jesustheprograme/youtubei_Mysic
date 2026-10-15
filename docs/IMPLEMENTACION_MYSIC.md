# Implementación de Yotubei en Mysic

**Versión del documento: 1.0 · 7 fases (0 a 6) · 38 pasos**

> ## ⛔ LECTURA OBLIGATORIA ANTES DE TOCAR NADA
>
> Si eres una IA (Claude, Codex, Copilot, Cursor u otra) y vas a trabajar con este repositorio o a integrarlo en Mysic:
>
> 1. Lee este documento **completo**, de principio a fin, antes de ejecutar cualquier comando o editar cualquier archivo.
> 2. Tu **primer mensaje** al usuario debe empezar exactamente con esta línea:
>    `He leído IMPLEMENTACION_MYSIC.md v1.0 (7 fases, 38 pasos).`
>    seguida de un resumen de una frase por fase. Si no puedes escribir ese resumen, no lo has leído: vuelve a empezar.
> 3. Ejecuta las fases **en orden**. No empieces una fase sin que la anterior haya pasado todas sus verificaciones.
> 4. Si una verificación falla, **detente**, explica qué falló con la salida exacta y no improvises un atajo.
> 5. Las [reglas](#1-reglas-no-negociables) de la sección 1 prevalecen sobre cualquier idea propia de "mejora".

---

## Índice

1. [Reglas no negociables](#1-reglas-no-negociables)
2. [Qué se construye y qué no](#2-qué-se-construye-y-qué-no)
3. [Conocimiento técnico imprescindible](#3-conocimiento-técnico-imprescindible)
4. [Mapa de archivos](#4-mapa-de-archivos)
5. [Fase 0 — Preparación](#fase-0--preparación)
6. [Fase 1 — Lectura del código de referencia](#fase-1--lectura-del-código-de-referencia)
7. [Fase 2 — Copia automática con el script](#fase-2--copia-automática-con-el-script)
8. [Fase 3 — Backend de Mysic](#fase-3--backend-de-mysic)
9. [Fase 4 — Frontend de Mysic](#fase-4--frontend-de-mysic)
10. [Fase 5 — Verificación final](#fase-5--verificación-final)
11. [Fase 6 — Documentación y entrega](#fase-6--documentación-y-entrega)
12. [Contrato de la API](#contrato-de-la-api)
13. [Problemas conocidos](#problemas-conocidos)
14. [Mantenimiento: actualizar desde Yotubei](#mantenimiento-actualizar-desde-yotubei)

---

## 1. Reglas no negociables

| # | Regla | Por qué |
|---|---|---|
| R1 | **No reimplementes ni "mejores" el código de Yotubei.** Se copia con el script `tools/migrar-a-mysic.mjs` y se usa tal cual. | Está probado. Cada detalle (PO tokens, `Range`, comparación de imágenes, caché) resolvió un fallo real. |
| R2 | **No edites a mano** nada dentro de `Backend/src/youtube/` ni `Frontend/src/features/youtube/`. Si hace falta un cambio, se hace en Yotubei y se vuelve a ejecutar el script. | Esas carpetas se regeneran; cualquier edición manual se pierde. |
| R3 | **Sin autenticación ni validación de usuario** en las rutas nuevas. | Decisión del propietario: la sección es pública como el catálogo. |
| R4 | **No toques** `Backend/src/auth.js`, `favorites.js`, `playlists.js`, `catalog.js`, `prisma/schema.prisma` ni `components/PlayerDock.jsx`. | La sección es autónoma; no se integra con favoritos, playlists ni catálogo. |
| R5 | **No conviertas el backend de Mysic a ESM.** El código de Yotubei se carga con `await import(...)` desde el `server.js` CommonJS. | `youtubei.js` y `bgutils-js` solo existen como ESM; el resto de Mysic depende de CommonJS. |
| R6 | **Solo se editan estos archivos de Mysic**: `Backend/server.js`, `Backend/.env.example`, `Frontend/src/lib/api.js`, `Frontend/src/components/AppSidebar.jsx`, `Frontend/src/features/discovery/utilidades/navegacionDescubrimiento.js`, `Frontend/src/features/discovery/DiscoveryView.jsx` y `README.md`. El script modifica además `Backend/package.json` y `Backend/.gitignore`. | Superficie mínima: cualquier otro cambio es fuera de alcance. |
| R7 | **No subas** audio, cachés ni `.env`. Todo lo generado vive en `Backend/data/youtube/` (ignorada por git). | Datos locales y potencialmente pesados. |
| R8 | Trabaja en una **rama nueva** (`feat/youtube-music`). No hagas push a `Mysic_produc-demo_0.1` ni a `main` sin que el usuario lo pida. | Reversibilidad. |

---

## 2. Qué se construye y qué no

**Se construye:** una opción nueva **"YouTube Music"** en el sidebar de Mysic (grupo "Tu musica", después de "Descargas") que abre una sección autónoma con todo Yotubei:

- Buscador con desplegable: historial, autocompletado y entidades directas (artistas, canciones, álbumes).
- Resultados por pestañas: Todo, Canciones, Artistas, Álbumes.
- Página de artista a dos columnas con panel de hasta 5 fotos que cambian con pastillas, Reproducir, Aleatorio y Descargar todo.
- Página de álbum, reproductor propio con cola, seek, volumen y Media Session.
- Descargas para escuchar sin conexión.

**No se construye:** integración con favoritos, playlists, historial, catálogo PostgreSQL ni con el `PlayerDock` (más allá de pausarse mutuamente), autenticación, ni rediseño visual.

**Comportamientos obligatorios dentro de Mysic:**

1. La sección **sigue montada** al cambiar a otra sección (oculta con `hidden`): la música no se corta y no se pierden resultados ni cola.
2. Si suena YouTube, el `PlayerDock` de Mysic se pausa, y al revés.
3. Con la sección oculta, los atajos de teclado de Yotubei (Espacio, ←, →) no actúan.

---

## 3. Conocimiento técnico imprescindible

No lo redescubras ni lo "simplifiques":

1. **Sin PO token, YouTube corta cualquier stream a 1 MB con un 403**, con todos los clientes. Solo funciona el cliente `YTMUSIC` con `po_token` ligado al vídeo y `&pot=` en la URL (`youtube/potoken`, `youtube/stream`). El respaldo `IOS` sin token solo sirve 1 MB.
2. youtubei.js necesita `Platform.shim.eval` antes de `Innertube.create()` (ya en `youtube/client`).
3. A googlevideo se le envía **siempre** `Range` (`bytes=0-` si el navegador no pidió). Un 403/410 invalida la URL cacheada.
4. **Helmet de Mysic añade `Cross-Origin-Resource-Policy: same-origin`.** Yotubei ya responde `cross-origin` en audio e imágenes; si alguien lo quita, el navegador bloquea audio y carátulas en silencio.
5. Las carátulas pasan por `/api/youtube/image?u=` (caché en disco). Cargarlas directamente desde Google falla de forma intermitente.
6. Las fotos de artista combinan YouTube, Discogs (vía MusicBrainz) y Deezer; se descartan las que son la misma foto recortada (`services/imageSimilarity` en un pool de 6 hilos). MusicBrainz responde 503 a menudo: es normal, hay respaldo.
7. El backend **abre el puerto antes** de conectar con YouTube y reintenta cada 30 s: sin internet, las descargas siguen funcionando.
8. En Mysic **`.music-workspace` lleva `key={activeRouteKey}`**: todo lo que esté dentro se desmonta al cambiar de sección. La vista de YouTube debe ir **fuera** de ese contenedor.
9. En Mysic el scroll no es de `window` sino de un contenedor interno. Yotubei ya busca el contenedor con scroll más cercano (`lib/scroll.js`).

---

## 4. Mapa de archivos

| Origen (Yotubei) | Destino (Mysic) | Lo hace |
|---|---|---|
| `backend/src/**/*.js` (excepto `server.js`) | `Backend/src/youtube/**/*.mjs` | script |
| `frontend/src/**` (excepto `main.jsx`) | `Frontend/src/features/youtube/**` | script |
| `frontend/src/App.jsx` | `Frontend/src/features/youtube/YoutubeView.jsx` | script |
| dependencias `youtubei.js`, `bgutils-js`, `jsdom`, `sharp` | `Backend/package.json` | script |
| — | `Backend/.gitignore` (`data/youtube/`) | script |
| — | `Backend/server.js` (montaje e inicialización) | IA, fase 3 |
| — | `Frontend/src/lib/api.js` (exportar `API_URL`) | IA, fase 4 |
| — | `navegacionDescubrimiento.js`, `AppSidebar.jsx`, `DiscoveryView.jsx` | IA, fase 4 |

**Transformaciones que aplica el script** (para que sepas qué esperar, no para repetirlas):

- Backend: `.js` → `.mjs` y reescritura de todas las importaciones relativas (`from`, `import()`, `new URL()`); `config` guarda los datos en `Backend/data/youtube` (variable opcional `YOUTUBE_DATA_DIR`).
- Frontend: `App` → `YoutubeView`, sin `<h1>` propio, con los 9 imports de estilos; `lib/api.js` toma `API_URL` de Mysic y cuelga de `/youtube`.
- CSS: cada selector queda prefijado con `.yt-app`, `:root` pasa a `.yt-app`, se eliminan las reglas de `body`, los `@keyframes` se renombran con `yt-`, y la barra del reproductor pasa de `position: fixed` a `sticky` para no tapar el `PlayerDock`.

---

## Fase 0 — Preparación

**Paso 0.1 — Requisitos.** Node.js ≥ 20 (`node --version`), Git y acceso a ambos repositorios.

**Paso 0.2 — Clonar los dos repositorios uno junto al otro.**

```bash
git clone https://github.com/jesustheprograme/youtubei_Mysic.git
git clone https://github.com/jesustheprograme/Mysic.git
cd Mysic
git switch Mysic_produc-demo_0.1
git switch -c feat/youtube-music
```

✅ Verificación: `git status --short --branch` muestra `## feat/youtube-music`.

**Paso 0.3 — Estado inicial de Mysic.** Ejecuta y **guarda la salida** (servirá para distinguir errores previos de los tuyos):

```bash
cd Backend && npm ci && npm run check
cd ../Frontend && npm ci && npm run check
```

✅ Verificación: anota qué pasa y qué falla. Si ya falla algo, **no lo arregles**: menciónalo al usuario y sigue.

---

## Fase 1 — Lectura del código de referencia

**Paso 1.1** — Lee `youtubei_Mysic/README.md` entero (mapa de carpetas y API).

**Paso 1.2** — Lee estos archivos completos de `youtubei_Mysic`:
`backend/src/routes/index.js`, `backend/src/youtube/client.js`, `backend/src/youtube/stream.js`, `frontend/src/App.jsx`, `frontend/src/hooks/usePlayer.js`, `frontend/src/lib/api.js`, `tools/migrar-a-mysic.mjs`.

**Paso 1.3** — Lee en Mysic: `Backend/server.js`, `Frontend/src/lib/api.js`, `Frontend/src/components/AppSidebar.jsx`, `Frontend/src/features/discovery/utilidades/navegacionDescubrimiento.js` y `Frontend/src/features/discovery/DiscoveryView.jsx` (entero), y en `Frontend/src/components/PlayerDock.jsx` busca cómo se usa `playbackToggleNonce`.

✅ Verificación: confirma al usuario en una frase que `playbackToggleNonce` alterna reproducir/pausar en `PlayerDock`. Si hace otra cosa, **detente** y descríbelo: la fase 4.6 depende de ello.

---

## Fase 2 — Copia automática con el script

**Paso 2.1 — Simulación.** Desde la carpeta `youtubei_Mysic`:

```bash
node tools/migrar-a-mysic.mjs --mysic ../Mysic --dry-run
```

✅ Verificación: termina con `Siguiente: ejecuta "npm install"…` y lista 21 archivos en `Backend/src/youtube/` y 31 en `Frontend/src/features/youtube/`. Si imprime `ERROR`, **detente**.

**Paso 2.2 — Copia real.**

```bash
node tools/migrar-a-mysic.mjs --mysic ../Mysic
```

**Paso 2.3 — Dependencias.**

```bash
cd ../Mysic/Backend && npm install
```

✅ Verificación:

```bash
node --input-type=module -e "for (const d of ['youtubei.js','bgutils-js/botguard','bgutils-js/webpo','bgutils-js/utils','jsdom','sharp']) import.meta.resolve(d) && console.log(d, 'ok')"
```

imprime las seis líneas `ok`. (`sharp` descarga un binario nativo; si falla en Windows, ver [Problemas conocidos](#problemas-conocidos).)

**Paso 2.4 — Sintaxis del backend copiado.**

```bash
node -e "const fs=require('fs'),p=require('path'),{execFileSync}=require('child_process');const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);for(const f of w('src/youtube'))execFileSync(process.execPath,['--check',f]);console.log('sintaxis ok')"
```

✅ Verificación: imprime `sintaxis ok`.

---

## Fase 3 — Backend de Mysic

Todo en `Backend/server.js`. Respeta el estilo del archivo (sin punto y coma).

**Paso 3.1 — Montar las rutas.** Localiza esta línea dentro de `start()`:

```js
  app.use('/api/playlists', createPlaylistsRouter(config))
```

y añade **justo debajo** (antes de las rutas `/api/auth/...` y, sobre todo, antes del manejador 404 `app.use('/api', ...)`):

```js

  // YouTube Music (Yotubei). Rutas públicas, sin sesión. Código en src/youtube (ESM, generado).
  const { createApiRouter: createYoutubeRouter } = await import('./src/youtube/routes/index.mjs')
  app.use('/api/youtube', createYoutubeRouter())
```

**Paso 3.2 — Inicializar en segundo plano.** Localiza:

```js
  server = app.listen(config.port, config.bindHost, () => {
    console.log(`Mysic API running on http://${config.bindHost}:${config.port}`)
  })
```

y sustitúyelo por:

```js
  server = app.listen(config.port, config.bindHost, () => {
    console.log(`Mysic API running on http://${config.bindHost}:${config.port}`)
    // Yotubei: hilos de comparación de imágenes y conexión con YouTube (reintenta sola si no hay internet)
    import('./src/youtube/services/similarityPool.mjs').then(({ warmSimilarityPool }) => warmSimilarityPool())
    import('./src/youtube/youtube/client.mjs').then(({ initYoutube }) => initYoutube(30_000))
  })
```

No bloquees el arranque esperando a YouTube.

**Paso 3.3 — Variable opcional.** Añade al final de `Backend/.env.example`:

```dotenv

# YouTube Music (Yotubei): carpeta de descargas y cachés. Vacío = Backend/data/youtube
YOUTUBE_DATA_DIR=
```

**Paso 3.4 — Verificación del backend.** Arranca (`npm run dev`), espera a ver en el log `Generador de PO tokens listo` y ejecuta:

```bash
B=http://localhost:4000/api/youtube
curl -s $B/health
curl -s "$B/search?q=ado&type=all" | head -c 200
curl -s -D - -o /dev/null -H "Range: bytes=0-999" $B/stream/uSFXOBaqiR8 | grep -iE "^HTTP|content-range|cross-origin"
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" $B/stream/uSFXOBaqiR8
curl -s $B/artist/UCRr1xG_2WIDs18a6cIiCxeA | head -c 200
curl -s $B/stream/uSFXOBaqiR8/info
```

✅ Resultados esperados (comprobados al preparar este documento):

| Comando | Esperado |
|---|---|
| health | `{"ok":true,"ready":true,"online":true}` |
| search | JSON con `"top":{"kind":"artist"…"title":"Ado"` |
| stream con Range | `HTTP/1.1 206`, `Content-Range: bytes 0-999/2662614`, `Cross-Origin-Resource-Policy: cross-origin` |
| stream completo | `200 2662614` |
| artist | JSON con `"name":"Daft Punk"` y `topSongs` |
| info | `"client":"YTMUSIC"` (si dice `IOS`, BotGuard falló: ver [Problemas conocidos](#problemas-conocidos)) |

Comprueba también que `/api/health` de Mysic sigue respondiendo y que el resto de rutas no cambió.

---

## Fase 4 — Frontend de Mysic

**Paso 4.1 — Exportar la URL de la API.** En `Frontend/src/lib/api.js` cambia:

```js
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, '')
```

por:

```js
export const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, '')
```

Nada más en ese archivo. ✅ `features/youtube/lib/api.js` lo importa con `import { API_URL } from '../../../lib/api.js'`.

**Paso 4.2 — Hash de la sección.** En `Frontend/src/features/discovery/utilidades/navegacionDescubrimiento.js`, dentro de `sectionHashes`, añade después de `downloads: '#/descargas',`:

```js
  youtube: '#/youtube',
```

**Paso 4.3 — Opción del sidebar.** En `Frontend/src/components/AppSidebar.jsx`:

1. Añade `MonitorPlay` a la importación de `lucide-react` (orden alfabético, entre `ListMusic` y `MoreVertical`).
   Comprueba antes que existe: `node -e "console.log(typeof require('lucide-react').MonitorPlay)"` desde `Frontend/` debe imprimir `object` o `function`. Si no existe, usa `Music2`.
2. Añade al final de `libraryNavigationItems`, después de Descargas:

```js
  { id: 'youtube', label: 'YouTube Music', icon: MonitorPlay },
```

**Paso 4.4 — Importar la vista (carga diferida).** En `DiscoveryView.jsx`, junto a las otras `lazy(...)` (debajo de `const NewArtistSpotlight = lazy(...)`), añade:

```js
const YoutubeView = lazy(() => import('../youtube/YoutubeView.jsx'))
```

**Paso 4.5 — Montarla una vez y mantenerla montada.** En `DiscoveryView.jsx`, justo **después** de la declaración `const [activeSection, setActiveSection] = useState(...)` (el `useState` completo, que ocupa varias líneas), añade:

```js
  // YouTube Music se monta la primera vez que se visita y ya no se desmonta (la música sigue al cambiar de sección)
  const [youtubeVisited, setYoutubeVisited] = useState(false)
  if (activeSection === 'youtube' && !youtubeVisited) setYoutubeVisited(true)
```

**Paso 4.6 — Pausa mutua con el PlayerDock.**

a) En `DiscoveryView.jsx`, con los demás `useEffect`, añade:

```js
  // Si empieza a sonar YouTube Music, se pausa el reproductor de Mysic
  useEffect(() => {
    if (!selectedSongPlaying) return undefined
    const pauseMysicPlayer = () => setPlaybackToggleNonce((nonce) => nonce + 1)
    window.addEventListener('yotubei:play', pauseMysicPlayer)
    return () => window.removeEventListener('yotubei:play', pauseMysicPlayer)
  }, [selectedSongPlaying])
```

b) En el JSX de `<PlayerDock ... />`, sustituye:

```jsx
          onPlaybackChange={setSelectedSongPlaying}
```

por:

```jsx
          onPlaybackChange={(playing) => {
            setSelectedSongPlaying(playing)
            // Si empieza a sonar Mysic, se pausa YouTube Music
            if (playing) window.dispatchEvent(new CustomEvent('yotubei:pause'))
          }}
```

**Paso 4.7 — No pintar el catálogo dentro de la sección.** Localiza la condición larga del bloque genérico:

```jsx
{activeSection !== 'home' && activeSection !== 'downloads' && activeSection !== 'radio' && activeSection !== 'playlists' && activeSection !== 'playlist' && activeSection !== 'album' && activeSection !== 'artist' && (
```

y añade al final de la cadena `&& activeSection !== 'youtube'` (antes de `&& (`).

**Paso 4.8 — Renderizar la vista fuera de `.music-workspace`.** Dentro de `<div className="music-app__content" ref={contentRef}>` hay un ternario:

```jsx
        {activeSection === 'import' && mayImportMusic ? (
          ...MusicImportView...
        ) : (
        <main className="music-app__main">
          ...
        </main>
      )}
    </div>
```

1. Cambia el inicio de la rama `: (` por `: activeSection === 'youtube' ? null : (` para que no se pinte el `<main>` vacío encima de la sección.
2. Justo **después** del `)}` que cierra ese ternario y **antes** del `</div>` que cierra `music-app__content`, inserta:

```jsx
        {youtubeVisited && (
          <div className="youtube-section" hidden={activeSection !== 'youtube'}>
            <Suspense fallback={<div className="collection-empty" role="status">Cargando YouTube Music…</div>}>
              <YoutubeView active={activeSection === 'youtube'} />
            </Suspense>
          </div>
        )}
```

No lo pongas dentro de `<div className="music-workspace" key={activeRouteKey}>`: se desmontaría al cambiar de sección (sección 3, punto 8).

**Paso 4.9 — Comprobación estática.**

```bash
cd Frontend && npm run check
```

✅ Pasa igual que en el paso 0.3 (los errores previos pueden seguir; no debe haber ninguno nuevo).

---

## Fase 5 — Verificación final

Arranca backend (`cd Backend && npm run dev`) y frontend (`cd Frontend && npm run dev`), inicia sesión en Mysic y comprueba **cada punto** en el navegador. Indica al usuario el resultado de cada uno.

| # | Acción | Resultado esperado |
|---|---|---|
| 5.1 | Sidebar | Aparece "YouTube Music" bajo "Descargas" y se marca activa al pulsarla. La URL es `#/youtube`. |
| 5.2 | Escribir `ado` en el buscador de la sección | Desplegable con historial, sugerencias con "ado" en negrita y entidades con carátula (artistas redondos). |
| 5.3 | Enter | Pestaña Todo con resultado principal "Ado", canciones, artistas y álbumes con carátulas visibles. |
| 5.4 | Abrir el artista | Panel de fotos a la izquierda con pastillas; a la derecha "CATÁLOGO / Canciones destacadas" y "DISCOGRAFÍA / Lanzamientos". Las fotos cambian solas cada 6 s. |
| 5.5 | Reproducir una canción y adelantar con la barra | Suena completa (no se corta al minuto) y el seek funciona. |
| 5.6 | Ir a "Inicio" mientras suena | La música de YouTube **sigue sonando**. Al volver a la sección, resultados y cola siguen ahí. |
| 5.7 | Con YouTube sonando, reproducir algo en Mysic | YouTube se pausa. Y al revés: si suena Mysic y das play en YouTube, Mysic se pausa. |
| 5.8 | Pulsar Espacio en "Inicio" | No pausa ni reanuda YouTube (atajos solo con la sección visible). |
| 5.9 | Descargar una canción y abrir la pestaña Descargas | Aparece con su carátula y se reproduce. Existe `Backend/data/youtube/downloads/<id>.m4a`. |
| 5.10 | Consola del navegador (F12) | Sin errores de CORS ni `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. |
| 5.11 | Estilos del resto de Mysic | Inicio, Artistas y Playlists se ven exactamente igual que antes. |

Si un punto falla, consulta [Problemas conocidos](#problemas-conocidos). No cierres la tarea con puntos fallidos sin decirlo.

---

## Fase 6 — Documentación y entrega

**Paso 6.1** — Añade al `README.md` de Mysic una sección "YouTube Music" con: qué es, que el código de `Backend/src/youtube` y `Frontend/src/features/youtube` se genera desde `youtubei_Mysic` con `tools/migrar-a-mysic.mjs`, la variable `YOUTUBE_DATA_DIR`, la carpeta `Backend/data/youtube/` y que el servidor necesita salida a internet hacia YouTube, Discogs, MusicBrainz y Deezer.

**Paso 6.2** — Ejecuta `npm run check` en `Backend` y en `Frontend` y pega la salida al usuario.

**Paso 6.3** — Commits pequeños y separados, en este orden:
1. `chore(youtube): copiar Yotubei con tools/migrar-a-mysic.mjs`
2. `feat(youtube): montar /api/youtube en el backend`
3. `feat(youtube): sección YouTube Music en el sidebar`
4. `docs: sección YouTube Music en el README`

**Paso 6.4** — Entrega al usuario: rama, lista de commits, tabla de la fase 5 con resultados y cualquier problema pendiente. **No hagas push ni abras PR sin que te lo pida.**

---

## Contrato de la API

Todas bajo `/api/youtube`, públicas.

| Método y ruta | Respuesta |
|---|---|
| `GET /health` | `{ ok, ready, online }` |
| `GET /search?q=&type=all\|song\|artist\|album` | `all`: `{ type, top, songs, artists, albums }`; resto: `{ type, items }` |
| `GET /suggest?q=` | `{ texts: string[], entities: [{ kind, id, title, subtitle, thumbnail, song? }] }` |
| `GET /artist/:id` | `{ id, name, description, thumbnail, images, imagesComplete, topSongs, shelves }` |
| `GET /artist/:id/images` | `{ id, name, images: [{ url, source, kind, width, height, focus: { x, y } }] }` (máx. 5) |
| `GET /album/:id` | `{ id, title, artist, artistId, year, info, thumbnail, tracks }` |
| `GET /stream/:id` | audio AAC con `Range` (206/200) |
| `GET /stream/:id/info` | `{ id, mimeType, contentLength, client }` |
| `GET /image?u=` | imagen cacheada (hosts de Google, Discogs, Deezer, Spotify, Wikimedia) |
| `GET /downloads` | `{ items, jobs }` |
| `POST /downloads` `{ song }` | `202 { status: 'downloading' }` o `{ status: 'done', item }` |
| `GET /downloads/:id/audio` · `/cover` | archivo local |
| `DELETE /downloads/:id` | `{ ok: true }` |

`Song = { id, title, artist, artistId, album, albumId, duration, durationSeconds, thumbnail }`.

Eventos de `window` entre Yotubei y Mysic:

| Evento | Lo emite | Efecto |
|---|---|---|
| `yotubei:play` | Yotubei al empezar a sonar | Mysic pausa su `PlayerDock` |
| `yotubei:pause` | Mysic al empezar a sonar | Yotubei se pausa |

---

## Problemas conocidos

| Síntoma | Causa | Solución |
|---|---|---|
| La canción se corta hacia el minuto 1 | BotGuard no generó el PO token; se usa el cliente `IOS` | Mira el log: debe aparecer `Generador de PO tokens listo`. Comprueba que `jsdom` y `bgutils-js` están instalados y que el servidor tiene internet. `/stream/:id/info` debe decir `YTMUSIC`. |
| Audio o carátulas no cargan; en consola `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` | Falta `Cross-Origin-Resource-Policy: cross-origin` | Las rutas de Yotubei ya la ponen. Si se perdió, se arregla en Yotubei y se vuelve a ejecutar el script (R2). |
| Errores de CORS en `fetch` | El origen del frontend no está en `FRONTEND_ORIGINS` | Añádelo en `Backend/.env` (en desarrollo, localhost ya está permitido). |
| La sección se reinicia al cambiar de sección | La vista está dentro de `.music-workspace` | Debe ir fuera (paso 4.8). |
| Suenan dos canciones a la vez | Falta el paso 4.6 o `playbackToggleNonce` no alterna | Revisa 4.6 y la verificación del paso 1.3. |
| La barra de reproducción de YouTube tapa algo | La copia no aplicó `position: sticky` | Vuelve a ejecutar el script con `--force`. |
| `npm install` falla con `sharp` en Windows | Binario nativo no descargado | `npm install --include=optional sharp`, o borra `node_modules` y repite. |
| Fotos de artista tardan unos segundos la primera vez | Se consultan Discogs, MusicBrainz y Deezer | Normal. La página aparece enseguida y el resto llega sola; después hay caché de 7 días. `MusicBrainz respondió 503` en el log es normal. |
| `ready: false` en `/health` | Sin internet o YouTube no responde | Se reintenta cada 30 s. Las descargas funcionan igualmente. |

---

## Mantenimiento: actualizar desde Yotubei

1. Haz el cambio en `youtubei_Mysic` y verifícalo allí (`npm start` en `backend`, `npm run dev` en `frontend`).
2. En Mysic: `node ../youtubei_Mysic/tools/migrar-a-mysic.mjs --mysic . --force` (desde la raíz de Mysic).
3. Si cambiaron dependencias, `cd Backend && npm install`.
4. Repite la fase 5.

Si el script imprime `ERROR: Transformación no aplicable…`, el código de Yotubei cambió en un punto que el script reescribe: actualiza `tools/migrar-a-mysic.mjs` en Yotubei, nunca parchees a mano la copia.

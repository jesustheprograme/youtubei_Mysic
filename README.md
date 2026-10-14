# Yotubei – Reproductor de YouTube Music

> **¿Vas a integrar este proyecto en Mysic (o eres una IA trabajando con él)?**
> Lee primero, entero, [`docs/IMPLEMENTACION_MYSIC.md`](docs/IMPLEMENTACION_MYSIC.md). Contiene las reglas, el script de migración y los 38 pasos verificables.

Buscador y reproductor de canciones de YouTube Music con páginas de artista y álbum, sugerencias al escribir, descargas para escuchar sin conexión y carátulas servidas por proxy. El backend (Express + youtubei.js) habla con YouTube y otras fuentes; el frontend (React + Vite) muestra y reproduce.

## Requisitos

- Node.js 20 o superior (probado con Node 24).

## Puesta en marcha

Terminal 1, backend (puerto 5000):

```bash
cd backend
npm install
npm start        # o npm run dev para reinicio automático al editar
```

Terminal 2, frontend (puerto 5173):

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. Las llamadas a `/api` se reenvían automáticamente al backend gracias al proxy configurado en `frontend/vite.config.js`.

## Estructura del proyecto

```
Yotubei/
├── CLAUDE.md / AGENTS.md  Instrucciones obligatorias para IAs (remiten al documento de implementación)
├── docs/
│   └── IMPLEMENTACION_MYSIC.md  Guía atómica para integrar Yotubei en Mysic
├── tools/
│   └── migrar-a-mysic.mjs  Copia Yotubei dentro de Mysic aplicando las transformaciones necesarias
├── backend/
│   ├── src/
│   │   ├── server.js        Punto de entrada: crea Express, monta /api y arranca
│   │   ├── config.js        Puertos, carpetas de datos y tiempos de caché (variables de entorno)
│   │   ├── routes/          Una ruta HTTP por archivo; solo validan y responden
│   │   │   ├── index.js     Ensambla todas las rutas bajo /api
│   │   │   ├── health.js    GET /health
│   │   │   ├── search.js    GET /search y GET /suggest
│   │   │   ├── artist.js    GET /artist/:id y GET /artist/:id/images
│   │   │   ├── album.js     GET /album/:id
│   │   │   ├── stream.js    GET /stream/:id (proxy de audio con Range) y /stream/:id/info
│   │   │   ├── downloads.js Descargas a disco: listar, iniciar, servir audio/carátula, borrar
│   │   │   └── images.js    Proxy de carátulas con caché en disco
│   │   ├── youtube/         Todo lo que habla con YouTube a través de youtubei.js
│   │   │   ├── client.js    Instancia única de Innertube, evaluador JS, reintentos sin internet
│   │   │   ├── potoken.js   PO tokens con BotGuard (sin ellos YouTube corta el audio a 1 MB)
│   │   │   ├── stream.js    Resuelve la URL directa del audio (YTMUSIC + token, IOS de respaldo)
│   │   │   ├── search.js    Búsqueda (por tipo o general) y sugerencias
│   │   │   ├── artist.js    Página de artista y sus fotos en YouTube
│   │   │   ├── album.js     Página de álbum
│   │   │   └── mappers.js   Convierte objetos de Innertube al formato del frontend
│   │   ├── services/        Lógica que combina varias fuentes externas
│   │   │   ├── artistImages.js    Agrega fotos de YouTube, Discogs y Deezer (máximo 5)
│   │   │   └── imageSimilarity.js Detecta la misma foto recortada o reescalada
│   │   └── utils/
│   │       └── http.js      Validación de IDs, envoltorio de errores, comprobación de YouTube listo
│   └── data/                Generada en ejecución, ignorada por git
│       ├── downloads/       Audio (.m4a), carátulas (.jpg) e index.json de las descargas
│       └── cache/           images/ (carátulas) y artist-images/ (fotos agregadas, 7 días)
│
└── frontend/
    └── src/
        ├── main.jsx         Monta React e importa los estilos
        ├── App.jsx          Composición: buscador, pestañas, vista activa y reproductor
        ├── lib/             Utilidades sin React
        │   ├── api.js       Llamadas al backend y URLs de audio/imágenes (único sitio con rutas)
        │   ├── scroll.js    Sube al principio del contenedor con scroll (ventana u otro)
        │   ├── format.js    Formato de tiempos y tamaños
        │   └── storage.js   localStorage seguro
        ├── hooks/           Estado y lógica reutilizable
        │   ├── usePlayer.js       Cola, <audio>, controles, volumen, Media Session, atajos
        │   ├── useDownloads.js    Descargas, sondeo de progreso y estado de conexión
        │   ├── useBrowse.js       Búsqueda, pestañas y navegación entre vistas
        │   └── useSearchHistory.js Historial de búsquedas
        ├── components/      Piezas de interfaz reutilizables
        │   ├── SearchBox.jsx      Buscador con historial, autocompletado y entidades
        │   ├── Player.jsx         Barra de reproducción fija
        │   ├── SongList.jsx       Lista de canciones reproducible
        │   ├── Card.jsx           Tarjetas y rejillas de artistas/álbumes
        │   ├── ArtistHero.jsx     Panel de fotos del artista con fundido y pastillas
        │   ├── DownloadButton.jsx Botón de descarga por canción y "Descargar todo"
        │   ├── Cover.jsx          Carátula con proxy y marcador de posición
        │   ├── SectionHeader.jsx  Título de sección con "Mostrar todo"
        │   └── icons.jsx          Iconos SVG en línea
        ├── views/           Pantallas completas
        │   ├── SearchResults.jsx  Resultados (vista "Todo" o por pestaña)
        │   ├── ArtistView.jsx     Página de artista a dos columnas
        │   ├── AlbumView.jsx      Página de álbum
        │   └── DownloadsView.jsx  Descargas y trabajos en curso
        └── styles/          CSS dividido por zona (main.jsx los importa en orden)
```

## Cómo funciona el audio

1. `GET /api/search?q=...&type=all|song|artist|album` busca en YouTube Music. Con `all` (por defecto en la interfaz) devuelve el resultado principal más canciones, artistas y álbumes; con un filtro devuelve solo esa lista.
   - `GET /api/suggest?q=...` devuelve sugerencias de autocompletado y entidades directas mientras se escribe. Se cachean 5 minutos.
   - `GET /api/artist/:id` devuelve la página del artista: canciones destacadas, estanterías de álbumes y sencillos, y `images` con hasta 3 fotos de YouTube.
   - `GET /api/artist/:id/images` devuelve hasta 5 imágenes distintas del artista agregando YouTube (cabecera, avatar y fotogramas de sus vídeos y actuaciones en directo; nunca el banner), Discogs (localizado vía MusicBrainz) y Deezer. Las que son la misma foto recortada o reescalada se descartan comparándolas visualmente (`services/imageSimilarity.js`, en paralelo en varios hilos con `services/similarityPool.js`). Cada imagen trae `focus` (punto de interés en %) para encuadrarla en el panel vertical. Caché de 7 días.
   - La página del artista nunca espera más de 0,3 s a ese conjunto: si ya está en caché lo incluye (`imagesComplete: true`); si no, responde con la cabecera y el frontend recibe el resto en segundo plano sin cambiar la foto que se está viendo. Al buscar, se precalientan con baja prioridad las fotos del artista principal. Un planificador limita las agregaciones simultáneas (2 pedidas por el usuario, 1 de precalentamiento, que solo corre si no hay nadie esperando) y las fotos elegidas quedan guardadas en la caché del proxy.
   - `GET /api/album/:id` devuelve la cabecera del álbum y sus pistas.
2. `GET /api/stream/:id` obtiene el mejor formato de solo audio (AAC) y lo reenvía al navegador con soporte de `Range`, lo que permite adelantar y retroceder.
3. Para que YouTube sirva el archivo completo hace falta un *PO token* (prueba de origen). `youtube/potoken.js` lo genera con BotGuard (`bgutils-js` + `jsdom`) y lo renueva solo. Sin él YouTube corta el stream a 1 MB.
4. Si BotGuard fallara, el backend usa el cliente IOS como respaldo (solo sirve el primer MB).

`GET /api/stream/:id/info` devuelve qué cliente y formato se usarán. `GET /api/health` indica si el backend está listo.

Las carátulas se sirven a través de `GET /api/image?u=<url>` (solo hosts de imágenes conocidos) y se guardan en `backend/data/cache/images/` para que carguen al instante y sigan disponibles sin internet.

## Descargas (escuchar sin internet)

- El icono de descarga junto a cada canción, o "Descargar todo" en un álbum o artista, guarda el audio (~1 MB por minuto) y la carátula en `backend/data/downloads/`.
- La pestaña "Descargas" lista lo guardado, con el progreso de lo que está en curso, el espacio ocupado, "Reproducir todo" y borrado por canción (pulsa el check verde).
- Cuando una canción está descargada, el reproductor la sirve desde el disco aunque la elijas desde los resultados de búsqueda.
- Sin internet: arranca igualmente el backend y el frontend. La búsqueda no funcionará, pero Descargas sí. El backend reintenta conectar con YouTube cada 30 s y la interfaz muestra un aviso.

## Controles del reproductor

- Buscador con desplegable: historial reciente (borrable), autocompletado y resultados directos con carátula. Flechas ↑/↓, Enter y Esc.
- Pestañas Todo / Canciones / Artistas / Álbumes. Cambiar de pestaña repite la búsqueda actual.
- Página de artista: panel de fotos a toda altura que van cambiando (pastillas para elegir), Reproducir, Aleatorio y Descargar todo; a la derecha Canciones destacadas, Lanzamientos y biografía.
- Clic en una canción: reproducir (otro clic: pausar). La lista visible pasa a ser la cola.
- Barra inferior: anterior, play/pausa, siguiente, progreso con seek y volumen (se recuerda).
- Teclado: `Espacio` play/pausa, `←`/`→` retroceder/adelantar 5 s. Teclas multimedia y pantalla de bloqueo (Media Session).

## Variables de entorno del backend

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `5000` | Puerto de la API |
| `DATA_DIR` | `backend/data` | Carpeta raíz de descargas y cachés |

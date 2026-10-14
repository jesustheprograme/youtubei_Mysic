// backend/src/routes/index.js
// Ensambla todas las rutas bajo /api.
import express from 'express';
import { config } from '../config.js';
import { createArtistImagesResolver } from '../services/artistImages.js';
import { collectChannelMedia, getArtistNameAndMedia } from '../youtube/artist.js';
import { invalidateStream, resolveAudioStream } from '../youtube/stream.js';
import { createAlbumRouter } from './album.js';
import { createArtistRouter } from './artist.js';
import { createDownloadsRouter } from './downloads.js';
import { createHealthRouter } from './health.js';
import { createImagesRouter } from './images.js';
import { createSearchRouter } from './search.js';
import { createStreamRouter } from './stream.js';

export function createApiRouter() {
  const api = express.Router();

  // Agregador de fotos de artista, compartido por la página del artista y la búsqueda (precalentado)
  const getArtistImages = createArtistImagesResolver({
    cacheDir: config.artistImagesCacheDir,
    imageCacheDir: config.imageCacheDir,
    getYoutubeArtist: getArtistNameAndMedia,
    getChannelMedia: collectChannelMedia,
  });
  const warmArtistImages = (id) => {
    getArtistImages(id, { priority: 'warm' }).catch((error) =>
      console.warn(`[artist-images] precalentado de ${id} falló: ${error.message}`)
    );
  };

  api.use('/health', createHealthRouter());
  api.use('/', createSearchRouter({ warmArtistImages })); // /search y /suggest
  api.use('/artist', createArtistRouter({ getArtistImages }));
  api.use('/album', createAlbumRouter());
  api.use('/stream', createStreamRouter());
  api.use('/downloads', createDownloadsRouter({ dir: config.downloadsDir, resolveAudioStream, invalidateStream }));
  api.use('/image', createImagesRouter({ dir: config.imageCacheDir }));

  api.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));
  return api;
}

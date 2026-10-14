// backend/src/routes/album.js
// GET /api/album/:id  cabecera y pistas del álbum
import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam } from '../utils/http.js';
import { getAlbumPage } from '../youtube/album.js';

export function createAlbumRouter() {
  const router = express.Router();

  router.get(
    '/:id',
    requireYoutube,
    validateParam('id', BROWSE_ID_RE, 'ID de álbum inválido'),
    asyncRoute(async (req, res) => {
      res.json(await getAlbumPage(req.params.id));
    }, 'No se pudo cargar el álbum')
  );

  return router;
}

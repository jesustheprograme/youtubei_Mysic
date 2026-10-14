// backend/src/server.js
// Punto de entrada: crea la app Express, monta /api y arranca el servidor.
// El puerto se abre PRIMERO; la conexión con YouTube se inicializa después y
// se reintenta sola, así que las descargas y la caché funcionan sin internet.
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { createApiRouter } from './routes/index.js';
import { warmSimilarityPool } from './services/similarityPool.js';
import { initYoutube } from './youtube/client.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`El servidor backend está activo y funcionando en el puerto ${config.port}`);
});

app.use('/api', createApiRouter());

app.listen(config.port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${config.port}`);
  console.log(`🧵 ${warmSimilarityPool()} hilos listos para comparar imágenes de artistas.`);
  initYoutube(config.youtubeRetryMs);
});

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Estilos, uno por zona de la interfaz (el orden importa: base primero)
import './styles/base.css'
import './styles/layout.css'
import './styles/search.css'
import './styles/results.css'
import './styles/songs.css'
import './styles/detail.css'
import './styles/artist.css'
import './styles/downloads.css'
import './styles/player.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/push';
import './index.css';

// Service Worker didaftarkan sebelum React dirender, bukan saat tamu menekan
// "Aktifkan" notifikasi. Web Push justru bekerja ketika tab sudah TERTUTUP —
// dan pekerja yang baru dipasang pada detik terakhir tidak pernah sempat
// menjadi pekerja aktif yang menerima kiriman itu.
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

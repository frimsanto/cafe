// Alamat backend. Nilai default menunjuk ke backend lokal (:4000) agar `npm run
// dev` jalan tanpa konfigurasi; untuk lingkungan lain (mis. VPS) nilainya
// di-override lewat berkas .env.production saat build.

/** Buang garis miring di ujung agar penggabungan `${base}${path}` tidak dobel. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Basis URL REST API, tanpa garis miring di ujung. */
export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
);

/**
 * Endpoint WebSocket realtime — sudah lengkap, tinggal dipakai langsung oleh
 * `new WebSocket(...)`. Di produksi jalurnya di-reverse-proxy ke path `/ws`
 * pada backend, sedangkan saat pengembangan menunjuk ke sana secara langsung.
 */
export const WS_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000/ws',
);

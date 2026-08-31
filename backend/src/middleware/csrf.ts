import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { daftarOriginDiizinkan, keOrigin } from '../lib/konfigurasi';

/**
 * Perlindungan CSRF untuk endpoint yang otentikasinya dibawa COOKIE.
 *
 * ── Kenapa jalur POS butuh ini sementara jalur staf tidak ──
 *
 * Endpoint staf biasa memakai `Authorization: Bearer <token>`. Header itu harus
 * ditulis JavaScript, dan JavaScript milik situs lain tidak punya cara
 * membacanya dari localStorage kita — jadi CSRF tidak berlaku di sana sejak
 * awal.
 *
 * Jalur POS berbeda: identitasnya di cookie, dan cookie dikirim peramban SECARA
 * OTOMATIS. Sebuah halaman jahat yang dibuka di tablet kasir bisa memanggil
 * `POST /api/pos/shift/buka` dan peramban dengan patuh menyertakan cookienya.
 *
 * ── Tiga lapis, dan kenapa tiga ──
 *
 *   1. `SameSite=Strict` pada cookienya (`lib/cookie.ts`). Peramban tidak akan
 *      menyertakan cookie POS pada permintaan yang berasal dari situs lain.
 *      Ini pertahanan terkuat — tapi ia hidup di peramban, bukan di server.
 *   2. Daftar origin CORS (`lib/konfigurasi.ts`). Menghentikan `fetch` lintas
 *      situs dari membaca balasan.
 *   3. Pemeriksaan di berkas ini: permintaan MUTASI ber-cookie WAJIB membawa
 *      `Origin` (atau `Referer`) yang ada di daftar.
 *
 * Lapis ketiga menangkap apa yang dilewatkan dua lapis pertama: permintaan
 * "simple" berbentuk form yang tidak memicu preflight CORS sama sekali, dan
 * peramban lama yang memperlakukan SameSite secara berbeda. Ketiganya murah;
 * yang mahal adalah menemukan bahwa hanya satu yang terpasang.
 *
 * ── Kenapa TIDAK memakai token CSRF ──
 *
 * Pola token-per-sesi menuntut endpoint penerbit, penyimpanan token, dan
 * penanganan kedaluwarsa — permukaan baru yang harus benar. Untuk API yang
 * seluruh permintaan mutasinya dikirim `fetch` dari halaman kita sendiri,
 * pemeriksaan Origin memberi jaminan yang setara dengan bagian yang bergerak
 * jauh lebih sedikit. Header `Origin` dikirim peramban dan TIDAK bisa dipalsukan
 * JavaScript halaman penyerang — itulah yang membuatnya cukup.
 */

/** Metode yang tidak mengubah apa pun — tidak perlu diperiksa. */
const AMAN = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Origin permintaan, dari `Origin` atau (bila tidak ada) `Referer`.
 *
 * Sebagian peramban lama tidak mengirim `Origin` pada permintaan same-origin;
 * `Referer` menjadi cadangannya. Keduanya sama-sama ditulis peramban dan tidak
 * bisa disetel JavaScript halaman penyerang.
 */
function originPermintaan(req: Request): string | null {
  const dariOrigin = keOrigin(req.headers.origin);
  if (dariOrigin) return dariOrigin;
  return keOrigin(req.headers.referer);
}

/**
 * Tolak permintaan mutasi ber-cookie yang datang dari origin tak dikenal.
 *
 * Dipasang HANYA pada jalur POS. Endpoint publik pelanggan dan webhook gateway
 * tidak memakai cookie sama sekali, dan memasang ini di sana justru akan
 * mematikan notifikasi pembayaran yang memang datang tanpa `Origin`.
 */
export function tolakLintasSitus(req: Request, _res: Response, next: NextFunction): void {
  if (AMAN.has(req.method)) {
    next();
    return;
  }

  const origin = originPermintaan(req);

  // Permintaan mutasi TANPA origin sama sekali: bukan dari peramban (curl,
  // klien server). Jalur POS selalu dipanggil dari halaman kita, jadi ketiadaan
  // origin di sini justru mencurigakan — dan menolaknya tidak mematikan apa pun
  // yang sah, karena webhook gateway tidak lewat sini.
  if (!origin) {
    next(new ApiError(403, 'Permintaan ditolak: asal permintaan tidak dikenali'));
    return;
  }

  if (!daftarOriginDiizinkan().includes(origin)) {
    next(new ApiError(403, 'Permintaan ditolak: asal permintaan tidak diizinkan'));
    return;
  }

  next();
}

import type { Response } from 'express';

/**
 * Cookie HttpOnly untuk token perangkat & sesi kasir.
 *
 * ── Kenapa cookie, bukan localStorage ──
 *
 * Token akses staf yang sudah ada memang disimpan di localStorage, dan itu
 * ditoleransi karena umurnya pendek (15 menit) serta pemiliknya seorang manusia
 * yang sedang login. Dua token di berkas ini berbeda sifatnya:
 *
 *   - Token PERANGKAT berumur panjang dan melekat pada tablet yang berdiri di
 *     area kasir sepanjang hari. Di localStorage, satu skrip pihak ketiga yang
 *     kebetulan termuat di halaman itu cukup untuk membawanya pergi — dan
 *     pencurinya lalu bisa berpura-pura menjadi terminal kafe itu dari mana pun.
 *   - Token SESI KASIR menyatakan "orang ini sudah membuktikan PIN-nya". Ia
 *     tidak boleh bisa dibaca JavaScript sama sekali.
 *
 * `HttpOnly` menutup pembacaan lewat JavaScript. Itu bagian yang mudah.
 *
 * ── Yang sebenarnya menjaga: SameSite=Strict ──
 *
 * Cookie yang dikirim otomatis oleh browser membuka pintu CSRF: situs jahat
 * memanggil endpoint kasir, dan browser dengan patuh menyertakan cookienya.
 * `SameSite: 'strict'` menutup pintu itu di tingkat browser — cookie ini TIDAK
 * PERNAH ikut pada permintaan yang berasal dari situs lain, apa pun yang
 * dikatakan header CORS.
 *
 * Itu sebabnya keamanan modul ini tidak bergantung pada daftar origin yang
 * benar. Perbedaan port (dev: 5173 → 4000) bukan lintas-situs menurut aturan
 * SameSite, jadi pengembangan tetap berjalan tanpa melonggarkan apa pun.
 */

/** Umur token perangkat: panjang, karena terminal tidak login setiap hari. */
const UMUR_PERANGKAT_HARI = 180;

/**
 * Umur sesi kasir: satu shift kerja yang panjang, lalu habis dengan sendirinya.
 *
 * Bukan angka keamanan melainkan angka kepraktisan — yang benar-benar
 * mengakhiri sesi adalah tombol "Ganti Petugas". Batas ini menjaga terminal
 * yang ditinggalkan menyala semalaman tidak tetap terbuka atas nama kasir yang
 * sudah pulang.
 */
const UMUR_SESI_JAM = 14;

export const COOKIE_PERANGKAT = 'cafeos_device';
export const COOKIE_SESI_KASIR = 'cafeos_pos';

/**
 * Cookie hanya dikirim lewat HTTPS di produksi.
 *
 * Di pengembangan (`http://localhost`) `Secure` akan membuat browser membuang
 * cookienya diam-diam, jadi ia mengikuti `NODE_ENV`.
 */
function amanUntukProduksi(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Sumber cookie yang cukup untuk pembacaan di bawah.
 *
 * Sengaja BUKAN `Request` Express: handshake WebSocket hanya punya
 * `IncomingMessage` mentah, dan sesi terminal POS harus dibuktikan di sana juga
 * (lihat `realtime/wsAuth.ts`). Keduanya memenuhi bentuk ini, sehingga tidak ada
 * pembacaan cookie kedua yang bisa menyimpang dari yang ini.
 */
export interface SumberCookie {
  headers: { cookie?: string | undefined };
}

/**
 * Baca satu cookie dari header permintaan.
 *
 * Ditulis tangan alih-alih memasang `cookie-parser`: yang dibutuhkan hanya
 * pembacaan dua nama cookie, dan `res.cookie()` untuk menulisnya sudah bawaan
 * Express. Satu dependensi lebih sedikit pada jalur yang menyentuh autentikasi.
 */
export function bacaCookie(req: SumberCookie, nama: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const bagian of header.split(';')) {
    const pisah = bagian.indexOf('=');
    if (pisah === -1) continue;
    if (bagian.slice(0, pisah).trim() !== nama) continue;

    const nilai = bagian.slice(pisah + 1).trim();
    if (nilai === '') return null;
    try {
      return decodeURIComponent(nilai);
    } catch {
      // Cookie yang rusak diperlakukan sebagai tidak ada — bukan menjatuhkan
      // permintaannya dengan galat yang tidak bisa diperbaiki pengguna.
      return null;
    }
  }
  return null;
}

export function pasangCookiePerangkat(res: Response, token: string): void {
  res.cookie(COOKIE_PERANGKAT, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: amanUntukProduksi(),
    path: '/',
    maxAge: UMUR_PERANGKAT_HARI * 24 * 60 * 60 * 1000,
  });
}

export function pasangCookieSesi(res: Response, token: string): void {
  res.cookie(COOKIE_SESI_KASIR, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: amanUntukProduksi(),
    path: '/',
    maxAge: UMUR_SESI_JAM * 60 * 60 * 1000,
  });
}

/**
 * Hapus cookie sesi — dipakai "Ganti Petugas" dan saat sesi ditolak.
 *
 * Opsi yang dikirim harus SAMA PERSIS dengan saat dipasang (kecuali umurnya),
 * kalau tidak browser menganggapnya cookie berbeda dan yang lama tetap tinggal.
 */
export function hapusCookieSesi(res: Response): void {
  res.clearCookie(COOKIE_SESI_KASIR, {
    httpOnly: true,
    sameSite: 'strict',
    secure: amanUntukProduksi(),
    path: '/',
  });
}

export function hapusCookiePerangkat(res: Response): void {
  res.clearCookie(COOKIE_PERANGKAT, {
    httpOnly: true,
    sameSite: 'strict',
    secure: amanUntukProduksi(),
    path: '/',
  });
}

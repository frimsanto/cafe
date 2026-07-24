/**
 * URL menu digital yang dienkode ke QR meja.
 *
 * Alamatnya diputuskan SERVER, bukan peramban yang sedang membuka dasbor:
 * pemilik sering mencetak stiker QR dari laptop yang mengakses aplikasi lewat
 * `localhost` atau IP lokal, dan QR seperti itu tidak akan bisa dibuka
 * pelanggan. `PUBLIC_APP_URL` adalah alamat publik aplikasi (mis.
 * `https://cafeos.example.com`).
 */

const DEFAULT_APP_URL = 'http://localhost:5173';

/** Alamat publik aplikasi frontend, tanpa garis miring di akhir. */
export function publicAppUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_APP_URL;
  return base.replace(/\/+$/, '');
}

/** True bila `PUBLIC_APP_URL` sudah diisi (bukan sekadar default dev). */
export const publicAppUrlConfigured = Boolean(process.env.PUBLIC_APP_URL?.trim());

/**
 * URL lengkap yang dipindai pelanggan, mis.
 * `https://cafeos.example.com/menu/mj-3f9a2b7c1d4e`.
 *
 * Token QR-lah yang menentukan meja — tidak ada id kafe/meja yang bisa ditebak
 * dari URL, dan menukar tokennya hanya mengarahkan ke meja lain yang sah.
 */
export function tableMenuUrl(qrCode: string): string {
  return `${publicAppUrl()}/menu/${encodeURIComponent(qrCode)}`;
}

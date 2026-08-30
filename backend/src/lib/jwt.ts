import jwt from 'jsonwebtoken';
import type { AuthPayload, AuthRole } from '../types/auth';
import { AUTH_ROLES } from '../types/auth';

const SECRET = process.env.JWT_SECRET ?? '';

/**
 * Secret terpisah untuk refresh token. Bila kosong, jatuh kembali ke
 * `JWT_SECRET` supaya deployment lama tetap berjalan tanpa konfigurasi baru —
 * klaim `typ` di bawah yang mencegah refresh token dipakai sebagai token akses
 * meski keduanya ditandatangani secret yang sama.
 */
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || SECRET;

/**
 * Token akses sengaja berumur pendek: ia dikirim pada setiap permintaan dan
 * disimpan di localStorage, jadi jendela penyalahgunaannya harus sempit.
 * Umur panjang dipegang refresh token yang hanya dipakai saat memperbarui.
 */
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

/** Token hanya bisa dipakai bila secret dikonfigurasi. */
export const jwtEnabled = SECRET.length > 0;

/** Ambil klaim standar dari token yang sudah lolos verifikasi tanda tangan. */
function readPayload(decoded: unknown): AuthPayload | null {
  if (typeof decoded !== 'object' || decoded === null) return null;

  const { userId, cafeId, role } = decoded as Record<string, unknown>;
  if (
    typeof userId !== 'string' ||
    typeof cafeId !== 'string' ||
    typeof role !== 'string' ||
    !AUTH_ROLES.includes(role as AuthRole)
  ) {
    return null;
  }
  return { userId, cafeId, role: role as AuthRole };
}

/**
 * Terbitkan token akses untuk header `Authorization: Bearer <token>`.
 * Disediakan di sini agar penerbitan & verifikasi memakai kontrak yang sama.
 */
export function signAccessToken(payload: AuthPayload): string {
  if (!jwtEnabled) throw new Error('JWT_SECRET belum dikonfigurasi');
  return jwt.sign({ ...payload, typ: 'access' }, SECRET, {
    expiresIn: EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Terbitkan refresh token berumur panjang. Token ini TIDAK diterima middleware
 * autentikasi — satu-satunya kegunaannya adalah menukar diri dengan token akses
 * baru lewat `POST /api/auth/refresh`.
 */
export function signRefreshToken(payload: AuthPayload): string {
  if (!jwtEnabled) throw new Error('JWT_SECRET belum dikonfigurasi');
  return jwt.sign({ ...payload, typ: 'refresh' }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verifikasi token akses; mengembalikan null bila tidak valid/kedaluwarsa.
 *
 * Refresh token ditolak secara eksplisit: bila `JWT_REFRESH_SECRET` tidak diisi
 * keduanya memakai secret yang sama, sehingga tanpa pemeriksaan ini sebuah
 * refresh token berumur 7 hari bisa dipakai langsung sebagai token akses.
 * Token lama yang terbit sebelum klaim `typ` ada tetap diterima.
 */
export function verifyAccessToken(token: string): AuthPayload | null {
  if (!jwtEnabled) return null;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    if ((decoded as Record<string, unknown>).typ === 'refresh') return null;
    return readPayload(decoded);
  } catch {
    return null;
  }
}

/** Verifikasi refresh token; klaim `typ` wajib ada dan bernilai `refresh`. */
export function verifyRefreshToken(token: string): AuthPayload | null {
  if (!jwtEnabled) return null;
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    if ((decoded as Record<string, unknown>).typ !== 'refresh') return null;
    return readPayload(decoded);
  } catch {
    return null;
  }
}

// ── Sesi kasir di perangkat POS ──────────────────────────────────────────────

/**
 * Isi token sesi kasir — diterbitkan setelah PIN dibuktikan di sebuah terminal.
 *
 * Berbeda dari token akses biasa dalam satu hal yang menentukan: ia MEMBAWA
 * `deviceId`. Sesi kasir tidak pernah lepas dari terminal tempat ia dibuka,
 * sehingga token yang entah bagaimana berpindah ke perangkat lain tetap tidak
 * cocok dengan token perangkat yang menyertainya di sana.
 */
export interface SesiKasirPayload extends AuthPayload {
  deviceId: string;
}

/**
 * Umur sesi kasir. Yang benar-benar mengakhiri sesi adalah tombol "Ganti
 * Petugas"; batas ini hanya menjaga terminal yang ditinggalkan menyala
 * semalaman tidak tetap terbuka atas nama kasir yang sudah pulang.
 */
const SESI_KASIR_EXPIRES_IN = process.env.POS_SESSION_EXPIRES_IN ?? '14h';

/**
 * Terbitkan token sesi kasir.
 *
 * Klaim `typ: 'pos'` yang membuatnya TIDAK bisa dipakai sebagai token akses
 * biasa: `verifyAccessToken` menerima token tanpa `typ` (peninggalan versi
 * lama) tetapi sebuah nilai `typ` yang bukan `refresh` akan lolos di sana —
 * karena itu verifikasi sesi POS di bawah memeriksa `typ` secara ketat, dan
 * middleware POS tidak pernah memakai `verifyAccessToken`.
 */
export function signSesiKasir(payload: SesiKasirPayload): string {
  if (!jwtEnabled) throw new Error('JWT_SECRET belum dikonfigurasi');
  return jwt.sign({ ...payload, typ: 'pos' }, SECRET, {
    expiresIn: SESI_KASIR_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Verifikasi token sesi kasir; `typ` WAJIB bernilai `pos`. */
export function verifySesiKasir(token: string): SesiKasirPayload | null {
  if (!jwtEnabled) return null;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;

    const obj = decoded as Record<string, unknown>;
    // Ketat, bukan permisif: tidak ada sesi POS yang terbit sebelum klaim ini
    // ada, jadi tidak ada kompatibilitas mundur yang perlu dijaga di sini.
    if (obj.typ !== 'pos') return null;

    const dasar = readPayload(decoded);
    if (!dasar || typeof obj.deviceId !== 'string') return null;

    return { ...dasar, deviceId: obj.deviceId };
  } catch {
    return null;
  }
}

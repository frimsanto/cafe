import { apiFetch } from '../lib/apiClient';

// Unggah berkas ke backend, yang meneruskannya ke Cloudinary. Frontend tidak
// pernah menyentuh kredensial Cloudinary: kunci rahasianya hanya ada di server,
// dan folder tujuan ditentukan dari kafe pada token — bukan dari sini.

/** Field FormData yang dibaca middleware `uploadSingle` di backend. */
const FIELD_FOTO = 'foto';

/** Batas ukuran yang sama dengan backend — dipakai untuk menolak lebih awal. */
export const MAKS_UKURAN_FOTO = 5 * 1024 * 1024;

/** Tipe berkas yang diterima backend; dipakai juga untuk atribut `accept`. */
export const TIPE_FOTO_DITERIMA = ['image/jpeg', 'image/png', 'image/webp'];

export interface FotoMenu {
  /** URL siap tampil (sudah 800×800, format & kompresi otomatis per browser). */
  url: string;
  /** Pengenal berkas di Cloudinary — dibutuhkan untuk menghapusnya kembali. */
  publicId: string;
}

/**
 * Unggah satu foto item menu.
 *
 * Ukuran & tipe diperiksa di sini SEBELUM berkas dikirim: menunggu 5 MB
 * terunggah hanya untuk ditolak server adalah pemborosan kuota pengguna.
 * Pemeriksaan yang sama tetap dilakukan backend — yang di sini demi kecepatan
 * umpan balik, bukan demi keamanan.
 */
export function uploadFotoMenu(file: File): Promise<FotoMenu> {
  if (!TIPE_FOTO_DITERIMA.includes(file.type)) {
    return Promise.reject(
      new Error('Format foto tidak didukung. Pakai JPG, PNG, atau WEBP.'),
    );
  }
  if (file.size > MAKS_UKURAN_FOTO) {
    return Promise.reject(
      new Error(
        `Ukuran foto maksimal ${MAKS_UKURAN_FOTO / (1024 * 1024)} MB.`,
      ),
    );
  }

  const formData = new FormData();
  formData.append(FIELD_FOTO, file);

  return apiFetch<FotoMenu>('/api/upload/menu-item', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Hapus foto dari Cloudinary.
 *
 * `publicId` memuat garis miring (`cafeos/<cafeId>/menu/<berkas>`) sehingga
 * wajib di-encode agar tetap terbaca sebagai SATU parameter jalur.
 */
export async function hapusFotoMenu(publicId: string): Promise<void> {
  await apiFetch<{ berhasil: boolean }>(
    `/api/upload/menu-item/${encodeURIComponent(publicId)}`,
    { method: 'DELETE' },
  );
}

export const uploadApi = { uploadFotoMenu, hapusFotoMenu };

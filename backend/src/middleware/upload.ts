import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { ApiError } from '../lib/ApiError';

/**
 * Penerimaan berkas untuk unggah foto.
 *
 * Berkas ditahan di MEMORI (bukan disk): tujuannya Cloudinary, jadi menulis
 * berkas sementara ke disk hanya menambah kerja I/O dan menyisakan sampah bila
 * proses mati di tengah jalan. Ukurannya dibatasi 5 MB sehingga menahannya di
 * memori tetap aman.
 */

/** Batas ukuran berkas — dipakai juga untuk menyusun pesan error. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Nama field pada FormData yang membawa berkas foto. */
export const FIELD_FOTO = 'foto';

/**
 * Tipe gambar yang diterima. Sengaja daftar-putih, bukan sekadar `image/*`:
 * SVG juga ber-MIME `image/svg+xml` dan bisa memuat skrip.
 */
const TIPE_DIIZINKAN = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!TIPE_DIIZINKAN.includes(file.mimetype)) {
      cb(
        new ApiError(
          400,
          'Format foto tidak didukung. Pakai JPG, PNG, atau WEBP.',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/** Terjemahkan kode error multer menjadi kalimat yang bisa dipahami pengguna. */
function pesanMulter(err: MulterError): string {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return `Ukuran foto maksimal ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
    case 'LIMIT_FILE_COUNT':
      return 'Hanya boleh mengunggah satu foto sekali kirim.';
    case 'LIMIT_UNEXPECTED_FILE':
      return `Berkas harus dikirim pada field bernama "${FIELD_FOTO}".`;
    default:
      return 'Berkas yang dikirim tidak bisa diproses.';
  }
}

const singleFoto = upload.single(FIELD_FOTO);

/**
 * Menerima satu berkas pada field `foto`.
 *
 * Membungkus `multer().single()` agar penolakannya keluar sebagai `ApiError`
 * 400 dengan pesan Indonesia — tanpa ini `MulterError` lolos ke error handler
 * terpusat dan berubah menjadi 500 "kesalahan pada server", padahal penyebabnya
 * murni kesalahan input pengguna.
 */
export function uploadSingle(req: Request, res: Response, next: NextFunction) {
  singleFoto(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      next(new ApiError(400, pesanMulter(err)));
      return;
    }
    next(err);
  });
}

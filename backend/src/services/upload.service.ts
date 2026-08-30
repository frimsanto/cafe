import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import cloudinary, { cloudinaryTerkonfigurasi } from '../lib/cloudinary';
import { ApiError } from '../lib/ApiError';

/**
 * Layanan unggah foto ke Cloudinary.
 *
 * Isolasi tenant di sini bersifat STRUKTURAL: setiap berkas selalu disimpan di
 * bawah `cafeos/<cafeId>/…` dan `cafeId` hanya boleh berasal dari token, tidak
 * pernah dari input klien. Konsekuensinya penghapusan cukup memverifikasi awalan
 * jalur — satu kafe tidak punya cara menyebut berkas milik kafe lain.
 */

/** Akar folder seluruh berkas aplikasi di Cloudinary. */
const ROOT_FOLDER = 'cafeos';

/** Folder foto menu milik sebuah kafe. */
export function folderMenu(cafeId: string): string {
  return `${ROOT_FOLDER}/${cafeId}/menu`;
}

/** Folder gambar QRIS statis milik sebuah kafe. */
export function folderQris(cafeId: string): string {
  return `${ROOT_FOLDER}/${cafeId}/qris`;
}

/** Folder bukti pembayaran yang diunggah tamu/kasir. */
export function folderBukti(cafeId: string): string {
  return `${ROOT_FOLDER}/${cafeId}/bukti`;
}

/** Awalan yang wajib dimiliki setiap public id milik sebuah kafe. */
function prefixKafe(cafeId: string): string {
  return `${ROOT_FOLDER}/${cafeId}/`;
}

/** Pastikan kredensial ada sebelum menyentuh Cloudinary. */
function pastikanTerkonfigurasi(): void {
  if (!cloudinaryTerkonfigurasi()) {
    throw new ApiError(
      503,
      'Penyimpanan foto belum dikonfigurasi. Hubungi admin untuk mengisi kredensial Cloudinary.',
    );
  }
}

/** Bungkus `upload_stream` (berbasis callback) menjadi Promise. */
function unggahBuffer(
  buffer: Buffer,
  folder: string,
  // Ukuran dipangkas SAAT UNGGAH, bukan saat pengiriman: foto asli dari kamera
  // ponsel bisa belasan megapiksel dan tidak ada gunanya disimpan utuh.
  // Bentuknya berbeda per jenis berkas — foto menu dipotong bujur sangkar,
  // QRIS justru TIDAK BOLEH dipotong — jadi pemanggil yang menentukan.
  transformation: Record<string, unknown>[] = [
    { width: 800, height: 800, crop: 'fill', gravity: 'auto' },
  ],
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation,
      },
      (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
        if (error) {
          reject(new ApiError(502, `Gagal mengunggah foto: ${error.message}`));
          return;
        }
        if (!result) {
          reject(new ApiError(502, 'Cloudinary tidak mengembalikan hasil unggah.'));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

export interface HasilUnggah {
  url: string;
  publicId: string;
}

export const uploadService = {
  /**
   * Unggah satu foto item menu milik `cafeId`.
   *
   * URL yang dikembalikan memakai `f_auto,q_auto` — keduanya transformasi
   * PENGIRIMAN (format & kompresi dipilih per browser: AVIF/WebP bila
   * didukung), jadi tidak bisa ikut "dibakar" ke berkas tersimpan.
   */
  async unggahFotoMenu(cafeId: string, buffer: Buffer): Promise<HasilUnggah> {
    pastikanTerkonfigurasi();

    const hasil = await unggahBuffer(buffer, folderMenu(cafeId));

    const url = cloudinary.url(hasil.public_id, {
      secure: true,
      fetch_format: 'auto',
      quality: 'auto',
      version: hasil.version,
    });

    return { url, publicId: hasil.public_id };
  },

  /**
   * Unggah gambar QRIS statis milik `cafeId`.
   *
   * Berbeda dari foto menu, gambar ini TIDAK dipotong menjadi bujur sangkar:
   * QR code yang terpotong tidak bisa dipindai. Ukurannya dibatasi saja
   * (maksimal 1200 px pada sisi terpanjang) dengan `crop: 'limit'`, yang
   * mengecilkan bila kebesaran dan membiarkannya bila sudah pas.
   *
   * Format pengiriman juga dibiarkan apa adanya — `f_auto` boleh memilih AVIF
   * yang belum tentu terbaca semua pemindai QR bawaan aplikasi bank.
   */
  async unggahQris(cafeId: string, buffer: Buffer): Promise<HasilUnggah> {
    pastikanTerkonfigurasi();

    const hasil = await unggahBuffer(buffer, folderQris(cafeId), [
      { width: 1200, height: 1200, crop: 'limit' },
    ]);

    return {
      url: cloudinary.url(hasil.public_id, {
        secure: true,
        quality: 'auto:best',
        version: hasil.version,
      }),
      publicId: hasil.public_id,
    };
  },

  /**
   * Unggah bukti pembayaran (transfer/QRIS) untuk sebuah kafe.
   *
   * Disimpan di bawah folder kafe seperti berkas lain, sehingga bukti milik
   * satu kafe tidak pernah bisa disebut — apalagi dihapus — kafe lain.
   */
  async unggahBukti(cafeId: string, buffer: Buffer): Promise<HasilUnggah> {
    pastikanTerkonfigurasi();

    const hasil = await unggahBuffer(buffer, folderBukti(cafeId), [
      { width: 1600, height: 1600, crop: 'limit' },
    ]);

    return {
      url: cloudinary.url(hasil.public_id, {
        secure: true,
        fetch_format: 'auto',
        quality: 'auto',
        version: hasil.version,
      }),
      publicId: hasil.public_id,
    };
  },

  /**
   * Hapus foto berdasarkan public id.
   *
   * Berkas yang sudah tidak ada dianggap sukses: tujuan pemanggil adalah
   * "fotonya hilang", dan menghapus dua kali (mis. tombol diklik ulang) tidak
   * seharusnya memunculkan error.
   */
  async hapusFotoMenu(cafeId: string, publicId: string): Promise<void> {
    pastikanTerkonfigurasi();

    if (!publicId || !publicId.startsWith(prefixKafe(cafeId))) {
      throw new ApiError(403, 'Foto ini bukan milik kafemu.');
    }

    const hasil = (await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    })) as { result?: string };

    if (hasil.result !== 'ok' && hasil.result !== 'not found') {
      throw new ApiError(502, 'Gagal menghapus foto dari penyimpanan.');
    }
  },

  /**
   * Ambil public id dari URL Cloudinary — kebalikan dari `unggahFotoMenu`.
   *
   * Mengembalikan `null` bila URL-nya bukan dari Cloudinary (item menu boleh
   * memakai URL manual dari mana saja) atau bukan milik `cafeId`, sehingga
   * pemanggil tidak perlu menebak-nebak asal sebuah gambar.
   */
  publicIdDariUrl(url: string, cafeId: string): string | null {
    const penanda = '/image/upload/';
    const mulai = url.indexOf(penanda);
    if (mulai === -1) return null;

    const segmen = url.slice(mulai + penanda.length).split('/');
    // Segmen transformasi (`f_auto,q_auto`) dan versi (`v1712345678`) boleh
    // mendahului public id — potong dari segmen `cafeos` ke belakang.
    const awal = segmen.indexOf(ROOT_FOLDER);
    if (awal === -1) return null;

    const publicId = segmen.slice(awal).join('/').replace(/\.[a-z0-9]+$/i, '');
    return publicId.startsWith(prefixKafe(cafeId)) ? publicId : null;
  },
};

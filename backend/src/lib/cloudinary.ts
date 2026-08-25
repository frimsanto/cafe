import { v2 as cloudinary } from 'cloudinary';

// Klien Cloudinary untuk penyimpanan foto item menu.
//
// Kredensial dibaca dari .env (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).
// API secret TIDAK pernah keluar dari backend: frontend hanya mengirim berkas ke
// endpoint `/api/upload/...` dan menerima URL hasilnya, sehingga kunci rahasia
// tidak ikut terkirim ke browser.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  // URL hasil unggah DISIMPAN di kolom `image_url`. Tanpa ini SDK menempelkan
  // parameter telemetri `?_a=…` yang ikut terbawa ke database selamanya.
  analytics: false,
});

/**
 * Apakah kredensial Cloudinary sudah lengkap?
 *
 * Diperiksa saat permintaan berjalan (bukan saat impor) supaya server tetap
 * bisa menyala tanpa Cloudinary — hanya fitur unggah foto yang mati, dan
 * pesannya jelas alih-alih error mentah dari SDK.
 */
export function cloudinaryTerkonfigurasi(): boolean {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  return Boolean(cloud_name && api_key && api_secret);
}

export default cloudinary;

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { adalahJpeg, bersihkanJpeg, tebakFormat } from '../lib/jpeg';
import { direktoriFoto } from '../lib/konfigurasi';
import type { JenisFoto } from '../lib/shiftStatus';

/**
 * Penyimpanan foto absensi — PRIVAT, di disk server.
 *
 * ── Kenapa bukan Cloudinary seperti foto menu ──
 *
 * Foto menu memang untuk dilihat siapa saja; URL publik permanen justru yang
 * diinginkan. Foto absensi kebalikannya: ia wajah karyawan, diambil beberapa
 * kali sehari, dan satu-satunya orang yang berhak melihatnya adalah pemilik
 * kafenya sendiri. URL publik permanen — bahkan yang acak — berarti siapa pun
 * yang pernah melihat tautannya bisa terus membukanya selamanya, dan tautan
 * bocor lewat riwayat peramban, log proxy, dan tangkapan layar.
 *
 * Di sini berkasnya hidup di luar jangkauan web server dan hanya bisa keluar
 * lewat endpoint yang memeriksa siapa yang meminta. Retensi juga menjadi
 * mungkin: menghapus berkas berumur 90 hari adalah `unlink`, bukan panggilan
 * API ke pihak ketiga yang bisa gagal separuh jalan.
 *
 * ── Pembagian kerja dengan peramban ──
 *
 * Pengubahan UKURAN dilakukan di peramban sebelum diunggah: foto ditangkap
 * `getUserMedia` ke sebuah `<canvas>`, digambar ulang pada lebar maksimum,
 * lalu diekspor `toBlob('image/jpeg')`. Dua akibat yang menguntungkan:
 *
 *   1. Yang melintasi jaringan sudah kecil — kasir di koneksi lambat tidak
 *      menunggu foto belasan megapiksel terkirim.
 *   2. Canvas TIDAK PERNAH membawa EXIF. Gambar yang lahir dari canvas tidak
 *      punya metadata untuk dibawa, jadi koordinat GPS ponsel tidak ikut sejak
 *      awal.
 *
 * Server tetap tidak mempercayai itu. `bersihkanJpeg` membuang setiap segmen
 * APPn yang ditemukannya, karena "klien kami tidak mengirim EXIF" adalah
 * pernyataan tentang klien kami — bukan tentang siapa pun yang memanggil
 * endpoint ini.
 */

// Akar penyimpanannya ditentukan `lib/konfigurasi.ts` (`ATTENDANCE_PHOTO_DIR`),
// diperiksa saat boot, dan berada di luar `dist/` maupun apa pun yang disajikan
// statis. Dibaca dari sana — bukan dihitung ulang di sini — supaya jalur yang
// dipakai MENULIS persis sama dengan yang sudah divalidasi saat proses menyala.

/** Batas ukuran SETELAH dibersihkan. */
const MAKS_BYTE = 2 * 1024 * 1024;

/** Batas dimensi — foto absensi tidak perlu lebih besar dari ini. */
const MAKS_DIMENSI = 2000;

/**
 * Ambang "diunggah terlambat".
 *
 * Foto yang waktu tangkapnya jauh lebih tua dari saat ia tiba berarti perangkat
 * sempat kehilangan koneksi. Itu ditandai, bukan ditolak: kehadirannya nyata,
 * dan yang perlu diketahui pemilik adalah bahwa buktinya datang belakangan.
 */
const AMBANG_TERLAMBAT_MS = 5 * 60 * 1000;

/**
 * Jalur berkas sebuah foto.
 *
 * Dirakit HANYA dari `cafeId` (UUID dari token) dan nama berkas acak yang kami
 * sendiri yang membuatnya — tidak ada satu pun potongan yang berasal dari nama
 * berkas kiriman klien. Itulah yang membuat path traversal tidak punya bahan
 * untuk dikerjakan: tidak ada `..` yang bisa dititipkan karena tidak ada teks
 * klien yang ikut dirangkai.
 */
function jalurBerkas(cafeId: string, namaBerkas: string): string {
  const jalur = path.join(direktoriFoto(), cafeId, namaBerkas);

  // Sabuk pengaman kedua: hasil akhirnya wajib berada di bawah akar. Kalau
  // suatu saat ada pemanggil yang meneruskan nilai dari luar, ia berhenti di
  // sini alih-alih menulis ke tempat lain di server.
  const akarKafe = path.join(direktoriFoto(), cafeId) + path.sep;
  if (!jalur.startsWith(akarKafe)) {
    throw ApiError.internal('Jalur berkas foto tidak sah');
  }
  return jalur;
}

export interface HasilSimpanFoto {
  namaBerkas: string;
  ukuranByte: number;
  mimeType: string;
  terlambatDiunggah: boolean;
}

export const fotoAbsensiService = {
  /**
   * Validasi, bersihkan, dan simpan satu foto.
   *
   * Urutannya penting: yang ditulis ke disk adalah byte yang SUDAH dibersihkan,
   * bukan aslinya. Tidak ada momen ketika berkas mentah dari klien tersimpan.
   */
  async simpan(
    cafeId: string,
    berkas: Buffer,
    diambilPada: Date | null,
    sekarang: Date = new Date(),
  ): Promise<HasilSimpanFoto> {
    if (berkas.length === 0) {
      throw ApiError.badRequest('Foto kosong. Ambil ulang fotonya.');
    }

    // Yang menentukan adalah ISI berkasnya, bukan `Content-Type` kiriman klien:
    // header itu ditulis pemanggil dan bisa mengatakan apa saja.
    if (!adalahJpeg(berkas)) {
      const format = tebakFormat(berkas);
      throw ApiError.badRequest(
        format === 'lainnya'
          ? 'Berkas yang dikirim bukan foto.'
          : `Foto absensi harus JPEG (yang dikirim ${format.toUpperCase()}).`,
      );
    }

    let bersih;
    try {
      bersih = bersihkanJpeg(berkas);
    } catch {
      throw ApiError.badRequest('Foto tidak bisa dibaca. Ambil ulang fotonya.');
    }

    if (bersih.buffer.length > MAKS_BYTE) {
      throw ApiError.badRequest(
        `Ukuran foto maksimal ${MAKS_BYTE / (1024 * 1024)} MB.`,
      );
    }
    if (
      (bersih.lebar !== null && bersih.lebar > MAKS_DIMENSI) ||
      (bersih.tinggi !== null && bersih.tinggi > MAKS_DIMENSI)
    ) {
      throw ApiError.badRequest(
        `Ukuran gambar maksimal ${MAKS_DIMENSI}x${MAKS_DIMENSI} piksel.`,
      );
    }

    // Nama acak 32 hex + ekstensi tetap. Tidak ada nama asli, tidak ada
    // ekstensi ganda (`.jpg.php`), tidak ada teks klien.
    const namaBerkas = `${randomBytes(16).toString('hex')}.jpg`;
    const jalur = jalurBerkas(cafeId, namaBerkas);

    await mkdir(path.dirname(jalur), { recursive: true });
    await writeFile(jalur, bersih.buffer, { flag: 'wx' });

    const terlambatDiunggah =
      diambilPada !== null &&
      sekarang.getTime() - diambilPada.getTime() > AMBANG_TERLAMBAT_MS;

    return {
      namaBerkas,
      ukuranByte: bersih.buffer.length,
      mimeType: 'image/jpeg',
      terlambatDiunggah,
    };
  },

  /**
   * Baca sebuah foto untuk disajikan — SETELAH pemanggil memeriksa hak akses.
   *
   * Fungsi ini sengaja menuntut `cafeId` alih-alih menerima id foto saja:
   * dengan begitu tidak ada jalan membaca berkas milik kafe lain bahkan bila
   * pemanggilnya lalai, karena kafe ikut menentukan jalurnya.
   */
  async baca(cafeId: string, fotoId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const foto = await prisma.attendancePhoto.findFirst({
      where: { id: fotoId, cafeId },
    });
    if (!foto) throw ApiError.notFound('Foto tidak ditemukan');
    if (foto.dihapusPada) {
      throw ApiError.notFound('Foto ini sudah dihapus sesuai masa simpan kafe.');
    }

    try {
      const buffer = await readFile(jalurBerkas(cafeId, foto.namaBerkas));
      return { buffer, mimeType: foto.mimeType };
    } catch {
      // Baris ada tapi berkasnya tidak — mis. dipindahkan di luar aplikasi.
      // Dijawab 404 apa adanya, bukan 500: yang salah bukan permintaannya.
      throw ApiError.notFound('Berkas foto tidak ada lagi di penyimpanan.');
    }
  },

  /**
   * Hapus foto yang melewati masa simpan kafe.
   *
   * BARIS DATABASENYA TIDAK DIHAPUS — hanya ditandai `dihapusPada`. Catatan
   * kehadiran harus tetap menyebut bahwa foto pernah ada dan sengaja dihapus;
   * baris yang lenyap tidak bisa dibedakan dari absensi yang memang tidak
   * pernah berfoto.
   */
  async jalankanRetensi(cafeId: string, sekarang: Date = new Date()): Promise<number> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { retensiFotoHari: true },
    });
    const hari = cafe?.retensiFotoHari ?? 90;
    const batas = new Date(sekarang.getTime() - hari * 24 * 60 * 60 * 1000);

    const kedaluwarsa = await prisma.attendancePhoto.findMany({
      where: { cafeId, dihapusPada: null, diterimaPada: { lt: batas } },
      select: { id: true, namaBerkas: true },
    });

    let dihapus = 0;
    for (const foto of kedaluwarsa) {
      try {
        await unlink(jalurBerkas(cafeId, foto.namaBerkas));
      } catch {
        // Berkas sudah tidak ada — barisnya tetap ditandai, supaya percobaan
        // berikutnya tidak mengulanginya selamanya.
      }
      await prisma.attendancePhoto.update({
        where: { id: foto.id },
        data: { dihapusPada: sekarang },
      });
      dihapus += 1;
    }
    return dihapus;
  },

  /** Catat referensi foto yang sudah tersimpan ke sebuah absensi. */
  async catat(
    cafeId: string,
    attendanceId: string,
    jenis: JenisFoto,
    hasil: HasilSimpanFoto,
    diambilPada: Date | null,
  ): Promise<string> {
    const baris = await prisma.attendancePhoto.create({
      data: {
        cafeId,
        attendanceId,
        jenis,
        namaBerkas: hasil.namaBerkas,
        mimeType: hasil.mimeType,
        ukuranByte: hasil.ukuranByte,
        diambilPada,
        terlambatDiunggah: hasil.terlambatDiunggah,
      },
      select: { id: true },
    });
    return baris.id;
  },
};

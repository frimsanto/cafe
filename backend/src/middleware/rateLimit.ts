import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';

/**
 * Pembatas laju sederhana per alamat IP — sliding window di memori proses.
 *
 * Dipakai untuk endpoint publik tanpa autentikasi (mis. formulir pendaftaran),
 * yang kalau dibiarkan bisa dibanjiri baris sampah. Sengaja tanpa dependensi
 * baru: satu Map berisi cap waktu permintaan sudah cukup untuk kuota sekecil
 * "5 per jam".
 *
 * BATASNYA: hitungan hidup di memori satu proses. Kalau backend dijalankan
 * dalam beberapa instance (cluster / beberapa container), tiap instance punya
 * kuotanya sendiri. Untuk kuota yang benar-benar global, pindahkan penyimpanan
 * cap waktu ini ke Redis — antarmukanya tidak perlu berubah.
 */
interface RateLimitOptions {
  /** Jumlah permintaan yang diizinkan dalam satu jendela waktu. */
  maks: number;
  /** Panjang jendela waktu dalam milidetik. */
  jendelaMs: number;
  /** Pesan yang dikirim saat kuota habis. */
  pesan?: string;
}

/**
 * Alamat IP pemanggil. `X-Forwarded-For` didahulukan karena di produksi
 * backend berada di belakang reverse proxy — tanpa ini setiap permintaan
 * tampak berasal dari IP proxy dan satu pendaftar bisa memblokir semua orang.
 *
 * Hop pertama yang dipakai (klien asli); sisanya adalah rantai proxy.
 */
function alamatIp(req: Request): string {
  const diteruskan = req.headers['x-forwarded-for'];
  const baris = Array.isArray(diteruskan) ? diteruskan[0] : diteruskan;
  const hopPertama = baris?.split(',')[0]?.trim();
  return hopPertama || req.ip || req.socket.remoteAddress || 'tak-dikenal';
}

export function rateLimit({ maks, jendelaMs, pesan }: RateLimitOptions) {
  /** IP → cap waktu permintaan yang masih berada di dalam jendela. */
  const riwayat = new Map<string, number[]>();
  let sapuBerikutnya = Date.now() + jendelaMs;

  /**
   * Buang IP yang seluruh cap waktunya sudah kedaluwarsa. Dijalankan paling
   * sering sekali per jendela supaya Map tidak tumbuh tanpa batas oleh IP yang
   * datang sekali lalu tidak pernah kembali.
   */
  function sapu(sekarang: number): void {
    if (sekarang < sapuBerikutnya) return;
    for (const [ip, capWaktu] of riwayat) {
      if (capWaktu.every((waktu) => sekarang - waktu >= jendelaMs)) {
        riwayat.delete(ip);
      }
    }
    sapuBerikutnya = sekarang + jendelaMs;
  }

  return function pembatas(req: Request, res: Response, next: NextFunction) {
    const sekarang = Date.now();
    sapu(sekarang);

    const ip = alamatIp(req);
    const sebelumnya = riwayat.get(ip) ?? [];
    const dalamJendela = sebelumnya.filter((waktu) => sekarang - waktu < jendelaMs);

    if (dalamJendela.length >= maks) {
      // Sisa waktu sampai permintaan TERTUA keluar dari jendela — saat itulah
      // satu slot terbebas.
      const detikLagi = Math.ceil((jendelaMs - (sekarang - dalamJendela[0])) / 1000);
      riwayat.set(ip, dalamJendela);
      res.setHeader('Retry-After', String(Math.max(detikLagi, 1)));
      next(
        new ApiError(
          429,
          pesan ?? 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
        ),
      );
      return;
    }

    dalamJendela.push(sekarang);
    riwayat.set(ip, dalamJendela);
    next();
  };
}

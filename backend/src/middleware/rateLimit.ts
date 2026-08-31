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
 * Alamat IP pemanggil, sebagaimana ditetapkan Express.
 *
 * `req.ip` DENGAN SENGAJA dipakai apa adanya, bukan `X-Forwarded-For` yang
 * dibaca sendiri. Perbedaannya menentukan apakah pembatas ini benar-benar
 * menahan sesuatu:
 *
 *   - Membaca headernya sendiri berarti memercayai teks yang diketik klien.
 *     Selama proxy tidak menimpa header itu, siapa pun bisa mengarang IP baru
 *     pada tiap permintaan dan kuota tidak pernah tersentuh sama sekali.
 *   - `req.ip` menghormati setelan `trust proxy` aplikasi (lihat
 *     `lib/konfigurasi.ts`). Bila tidak dinyalakan, ia mengembalikan alamat
 *     peer sungguhan — 127.0.0.1 di belakang Nginx, jadi kuotanya global tapi
 *     TIDAK bisa dilewati. Bila dinyalakan, Express sendiri yang menelusuri
 *     rantai dari kanan dan berhenti pada hop pertama yang tidak dipercaya.
 *
 * Yang tumpul dan benar mengalahkan yang tajam dan bisa dikarang.
 */
function alamatIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'tak-dikenal';
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

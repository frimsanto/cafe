import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/ApiError';
import { rateLimit } from './rateLimit';

/**
 * Pembatas laju, dan satu-satunya pertanyaan yang benar-benar menentukan:
 * dari mana ia mengambil alamat pemanggil.
 *
 * Versi sebelumnya membaca `X-Forwarded-For` sendiri, dengan alasan yang
 * terdengar masuk akal — "di produksi kami di belakang reverse proxy, tanpa ini
 * semua permintaan tampak dari IP proxy". Alasannya benar, kesimpulannya tidak.
 *
 * Nginx CafeOS tidak pernah menyetel header itu (diperiksa langsung pada vhost
 * `cafeos`), jadi apa pun yang sampai ke backend adalah teks yang diketik
 * klien. Pembatas yang memercayainya tidak menahan apa pun: cukup mengarang
 * satu IP baru pada tiap permintaan dan kuotanya tidak pernah tersentuh.
 *
 * Sekarang ia memakai `req.ip`, yang mematuhi setelan `trust proxy` aplikasi
 * (bawaannya MATI — lihat `lib/konfigurasi.ts`).
 */

interface Palsu {
  req: Request;
  res: Response;
  next: NextFunction;
  hasil: () => ApiError | null;
}

/**
 * Permintaan tiruan.
 *
 * `ip` adalah apa yang SUDAH ditetapkan Express (mematuhi `trust proxy`);
 * `xff` adalah header mentah yang dikirim klien. Memisahkan keduanya persis
 * itulah inti ujinya.
 */
function palsu(ip: string, xff?: string): Palsu {
  let ditangkap: ApiError | null = null;
  const req = {
    ip,
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: ip },
  } as unknown as Request;
  const res = { setHeader: () => undefined } as unknown as Response;
  const next: NextFunction = (err?: unknown) => {
    if (err instanceof ApiError) ditangkap = err;
  };
  return { req, res, next, hasil: () => ditangkap };
}

/** Jalankan pembatas sekali; kembalikan galat bila permintaannya ditolak. */
function panggil(
  pembatas: ReturnType<typeof rateLimit>,
  ip: string,
  xff?: string,
): ApiError | null {
  const p = palsu(ip, xff);
  pembatas(p.req, p.res, p.next);
  return p.hasil();
}

describe('rateLimit', () => {
  it('meloloskan permintaan sampai kuota, lalu menolak dengan 429', () => {
    const pembatas = rateLimit({ maks: 2, jendelaMs: 60_000 });

    expect(panggil(pembatas, '10.0.0.1')).toBeNull();
    expect(panggil(pembatas, '10.0.0.1')).toBeNull();

    const ditolak = panggil(pembatas, '10.0.0.1');
    expect(ditolak).toBeInstanceOf(ApiError);
    expect(ditolak?.statusCode).toBe(429);
  });

  it('memisahkan kuota antar alamat yang berbeda', () => {
    const pembatas = rateLimit({ maks: 1, jendelaMs: 60_000 });

    expect(panggil(pembatas, '10.0.0.1')).toBeNull();
    expect(panggil(pembatas, '10.0.0.1')?.statusCode).toBe(429);
    // Alamat lain tidak ikut terkena.
    expect(panggil(pembatas, '10.0.0.2')).toBeNull();
  });

  /**
   * INTI PERBAIKAN. Satu klien, satu alamat sungguhan, tapi `X-Forwarded-For`
   * yang berganti-ganti setiap permintaan. Dulu itu menghasilkan ember baru
   * setiap kali dan kuotanya tidak pernah habis.
   */
  it('tidak bisa dilewati dengan mengarang X-Forwarded-For', () => {
    const pembatas = rateLimit({ maks: 2, jendelaMs: 60_000 });

    expect(panggil(pembatas, '127.0.0.1', '1.1.1.1')).toBeNull();
    expect(panggil(pembatas, '127.0.0.1', '2.2.2.2')).toBeNull();

    const ditolak = panggil(pembatas, '127.0.0.1', '3.3.3.3');
    expect(ditolak?.statusCode).toBe(429);
  });

  // Rantai berkoma adalah bentuk yang paling menggoda untuk diurai sendiri —
  // dan justru di situlah nilai karangan klien duduk di hop pertama.
  it('mengabaikan rantai X-Forwarded-For yang panjang', () => {
    const pembatas = rateLimit({ maks: 1, jendelaMs: 60_000 });

    expect(panggil(pembatas, '127.0.0.1', '9.9.9.9, 8.8.8.8, 7.7.7.7')).toBeNull();
    expect(panggil(pembatas, '127.0.0.1', '6.6.6.6, 5.5.5.5')?.statusCode).toBe(429);
  });

  it('menyertakan Retry-After saat menolak', () => {
    const pembatas = rateLimit({ maks: 1, jendelaMs: 60_000 });
    panggil(pembatas, '10.0.0.9');

    const header: Record<string, string> = {};
    const req = {
      ip: '10.0.0.9',
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
    } as unknown as Request;
    const res = {
      setHeader: (nama: string, nilai: string) => {
        header[nama] = nilai;
      },
    } as unknown as Response;
    pembatas(req, res, () => undefined);

    expect(Number(header['Retry-After'])).toBeGreaterThan(0);
  });

  // Permintaan tanpa alamat sama sekali (soket sudah tertutup, uji) tidak boleh
  // menjatuhkan permintaannya — ia hanya masuk ke satu ember bersama.
  it('tidak meledak ketika alamat tidak diketahui', () => {
    const pembatas = rateLimit({ maks: 1, jendelaMs: 60_000 });
    const req = { ip: undefined, headers: {}, socket: {} } as unknown as Request;
    const res = { setHeader: () => undefined } as unknown as Response;

    expect(() => pembatas(req, res, () => undefined)).not.toThrow();
  });
});

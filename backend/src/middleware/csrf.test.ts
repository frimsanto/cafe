import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tolakLintasSitus } from './csrf';
import { ApiError } from '../lib/ApiError';

/**
 * Perlindungan CSRF jalur POS.
 *
 * Jalur POS diautentikasi lewat cookie, dan cookie dikirim peramban secara
 * OTOMATIS — sebuah halaman jahat yang dibuka di tablet kasir bisa memanggil
 * `POST /api/pos/shift/buka` dan peramban dengan patuh menyertakan cookienya.
 * Yang diuji di sini adalah lapis ketiga (Origin/Referer); dua lapis lainnya
 * (`SameSite=Strict` dan daftar CORS) diuji di tempatnya masing-masing.
 */

const ENV_ASLI = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://cafe.example.com';
  delete process.env.PUBLIC_APP_URL;
  delete process.env.PUBLIC_API_URL;
});

afterEach(() => {
  process.env = { ...ENV_ASLI };
});

function jalankan(
  metode: string,
  headers: Record<string, string> = {},
): { next: NextFunction; galat: unknown } {
  const req = { method: metode, headers } as unknown as Request;
  let galat: unknown = null;
  const next = vi.fn((e?: unknown) => {
    galat = e ?? null;
  }) as unknown as NextFunction;
  tolakLintasSitus(req, {} as Response, next);
  return { next, galat };
}

describe('metode yang tidak mengubah apa pun', () => {
  it('melewatkan GET/HEAD/OPTIONS tanpa memeriksa origin', () => {
    for (const metode of ['GET', 'HEAD', 'OPTIONS']) {
      const { galat } = jalankan(metode, { origin: 'https://situs-jahat.id' });
      expect(galat, `${metode} harus lolos`).toBeNull();
    }
  });
});

describe('permintaan mutasi', () => {
  it('menerima origin yang terdaftar', () => {
    const { galat } = jalankan('POST', { origin: 'https://cafe.example.com' });
    expect(galat).toBeNull();
  });

  it('menolak origin asing', () => {
    const { galat } = jalankan('POST', { origin: 'https://situs-jahat.id' });
    expect(galat).toBeInstanceOf(ApiError);
    expect((galat as ApiError).statusCode).toBe(403);
  });

  // Nama domain yang diawali domain sah adalah trik yang paling sering dicoba.
  it('menolak domain yang menyamar', () => {
    for (const origin of [
      'https://cafe.example.com.jahat.id',
      'https://jahat.id?x=https://cafe.example.com',
      'http://cafe.example.com',
    ]) {
      const { galat } = jalankan('POST', { origin });
      expect(galat, `${origin} harus ditolak`).toBeInstanceOf(ApiError);
    }
  });

  /**
   * Jalur POS SELALU dipanggil dari halaman kita sendiri, jadi ketiadaan
   * `Origin` di sini mencurigakan. Menolaknya tidak mematikan apa pun yang sah:
   * webhook gateway (yang memang datang tanpa origin) tidak lewat middleware
   * ini sama sekali.
   */
  it('menolak permintaan mutasi tanpa Origin maupun Referer', () => {
    const { galat } = jalankan('POST', {});
    expect(galat).toBeInstanceOf(ApiError);
    expect((galat as ApiError).message).toMatch(/tidak dikenali/i);
  });

  // Sebagian peramban lama tidak mengirim `Origin` pada permintaan same-origin.
  it('memakai Referer sebagai cadangan saat Origin tidak ada', () => {
    const { galat } = jalankan('POST', {
      referer: 'https://cafe.example.com/kasir/shift',
    });
    expect(galat).toBeNull();
  });

  it('menolak Referer dari situs lain', () => {
    const { galat } = jalankan('POST', { referer: 'https://situs-jahat.id/serang' });
    expect(galat).toBeInstanceOf(ApiError);
  });

  it('memeriksa seluruh metode yang menulis', () => {
    for (const metode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const asing = jalankan(metode, { origin: 'https://situs-jahat.id' });
      expect(asing.galat, `${metode} asing harus ditolak`).toBeInstanceOf(ApiError);

      const sah = jalankan(metode, { origin: 'https://cafe.example.com' });
      expect(sah.galat, `${metode} sah harus lolos`).toBeNull();
    }
  });

  it('menerima origin pengembangan saat bukan produksi', () => {
    process.env.NODE_ENV = 'development';
    const { galat } = jalankan('POST', { origin: 'http://localhost:5173' });
    expect(galat).toBeNull();
  });

  it('menolak localhost di produksi', () => {
    const { galat } = jalankan('POST', { origin: 'http://localhost:5173' });
    expect(galat).toBeInstanceOf(ApiError);
  });
});

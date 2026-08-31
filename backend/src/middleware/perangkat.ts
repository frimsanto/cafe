import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { COOKIE_PERANGKAT, COOKIE_SESI_KASIR, bacaCookie, hapusCookieSesi } from '../lib/cookie';
import { verifySesiKasir } from '../lib/jwt';
import { runWithTenant } from '../lib/tenantContext';
import { deviceService } from '../services/device.service';
import { tolakLintasSitus } from './csrf';

/**
 * Autentikasi perangkat POS & sesi kasir.
 *
 * Rantainya dua lapis, dan urutannya bukan selera:
 *
 *   requirePerangkat  → "permintaan ini datang dari terminal terdaftar kafe X"
 *   requireSesiKasir  → "dan yang memegangnya sudah membuktikan PIN-nya"
 *
 * Layar pergantian petugas hanya butuh lapis pertama (ia justru yang menerbitkan
 * lapis kedua). Segala sesuatu yang menyentuh uang butuh keduanya.
 *
 * ── Yang membuat ini tidak bisa ditembus dari luar kafe ──
 *
 * `cafeId` sebuah permintaan POS SELALU diturunkan dari token perangkat. Tidak
 * ada satu pun jalur di berkas ini yang membaca `cafeId` dari body, URL, atau
 * header — jadi terminal kafe A tidak punya tempat untuk mengucapkan kafe B.
 * Dan bila sesi kasirnya ternyata menyebut kafe atau perangkat yang berbeda
 * dari yang sedang dipegang, sesinya ditolak: token yang disalin ke terminal
 * lain berhenti berlaku di sana.
 */

// `req.perangkat` & `req.sesiKasir` dideklarasikan di `types/express.d.ts`,
// bersama augmentasi Request lainnya.

/**
 * Wajib membawa token perangkat yang sah.
 *
 * Token dibaca HANYA dari cookie HttpOnly. Header `x-device-token` dulu ikut
 * diterima sebagai jalur pemasangan pertama — itu sudah tidak ada lagi:
 * pemasangan sekarang menukar sebuah KODE pendek di `/api/pos/pasang`, dan
 * tokennya lahir di server lalu langsung menjadi cookie tanpa pernah melewati
 * peramban sebagai nilai yang bisa dibaca.
 *
 * Menghapus penerimaan header itu menutup satu jalan masuk: selama ia ada,
 * siapa pun yang memegang token perangkat curian bisa memakainya langsung dari
 * `curl`, tanpa perlu cookie dan tanpa tersandung `SameSite=Strict`.
 */
export async function requirePerangkat(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const perangkat = await deviceService.dariToken(bacaCookie(req, COOKIE_PERANGKAT));
    if (!perangkat) {
      // Satu pesan untuk token tidak dikenal MAUPUN perangkat yang dicabut —
      // pemegang token yang dicabut tidak perlu tahu bahwa tokennya pernah sah.
      next(new ApiError(401, 'Perangkat ini belum terdaftar atau aksesnya sudah dicabut'));
      return;
    }

    req.perangkat = perangkat;
    // Pemakaian dicatat tanpa ditunggu — ini keterangan untuk pemilik, bukan
    // bagian dari autentikasi, dan kegagalannya tidak boleh menjatuhkan
    // permintaan kasir yang sedang menagih.
    void deviceService.tandaiDipakai(perangkat.id);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Wajib membawa sesi kasir yang sah DI ATAS perangkat yang sudah terverifikasi.
 *
 * Pasang SETELAH `requirePerangkat` — tanpa itu tidak ada perangkat yang bisa
 * dicocokkan dengan klaim `deviceId` di dalam tokennya.
 */
export function requireSesiKasir(req: Request, res: Response, next: NextFunction): void {
  const perangkat = req.perangkat;
  if (!perangkat) {
    next(ApiError.internal('requireSesiKasir dipasang tanpa requirePerangkat'));
    return;
  }

  const token = bacaCookie(req, COOKIE_SESI_KASIR);
  if (!token) {
    next(new ApiError(401, 'Belum ada petugas yang masuk di terminal ini'));
    return;
  }

  const sesi = verifySesiKasir(token);
  if (!sesi) {
    // Cookie yang kedaluwarsa/rusak ikut dibuang, supaya terminal tidak
    // terjebak mengirim token mati berulang kali dan menampilkan galat yang
    // tidak bisa diperbaiki kasirnya sendiri.
    hapusCookieSesi(res);
    next(new ApiError(401, 'Sesi petugas sudah berakhir. Masukkan PIN lagi.'));
    return;
  }

  // Sesi terikat pada terminal tempat ia dibuka. Token yang disalin ke perangkat
  // lain — atau perangkat yang tokennya berganti — berhenti berlaku.
  if (sesi.deviceId !== perangkat.id || sesi.cafeId !== perangkat.cafeId) {
    hapusCookieSesi(res);
    next(new ApiError(401, 'Sesi ini bukan milik terminal yang sedang dipakai'));
    return;
  }

  req.sesiKasir = sesi;
  // Konteks tenant dipasang dari PERANGKAT, bukan dari sesi — keduanya sudah
  // dipastikan sama di atas, dan mengambilnya dari perangkat membuat sumber
  // kebenarannya tetap satu.
  runWithTenant(perangkat.cafeId, next);
}

/**
 * Rantai untuk endpoint POS yang hanya butuh perangkat terdaftar — layar
 * pemasangan dan layar pergantian petugas.
 *
 * `tolakLintasSitus` DULU, sebelum apa pun menyentuh database: permintaan dari
 * origin asing tidak perlu sampai ke pencarian perangkat, apalagi ke
 * pencocokan PIN yang menghabiskan waktu bcrypt.
 */
export const perangkatAccess = [tolakLintasSitus, requirePerangkat];

/** Rantai lengkap untuk endpoint POS yang menyentuh uang. */
export const posAccess = [tolakLintasSitus, requirePerangkat, requireSesiKasir];

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CashierDevice } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';

/**
 * Perangkat POS bersama — terminal yang berdiri di meja kasir.
 *
 * ── Masalah yang dipecahkan ──
 *
 * Kasir tidak boleh mengetik email dan kata sandi setiap pergantian shift: itu
 * berarti kata sandi diketik berkali-kali sehari di layar yang bisa dilihat
 * antrean tamu, dan berakhir menjadi kata sandi sependek mungkin yang ditempel
 * di bawah meja. Yang dibutuhkan adalah perangkatnya yang dipercaya, lalu
 * ORANGNYA yang membuktikan diri dengan PIN.
 *
 * ── Dua faktor yang harus ada bersamaan ──
 *
 *   1. Token perangkat — dimiliki tablet itu, disimpan di cookie HttpOnly.
 *      Menyatakan "permintaan ini datang dari terminal terdaftar kafe X".
 *   2. PIN staf — diketik orangnya. Menyatakan "yang memegang terminal ini
 *      adalah Budi".
 *
 * Keduanya lemah sendirian dan cukup bersama-sama: PIN empat digit tidak bisa
 * ditebak dari luar kafe karena penebaknya harus memegang terminal lebih dulu,
 * dan terminal yang dicuri tidak bisa menagih apa pun tanpa seseorang yang tahu
 * sebuah PIN.
 *
 * ── cafeId TIDAK PERNAH datang dari browser ──
 *
 * Ini aturan yang menentukan bentuk seluruh modul: kafe sebuah permintaan POS
 * diturunkan dari TOKEN PERANGKAT, bukan dari body, URL, atau header pilihan
 * klien. Terminal kafe A karena itu tidak punya cara menyebut kafe B — bukan
 * karena ditolak, melainkan karena tidak ada tempat untuk mengucapkannya.
 *
 * ── Yang disimpan hanya hash ──
 *
 * Token aslinya diperlihatkan SEKALI saat pendaftaran dan tidak pernah bisa
 * dibaca ulang, termasuk oleh pemilik. Database yang bocor karena itu tidak
 * langsung menjadi sekumpulan terminal yang bisa dipakai orang lain.
 */

/** 32 byte acak — ruang tebakan yang jauh di luar jangkauan brute force. */
const PANJANG_TOKEN_BYTE = 32;

/**
 * Hash token perangkat.
 *
 * SHA-256 polos, BUKAN bcrypt — dan itu pilihan yang disengaja. bcrypt lambat
 * dengan sengaja untuk melindungi rahasia beruang rendah seperti kata sandi
 * manusia. Token ini 256 bit acak: tidak ada kamus yang bisa menebaknya, jadi
 * yang tersisa hanyalah kebutuhan pencarian yang cepat — dan hash ini dipanggil
 * pada SETIAP permintaan dari terminal.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Bentuk perangkat yang aman dikirim ke pemilik. */
export interface PerangkatDTO {
  id: string;
  label: string;
  aktif: boolean;
  terakhirDipakai: string | null;
  dicabutPada: string | null;
  createdAt: string;
  /** Shift yang sedang berjalan di terminal ini, bila ada. */
  shiftAktif: { id: string; kasir: string; dibukaPada: string } | null;
}

function toPerangkatDTO(
  d: CashierDevice,
  shift?: { id: string; dibukaPada: Date; user: { name: string } } | null,
): PerangkatDTO {
  return {
    id: d.id,
    label: d.label,
    aktif: d.aktif,
    terakhirDipakai: d.terakhirDipakai?.toISOString() ?? null,
    dicabutPada: d.dicabutPada?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    shiftAktif: shift
      ? { id: shift.id, kasir: shift.user.name, dibukaPada: shift.dibukaPada.toISOString() }
      : null,
  };
}

export const deviceService = {
  /** Daftar terminal sebuah kafe, beserta shift yang sedang berjalan. */
  async daftar(cafeId: string): Promise<PerangkatDTO[]> {
    const [perangkat, shift] = await Promise.all([
      prisma.cashierDevice.findMany({
        where: { cafeId },
        orderBy: [{ aktif: 'desc' }, { label: 'asc' }],
      }),
      prisma.cashierShift.findMany({
        where: { cafeId, status: 'AKTIF', deviceId: { not: null } },
        select: { id: true, deviceId: true, dibukaPada: true, user: { select: { name: true } } },
      }),
    ]);

    const perDevice = new Map(shift.map((s) => [s.deviceId as string, s]));
    return perangkat.map((d) => toPerangkatDTO(d, perDevice.get(d.id)));
  },

  /**
   * Daftarkan terminal baru; mengembalikan token SEKALI SAJA.
   *
   * Pemanggil WAJIB menyampaikan `token` ke perangkatnya saat itu juga (dipasang
   * sebagai cookie, atau ditampilkan untuk dipindai) — tidak ada endpoint mana
   * pun yang bisa mengeluarkannya lagi. Kalau hilang, yang benar adalah mencabut
   * perangkat itu dan mendaftarkannya ulang.
   */
  async daftarkan(
    cafeId: string,
    label: string,
    aktor: AktorAudit,
  ): Promise<{ perangkat: PerangkatDTO; token: string }> {
    const token = randomBytes(PANJANG_TOKEN_BYTE).toString('hex');

    const perangkat = await prisma.cashierDevice.create({
      data: {
        cafeId,
        label,
        tokenHash: hashToken(token),
        dibuatOleh: aktor.userId ?? null,
        aktif: true,
      },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PERANGKAT_DIDAFTARKAN,
      aktor,
      entityType: 'cashier_device',
      entityId: perangkat.id,
      // Labelnya boleh dicatat; tokennya tidak pernah — `auditRedaksi` menyaring
      // kunci apa pun yang mengandung "token" sebagai jaring pengaman kedua.
      nilaiBaru: { label: perangkat.label },
      deviceId: perangkat.id,
    });

    return { perangkat: toPerangkatDTO(perangkat), token };
  },

  /**
   * Cabut sebuah terminal.
   *
   * Shift yang sedang berjalan di terminal itu TIDAK ikut ditutup paksa: uang
   * di lacinya belum dihitung, dan menutupnya tanpa seseorang menghitung
   * membuat "tunai aktual" menjadi angka karangan. Yang terjadi adalah
   * pencabutan ditolak sampai shiftnya ditutup dengan benar.
   */
  async cabut(cafeId: string, deviceId: string, aktor: AktorAudit): Promise<PerangkatDTO> {
    const perangkat = await prisma.cashierDevice.findFirst({
      where: { id: deviceId, cafeId },
    });
    if (!perangkat) throw ApiError.notFound('Perangkat tidak ditemukan di kafe ini');

    const shift = await prisma.cashierShift.findFirst({
      where: { cafeId, deviceId, status: 'AKTIF' },
      select: { id: true },
    });
    if (shift) {
      throw ApiError.conflict(
        'Terminal ini masih menjalankan shift yang terbuka. Tutup shiftnya dulu.',
      );
    }

    const diperbarui = await prisma.cashierDevice.update({
      where: { id: perangkat.id },
      data: { aktif: false, dicabutPada: new Date(), dicabutOleh: aktor.userId ?? null },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PERANGKAT_DICABUT,
      aktor,
      entityType: 'cashier_device',
      entityId: perangkat.id,
      deviceId: perangkat.id,
      nilaiLama: { aktif: true },
      nilaiBaru: { aktif: false },
    });

    return toPerangkatDTO(diperbarui);
  },

  /**
   * Terjemahkan token mentah menjadi perangkat yang masih berlaku.
   *
   * `null` untuk token yang tidak dikenal MAUPUN perangkat yang sudah dicabut —
   * pemanggil tidak perlu (dan tidak boleh) membedakan keduanya dalam pesannya.
   *
   * Pencocokan akhirnya memakai `timingSafeEqual`. Pencarian utamanya memang
   * lewat index database (yang waktunya tidak konstan), jadi ini bukan
   * pertahanan yang menentukan — tapi ia gratis, dan membuat perbandingan
   * terakhir tidak menambah kebocoran baru di atasnya.
   */
  async dariToken(token: string | null | undefined): Promise<CashierDevice | null> {
    if (!token) return null;

    const hash = hashToken(token);
    const perangkat = await prisma.cashierDevice.findUnique({
      where: { tokenHash: hash },
    });
    if (!perangkat) return null;

    const a = Buffer.from(perangkat.tokenHash, 'utf8');
    const b = Buffer.from(hash, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    // Perangkat yang dicabut tidak pernah hidup lagi — pemilik harus
    // mendaftarkan yang baru, sehingga tokennya juga baru.
    if (!perangkat.aktif || perangkat.dicabutPada !== null) return null;

    return perangkat;
  },

  /**
   * Catat bahwa sebuah terminal baru saja dipakai.
   *
   * Sengaja tidak di-`await` oleh pemanggilnya: ini keterangan untuk pemilik
   * ("terminal belakang terakhir dipakai kemarin"), bukan bagian dari
   * autentikasi. Kegagalannya tidak boleh menjatuhkan permintaan kasir yang
   * sedang menagih.
   */
  async tandaiDipakai(deviceId: string): Promise<void> {
    try {
      await prisma.cashierDevice.update({
        where: { id: deviceId },
        data: { terakhirDipakai: new Date() },
      });
    } catch (err) {
      console.error('[perangkat] gagal mencatat pemakaian', deviceId, err);
    }
  },
};

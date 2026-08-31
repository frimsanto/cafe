import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CashierDevice } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import {
  buatKode,
  hashKode,
  kedaluwarsaKode,
  normalisasiKode,
} from '../lib/kodePemasangan';

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

  // ── Pemasangan ─────────────────────────────────────────────────────────────
  //
  // Sebuah terminal melewati tiga keadaan, dan layar pemilik harus bisa
  // membedakannya: BARU DIBUAT (punya kode, belum ditukar), TERPASANG (kodenya
  // sudah menjadi token di sebuah tablet), dan DICABUT.

  /** Sudah pernah menukar kodenya menjadi token di sebuah perangkat. */
  terpasang: boolean;
  terpasangPada: string | null;
  /** Kapan kode pemasangan yang berlaku berakhir; null bila tidak sedang menunggu. */
  kodeBerlakuHingga: string | null;
  /** Kode masih bisa dipakai sekarang. */
  kodeBerlaku: boolean;
}

function toPerangkatDTO(
  d: CashierDevice,
  shift?: { id: string; dibukaPada: Date; user: { name: string } } | null,
  sekarang: Date = new Date(),
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
    terpasang: d.tokenHash !== null,
    terpasangPada: d.terpasangPada?.toISOString() ?? null,
    kodeBerlakuHingga: d.kodeBerlakuHingga?.toISOString() ?? null,
    kodeBerlaku:
      d.kodeHash !== null &&
      d.kodeDipakaiPada === null &&
      d.kodeBerlakuHingga !== null &&
      d.kodeBerlakuHingga.getTime() > sekarang.getTime(),
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
  /**
   * Daftarkan terminal baru — yang terbit adalah KODE, bukan token.
   *
   * ── Kenapa berubah ──
   *
   * Sebelumnya endpoint ini mengembalikan token 64 heksadesimal dan menyuruh
   * pemilik membawanya ke tablet kasir. Di produksi itu berakhir sebagai tiga
   * terminal bernama `0b41506b3ca29a87…`, `budiman@gmail.com`, dan `123123`,
   * dicabut semua dalam dua setengah menit tanpa satu pun pernah terpasang:
   * tokennya tidak bisa dibawa manusia dari satu layar ke layar lain.
   *
   * Sekarang terminal LAHIR TANPA TOKEN. Yang diperlihatkan pemilik adalah kode
   * pendek berumur 15 menit; tokennya baru terbit di
   * `tukarKode` di perangkat yang bersangkutan, dan tidak ada manusia yang
   * pernah melihatnya.
   */
  async daftarkan(
    cafeId: string,
    label: string,
    aktor: AktorAudit,
  ): Promise<{ perangkat: PerangkatDTO; kode: string }> {
    const kode = buatKode();

    const perangkat = await prisma.cashierDevice.create({
      data: {
        cafeId,
        label,
        tokenHash: null,
        kodeHash: hashKode(kode),
        kodeBerlakuHingga: kedaluwarsaKode(),
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
      // Labelnya boleh dicatat; kode & tokennya tidak pernah.
      nilaiBaru: { label: perangkat.label },
      deviceId: perangkat.id,
    });

    return { perangkat: toPerangkatDTO(perangkat), kode };
  },

  /**
   * Terbitkan kode baru untuk terminal yang sudah ada.
   *
   * Dibutuhkan karena kode kedaluwarsa dalam 15 menit, dan
   * pemilik yang terlambat berjalan ke terminalnya tidak boleh dipaksa mencabut
   * lalu mendaftarkan ulang — pencabutan memutus riwayat shift terminal itu,
   * sedangkan yang sebenarnya terjadi hanyalah selembar kode yang basi.
   *
   * Berlaku juga untuk terminal yang SUDAH terpasang: tabletnya rusak atau
   * cookienya terhapus, dan pemilik perlu memasangkannya di perangkat
   * pengganti. Token lama ikut dibuang saat kodenya ditukar.
   */
  async terbitkanKode(
    cafeId: string,
    deviceId: string,
    aktor: AktorAudit,
  ): Promise<{ perangkat: PerangkatDTO; kode: string }> {
    const ada = await prisma.cashierDevice.findFirst({
      where: { id: deviceId, cafeId },
    });
    if (!ada) throw ApiError.notFound('Terminal tidak ditemukan');
    if (!ada.aktif || ada.dicabutPada !== null) {
      throw ApiError.badRequest(
        'Terminal ini sudah dicabut. Daftarkan terminal baru.',
      );
    }

    const kode = buatKode();
    const perangkat = await prisma.cashierDevice.update({
      where: { id: ada.id },
      data: {
        kodeHash: hashKode(kode),
        kodeBerlakuHingga: kedaluwarsaKode(),
        kodeDipakaiPada: null,
      },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PERANGKAT_DIDAFTARKAN,
      aktor,
      entityType: 'cashier_device',
      entityId: perangkat.id,
      nilaiBaru: { label: perangkat.label, kodeDiterbitkanUlang: true },
      deviceId: perangkat.id,
    });

    return { perangkat: toPerangkatDTO(perangkat), kode };
  },

  /**
   * Tukar kode pemasangan dengan token perangkat.
   *
   * Ini SATU-SATUNYA tempat token perangkat lahir. Pemanggilnya (`/api/pos/pasang`)
   * langsung memasangnya sebagai cookie HttpOnly dan tidak pernah mengembalikan
   * tokennya ke JavaScript.
   *
   * Kodenya dilumpuhkan pada penukaran yang sama: `kodeHash` dikosongkan
   * sehingga tidak ada percobaan kedua yang bisa cocok, bahkan bila seseorang
   * memfoto layarnya. Itulah yang membuat kode 40-bit ini memadai — bukan
   * panjangnya, melainkan sekali pakainya.
   */
  async tukarKode(kodeMentah: string): Promise<{ token: string; perangkat: CashierDevice }> {
    const kode = normalisasiKode(kodeMentah);
    // Bentuk yang salah ditolak tanpa menyentuh database sama sekali.
    if (!kode) throw ApiError.badRequest('Kode pemasangan tidak dikenali');

    const perangkat = await prisma.cashierDevice.findUnique({
      where: { kodeHash: hashKode(kode) },
    });

    // Satu pesan untuk kode salah, kode terpakai, kode kedaluwarsa, DAN terminal
    // yang dicabut. Membedakannya memberi tahu penebak bahwa tebakannya
    // "hampir benar", dan itu satu-satunya keterangan yang berguna baginya.
    const tolak = () =>
      new ApiError(400, 'Kode pemasangan tidak berlaku. Minta kode baru ke pemilik.');

    if (!perangkat) throw tolak();
    if (!perangkat.aktif || perangkat.dicabutPada !== null) throw tolak();
    if (perangkat.kodeDipakaiPada !== null) throw tolak();
    if (
      perangkat.kodeBerlakuHingga === null ||
      perangkat.kodeBerlakuHingga.getTime() <= Date.now()
    ) {
      throw tolak();
    }

    const token = randomBytes(PANJANG_TOKEN_BYTE).toString('hex');
    const sekarang = new Date();

    const diperbarui = await prisma.cashierDevice.update({
      where: { id: perangkat.id },
      data: {
        tokenHash: hashToken(token),
        terpasangPada: sekarang,
        kodeDipakaiPada: sekarang,
        // Dikosongkan, bukan sekadar ditandai terpakai: baris yang tidak lagi
        // memuat hash kode tidak bisa dicocokkan oleh percobaan apa pun.
        kodeHash: null,
        kodeBerlakuHingga: null,
      },
    });

    await auditLogService.catat({
      cafeId: diperbarui.cafeId,
      aksi: AKSI_AUDIT.PERANGKAT_DIDAFTARKAN,
      aktor: { userId: null, role: null },
      entityType: 'cashier_device',
      entityId: diperbarui.id,
      nilaiBaru: { label: diperbarui.label, terpasang: true },
      deviceId: diperbarui.id,
    });

    return { token, perangkat: diperbarui };
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

    // Terminal yang belum pernah menukar kodenya tidak punya token sama sekali,
    // jadi tidak ada token mana pun yang boleh cocok dengannya.
    if (perangkat.tokenHash === null) return null;

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

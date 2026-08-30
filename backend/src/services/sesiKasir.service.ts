import type { CashierDevice } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { signSesiKasir } from '../lib/jwt';
import {
  cocokkanPin,
  sedangTerkunci,
  setelahBerhasil,
  setelahGagal,
  sisaKunciDetik,
} from '../lib/pin';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import type { AuthRole } from '../types/auth';

/**
 * Layar pergantian petugas: staf memilih namanya, mengetik PIN, dan mendapat
 * sesi kasir di terminal itu.
 *
 * ── Yang dijaga di sini ──
 *
 * PIN empat digit hanya aman selama percobaannya dibatasi. Seluruh kebijakan
 * penguncian ada di `lib/pin.ts` sebagai fungsi murni; modul ini yang
 * menerapkannya ke database dan memastikan tidak ada jalan memutarnya:
 *
 *   - Penguncian diperiksa SEBELUM PIN dicocokkan. Menebak saat terkunci tidak
 *     boleh "gratis" — kalau pencocokan tetap dijalankan, penyerang bisa
 *     menunggu penguncian lalu terus menebak tanpa penghitungnya bertambah.
 *   - Kegagalan dicatat ke database SEBELUM balasan dikirim, sehingga
 *     permintaan yang dibanjiri tetap menaikkan penghitung yang sama.
 *   - Pesan galat TIDAK PERNAH membedakan "staf tidak ada" dari "PIN salah".
 *     Membedakannya memberi tahu penebak bahwa ia sudah menemukan orang yang
 *     benar dan tinggal mengurus empat digitnya.
 *
 * ── cafeId dari perangkat, bukan dari klien ──
 *
 * Setiap fungsi di bawah menerima `CashierDevice` yang SUDAH terverifikasi,
 * dan kafenya diambil dari situ. Terminal kafe A karena itu tidak punya cara
 * membuka sesi atas nama staf kafe B: stafnya dicari dengan `cafeId` milik
 * perangkat, jadi orang dari kafe lain sekadar "tidak ditemukan".
 */

export interface SesiKasirDTO {
  userId: string;
  nama: string;
  role: AuthRole;
  cafeId: string;
  cafeName: string;
  deviceId: string;
  deviceLabel: string;
}

/** Pesan tunggal untuk PIN salah maupun staf yang tidak ada. */
const PESAN_GAGAL = 'PIN salah. Coba lagi.';

export const sesiKasirService = {
  /**
   * Buka sesi kasir dengan PIN.
   *
   * Mengembalikan token yang dipasang pemanggil sebagai cookie HttpOnly —
   * tokennya tidak pernah menyentuh JavaScript di browser.
   */
  async buka(
    perangkat: CashierDevice,
    userId: string,
    pin: string,
    aktor: AktorAudit,
  ): Promise<{ token: string; sesi: SesiKasirDTO }> {
    const sekarang = new Date();

    // `cafeId` perangkat yang menyaring, bukan apa pun dari klien.
    const staf = await prisma.user.findFirst({
      where: { id: userId, cafeId: perangkat.cafeId, deletedAt: null, aktif: true },
      include: { cafe: { select: { name: true } } },
    });

    // Staf tidak ada / bukan milik kafe ini / nonaktif / belum punya PIN —
    // semuanya dijawab sama persis dengan PIN yang salah.
    if (!staf || !staf.pinHash) {
      throw ApiError.badRequest(PESAN_GAGAL);
    }

    // Diperiksa LEBIH DULU: menebak saat terkunci tidak boleh gratis.
    if (sedangTerkunci(staf, sekarang)) {
      throw ApiError.conflict(
        `Terlalu banyak percobaan. Coba lagi dalam ${sisaKunciDetik(staf, sekarang)} detik.`,
      );
    }

    const cocok = await cocokkanPin(pin, staf.pinHash);

    if (!cocok) {
      const keputusan = setelahGagal(staf, sekarang);
      await prisma.user.updateMany({
        where: { id: staf.id, cafeId: perangkat.cafeId },
        data: {
          pinGagal: keputusan.pinGagal,
          pinTerkunciSampai: keputusan.pinTerkunciSampai,
        },
      });

      if (keputusan.pinTerkunciSampai) {
        await auditLogService.catat({
          cafeId: perangkat.cafeId,
          aksi: AKSI_AUDIT.PIN_TERKUNCI,
          aktor: { ...aktor, userId: staf.id },
          entityType: 'user',
          entityId: staf.id,
          deviceId: perangkat.id,
          // Jumlah percobaan sengaja TIDAK dicatat sebagai nilai: `auditRedaksi`
          // menyaring kunci apa pun yang mengandung "pin", dan itu memang
          // diinginkan. Yang perlu diketahui pemilik ada di aksinya sendiri.
          nilaiBaru: { terkunciSampai: keputusan.pinTerkunciSampai.toISOString() },
        });

        throw ApiError.conflict(
          `Terlalu banyak percobaan. Coba lagi dalam ${sisaKunciDetik(
            { pinGagal: keputusan.pinGagal, pinTerkunciSampai: keputusan.pinTerkunciSampai },
            sekarang,
          )} detik.`,
        );
      }

      throw ApiError.badRequest(PESAN_GAGAL);
    }

    // Berhasil — penghitung dibersihkan SEPENUHNYA. Kasir yang salah ketik
    // empat kali lalu berhasil tidak boleh memulai besok dengan satu percobaan.
    const bersih = setelahBerhasil();
    await prisma.user.updateMany({
      where: { id: staf.id, cafeId: perangkat.cafeId },
      data: { pinGagal: bersih.pinGagal, pinTerkunciSampai: bersih.pinTerkunciSampai },
    });

    // Peran DAPUR tidak berkepentingan dengan laci kas; sesi POS bukan untuknya.
    if (staf.role !== 'KASIR' && staf.role !== 'OWNER') {
      throw ApiError.badRequest('Peran ini tidak bisa membuka sesi kasir.');
    }

    const token = signSesiKasir({
      userId: staf.id,
      cafeId: perangkat.cafeId,
      role: staf.role,
      deviceId: perangkat.id,
    });

    await auditLogService.catat({
      cafeId: perangkat.cafeId,
      aksi: AKSI_AUDIT.SESI_KASIR_DIBUKA,
      aktor: { ...aktor, userId: staf.id, role: staf.role },
      entityType: 'user',
      entityId: staf.id,
      deviceId: perangkat.id,
      nilaiBaru: { terminal: perangkat.label },
    });

    return {
      token,
      sesi: {
        userId: staf.id,
        nama: staf.name,
        role: staf.role,
        cafeId: perangkat.cafeId,
        cafeName: staf.cafe.name,
        deviceId: perangkat.id,
        deviceLabel: perangkat.label,
      },
    };
  },

  /**
   * Kunci sesi — tombol "Ganti Petugas".
   *
   * Shift kasir yang sedang berjalan SENGAJA TIDAK ikut ditutup. Keduanya
   * memang terdengar mirip, tetapi menutup shift berarti menghitung uang di
   * laci, dan itu pekerjaan tersendiri yang tidak boleh terjadi sebagai efek
   * samping dari menekan "Ganti Petugas". Kasir yang keliru menekannya cukup
   * memasukkan PIN lagi dan menemukan shiftnya masih terbuka seperti semula.
   */
  async kunci(
    cafeId: string,
    userId: string,
    deviceId: string,
    aktor: AktorAudit,
  ): Promise<void> {
    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.SESI_KASIR_DIKUNCI,
      aktor,
      entityType: 'user',
      entityId: userId,
      deviceId,
    });
  },

  /**
   * Muat ulang keadaan sesi dari database.
   *
   * Token bersifat stateless, jadi klaimnya bisa basi: staf sudah dinonaktifkan
   * atau dipindah kafe setelah tokennya terbit. Pola ini sama dengan
   * `attachUser` pada jalur staf biasa — otorisasi selalu memakai kondisi
   * terkini, bukan kondisi saat token dibuat.
   */
  async muat(
    cafeId: string,
    userId: string,
    perangkat: CashierDevice,
  ): Promise<SesiKasirDTO | null> {
    const staf = await prisma.user.findFirst({
      where: { id: userId, cafeId, deletedAt: null, aktif: true },
      include: { cafe: { select: { name: true } } },
    });
    if (!staf) return null;
    if (staf.role !== 'KASIR' && staf.role !== 'OWNER') return null;

    return {
      userId: staf.id,
      nama: staf.name,
      role: staf.role,
      cafeId,
      cafeName: staf.cafe.name,
      deviceId: perangkat.id,
      deviceLabel: perangkat.label,
    };
  },
};

import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redaksiAudit } from '../lib/auditRedaksi';

/**
 * Jejak audit untuk perubahan & keputusan pembayaran.
 *
 * Dua sifat yang menentukan bentuk modul ini:
 *
 *   1. **Tidak boleh menggagalkan aksi yang dicatatnya.** Kasir yang sudah
 *      menerima uang tidak boleh melihat error hanya karena penulisan log
 *      gagal. Karena itu `catat()` menelan galatnya sendiri dan cukup mencatat
 *      ke console — uangnya sudah pindah, dan itu yang lebih penting.
 *   2. **Tidak boleh menyimpan rahasia.** Semua nilai melewati
 *      `redaksiAudit()`; lihat `lib/auditRedaksi.ts`.
 */

/** Kode aksi yang dikenal — dipakai juga untuk menyaring saat membaca log. */
export const AKSI_AUDIT = {
  METODE_DIPERBARUI: 'metode.diperbarui',
  METODE_DIKONFIGURASI: 'metode.dikonfigurasi',
  MIDTRANS_KREDENSIAL_DISIMPAN: 'midtrans.kredensial.disimpan',
  MIDTRANS_KREDENSIAL_DIHAPUS: 'midtrans.kredensial.dihapus',
  MIDTRANS_TES_KONEKSI: 'midtrans.tes-koneksi',
  MIDTRANS_MODE_DIUBAH: 'midtrans.mode.diubah',
  MIDTRANS_WEBHOOK_DIPERIKSA: 'midtrans.webhook.diperiksa',
  /** Satu percobaan bayar Snap dibuat (termasuk "Coba Bayar Lagi"). */
  MIDTRANS_PERCOBAAN_DIBUAT: 'midtrans.percobaan.dibuat',
  /** Notifikasi sah datang untuk percobaan bayar yang sudah digantikan. */
  MIDTRANS_PERCOBAAN_LAMA: 'midtrans.percobaan.lama',
  /** Uang masuk dua kali untuk satu pesanan — perlu pengembalian dana. */
  PEMBAYARAN_GANDA: 'pembayaran.ganda',
  PEMBAYARAN_MANUAL_DIMINTA: 'pembayaran.manual.diminta',
  PEMBAYARAN_MANUAL_DITERIMA: 'pembayaran.manual.diterima',
  PEMBAYARAN_MANUAL_DITOLAK: 'pembayaran.manual.ditolak',
  WEBHOOK_DITERIMA: 'webhook.diterima',
  WEBHOOK_DITOLAK: 'webhook.ditolak',
  WEBHOOK_NOMINAL_TIDAK_COCOK: 'webhook.nominal-tidak-cocok',
  // ── Layar kasir (POS) ──
  PESANAN_KASIR_DIBUAT: 'pesanan.kasir.dibuat',
  PESANAN_DIBATALKAN: 'pesanan.dibatalkan',
  DAPUR_STATUS_DIUBAH: 'dapur.status.diubah',
} as const;

export type AksiAudit = (typeof AKSI_AUDIT)[keyof typeof AKSI_AUDIT];

/** Siapa yang melakukan aksi. Null di kedua field = tindakan sistem (webhook). */
export interface AktorAudit {
  userId?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface InputAudit {
  cafeId: string;
  aksi: AksiAudit | string;
  aktor?: AktorAudit;
  orderId?: string | null;
  nilaiLama?: Record<string, unknown> | null;
  nilaiBaru?: Record<string, unknown> | null;
}

/**
 * Susun aktor dari sebuah permintaan Express.
 *
 * IP diambil dari `X-Forwarded-For` lebih dulu karena di produksi backend
 * berada di belakang reverse proxy — tanpa itu setiap baris audit akan
 * mencatat IP proxy dan tidak ada gunanya.
 */
export function aktorDariRequest(req: Request): AktorAudit {
  const diteruskan = req.headers['x-forwarded-for'];
  const baris = Array.isArray(diteruskan) ? diteruskan[0] : diteruskan;
  const ip = baris?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || null;
  const ua = req.headers['user-agent'];

  return {
    userId: req.auth?.userId ?? null,
    role: req.auth?.role ?? null,
    ip,
    // Header user-agent bisa panjang sekali; dipotong agar satu baris audit
    // tidak menghabiskan halaman.
    userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null,
  };
}

export const auditLogService = {
  /**
   * Catat satu aksi. TIDAK PERNAH melempar — lihat catatan di kepala berkas.
   *
   * Sengaja tidak di-`await` oleh sebagian pemanggil (`void catat(...)`) ketika
   * aksinya sudah selesai dan pengguna tidak perlu menunggu penulisan log.
   */
  async catat(input: InputAudit): Promise<void> {
    try {
      await prisma.paymentAuditLog.create({
        data: {
          cafeId: input.cafeId,
          actorUserId: input.aktor?.userId ?? null,
          actorRole: input.aktor?.role ?? null,
          aksi: input.aksi,
          orderId: input.orderId ?? null,
          nilaiLama: (redaksiAudit(input.nilaiLama) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          nilaiBaru: (redaksiAudit(input.nilaiBaru) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          ip: input.aktor?.ip ?? null,
          userAgent: input.aktor?.userAgent ?? null,
        },
      });
    } catch (err) {
      console.error('[audit] gagal mencatat aksi', input.aksi, err);
    }
  },

  /**
   * Riwayat audit sebuah kafe, terbaru lebih dulu.
   *
   * `cafeId` WAJIB diberikan pemanggil dari token — bukan dari input klien.
   * Query ini juga berjalan di dalam konteks tenant pada route staf, jadi ada
   * dua lapis penjagaan yang sama-sama menyaring kafe.
   */
  async riwayat(
    cafeId: string,
    opsi: { limit?: number; aksi?: string; orderId?: string } = {},
  ) {
    const limit = Math.min(Math.max(opsi.limit ?? 50, 1), 200);
    const baris = await prisma.paymentAuditLog.findMany({
      where: {
        cafeId,
        ...(opsi.aksi ? { aksi: opsi.aksi } : {}),
        ...(opsi.orderId ? { orderId: opsi.orderId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return baris.map((b) => ({
      id: b.id,
      aksi: b.aksi,
      actorUserId: b.actorUserId,
      actorRole: b.actorRole,
      orderId: b.orderId,
      nilaiLama: b.nilaiLama,
      nilaiBaru: b.nilaiBaru,
      ip: b.ip,
      userAgent: b.userAgent,
      createdAt: b.createdAt.toISOString(),
    }));
  },
};

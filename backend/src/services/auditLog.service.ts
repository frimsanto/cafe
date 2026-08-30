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

  // ── Staf & PIN ──
  STAF_DITAMBAH: 'staf.ditambah',
  STAF_DIPERBARUI: 'staf.diperbarui',
  STAF_DIAKTIFKAN: 'staf.diaktifkan',
  STAF_DINONAKTIFKAN: 'staf.dinonaktifkan',
  /// Nilai PIN-nya sendiri TIDAK PERNAH ikut — hanya faktanya bahwa PIN diubah.
  PIN_DIATUR: 'pin.diatur',
  PIN_DIRESET: 'pin.direset',
  PIN_TERKUNCI: 'pin.terkunci',

  // ── Perangkat POS ──
  PERANGKAT_DIDAFTARKAN: 'perangkat.didaftarkan',
  PERANGKAT_DICABUT: 'perangkat.dicabut',
  SESI_KASIR_DIBUKA: 'sesi.kasir.dibuka',
  SESI_KASIR_DIKUNCI: 'sesi.kasir.dikunci',

  // ── Jadwal ──
  JADWAL_TEMPLATE_DISIMPAN: 'jadwal.template.disimpan',
  JADWAL_TEMPLATE_DIHAPUS: 'jadwal.template.dihapus',
  JADWAL_DITETAPKAN: 'jadwal.ditetapkan',
  JADWAL_DIBATALKAN: 'jadwal.dibatalkan',

  // ── Absensi ──
  ABSEN_MASUK: 'absen.masuk',
  ABSEN_PULANG: 'absen.pulang',
  ABSEN_PENGECUALIAN_FOTO: 'absen.pengecualian-foto',
  ABSEN_DIKOREKSI: 'absen.dikoreksi',

  // ── Shift kasir ──
  SHIFT_DIBUKA: 'shift.dibuka',
  SHIFT_DITUTUP: 'shift.ditutup',
  SHIFT_SELISIH_KAS: 'shift.selisih-kas',
  SHIFT_MODAL_DIUBAH: 'shift.modal.diubah',
  SHIFT_DIKOREKSI: 'shift.dikoreksi',
  KAS_MASUK: 'kas.masuk',
  KAS_KELUAR: 'kas.keluar',

  // ── Penggantian petugas ──
  PENGGANTI_DIAJUKAN: 'pengganti.diajukan',
  PENGGANTI_DISETUJUI: 'pengganti.disetujui',
  PENGGANTI_DITOLAK: 'pengganti.ditolak',
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

  // ── Perluasan: dari jejak pembayaran menjadi jejak audit umum ──────────────
  //
  // Tabelnya tetap `payment_audit_logs` — lihat alasannya di schema. Yang
  // bertambah cuma kolom, dan seluruh baris lama tetap terbaca. Aksi shift,
  // absensi, dan staf memakai tabel yang sama supaya "apa yang terjadi pada
  // pesanan ini" dan "siapa yang memegang laci saat itu" bisa dibaca dalam
  // SATU urutan waktu.

  /** `order` | `cashier_shift` | `attendance` | `user` | `shift_schedule` | … */
  entityType?: string | null;
  entityId?: string | null;
  /** Alasan tertulis — wajib untuk pembatalan, penolakan, dan koreksi. */
  alasan?: string | null;
  /** Terminal tempat aksi terjadi. */
  deviceId?: string | null;
  /** Menyatukan beberapa baris audit yang lahir dari satu ketukan tombol. */
  correlationId?: string | null;
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

  // Dua jalur autentikasi bermuara ke sini: staf yang login lewat email/sandi
  // (`req.auth`) dan petugas yang membuka sesi dengan PIN di terminal POS
  // (`req.sesiKasir`). Keduanya harus menghasilkan jejak yang sama-sama
  // menyebut SIAPA — sebuah pembayaran yang tercatat tanpa aktor hanya karena
  // diproses dari layar kasir adalah persis jenis lubang yang membuat selisih
  // kas tidak bisa ditelusuri.
  return {
    userId: req.auth?.userId ?? req.sesiKasir?.userId ?? null,
    role: req.auth?.role ?? req.sesiKasir?.role ?? null,
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
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          alasan: input.alasan ?? null,
          deviceId: input.deviceId ?? null,
          correlationId: input.correlationId ?? null,
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

import type { CashierShift } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { dariDecimal, jumlah, keBigInt, keNumberAtauNol } from '../lib/rupiah';
import { normalisasiStatusShift, type JenisKas } from '../lib/shiftStatus';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import { penggantianService } from './penggantian.service';

/**
 * Shift kasir — tanggung jawab atas laci kas.
 *
 * ── Kenapa ini bukan sekadar "jam kerja" ──
 *
 * Absensi menjawab "siapa yang hadir". Shift menjawab "siapa yang bertanggung
 * jawab atas uang yang masuk". Keduanya berbeda dan harus tetap berbeda:
 * seorang kasir bisa hadir pukul 07.00 dan baru membuka lacinya pukul 07.30,
 * dan seorang staf dapur hadir tanpa pernah menyentuh uang sama sekali.
 *
 * ── Rekap dihitung dari TRANSAKSI MILIK SHIFT, bukan dari rentang waktu ──
 *
 * Ini keputusan yang paling menentukan di berkas ini. Menjumlahkan "semua
 * transaksi antara jam buka dan jam tutup" terasa masuk akal sampai sebuah kafe
 * menjalankan dua terminal sekaligus — lalu penjualan terminal sebelah ikut
 * terhitung di laci ini, dan kedua rekapnya sama-sama salah dengan cara yang
 * saling menutupi. Karena itu setiap pesanan menyimpan `cashier_shift_id`, dan
 * penutupan menjumlahkan persis baris yang menunjuk ke sini.
 *
 * ── Uang bulat, dari awal sampai akhir ──
 *
 * Seluruh aritmetika kas memakai BigInt rupiah. Nilai dari kolom lama
 * (`orders.total_amount`, Decimal) melewati `lib/rupiah.ts` satu kali di
 * perbatasan, lalu tidak pernah kembali menjadi pecahan. Penjumlahan lewat
 * `number` akan menghasilkan selisih beberapa rupiah yang muncul setiap hari —
 * dan selisih yang selalu ada berhenti menjadi peringatan bagi siapa pun.
 */

export interface RekapShiftDTO {
  modalAwal: number;
  penjualanTunai: number;
  kasMasuk: number;
  kasKeluar: number;
  /** modal + tunai + masuk − keluar. Inilah yang seharusnya ada di laci. */
  tunaiSeharusnya: number;
  tunaiAktual: number | null;
  selisih: number | null;
  nonTunai: Array<{ metode: string; total: number; jumlahTransaksi: number }>;
  totalNonTunai: number;
  jumlahTransaksi: number;
  pesananDibatalkan: number;
  pembayaranDitolak: number;
}

export interface ShiftDTO {
  id: string;
  status: string;
  namaShift: string;
  kasir: { id: string; nama: string };
  terminal: { id: string; label: string } | null;
  dibukaPada: string;
  ditutupPada: string | null;
  catatanBuka: string | null;
  catatanTutup: string | null;
  attendanceId: string | null;
  rekap: RekapShiftDTO;
  pergerakanKas: Array<{
    id: string;
    jenis: string;
    nominal: number;
    alasan: string;
    createdAt: string;
  }>;
  dikoreksi: { pada: string; alasan: string | null } | null;
}

type ShiftLengkap = CashierShift & {
  user: { id: string; name: string };
  device: { id: string; label: string } | null;
};

const SHIFT_INCLUDE = {
  user: { select: { id: true, name: true } },
  device: { select: { id: true, label: true } },
} as const;

/**
 * Hitung rekap sebuah shift dari transaksi yang menunjuk kepadanya.
 *
 * Dipanggil dua kali dengan arti yang berbeda: saat shift masih berjalan
 * (angka sementara yang dilihat kasir di layar) dan saat ditutup (angka yang
 * dibekukan ke kolom `kas_seharusnya`). Perhitungannya sama persis — kalau
 * berbeda, kasir akan melihat satu angka sepanjang shift lalu angka lain saat
 * menutupnya, dan tidak ada yang bisa menjelaskan selisihnya.
 */
async function hitungRekap(shift: CashierShift): Promise<RekapShiftDTO> {
  const [pesanan, pergerakan] = await Promise.all([
    prisma.order.findMany({
      where: { cafeId: shift.cafeId, cashierShiftId: shift.id },
      select: {
        totalAmount: true,
        statusPembayaran: true,
        metodePembayaran: true,
        status: true,
      },
    }),
    prisma.cashMovement.findMany({
      where: { cafeId: shift.cafeId, shiftId: shift.id },
      select: { jenis: true, nominal: true },
    }),
  ]);

  const lunas = pesanan.filter((p) => p.statusPembayaran === 'PAID');

  // Untuk TUNAI yang masuk laci adalah TAGIHANNYA, bukan uang yang disodorkan
  // tamu: kembaliannya keluar lagi dari laci yang sama pada detik yang sama.
  const tunai = lunas.filter((p) => p.metodePembayaran === 'TUNAI');
  const penjualanTunai = jumlah(tunai.map((p) => dariDecimal(p.totalAmount)));

  const perMetode = new Map<string, { total: bigint; n: number }>();
  for (const p of lunas) {
    const metode = p.metodePembayaran ?? 'LAINNYA';
    if (metode === 'TUNAI') continue;
    const kini = perMetode.get(metode) ?? { total: 0n, n: 0 };
    kini.total += dariDecimal(p.totalAmount);
    kini.n += 1;
    perMetode.set(metode, kini);
  }

  const kasMasuk = jumlah(
    pergerakan.filter((m) => m.jenis === 'MASUK').map((m) => m.nominal),
  );
  const kasKeluar = jumlah(
    pergerakan.filter((m) => m.jenis === 'KELUAR').map((m) => m.nominal),
  );

  const tunaiSeharusnya = shift.modalAwal + penjualanTunai + kasMasuk - kasKeluar;
  const nonTunaiTotal = jumlah([...perMetode.values()].map((v) => v.total));

  return {
    modalAwal: keNumberAtauNol(shift.modalAwal),
    penjualanTunai: keNumberAtauNol(penjualanTunai),
    kasMasuk: keNumberAtauNol(kasMasuk),
    kasKeluar: keNumberAtauNol(kasKeluar),
    tunaiSeharusnya: keNumberAtauNol(tunaiSeharusnya),
    tunaiAktual: shift.kasAktual === null ? null : keNumberAtauNol(shift.kasAktual),
    selisih: shift.selisih === null ? null : keNumberAtauNol(shift.selisih),
    nonTunai: [...perMetode.entries()]
      .map(([metode, v]) => ({
        metode,
        total: keNumberAtauNol(v.total),
        jumlahTransaksi: v.n,
      }))
      .sort((a, b) => b.total - a.total),
    totalNonTunai: keNumberAtauNol(nonTunaiTotal),
    jumlahTransaksi: lunas.length,
    pesananDibatalkan: pesanan.filter((p) => p.status === 'DIBATALKAN').length,
    pembayaranDitolak: pesanan.filter(
      (p) => p.statusPembayaran === 'FAILED' || p.statusPembayaran === 'CANCELLED',
    ).length,
  };
}

async function toShiftDTO(shift: ShiftLengkap): Promise<ShiftDTO> {
  const [rekap, pergerakan] = await Promise.all([
    hitungRekap(shift),
    prisma.cashMovement.findMany({
      where: { cafeId: shift.cafeId, shiftId: shift.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, jenis: true, nominal: true, alasan: true, createdAt: true },
    }),
  ]);

  return {
    id: shift.id,
    status: normalisasiStatusShift(shift.status),
    namaShift: shift.namaShift,
    kasir: { id: shift.user.id, nama: shift.user.name },
    terminal: shift.device ? { id: shift.device.id, label: shift.device.label } : null,
    dibukaPada: shift.dibukaPada.toISOString(),
    ditutupPada: shift.ditutupPada?.toISOString() ?? null,
    catatanBuka: shift.catatanBuka,
    catatanTutup: shift.catatanTutup,
    attendanceId: shift.attendanceId,
    rekap,
    pergerakanKas: pergerakan.map((m) => ({
      id: m.id,
      jenis: m.jenis,
      nominal: keNumberAtauNol(m.nominal),
      alasan: m.alasan,
      createdAt: m.createdAt.toISOString(),
    })),
    dikoreksi: shift.dikoreksiPada
      ? { pada: shift.dikoreksiPada.toISOString(), alasan: shift.alasanKoreksi }
      : null,
  };
}

export interface BukaShiftInput {
  cafeId: string;
  userId: string;
  deviceId: string | null;
  modalAwal: number;
  scheduleId: string | null;
  catatan: string | null;
}

export const shiftKasirService = {
  /** Shift yang sedang berjalan milik seorang kasir. */
  async aktifMilik(cafeId: string, userId: string): Promise<ShiftDTO | null> {
    const shift = await prisma.cashierShift.findFirst({
      where: { cafeId, userId, status: 'AKTIF' },
      include: SHIFT_INCLUDE,
    });
    return shift ? toShiftDTO(shift as ShiftLengkap) : null;
  },

  /**
   * Buka shift.
   *
   * Syaratnya berlapis, dan tiap lapis punya alasannya sendiri:
   *
   *   - Sudah absen masuk. Tanpa itu, tidak ada kehadiran yang bisa dikaitkan
   *     dengan uang yang diterima — dan laporan absensi akan menunjukkan
   *     seseorang yang menagih sepanjang hari tanpa pernah datang.
   *   - Belum punya shift aktif. Dijaga partial unique index di database, bukan
   *     hanya oleh pemeriksaan di sini: dua permintaan yang tiba bersamaan
   *     sama-sama lolos pemeriksaan aplikasi lalu sama-sama menulis.
   *   - Terminalnya belum dipakai shift lain. Dijaga index yang sama.
   */
  async buka(input: BukaShiftInput, aktor: AktorAudit): Promise<ShiftDTO> {
    const { cafeId, userId } = input;

    const staf = await prisma.user.findFirst({
      where: { id: userId, cafeId, deletedAt: null, aktif: true },
      select: { id: true, name: true, role: true },
    });
    if (!staf) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');
    if (staf.role === 'DAPUR') {
      throw ApiError.badRequest('Peran ini tidak memegang laci kas.');
    }

    const absensi = await prisma.attendanceRecord.findFirst({
      where: { cafeId, userId, masukPada: { not: null }, keluarPada: null },
      select: { id: true, scheduleId: true },
      orderBy: { masukPada: 'desc' },
    });
    if (!absensi) {
      throw ApiError.conflict('Absen masuk dulu sebelum membuka shift kasir.');
    }

    if (input.modalAwal < 0) {
      throw ApiError.badRequest('Modal awal tidak boleh negatif');
    }

    let namaShift = 'Shift';
    let templateId: string | null = null;
    const scheduleId = input.scheduleId ?? absensi.scheduleId;
    if (scheduleId) {
      const jadwal = await prisma.shiftSchedule.findFirst({
        where: { id: scheduleId, cafeId },
        include: { template: { select: { id: true, nama: true } } },
      });
      if (jadwal) {
        // Nama di-SNAPSHOT: template boleh diganti nama besok, laporan bulan
        // lalu tidak boleh ikut berubah karenanya.
        namaShift = jadwal.template.nama;
        templateId = jadwal.template.id;

        // Membuka shift atas jadwal MILIK ORANG LAIN menuntut penggantian yang
        // sah. Kebijakan kafe yang menentukan apakah persetujuan harus lebih
        // dulu atau boleh menyusul — lihat `penggantian.service`.
        const penghalang = await penggantianService.penghalangUntukMembuka(
          cafeId,
          scheduleId,
          userId,
        );
        if (penghalang) throw ApiError.conflict(penghalang);
      }
    }

    if (input.deviceId) {
      const terminal = await prisma.cashierDevice.findFirst({
        where: { id: input.deviceId, cafeId, aktif: true },
        select: { id: true },
      });
      if (!terminal) throw ApiError.notFound('Terminal tidak ditemukan di kafe ini');
    }

    const dibuat = await prisma.cashierShift
      .create({
        data: {
          cafeId,
          userId,
          attendanceId: absensi.id,
          scheduleId,
          deviceId: input.deviceId,
          templateId,
          namaShift,
          modalAwal: keBigInt(input.modalAwal),
          status: 'AKTIF',
          catatanBuka: input.catatan,
        },
        include: SHIFT_INCLUDE,
      })
      .catch((err: unknown) => {
        // Partial unique index yang berbicara — dua "Buka Shift" bersamaan,
        // atau terminal yang sudah dipakai orang lain.
        const pesan = String(err);
        if (pesan.includes('satu_aktif_per_kasir')) {
          throw ApiError.conflict('Kamu sudah punya shift yang terbuka.');
        }
        if (pesan.includes('satu_aktif_per_terminal')) {
          throw ApiError.conflict('Terminal ini sudah dipakai shift lain.');
        }
        throw err;
      });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.SHIFT_DIBUKA,
      aktor,
      entityType: 'cashier_shift',
      entityId: dibuat.id,
      deviceId: input.deviceId,
      nilaiBaru: {
        kasir: staf.name,
        namaShift,
        modalAwal: input.modalAwal,
      },
    });

    return toShiftDTO(dibuat as ShiftLengkap);
  },

  /**
   * Tutup shift.
   *
   * Rekapnya DIBEKUKAN ke kolom (`kas_seharusnya`, `selisih`) alih-alih
   * dihitung ulang setiap kali dibaca. Kalau sebuah transaksi lama dikoreksi
   * bulan depan, angka yang dilihat dan ditandatangani kasir malam itu harus
   * tetap sama — rekap yang berubah sendiri setelah ditutup membuat selisih kas
   * mustahil ditelusuri.
   */
  async tutup(
    cafeId: string,
    shiftId: string,
    kasAktual: number,
    catatan: string | null,
    aktor: AktorAudit,
  ): Promise<ShiftDTO> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id: shiftId, cafeId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) throw ApiError.notFound('Shift tidak ditemukan di kafe ini');
    if (normalisasiStatusShift(shift.status) !== 'AKTIF') {
      throw ApiError.conflict('Shift ini sudah ditutup.');
    }
    if (kasAktual < 0) throw ApiError.badRequest('Uang tunai tidak boleh negatif');

    // Pembayaran manual yang masih menunggu keputusan menghalangi penutupan:
    // uangnya belum jelas masuk atau tidak, sehingga "tunai seharusnya" belum
    // punya jawaban. Menutup sekarang berarti membekukan angka yang akan salah
    // beberapa menit kemudian.
    const menggantung = await prisma.pembayaranManual.count({
      where: { cashierShiftId: shiftId, statusVerifikasi: 'MENUNGGU' },
    });
    if (menggantung > 0) {
      throw ApiError.conflict(
        `Masih ada ${menggantung} pembayaran yang menunggu keputusanmu. Selesaikan dulu.`,
      );
    }

    const rekap = await hitungRekap(shift);
    const seharusnya = keBigInt(rekap.tunaiSeharusnya);
    const aktual = keBigInt(kasAktual);
    const selisih = aktual - seharusnya;

    const ditutup = await prisma.cashierShift.update({
      where: { id: shiftId },
      data: {
        status: 'DITUTUP',
        ditutupPada: new Date(),
        kasAktual: aktual,
        kasSeharusnya: seharusnya,
        selisih,
        catatanTutup: catatan,
      },
      include: SHIFT_INCLUDE,
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.SHIFT_DITUTUP,
      aktor,
      entityType: 'cashier_shift',
      entityId: shiftId,
      deviceId: shift.deviceId,
      nilaiBaru: {
        tunaiSeharusnya: rekap.tunaiSeharusnya,
        tunaiAktual: kasAktual,
        selisih: keNumberAtauNol(selisih),
        jumlahTransaksi: rekap.jumlahTransaksi,
      },
    });

    // Selisih dicatat SEBAGAI AKSI TERSENDIRI supaya pemilik bisa menyaringnya
    // menjadi satu daftar — bukan mencarinya di antara penutupan yang normal.
    if (selisih !== 0n) {
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.SHIFT_SELISIH_KAS,
        aktor,
        entityType: 'cashier_shift',
        entityId: shiftId,
        alasan: catatan,
        nilaiBaru: { selisih: keNumberAtauNol(selisih) },
      });
    }

    return toShiftDTO(ditutup as ShiftLengkap);
  },

  /** Catat uang masuk/keluar laci di luar penjualan. */
  async catatKas(
    cafeId: string,
    shiftId: string,
    jenis: JenisKas,
    nominal: number,
    alasan: string,
    aktor: AktorAudit,
  ): Promise<ShiftDTO> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id: shiftId, cafeId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) throw ApiError.notFound('Shift tidak ditemukan di kafe ini');
    if (normalisasiStatusShift(shift.status) !== 'AKTIF') {
      throw ApiError.conflict('Shift ini sudah ditutup — kasnya tidak bisa diubah lagi.');
    }
    if (nominal <= 0) throw ApiError.badRequest('Nominal harus lebih dari nol');

    await prisma.cashMovement.create({
      data: {
        cafeId,
        shiftId,
        jenis,
        nominal: keBigInt(nominal),
        alasan,
        actorUserId: aktor.userId ?? null,
      },
    });

    await auditLogService.catat({
      cafeId,
      aksi: jenis === 'MASUK' ? AKSI_AUDIT.KAS_MASUK : AKSI_AUDIT.KAS_KELUAR,
      aktor,
      entityType: 'cash_movement',
      entityId: shiftId,
      alasan,
      deviceId: shift.deviceId,
      nilaiBaru: { jenis, nominal },
    });

    return toShiftDTO(shift as ShiftLengkap);
  },

  async ambil(cafeId: string, shiftId: string): Promise<ShiftDTO> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id: shiftId, cafeId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) throw ApiError.notFound('Shift tidak ditemukan di kafe ini');
    return toShiftDTO(shift as ShiftLengkap);
  },

  /** Daftar shift kafe pada sebuah rentang — dipakai laporan Kasir & Shift. */
  async daftar(
    cafeId: string,
    dari: Date,
    sampai: Date,
    filter: { userId?: string } = {},
  ): Promise<ShiftDTO[]> {
    const baris = await prisma.cashierShift.findMany({
      where: {
        cafeId,
        dibukaPada: { gte: dari, lt: sampai },
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      include: SHIFT_INCLUDE,
      orderBy: { dibukaPada: 'desc' },
    });
    return Promise.all(baris.map((s) => toShiftDTO(s as ShiftLengkap)));
  },

  /**
   * Koreksi pemilik atas shift yang sudah ditutup.
   *
   * Nilai lama TIDAK ditimpa diam-diam: yang berubah masuk audit log bersama
   * alasannya, sehingga rekap yang dikoreksi tetap bisa dibandingkan dengan apa
   * yang semula dilaporkan kasirnya. Kasir sendiri tidak punya jalan ke sini —
   * shift yang sudah ditutup terkunci baginya.
   */
  async koreksi(
    cafeId: string,
    shiftId: string,
    ubah: { kasAktual?: number; modalAwal?: number },
    alasan: string,
    aktor: AktorAudit,
  ): Promise<ShiftDTO> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id: shiftId, cafeId },
      include: SHIFT_INCLUDE,
    });
    if (!shift) throw ApiError.notFound('Shift tidak ditemukan di kafe ini');

    const modalAwal =
      ubah.modalAwal === undefined ? shift.modalAwal : keBigInt(ubah.modalAwal);
    const kasAktual =
      ubah.kasAktual === undefined
        ? shift.kasAktual
        : keBigInt(ubah.kasAktual);

    // Rekap dihitung ulang dengan modal yang baru, lalu dibekukan lagi.
    const rekapBaru = await hitungRekap({ ...shift, modalAwal });
    const seharusnya = keBigInt(rekapBaru.tunaiSeharusnya);
    const selisih = kasAktual === null ? null : kasAktual - seharusnya;

    const diperbarui = await prisma.cashierShift.update({
      where: { id: shiftId },
      data: {
        modalAwal,
        kasAktual,
        kasSeharusnya: shift.ditutupPada ? seharusnya : null,
        selisih: shift.ditutupPada ? selisih : null,
        dikoreksiOleh: aktor.userId ?? null,
        dikoreksiPada: new Date(),
        alasanKoreksi: alasan,
      },
      include: SHIFT_INCLUDE,
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.SHIFT_DIKOREKSI,
      aktor,
      entityType: 'cashier_shift',
      entityId: shiftId,
      alasan,
      nilaiLama: {
        modalAwal: keNumberAtauNol(shift.modalAwal),
        kasAktual: shift.kasAktual === null ? null : keNumberAtauNol(shift.kasAktual),
        selisih: shift.selisih === null ? null : keNumberAtauNol(shift.selisih),
      },
      nilaiBaru: {
        modalAwal: keNumberAtauNol(modalAwal),
        kasAktual: kasAktual === null ? null : keNumberAtauNol(kasAktual),
        selisih: selisih === null ? null : keNumberAtauNol(selisih),
      },
    });

    return toShiftDTO(diperbarui as ShiftLengkap);
  },
};

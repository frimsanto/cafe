import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan, type PrismaMock } from '../test/prismaMock';

const prisma: PrismaMock = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

const catat = vi.fn();
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return { ...asli, auditLogService: { catat, riwayat: vi.fn() } };
});

const simpanFoto = vi.fn();
const catatFoto = vi.fn();
vi.mock('./fotoAbsensi.service', () => ({
  fotoAbsensiService: { simpan: simpanFoto, catat: catatFoto, baca: vi.fn() },
}));

const { shiftKasirService } = await import('./shiftKasir.service');
const { absensiService } = await import('./absensi.service');
const { penggantianService } = await import('./penggantian.service');

const CAFE = 'cafe-a';
const KASIR = 'kasir-1';
const AKTOR = { userId: KASIR, role: 'KASIR' as const };
const AKTOR_PEMILIK = { userId: 'pemilik-1', role: 'OWNER' as const };

function shiftPalsu(ubah: Record<string, unknown> = {}) {
  return {
    id: 'shift-1',
    cafeId: CAFE,
    userId: KASIR,
    attendanceId: 'absen-1',
    scheduleId: null,
    deviceId: 'terminal-1',
    templateId: null,
    namaShift: 'Pagi',
    dibukaPada: new Date('2026-03-05T00:00:00Z'),
    ditutupPada: null,
    status: 'AKTIF',
    modalAwal: 100_000n,
    kasAktual: null,
    kasSeharusnya: null,
    selisih: null,
    catatanBuka: null,
    catatanTutup: null,
    dikoreksiOleh: null,
    dikoreksiPada: null,
    alasanKoreksi: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: KASIR, name: 'Budi' },
    device: { id: 'terminal-1', label: 'Kasir Depan' },
    ...ubah,
  };
}

function pesanan(total: string, metode: string, status = 'PAID') {
  return {
    totalAmount: new Prisma.Decimal(total),
    statusPembayaran: status,
    metodePembayaran: metode,
    status: 'SELESAI',
  };
}

beforeEach(() => {
  isiBawaan(prisma);
  catat.mockReset();
  simpanFoto.mockReset();
  catatFoto.mockReset();
  simpanFoto.mockResolvedValue({
    namaBerkas: 'acak.jpg',
    ukuranByte: 1024,
    mimeType: 'image/jpeg',
    terlambatDiunggah: false,
  });
  catatFoto.mockResolvedValue('foto-1');
  prisma.cafe.findUnique.mockResolvedValue({
    timezone: 'Asia/Jakarta',
    awalHariOperasional: 0,
    retensiFotoHari: 90,
    penggantiBolehLangsung: true,
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('buka shift — syarat yang tidak boleh dilewati', () => {
  // Bagian P nomor 21.
  it('menolak membuka shift tanpa absen masuk', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: KASIR, name: 'Budi', role: 'KASIR' });
    prisma.attendanceRecord.findFirst.mockResolvedValue(null);

    await expect(
      shiftKasirService.buka(
        { cafeId: CAFE, userId: KASIR, deviceId: null, modalAwal: 100_000, scheduleId: null, catatan: null },
        AKTOR,
      ),
    ).rejects.toThrow(/Absen masuk dulu/i);

    expect(prisma.cashierShift.create).not.toHaveBeenCalled();
  });

  it('menolak peran dapur memegang laci', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'dapur-1', name: 'Cici', role: 'DAPUR' });

    await expect(
      shiftKasirService.buka(
        { cafeId: CAFE, userId: 'dapur-1', deviceId: null, modalAwal: 0, scheduleId: null, catatan: null },
        AKTOR,
      ),
    ).rejects.toThrow(/tidak memegang laci/i);
  });

  // Bagian P nomor 22.
  it('mencatat modal awal sebagai BigInt', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: KASIR, name: 'Budi', role: 'KASIR' });
    prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'absen-1', scheduleId: null });
    prisma.cashierShift.create.mockResolvedValue(shiftPalsu());

    await shiftKasirService.buka(
      { cafeId: CAFE, userId: KASIR, deviceId: null, modalAwal: 250_000, scheduleId: null, catatan: null },
      AKTOR,
    );

    expect(prisma.cashierShift.create.mock.calls[0][0].data.modalAwal).toBe(250_000n);
  });

  /**
   * Bagian P nomor 23 & 24.
   *
   * Yang benar-benar menjaga aturan ini adalah partial unique index di database
   * — dibuktikan terhadap PostgreSQL sungguhan di `test/migrasiStafShift.test`.
   * Yang diuji DI SINI adalah bahwa pelanggarannya diterjemahkan menjadi pesan
   * yang bisa dimengerti kasir, bukan 500 "kesalahan pada server".
   */
  it('menerjemahkan pelanggaran index menjadi pesan yang bisa dimengerti', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: KASIR, name: 'Budi', role: 'KASIR' });
    prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'absen-1', scheduleId: null });

    prisma.cashierShift.create.mockRejectedValue(
      new Error('Unique constraint failed on cashier_shifts_satu_aktif_per_kasir'),
    );
    await expect(
      shiftKasirService.buka(
        { cafeId: CAFE, userId: KASIR, deviceId: null, modalAwal: 0, scheduleId: null, catatan: null },
        AKTOR,
      ),
    ).rejects.toThrow(/sudah punya shift yang terbuka/i);

    prisma.cashierDevice.findFirst.mockResolvedValue({ id: 'terminal-1' });
    prisma.cashierShift.create.mockRejectedValue(
      new Error('Unique constraint failed on cashier_shifts_satu_aktif_per_terminal'),
    );
    await expect(
      shiftKasirService.buka(
        { cafeId: CAFE, userId: KASIR, deviceId: 'terminal-1', modalAwal: 0, scheduleId: null, catatan: null },
        AKTOR,
      ),
    ).rejects.toThrow(/sudah dipakai shift lain/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('rekap & tutup shift', () => {
  // Bagian P nomor 26.
  it('menghitung tunai seharusnya dari transaksi MILIK shift', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu());
    prisma.order.findMany.mockResolvedValue([
      pesanan('36000.00', 'TUNAI'),
      pesanan('14000.00', 'TUNAI'),
      pesanan('50000.00', 'QRIS'), // non-tunai: tidak masuk laci
      pesanan('20000.00', 'TUNAI', 'UNPAID'), // belum lunas: tidak dihitung
    ]);
    prisma.cashMovement.findMany.mockResolvedValue([
      { id: 'kas-1', jenis: 'MASUK', nominal: 30_000n, alasan: 'setoran', createdAt: new Date() },
      { id: 'kas-2', jenis: 'KELUAR', nominal: 5_000n, alasan: 'beli es', createdAt: new Date() },
    ]);
    prisma.pembayaranManual.count.mockResolvedValue(0);
    prisma.cashierShift.update.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    const hasil = await shiftKasirService.tutup(CAFE, 'shift-1', 175_000, null, AKTOR);

    // 100.000 modal + 50.000 tunai + 30.000 masuk − 5.000 keluar = 175.000
    const ditulis = prisma.cashierShift.update.mock.calls[0][0].data;
    expect(ditulis.kasSeharusnya).toBe(175_000n);
    expect(ditulis.kasAktual).toBe(175_000n);
    expect(ditulis.selisih).toBe(0n);
    expect(hasil.status).toBe('DITUTUP');
  });

  it('memakai TAGIHAN, bukan uang yang disodorkan, untuk penjualan tunai', async () => {
    // Tamu membayar 50.000 untuk tagihan 36.000; 14.000 kembali keluar dari
    // laci yang sama pada detik yang sama.
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ modalAwal: 0n }));
    prisma.order.findMany.mockResolvedValue([pesanan('36000.00', 'TUNAI')]);
    prisma.cashMovement.findMany.mockResolvedValue([]);

    const shift = await shiftKasirService.ambil(CAFE, 'shift-1');
    expect(shift.rekap.penjualanTunai).toBe(36_000);
    expect(shift.rekap.tunaiSeharusnya).toBe(36_000);
  });

  // Bagian P nomor 27.
  it('mencatat selisih kas beserta jejak auditnya', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ modalAwal: 100_000n }));
    prisma.order.findMany.mockResolvedValue([]);
    prisma.cashMovement.findMany.mockResolvedValue([]);
    prisma.pembayaranManual.count.mockResolvedValue(0);
    prisma.cashierShift.update.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    await shiftKasirService.tutup(CAFE, 'shift-1', 95_000, 'kurang 5rb', AKTOR);

    expect(prisma.cashierShift.update.mock.calls[0][0].data.selisih).toBe(-5_000n);
    // Selisih dicatat sebagai aksi TERSENDIRI supaya bisa disaring pemilik.
    expect(catat).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'shift.selisih-kas' }),
    );
  });

  it('tidak mencatat aksi selisih bila kasnya pas', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ modalAwal: 100_000n }));
    prisma.order.findMany.mockResolvedValue([]);
    prisma.cashMovement.findMany.mockResolvedValue([]);
    prisma.pembayaranManual.count.mockResolvedValue(0);
    prisma.cashierShift.update.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    await shiftKasirService.tutup(CAFE, 'shift-1', 100_000, null, AKTOR);

    const aksi = catat.mock.calls.map((c) => c[0].aksi);
    expect(aksi).toContain('shift.ditutup');
    expect(aksi).not.toContain('shift.selisih-kas');
  });

  /**
   * Pembayaran manual yang masih menunggu keputusan menghalangi penutupan.
   *
   * Uangnya belum jelas masuk atau tidak, sehingga "tunai seharusnya" belum
   * punya jawaban — menutup sekarang berarti membekukan angka yang akan salah
   * beberapa menit kemudian.
   */
  it('menolak menutup shift yang masih punya pembayaran menggantung', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu());
    prisma.pembayaranManual.count.mockResolvedValue(2);

    await expect(
      shiftKasirService.tutup(CAFE, 'shift-1', 100_000, null, AKTOR),
    ).rejects.toThrow(/menunggu keputusanmu/i);
    expect(prisma.cashierShift.update).not.toHaveBeenCalled();
  });

  // Bagian P nomor 28.
  it('menolak menutup shift yang sudah ditutup', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    await expect(
      shiftKasirService.tutup(CAFE, 'shift-1', 100_000, null, AKTOR),
    ).rejects.toThrow(/sudah ditutup/i);
  });

  it('menolak mencatat kas pada shift yang sudah ditutup', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    await expect(
      shiftKasirService.catatKas(CAFE, 'shift-1', 'MASUK', 50_000, 'setoran', AKTOR),
    ).rejects.toThrow(/sudah ditutup/i);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });

  // Status shift yang rusak jatuh ke DITUTUP, bukan AKTIF — yang membatasi,
  // bukan yang mengizinkan uang diterima.
  it('memperlakukan status shift yang rusak sebagai DITUTUP', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ status: 'ENTAH' }));

    await expect(
      shiftKasirService.tutup(CAFE, 'shift-1', 100_000, null, AKTOR),
    ).rejects.toThrow(/sudah ditutup/i);
  });
});

describe('pergerakan kas', () => {
  it('menolak nominal nol atau negatif', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu());

    for (const nominal of [0, -1000]) {
      await expect(
        shiftKasirService.catatKas(CAFE, 'shift-1', 'KELUAR', nominal, 'uji', AKTOR),
      ).rejects.toThrow(/lebih dari nol/i);
    }
  });

  it('mengurangi tunai seharusnya saat uang diambil dari laci', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(shiftPalsu({ modalAwal: 200_000n }));
    prisma.order.findMany.mockResolvedValue([]);
    prisma.cashMovement.findMany.mockResolvedValue([
      { id: 'kas-1', jenis: 'KELUAR', nominal: 75_000n, alasan: 'belanja', createdAt: new Date() },
    ]);

    const shift = await shiftKasirService.ambil(CAFE, 'shift-1');
    expect(shift.rekap.kasKeluar).toBe(75_000);
    expect(shift.rekap.tunaiSeharusnya).toBe(125_000);
  });
});

describe('koreksi pemilik', () => {
  // Bagian P nomor 29.
  it('menyimpan nilai lama dan baru di audit log beserta alasannya', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue(
      shiftPalsu({
        status: 'DITUTUP',
        ditutupPada: new Date(),
        kasAktual: 95_000n,
        selisih: -5_000n,
      }),
    );
    prisma.order.findMany.mockResolvedValue([]);
    prisma.cashMovement.findMany.mockResolvedValue([]);
    prisma.cashierShift.update.mockResolvedValue(shiftPalsu({ status: 'DITUTUP' }));

    await shiftKasirService.koreksi(
      CAFE,
      'shift-1',
      { kasAktual: 100_000 },
      'salah hitung, uang ketemu di laci bawah',
      AKTOR_PEMILIK,
    );

    const audit = catat.mock.calls.find((c) => c[0].aksi === 'shift.dikoreksi')![0];
    expect(audit.alasan).toBe('salah hitung, uang ketemu di laci bawah');
    expect(audit.nilaiLama).toMatchObject({ kasAktual: 95_000, selisih: -5_000 });
    expect(audit.nilaiBaru).toMatchObject({ kasAktual: 100_000, selisih: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('absensi', () => {
  beforeEach(() => {
    prisma.user.findFirst.mockResolvedValue({ id: KASIR, name: 'Budi' });
    prisma.attendanceRecord.findFirst.mockResolvedValue(null);
    prisma.shiftSchedule.findMany.mockResolvedValue([]);
    prisma.attendanceRecord.create.mockResolvedValue({ id: 'absen-1' });
  });

  // Bagian P nomor 13.
  it('memakai waktu SERVER, bukan waktu yang dikirim perangkat', async () => {
    const sebelum = Date.now();
    prisma.attendanceRecord.findFirst
      .mockResolvedValueOnce(null) // pemeriksaan "sudah absen?"
      .mockResolvedValue({
        id: 'absen-1',
        userId: KASIR,
        status: 'PRESENT',
        masukPada: new Date(),
        keluarPada: null,
        photos: [],
        schedule: null,
        user: { name: 'Budi' },
        pengecualianFoto: false,
        alasanPengecualian: null,
        disetujuiPada: null,
        terlambatMenit: null,
        lemburMenit: null,
        durasiMenit: null,
        catatan: null,
      });

    await absensiService.masuk(
      {
        cafeId: CAFE,
        userId: KASIR,
        deviceId: 'terminal-1',
        foto: Buffer.from('x'),
        // Perangkat mengaku memotret tahun lalu.
        diambilPada: new Date('2025-01-01T00:00:00Z'),
        alasanPengecualian: null,
        correlationId: null,
      },
      AKTOR,
    );

    const ditulis = prisma.attendanceRecord.create.mock.calls[0][0].data;
    expect(ditulis.masukPada.getTime()).toBeGreaterThanOrEqual(sebelum);
    expect(ditulis.masukPada.getFullYear()).toBe(new Date().getFullYear());
  });

  // Bagian P nomor 17.
  it('menolak absen tanpa foto DAN tanpa alasan pengecualian', async () => {
    await expect(
      absensiService.masuk(
        {
          cafeId: CAFE,
          userId: KASIR,
          deviceId: null,
          foto: null,
          diambilPada: null,
          alasanPengecualian: null,
          correlationId: null,
        },
        AKTOR,
      ),
    ).rejects.toThrow(/Foto absen masuk wajib/i);

    expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it('menandai pengecualian foto dan mencatatnya sebagai aksi tersendiri', async () => {
    prisma.attendanceRecord.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'absen-1',
        userId: KASIR,
        status: 'PRESENT',
        masukPada: new Date(),
        keluarPada: null,
        photos: [],
        schedule: null,
        user: { name: 'Budi' },
        pengecualianFoto: true,
        alasanPengecualian: 'kamera tablet rusak',
        disetujuiPada: null,
        terlambatMenit: null,
        lemburMenit: null,
        durasiMenit: null,
        catatan: null,
      });

    await absensiService.masuk(
      {
        cafeId: CAFE,
        userId: KASIR,
        deviceId: null,
        foto: null,
        diambilPada: null,
        alasanPengecualian: 'kamera tablet rusak',
        correlationId: null,
      },
      AKTOR,
    );

    expect(prisma.attendanceRecord.create.mock.calls[0][0].data).toMatchObject({
      pengecualianFoto: true,
      alasanPengecualian: 'kamera tablet rusak',
    });
    expect(catat).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'absen.pengecualian-foto',
        alasan: 'kamera tablet rusak',
      }),
    );
  });

  it('menolak absen masuk dua kali tanpa pulang', async () => {
    prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'absen-lama' });

    await expect(
      absensiService.masuk(
        {
          cafeId: CAFE,
          userId: KASIR,
          deviceId: null,
          foto: Buffer.from('x'),
          diambilPada: null,
          alasanPengecualian: null,
          correlationId: null,
        },
        AKTOR,
      ),
    ).rejects.toThrow(/sudah absen masuk/i);
  });

  /**
   * Urutannya tetap: tutup shift dulu, baru absen pulang.
   *
   * Uang di laci belum dihitung, dan orang yang memegangnya tidak boleh
   * tercatat sudah pulang.
   */
  it('menolak absen pulang saat shift kasir masih terbuka', async () => {
    prisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'absen-1',
      masukPada: new Date(),
      status: 'PRESENT',
      photos: [],
      schedule: null,
      user: { name: 'Budi' },
      catatan: null,
    });
    prisma.cashierShift.findFirst.mockResolvedValue({ id: 'shift-1', namaShift: 'Pagi' });

    await expect(
      absensiService.pulang(
        CAFE,
        KASIR,
        { deviceId: null, foto: Buffer.from('x'), diambilPada: null, alasanPengecualian: null, catatan: null },
        AKTOR,
      ),
    ).rejects.toThrow(/masih terbuka/i);

    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  // Bagian P nomor 18.
  it('menghitung durasi kerja dari selisih waktu server', async () => {
    const masuk = new Date(Date.now() - 8 * 60 * 60 * 1000);
    prisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'absen-1',
      masukPada: masuk,
      status: 'PRESENT',
      photos: [],
      schedule: null,
      user: { name: 'Budi' },
      catatan: null,
    });
    prisma.cashierShift.findFirst.mockResolvedValue(null);

    await absensiService.pulang(
      CAFE,
      KASIR,
      { deviceId: null, foto: Buffer.from('x'), diambilPada: null, alasanPengecualian: null, catatan: null },
      AKTOR,
    );

    const ditulis = prisma.attendanceRecord.update.mock.calls[0][0].data;
    expect(ditulis.durasiMenit).toBeGreaterThanOrEqual(479);
    expect(ditulis.durasiMenit).toBeLessThanOrEqual(481);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('penggantian petugas', () => {
  // Bagian P nomor 30.
  it('menyimpan staf terjadwal DAN staf pengganti, tanpa mengubah jadwalnya', async () => {
    prisma.shiftSchedule.findFirst.mockResolvedValue({
      id: 'jadwal-1',
      userId: 'kasir-terjadwal',
      template: { nama: 'Pagi' },
    });
    prisma.user.findFirst.mockResolvedValue({ id: KASIR, name: 'Budi', role: 'KASIR' });
    prisma.shiftReplacement.findFirst.mockResolvedValue(null);
    prisma.shiftReplacement.create.mockResolvedValue({
      id: 'ganti-1',
      status: 'PENDING_APPROVAL',
      alasan: 'Sari sakit',
      diajukanPada: new Date(),
      diputuskanPada: null,
      alasanKeputusan: null,
      schedule: { id: 'jadwal-1', tanggal: new Date('2026-03-05'), template: { nama: 'Pagi' } },
      staffTerjadwal: { id: 'kasir-terjadwal', name: 'Sari' },
      staffPengganti: { id: KASIR, name: 'Budi' },
    });

    const hasil = await penggantianService.ajukan(
      CAFE,
      'jadwal-1',
      KASIR,
      'Sari sakit',
      AKTOR,
    );

    expect(hasil.staffTerjadwal.nama).toBe('Sari');
    expect(hasil.staffPengganti.nama).toBe('Budi');
    expect(hasil.status).toBe('PENDING_APPROVAL');
    // Jadwalnya TIDAK ditimpa — faktanya justru itu yang ingin dilihat pemilik.
    expect(prisma.shiftSchedule.update).not.toHaveBeenCalled();
  });

  it('menolak penolakan tanpa alasan', async () => {
    prisma.shiftReplacement.findFirst.mockResolvedValue({
      id: 'ganti-1',
      status: 'PENDING_APPROVAL',
      scheduleId: 'jadwal-1',
      staffTerjadwalId: 'kasir-terjadwal',
    });

    await expect(
      penggantianService.putuskan(CAFE, 'ganti-1', false, null, AKTOR_PEMILIK),
    ).rejects.toThrow(/wajib disertai alasan/i);
  });

  it('menolak permintaan yang sudah diputuskan', async () => {
    prisma.shiftReplacement.findFirst.mockResolvedValue({
      id: 'ganti-1',
      status: 'APPROVED',
    });

    await expect(
      penggantianService.putuskan(CAFE, 'ganti-1', true, null, AKTOR_PEMILIK),
    ).rejects.toThrow(/sudah diputuskan/i);
  });

  describe('kebijakan kafe menentukan urutannya', () => {
    it('menghalangi pengganti bekerja sebelum disetujui bila kafe menuntutnya', async () => {
      prisma.shiftSchedule.findFirst.mockResolvedValue({ userId: 'orang-lain' });
      prisma.cafe.findUnique.mockResolvedValue({ penggantiBolehLangsung: false });
      prisma.shiftReplacement.findFirst.mockResolvedValue({ status: 'PENDING_APPROVAL' });

      expect(
        await penggantianService.penghalangUntukMembuka(CAFE, 'jadwal-1', KASIR),
      ).toMatch(/menunggu persetujuan/i);
    });

    it('mengizinkan pengganti darurat bekerja sambil menunggu persetujuan', async () => {
      prisma.shiftSchedule.findFirst.mockResolvedValue({ userId: 'orang-lain' });
      prisma.cafe.findUnique.mockResolvedValue({ penggantiBolehLangsung: true });
      prisma.shiftReplacement.findFirst.mockResolvedValue({ status: 'PENDING_APPROVAL' });

      expect(
        await penggantianService.penghalangUntukMembuka(CAFE, 'jadwal-1', KASIR),
      ).toBeNull();
    });

    it('selalu menghalangi pengganti yang permintaannya ditolak', async () => {
      prisma.shiftSchedule.findFirst.mockResolvedValue({ userId: 'orang-lain' });
      prisma.cafe.findUnique.mockResolvedValue({ penggantiBolehLangsung: true });
      prisma.shiftReplacement.findFirst.mockResolvedValue({ status: 'REJECTED' });

      expect(
        await penggantianService.penghalangUntukMembuka(CAFE, 'jadwal-1', KASIR),
      ).toMatch(/ditolak/i);
    });

    it('menghalangi orang yang belum mengajukan diri sama sekali', async () => {
      prisma.shiftSchedule.findFirst.mockResolvedValue({ userId: 'orang-lain' });
      prisma.shiftReplacement.findFirst.mockResolvedValue(null);

      expect(
        await penggantianService.penghalangUntukMembuka(CAFE, 'jadwal-1', KASIR),
      ).toMatch(/Ajukan diri sebagai pengganti/i);
    });

    it('tidak menghalangi orang yang memang dijadwalkan', async () => {
      prisma.shiftSchedule.findFirst.mockResolvedValue({ userId: KASIR });

      expect(
        await penggantianService.penghalangUntukMembuka(CAFE, 'jadwal-1', KASIR),
      ).toBeNull();
    });
  });
});

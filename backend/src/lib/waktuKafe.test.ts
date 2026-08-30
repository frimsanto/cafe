import { describe, expect, it } from 'vitest';
import {
  bagianWaktu,
  dariWaktuLokal,
  deretHari,
  formatJam,
  geserKunci,
  hariISO,
  kunciHariOperasional,
  kunciTanggal,
  menitDalamHari,
  parseJam,
  rentangBeberapaHari,
  rentangHariOperasional,
  rentangShift,
  selisihMenit,
  zonaAman,
  zonaValid,
} from './waktuKafe';

// Kafe Jakarta yang hari operasionalnya berganti tengah malam (paling umum).
const JKT = { timezone: 'Asia/Jakarta', awalHariOperasional: 0 };
// Kafe Jakarta yang tutup dini hari — hari operasional berganti pukul 05:00.
const JKT_MALAM = { timezone: 'Asia/Jakarta', awalHariOperasional: 5 * 60 };

describe('zona waktu', () => {
  it('mengenali zona IANA yang sah dan menolak yang salah ketik', () => {
    expect(zonaValid('Asia/Jakarta')).toBe(true);
    expect(zonaValid('Asia/Makassar')).toBe(true);
    expect(zonaValid('Asia/Jakartaa')).toBe(false);
    expect(zonaValid('bukan/zona')).toBe(false);
  });

  // Zona yang rusak tidak boleh menjatuhkan laporan — ia jatuh ke bawaan.
  it('jatuh ke Asia/Jakarta untuk zona yang tidak dikenal', () => {
    expect(zonaAman('Asia/Jakartaa')).toBe('Asia/Jakarta');
    expect(zonaAman(null)).toBe('Asia/Jakarta');
    expect(zonaAman('')).toBe('Asia/Jakarta');
    expect(zonaAman('Asia/Makassar')).toBe('Asia/Makassar');
  });
});

describe('waktu dinding kafe', () => {
  // 2026-03-01T17:30:00Z = 2026-03-02 00:30 WIB. Inilah kasus yang dulu salah:
  // tanggal UTC dan tanggal kafe berbeda.
  const lewatTengahMalamWib = new Date('2026-03-01T17:30:00Z');

  it('membaca tanggal menurut zona kafe, bukan UTC', () => {
    expect(kunciTanggal(lewatTengahMalamWib, 'Asia/Jakarta')).toBe('2026-03-02');
    expect(kunciTanggal(lewatTengahMalamWib, 'UTC')).toBe('2026-03-01');
  });

  it('memecah instant menjadi bagian waktu kafe', () => {
    const b = bagianWaktu(lewatTengahMalamWib, 'Asia/Jakarta');
    expect(b).toMatchObject({ tahun: 2026, bulan: 3, hari: 2, jam: 0, menit: 30 });
  });

  // Tengah malam harus terbaca 0, bukan 24 — kalau tidak, seluruh aritmetika
  // hari bergeser.
  it('membaca tengah malam sebagai menit 0', () => {
    const tengahMalam = new Date('2026-03-01T17:00:00Z'); // 00:00 WIB
    expect(menitDalamHari(tengahMalam, 'Asia/Jakarta')).toBe(0);
  });

  it('menghitung menit dalam hari menurut zona kafe', () => {
    expect(menitDalamHari(lewatTengahMalamWib, 'Asia/Jakarta')).toBe(30);
    expect(menitDalamHari(lewatTengahMalamWib, 'UTC')).toBe(17 * 60 + 30);
  });

  it('memakai penomoran hari ISO (Senin = 1, Minggu = 7)', () => {
    // 2026-03-02 adalah hari Senin.
    expect(hariISO(lewatTengahMalamWib, 'Asia/Jakarta')).toBe(1);
    // Di UTC instant yang sama masih Minggu 2026-03-01.
    expect(hariISO(lewatTengahMalamWib, 'UTC')).toBe(7);
  });

  it('mengubah waktu dinding kafe menjadi instant UTC', () => {
    const instant = dariWaktuLokal(2026, 3, 2, 7, 0, 'Asia/Jakarta');
    // 07:00 WIB = 00:00 UTC (WIB = UTC+7, tanpa DST).
    expect(instant.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  // Bolak-balik harus kembali ke titik semula, apa pun zonanya.
  it('konsisten bolak-balik antara instant dan waktu dinding', () => {
    for (const tz of ['Asia/Jakarta', 'Asia/Makassar', 'UTC', 'Europe/London']) {
      const asli = new Date('2026-07-15T09:23:00Z');
      const b = bagianWaktu(asli, tz);
      const kembali = dariWaktuLokal(b.tahun, b.bulan, b.hari, b.jam, b.menit, tz);
      expect(kembali.toISOString()).toBe(asli.toISOString());
    }
  });
});

describe('hari operasional', () => {
  // Inti perbaikan Bagian J: penjualan dini hari milik hari operasional
  // SEBELUMNYA, karena kasirnya belum menutup laci.
  it('memasukkan penjualan pukul 02:00 ke hari operasional kemarin', () => {
    const diniHari = dariWaktuLokal(2026, 3, 6, 2, 0, 'Asia/Jakarta');
    expect(kunciHariOperasional(diniHari, JKT_MALAM)).toBe('2026-03-05');
    // Kafe yang bergantinya tengah malam melihatnya sebagai hari yang baru.
    expect(kunciHariOperasional(diniHari, JKT)).toBe('2026-03-06');
  });

  it('memasukkan penjualan setelah pergantian ke hari operasional berjalan', () => {
    const pagi = dariWaktuLokal(2026, 3, 6, 5, 0, 'Asia/Jakarta');
    expect(kunciHariOperasional(pagi, JKT_MALAM)).toBe('2026-03-06');
  });

  it('menghasilkan rentang yang persis sepanjang satu hari', () => {
    const r = rentangHariOperasional('2026-03-05', JKT_MALAM);
    expect(r.mulai.toISOString()).toBe('2026-03-04T22:00:00.000Z'); // 05:00 WIB
    expect(r.selesai.toISOString()).toBe('2026-03-05T22:00:00.000Z');
    expect(selisihMenit(r.mulai, r.selesai)).toBe(24 * 60);
  });

  // Setengah terbuka: satu transaksi tidak boleh diklaim dua hari sekaligus.
  it('menyambung tanpa tumpang tindih antara dua hari berurutan', () => {
    const a = rentangHariOperasional('2026-03-05', JKT_MALAM);
    const b = rentangHariOperasional('2026-03-06', JKT_MALAM);
    expect(a.selesai.toISOString()).toBe(b.mulai.toISOString());
  });

  it('menghitung rentang beberapa hari sekaligus', () => {
    const r = rentangBeberapaHari('2026-03-07', 7, JKT);
    expect(r.mulai.toISOString()).toBe(
      rentangHariOperasional('2026-03-01', JKT).mulai.toISOString(),
    );
    expect(selisihMenit(r.mulai, r.selesai)).toBe(7 * 24 * 60);
  });

  it('menggeser kunci tanggal melintasi bulan dan tahun kabisat', () => {
    expect(geserKunci('2026-03-01', -1)).toBe('2026-02-28');
    expect(geserKunci('2024-03-01', -1)).toBe('2024-02-29'); // kabisat
    expect(geserKunci('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('menyusun deret hari yang inklusif di kedua ujung', () => {
    expect(deretHari('2026-03-05', '2026-03-08')).toEqual([
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  // Rentang terbalik tidak boleh menjadi perulangan tak berujung.
  it('mengembalikan deret kosong bila akhir mendahului awal', () => {
    expect(deretHari('2026-03-08', '2026-03-05')).toEqual([]);
  });
});

describe('rentang shift', () => {
  const pagi = { menitMulai: 7 * 60, menitSelesai: 15 * 60, lewatTengahMalam: false };
  const malam = { menitMulai: 22 * 60, menitSelesai: 6 * 60, lewatTengahMalam: true };

  it('menghitung shift biasa dalam satu hari kalender', () => {
    const r = rentangShift('2026-03-05', pagi, 'Asia/Jakarta');
    expect(r.mulai.toISOString()).toBe('2026-03-05T00:00:00.000Z'); // 07:00 WIB
    expect(selisihMenit(r.mulai, r.selesai)).toBe(8 * 60);
  });

  // Bagian P nomor 19: shift melewati tengah malam harus berdurasi positif.
  it('mengakhiri shift malam di tanggal berikutnya', () => {
    const r = rentangShift('2026-03-05', malam, 'Asia/Jakarta');
    expect(kunciTanggal(r.mulai, 'Asia/Jakarta')).toBe('2026-03-05');
    expect(kunciTanggal(r.selesai, 'Asia/Jakarta')).toBe('2026-03-06');
    expect(selisihMenit(r.mulai, r.selesai)).toBe(8 * 60);
    expect(r.selesai.getTime()).toBeGreaterThan(r.mulai.getTime());
  });

  it('menangani shift malam yang melewati pergantian bulan', () => {
    const r = rentangShift('2026-03-31', malam, 'Asia/Jakarta');
    expect(kunciTanggal(r.selesai, 'Asia/Jakarta')).toBe('2026-04-01');
    expect(selisihMenit(r.mulai, r.selesai)).toBe(8 * 60);
  });

  it('menangani shift 24 jam yang ditandai melewati tengah malam', () => {
    const nonstop = { menitMulai: 8 * 60, menitSelesai: 8 * 60, lewatTengahMalam: true };
    const r = rentangShift('2026-03-05', nonstop, 'Asia/Jakarta');
    expect(selisihMenit(r.mulai, r.selesai)).toBe(24 * 60);
  });
});

describe('format jam', () => {
  it('memformat menit menjadi HH:MM', () => {
    expect(formatJam(0)).toBe('00:00');
    expect(formatJam(7 * 60)).toBe('07:00');
    expect(formatJam(22 * 60 + 30)).toBe('22:30');
    expect(formatJam(1439)).toBe('23:59');
  });

  it('membaca HH:MM menjadi menit', () => {
    expect(parseJam('00:00')).toBe(0);
    expect(parseJam('07:30')).toBe(450);
    expect(parseJam('23:59')).toBe(1439);
  });

  it('menolak bentuk jam yang tidak sah', () => {
    expect(parseJam('24:00')).toBeNull();
    expect(parseJam('7:30')).toBeNull();
    expect(parseJam('07:60')).toBeNull();
    expect(parseJam('pagi')).toBeNull();
  });
});

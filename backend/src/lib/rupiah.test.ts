import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  RupiahError,
  dariDecimal,
  formatRupiah,
  jumlah,
  keBigInt,
  keDecimal,
  keNumber,
  keNumberAtauNol,
} from './rupiah';

describe('keNumber', () => {
  it('mengubah BigInt menjadi number untuk DTO', () => {
    expect(keNumber(50_000n)).toBe(50_000);
    expect(keNumber(0n)).toBe(0);
    expect(keNumber(-25_000n)).toBe(-25_000);
  });

  it('meneruskan null/undefined apa adanya', () => {
    expect(keNumber(null)).toBeNull();
    expect(keNumber(undefined)).toBeNull();
  });

  it('menjadikan null sebagai nol bila diminta', () => {
    expect(keNumberAtauNol(null)).toBe(0);
    expect(keNumberAtauNol(7_500n)).toBe(7_500);
  });

  // Lebih baik berhenti dengan galat yang jelas daripada diam-diam membulatkan
  // angka yang sudah melewati ketelitian `number`.
  it('menolak nilai di luar jangkauan aman JavaScript', () => {
    const terlaluBesar = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => keNumber(terlaluBesar)).toThrow(RupiahError);
    expect(() => keNumber(-terlaluBesar)).toThrow(RupiahError);
  });
});

describe('keBigInt', () => {
  it('mengubah bilangan bulat menjadi BigInt', () => {
    expect(keBigInt(50_000)).toBe(50_000n);
    expect(keBigInt(0)).toBe(0n);
  });

  // Pembulatan diam-diam di perbatasan adalah asal-usul selisih kas yang tidak
  // bisa dijelaskan siapa pun. Lebih baik ditolak selagi pengirimnya masih ada.
  it('menolak pecahan alih-alih membulatkannya', () => {
    expect(() => keBigInt(50_000.5)).toThrow(RupiahError);
    expect(() => keBigInt(0.1)).toThrow(RupiahError);
  });

  it('menolak nilai yang bukan bilangan', () => {
    expect(() => keBigInt(Number.NaN)).toThrow(RupiahError);
    expect(() => keBigInt(Number.POSITIVE_INFINITY)).toThrow(RupiahError);
  });
});

describe('jembatan ke kolom Decimal lama', () => {
  it('membaca Decimal menjadi rupiah bulat', () => {
    expect(dariDecimal(new Prisma.Decimal('15000.00'))).toBe(15_000n);
    expect(dariDecimal(new Prisma.Decimal('0'))).toBe(0n);
    expect(dariDecimal(null)).toBe(0n);
  });

  // Nilai yang lahir dari perkalian bisa berujung 14999.999999; memotongnya
  // menghasilkan selisih satu rupiah di setiap baris.
  it('membulatkan, bukan memotong', () => {
    expect(dariDecimal(new Prisma.Decimal('14999.999999'))).toBe(15_000n);
    expect(dariDecimal(new Prisma.Decimal('15000.4'))).toBe(15_000n);
    expect(dariDecimal(new Prisma.Decimal('15000.5'))).toBe(15_001n);
  });

  it('menulis kembali ke Decimal untuk kolom lama', () => {
    expect(keDecimal(15_000n).toString()).toBe('15000');
    expect(keDecimal(0).toString()).toBe('0');
  });
});

describe('jumlah', () => {
  it('menjumlahkan tanpa keluar dari BigInt', () => {
    expect(jumlah([1_000n, 2_000n, 3_000n])).toBe(6_000n);
    expect(jumlah([])).toBe(0n);
  });

  // Justru total kas yang harus tepat sampai rupiah terakhir — menjumlahkan
  // lewat `number` akan kehilangan ketelitian pada angka sebesar ini.
  it('tetap tepat pada nilai yang melewati ketelitian number', () => {
    const besar = BigInt(Number.MAX_SAFE_INTEGER);
    expect(jumlah([besar, 1n])).toBe(besar + 1n);
  });
});

describe('formatRupiah', () => {
  it('mengelompokkan ribuan dengan titik', () => {
    expect(formatRupiah(0)).toBe('Rp 0');
    expect(formatRupiah(1_000)).toBe('Rp 1.000');
    expect(formatRupiah(1_250_000n)).toBe('Rp 1.250.000');
    expect(formatRupiah(999)).toBe('Rp 999');
  });

  // Selisih kas yang kurang ditampilkan sebagai angka negatif, bukan
  // disembunyikan.
  it('menampilkan nilai negatif dengan tanda minus di depan', () => {
    expect(formatRupiah(-50_000n)).toBe('-Rp 50.000');
  });
});

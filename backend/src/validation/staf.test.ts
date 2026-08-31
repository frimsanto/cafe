import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/ApiError';
import { parseLabelPerangkat } from './staf.validation';
import { buatKode, normalisasiKode } from '../lib/kodePemasangan';

/**
 * Nama terminal & kode pemasangan — dua hal yang di produksi pernah tertukar.
 *
 * Tiga terminal pernah terdaftar bernama `0b41506b3ca29a87…`,
 * `budiman@gmail.com`, dan `123123`, lalu dicabut semua dalam dua setengah
 * menit tanpa satu pun pernah terpasang. Itu bukan pemilik yang ceroboh; itu
 * alur yang meminta manusia memindahkan 64 karakter heksadesimal antar layar.
 */

describe('parseLabelPerangkat', () => {
  it('menerima nama tempat yang wajar', () => {
    expect(parseLabelPerangkat('Kasir Depan')).toBe('Kasir Depan');
    expect(parseLabelPerangkat('  Bar Lantai 2  ')).toBe('Bar Lantai 2');
    // Spasi berturut dirapikan: dua nama yang terlihat sama di layar tidak
    // boleh menjadi dua baris berbeda.
    expect(parseLabelPerangkat('Kasir   Depan')).toBe('Kasir Depan');
  });

  it('menolak token perangkat yang tertempel ke kolom nama', () => {
    const token = '0b41506b3ca29a87d4f1e2c3b5a69780';
    try {
      parseLabelPerangkat(token);
      throw new Error('seharusnya ditolak');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(400);
      // Pesannya menjelaskan APA yang terjadi, bukan sekadar "tidak valid".
      expect((err as ApiError).message).toMatch(/token perangkat/i);
    }
  });

  it('menolak alamat email sebagai nama terminal', () => {
    try {
      parseLabelPerangkat('budiman@gmail.com');
      throw new Error('seharusnya ditolak');
    } catch (err) {
      expect((err as ApiError).message).toMatch(/email/i);
    }
  });

  it('menolak kode pemasangan yang salah dimasukkan di sini', () => {
    try {
      parseLabelPerangkat('KSR-ABCD-2345');
      throw new Error('seharusnya ditolak');
    } catch (err) {
      expect((err as ApiError).message).toMatch(/kode pemasangan/i);
    }
  });

  it('menolak nama kosong, terlalu pendek, dan terlalu panjang', () => {
    for (const nilai of ['', '   ', 'A', 'x'.repeat(61), 42, null, undefined]) {
      expect(() => parseLabelPerangkat(nilai)).toThrow(ApiError);
    }
  });

  // `123123` memang terjadi di produksi, tapi angka bisa jadi nama meja yang
  // sah ("2"). Yang ditolak hanyalah bentuk yang PASTI keliru.
  it('membiarkan nama pendek berangka lewat', () => {
    expect(parseLabelPerangkat('Kasir 2')).toBe('Kasir 2');
    expect(parseLabelPerangkat('123123')).toBe('123123');
  });
});

describe('kode pemasangan', () => {
  it('berbentuk KSR-XXXX-XXXX tanpa huruf yang mudah tertukar', () => {
    for (let i = 0; i < 200; i += 1) {
      const kode = buatKode();
      expect(kode).toMatch(/^KSR-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      // I, L, O, U dibuang: masing-masing punya kembaran yang salah ketik.
      expect(kode.slice(4).replace('-', '')).not.toMatch(/[ILOU]/);
    }
  });

  /**
   * Yang benar-benar menolong bukan abjadnya melainkan ini: kode yang menolak
   * salah ketik yang sudah diketahui bentuknya adalah kode yang membuat orang
   * mengira terminalnya rusak.
   */
  it('memaafkan salah ketik klasik, spasi, huruf kecil, dan awalan hilang', () => {
    const baku = normalisasiKode('KSR-ABCD-2345');
    expect(baku).toBe('KSR-ABCD-2345');

    for (const varian of [
      'ksr-abcd-2345',
      'KSRABCD2345',
      'abcd2345',
      '  KSR ABCD 2345  ',
      'KSR-ABCD-2345',
    ]) {
      expect(normalisasiKode(varian)).toBe(baku);
    }
  });

  it('memetakan O→0, I→1, L→1', () => {
    // Layar menampilkan 0 dan 1; yang mengetik melihat O dan I.
    expect(normalisasiKode('KSR-O123-4567')).toBe(normalisasiKode('KSR-0123-4567'));
    expect(normalisasiKode('KSR-I234-5678')).toBe(normalisasiKode('KSR-1234-5678'));
    expect(normalisasiKode('KSR-L234-5678')).toBe(normalisasiKode('KSR-1234-5678'));
  });

  it('menolak panjang yang salah dan lambang di luar abjad', () => {
    for (const buruk of ['', 'KSR-ABC-2345', 'KSR-ABCD-234', 'ABCD2345X', 'KSR-ABCD-234U']) {
      expect(normalisasiKode(buruk)).toBeNull();
    }
  });

  it('menghasilkan kode yang praktis tidak pernah berulang', () => {
    const kumpulan = new Set(Array.from({ length: 500 }, () => buatKode()));
    expect(kumpulan.size).toBe(500);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isStatusPembayaran,
  labelStatus,
  normalisasiStatus,
  statusFinal,
  statusLunas,
} from './paymentStatus';

describe('normalisasiStatus', () => {
  it('meneruskan status kanonik apa adanya', () => {
    expect(normalisasiStatus('AWAITING_VERIFICATION')).toBe('AWAITING_VERIFICATION');
    expect(normalisasiStatus('PARTIALLY_REFUNDED')).toBe('PARTIALLY_REFUNDED');
  });

  // Inti kompatibilitas data lama: baris yang ditulis sebelum migrasi (dan
  // klien PWA yang belum dimuat ulang) masih memakai kosakata Indonesia.
  it('memetakan kosakata lama ke kanonik', () => {
    expect(normalisasiStatus('MENUNGGU')).toBe('UNPAID');
    expect(normalisasiStatus('LUNAS')).toBe('PAID');
    expect(normalisasiStatus('GAGAL')).toBe('FAILED');
  });

  // Anggapan paling aman untuk nilai yang tidak dikenal adalah "belum ada uang
  // yang diterima" — bukan lunas.
  it('menganggap null / nilai asing sebagai UNPAID', () => {
    expect(normalisasiStatus(null)).toBe('UNPAID');
    expect(normalisasiStatus(undefined)).toBe('UNPAID');
    expect(normalisasiStatus('')).toBe('UNPAID');
    expect(normalisasiStatus('ENTAH_APA')).toBe('UNPAID');
  });
});

describe('statusLunas', () => {
  it('hanya PAID yang berarti uang sudah diterima penuh', () => {
    expect(statusLunas('PAID')).toBe(true);
    for (const status of [
      'UNPAID',
      'AWAITING_VERIFICATION',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ] as const) {
      expect(statusLunas(status)).toBe(false);
    }
  });
});

describe('statusFinal', () => {
  it('UNPAID & AWAITING_VERIFICATION belum final', () => {
    expect(statusFinal('UNPAID')).toBe(false);
    // Yang ditunggu adalah kasir menekan tombol; halaman tamu harus terus
    // memeriksa sampai itu terjadi.
    expect(statusFinal('AWAITING_VERIFICATION')).toBe(false);
  });

  it('sisanya final', () => {
    for (const status of [
      'PAID',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ] as const) {
      expect(statusFinal(status)).toBe(true);
    }
  });
});

describe('isStatusPembayaran', () => {
  it('menolak kosakata lama dan sampah', () => {
    expect(isStatusPembayaran('PAID')).toBe(true);
    expect(isStatusPembayaran('LUNAS')).toBe(false);
    expect(isStatusPembayaran(42)).toBe(false);
    expect(isStatusPembayaran(null)).toBe(false);
  });
});

describe('labelStatus', () => {
  it('punya label Indonesia untuk setiap status, termasuk yang lama', () => {
    expect(labelStatus('AWAITING_VERIFICATION')).toBe('Menunggu Verifikasi');
    expect(labelStatus('PARTIALLY_REFUNDED')).toBe('Dikembalikan Sebagian');
    expect(labelStatus('LUNAS')).toBe('Lunas');
    expect(labelStatus(null)).toBe('Belum Dibayar');
  });
});

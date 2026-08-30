import { describe, expect, it } from 'vitest';
import {
  labelStatus,
  nadaStatus,
  normalisasiStatus,
  statusFinal,
  statusLunas,
} from './paymentStatus';

/**
 * Cerminan uji yang sama di backend. Keduanya sengaja ada: peta status di sini
 * adalah SALINAN, dan salinan yang menyimpang tanpa ketahuan persis itulah yang
 * dulu membuat satu layar menyebut "Menunggu" untuk keadaan yang oleh layar
 * lain sudah disebut "Gagal".
 */
describe('normalisasiStatus', () => {
  it('menerima kosakata baru dan lama', () => {
    expect(normalisasiStatus('AWAITING_VERIFICATION')).toBe('AWAITING_VERIFICATION');
    expect(normalisasiStatus('LUNAS')).toBe('PAID');
    expect(normalisasiStatus('MENUNGGU')).toBe('UNPAID');
    expect(normalisasiStatus('GAGAL')).toBe('FAILED');
  });

  it('nilai asing dianggap belum dibayar, bukan lunas', () => {
    expect(normalisasiStatus('APA_PUN')).toBe('UNPAID');
    expect(normalisasiStatus(null)).toBe('UNPAID');
  });
});

describe('statusLunas', () => {
  it('menunggu verifikasi BUKAN lunas', () => {
    expect(statusLunas('AWAITING_VERIFICATION')).toBe(false);
    expect(statusLunas('PAID')).toBe(true);
  });
});

describe('statusFinal', () => {
  // Yang ditunggu adalah kasir menekan tombol — polling harus jalan terus.
  it('menunggu verifikasi belum final', () => {
    expect(statusFinal('AWAITING_VERIFICATION')).toBe(false);
    expect(statusFinal('UNPAID')).toBe(false);
    expect(statusFinal('EXPIRED')).toBe(true);
    expect(statusFinal('REFUNDED')).toBe(true);
  });
});

describe('nadaStatus', () => {
  it('memetakan setiap status ke satu nada warna', () => {
    expect(nadaStatus('PAID')).toBe('sukses');
    expect(nadaStatus('AWAITING_VERIFICATION')).toBe('menunggu');
    expect(nadaStatus('EXPIRED')).toBe('gagal');
    expect(nadaStatus('CANCELLED')).toBe('gagal');
    expect(nadaStatus('UNPAID')).toBe('netral');
  });
});

describe('labelStatus', () => {
  it('memakai istilah yang dimengerti pemilik kafe', () => {
    expect(labelStatus('AWAITING_VERIFICATION')).toBe('Menunggu Verifikasi');
    expect(labelStatus('UNPAID')).toBe('Belum Dibayar');
    expect(labelStatus('PARTIALLY_REFUNDED')).toBe('Dikembalikan Sebagian');
  });
});

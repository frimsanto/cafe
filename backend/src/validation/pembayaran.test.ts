import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/ApiError';
import {
  parseManualPaymentInput,
  parsePermintaanManualInput,
  parseTolakPembayaranInput,
} from './pembayaran.validation';

const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';

describe('parseManualPaymentInput', () => {
  it('menerima konfirmasi kasir yang lengkap', () => {
    expect(
      parseManualPaymentInput({
        orderId: ORDER_ID,
        metode: 'TUNAI',
        nominal: 50000,
        catatanKasir: '  uang pas  ',
        referensi: 'REF-1',
      }),
    ).toEqual({
      orderId: ORDER_ID,
      metode: 'TUNAI',
      nominal: 50000,
      catatanKasir: 'uang pas',
      referensi: 'REF-1',
    });
  });

  // Dihentikan sebelum menyentuh database — kiriman ngawur dijawab 400
  // berbahasa Indonesia, bukan 500 dari galat query Prisma.
  it('menolak orderId yang bukan UUID', () => {
    expect(() =>
      parseManualPaymentInput({ orderId: 'bukan-uuid', metode: 'TUNAI', nominal: 1 }),
    ).toThrow(/bukan id pesanan/i);
  });

  it('menolak nominal nol, negatif, atau bukan angka', () => {
    for (const nominal of [0, -5, '50000', NaN]) {
      expect(() =>
        parseManualPaymentInput({ orderId: ORDER_ID, metode: 'TUNAI', nominal }),
      ).toThrow(ApiError);
    }
  });

  it('menolak nominal dengan lebih dari dua desimal', () => {
    expect(() =>
      parseManualPaymentInput({ orderId: ORDER_ID, metode: 'TUNAI', nominal: 1.005 }),
    ).toThrow(/2 angka desimal/i);
  });

  it('menolak metode di luar daftar manual', () => {
    expect(() =>
      parseManualPaymentInput({ orderId: ORDER_ID, metode: 'MIDTRANS', nominal: 1000 }),
    ).toThrow(ApiError);
  });
});

describe('parsePermintaanManualInput', () => {
  // TIDAK ada `nominal`: yang menentukan berapa yang harus dibayar adalah
  // tagihan di server, bukan angka yang dikirim HP tamu.
  it('tidak menerima nominal dari klien', () => {
    const hasil = parsePermintaanManualInput({
      orderId: ORDER_ID,
      metode: 'TRANSFER',
      nominal: 1,
    });
    expect(hasil).not.toHaveProperty('nominal');
  });

  // Tanpa ini, kolom bukti menjadi tempat menitipkan tautan ke mana saja —
  // yang kemudian dibuka kasir dengan sekali klik.
  it('menolak bukti dari luar penyimpanan CafeOS', () => {
    expect(() =>
      parsePermintaanManualInput({
        orderId: ORDER_ID,
        metode: 'TRANSFER',
        buktiUrl: 'https://situs-asing.test/gambar.png',
      }),
    ).toThrow(/unggahan dari CafeOS/i);
  });

  it('menerima bukti hasil unggahan CafeOS', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/cafeos/x/bukti/a.jpg';
    expect(
      parsePermintaanManualInput({ orderId: ORDER_ID, metode: 'TRANSFER', buktiUrl: url })
        .buktiUrl,
    ).toBe(url);
  });
});

describe('parseTolakPembayaranInput', () => {
  it('menuntut alasan yang berarti', () => {
    expect(() => parseTolakPembayaranInput({ orderId: ORDER_ID })).toThrow(/wajib diisi/i);
    expect(() =>
      parseTolakPembayaranInput({ orderId: ORDER_ID, alasan: '  x ' }),
    ).toThrow(/minimal 3/i);
  });

  it('menerima dan merapikan alasan', () => {
    expect(
      parseTolakPembayaranInput({ orderId: ORDER_ID, alasan: '  dana tidak masuk  ' }),
    ).toEqual({ orderId: ORDER_ID, alasan: 'dana tidak masuk' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  BOLEH_DI_CHECKOUT,
  isManualMethod,
  labelMidtransPaymentType,
  labelMetode,
  mapDokuStatus,
  mapMidtransStatus,
} from './paymentMethods';

describe('mapMidtransStatus', () => {
  it('settlement & capture bersih berarti LUNAS', () => {
    expect(mapMidtransStatus('settlement')).toBe('PAID');
    expect(mapMidtransStatus('capture', 'accept')).toBe('PAID');
  });

  // `capture` yang masih ditinjau Midtrans BELUM boleh dianggap lunas —
  // dananya bisa ditarik kembali setelah tinjauan.
  it('capture dengan fraud challenge belum lunas', () => {
    expect(mapMidtransStatus('capture', 'challenge')).toBe('UNPAID');
  });

  it('pending berarti belum dibayar', () => {
    expect(mapMidtransStatus('pending')).toBe('UNPAID');
  });

  // Ini yang paling penting dibedakan: kedaluwarsa, dibatalkan, dan ditolak
  // punya arti berbeda bagi tamu, dan dulu ketiganya dilebur jadi "GAGAL".
  it('memisahkan deny / cancel / expire', () => {
    expect(mapMidtransStatus('deny')).toBe('FAILED');
    expect(mapMidtransStatus('failure')).toBe('FAILED');
    expect(mapMidtransStatus('cancel')).toBe('CANCELLED');
    expect(mapMidtransStatus('expire')).toBe('EXPIRED');
  });

  // BUG LAMA: `refund` jatuh ke `default` dan mengembalikan pesanan yang sudah
  // lunas ke status menunggu — seolah tamunya tidak pernah membayar.
  it('menangani refund & partial refund', () => {
    expect(mapMidtransStatus('refund')).toBe('REFUNDED');
    expect(mapMidtransStatus('partial_refund')).toBe('PARTIALLY_REFUNDED');
  });

  it('status tak dikenal tidak pernah dianggap lunas', () => {
    expect(mapMidtransStatus('sesuatu_yang_baru')).toBe('UNPAID');
    expect(mapMidtransStatus(undefined)).toBe('UNPAID');
  });
});

describe('mapDokuStatus', () => {
  it('memetakan hasil akhir DOKU', () => {
    expect(mapDokuStatus('SUCCESS')).toBe('PAID');
    expect(mapDokuStatus('settlement')).toBe('PAID');
    expect(mapDokuStatus('PENDING')).toBe('UNPAID');
    expect(mapDokuStatus('EXPIRED')).toBe('EXPIRED');
    expect(mapDokuStatus('CANCELED')).toBe('CANCELLED');
    expect(mapDokuStatus('REFUNDED')).toBe('REFUNDED');
  });

  it('status tak dikenal dianggap belum dibayar, bukan gagal', () => {
    expect(mapDokuStatus('APA_INI')).toBe('UNPAID');
  });
});

describe('BOLEH_DI_CHECKOUT', () => {
  // Aturan domain, bukan preferensi: keduanya menuntut kasir yang hadir
  // memegang uang atau mesin EDC-nya.
  it('tunai & EDC tidak pernah boleh di checkout mandiri', () => {
    expect(BOLEH_DI_CHECKOUT.TUNAI).toBe(false);
    expect(BOLEH_DI_CHECKOUT.EDC).toBe(false);
  });

  it('QRIS statis & transfer boleh — dengan verifikasi kasir', () => {
    expect(BOLEH_DI_CHECKOUT.QRIS_STATIS).toBe(true);
    expect(BOLEH_DI_CHECKOUT.TRANSFER).toBe(true);
  });
});

describe('isManualMethod', () => {
  it('menerima hanya empat kode yang dikenal', () => {
    expect(isManualMethod('TUNAI')).toBe(true);
    expect(isManualMethod('QRIS_STATIS')).toBe(true);
    expect(isManualMethod('MIDTRANS')).toBe(false);
    expect(isManualMethod(null)).toBe(false);
  });
});

describe('label metode', () => {
  it('menerjemahkan kode manual & enum lama', () => {
    expect(labelMetode('QRIS_STATIS')).toBe('QRIS Statis');
    expect(labelMetode('CASH')).toBe('Tunai');
    expect(labelMetode(null)).toBe('-');
    // Label Midtrans sudah siap dibaca — diteruskan apa adanya.
    expect(labelMetode('BCA Virtual Account')).toBe('BCA Virtual Account');
  });

  it('menyusun label virtual account dari bank pada payload', () => {
    expect(labelMidtransPaymentType('bank_transfer', [{ bank: 'bca' }])).toBe(
      'BCA Virtual Account',
    );
    expect(labelMidtransPaymentType('qris')).toBe('QRIS');
  });
});

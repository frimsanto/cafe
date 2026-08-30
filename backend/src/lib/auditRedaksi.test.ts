import { describe, expect, it } from 'vitest';
import { redaksiAudit, samarkan } from './auditRedaksi';

describe('redaksiAudit', () => {
  // Jejak audit hidup selamanya di database dan ikut di setiap backup. Sebuah
  // Server Key yang lolos ke sini membatalkan seluruh gunanya kolom terenkripsi.
  it('tidak pernah meloloskan Server Key, apa pun namanya', () => {
    const hasil = redaksiAudit({
      serverKey: 'Mid-server-RAHASIA',
      server_key: 'Mid-server-RAHASIA',
      serverKeyEnc: 'abc:def:ghi',
      midtransServerKey: 'Mid-server-RAHASIA',
      secret: 'jangan-bocor',
      apiKey: 'jangan-bocor',
    });

    const teks = JSON.stringify(hasil);
    expect(teks).not.toContain('RAHASIA');
    expect(teks).not.toContain('jangan-bocor');
    expect(hasil?.serverKey).toBe('[dihapus]');
  });

  it('menyamarkan nomor rekening menjadi ekornya saja', () => {
    const hasil = redaksiAudit({ bank_nomor_rekening: '1234567890' });
    expect(hasil?.bank_nomor_rekening).toBe('••••7890');
  });

  it('meloloskan nilai yang memang aman dibaca ulang', () => {
    const hasil = redaksiAudit({
      metode: 'QRIS_STATIS',
      aktif: true,
      nominal: 25000,
      clientKey: 'SB-Mid-client-abc',
      kosong: null,
    });
    expect(hasil).toEqual({
      metode: 'QRIS_STATIS',
      aktif: true,
      nominal: 25000,
      // Client Key memang publik — dipakai Snap.js di browser tamu.
      clientKey: 'SB-Mid-client-abc',
      kosong: null,
    });
  });

  it('meratakan array menjadi teks agar log tetap datar', () => {
    expect(redaksiAudit({ aktif: ['TUNAI', 'EDC'] })).toEqual({ aktif: 'TUNAI, EDC' });
  });

  it('mengembalikan null untuk input kosong', () => {
    expect(redaksiAudit(null)).toBeNull();
    expect(redaksiAudit(undefined)).toBeNull();
  });
});

describe('samarkan', () => {
  it('menyisakan empat karakter terakhir', () => {
    expect(samarkan('1234567890')).toBe('••••7890');
  });

  it('menyembunyikan seluruhnya bila terlalu pendek untuk disamarkan', () => {
    expect(samarkan('123')).toBe('••••');
  });
});

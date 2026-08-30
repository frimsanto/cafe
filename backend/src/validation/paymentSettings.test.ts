import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/ApiError';
import {
  parseKodeMetode,
  parseKonfigurasiMetodeInput,
  parseKredensialInput,
  parseMetodeAktifInput,
  parseMode,
} from './paymentSettings.validation';

/** Semua metode dalam keadaan mati — dasar yang diubah tiap uji seperlunya. */
function semuaMetode(ubah: Partial<Record<string, unknown>> = {}) {
  const dasar = ['TUNAI', 'QRIS_STATIS', 'TRANSFER', 'EDC'].map((metode) => ({
    metode,
    aktif: false,
    tersediaDiKasir: true,
    tersediaDiCheckout: false,
    wajibVerifikasiKasir: true,
    ...(ubah[metode] as object | undefined),
  }));
  return { metode: dasar };
}

describe('parseMetodeAktifInput', () => {
  it('menuntut keempat metode dikirim sekaligus', () => {
    expect(() =>
      parseMetodeAktifInput({
        metode: [
          {
            metode: 'TUNAI',
            aktif: true,
            tersediaDiKasir: true,
            tersediaDiCheckout: false,
            wajibVerifikasiKasir: true,
          },
        ],
      }),
    ).toThrow(/belum dikirim/i);
  });

  it('menolak metode yang tidak dikenal', () => {
    expect(() =>
      parseMetodeAktifInput({
        metode: [{ metode: 'BITCOIN', aktif: true }],
      }),
    ).toThrow(ApiError);
  });

  it('menolak kiriman ganda untuk metode yang sama', () => {
    const dua = semuaMetode();
    dua.metode.push(dua.metode[0]);
    expect(() => parseMetodeAktifInput(dua)).toThrow(/lebih dari sekali/i);
  });

  // Aturan domain: tunai & EDC menuntut kasir yang hadir. Ditolak di sini, bukan
  // sekadar disembunyikan di UI.
  it('menolak tunai/EDC yang dipaksa tampil di checkout', () => {
    expect(() =>
      parseMetodeAktifInput(
        semuaMetode({ TUNAI: { aktif: true, tersediaDiCheckout: true } }),
      ),
    ).toThrow(/hanya bisa dipakai di kasir/i);

    expect(() =>
      parseMetodeAktifInput(
        semuaMetode({ EDC: { aktif: true, tersediaDiCheckout: true } }),
      ),
    ).toThrow(/hanya bisa dipakai di kasir/i);
  });

  it('menerima QRIS statis di checkout', () => {
    const hasil = parseMetodeAktifInput(
      semuaMetode({ QRIS_STATIS: { aktif: true, tersediaDiCheckout: true } }),
    );
    expect(hasil.metode.find((m) => m.metode === 'QRIS_STATIS')?.tersediaDiCheckout).toBe(
      true,
    );
  });

  it('menolak field yang bukan boolean', () => {
    expect(() =>
      parseMetodeAktifInput(semuaMetode({ TUNAI: { aktif: 'ya' } })),
    ).toThrow(/true\/false/i);
  });
});

describe('parseKonfigurasiMetodeInput', () => {
  it('menolak nomor rekening berisi huruf', () => {
    expect(() =>
      parseKonfigurasiMetodeInput('TRANSFER', { bankNomorRekening: '12AB56' }),
    ).toThrow(/nomor rekening/i);
  });

  it('menerima nomor rekening berspasi / bertanda hubung', () => {
    const hasil = parseKonfigurasiMetodeInput('TRANSFER', {
      bankNomorRekening: '123 456-7890',
    });
    expect(hasil.bankNomorRekening).toBe('123 456-7890');
  });

  it('membatasi batas waktu pembayaran di rentang yang masuk akal', () => {
    expect(() =>
      parseKonfigurasiMetodeInput('TRANSFER', { batasWaktuMenit: 1 }),
    ).toThrow(/antara 5 menit/i);
    expect(
      parseKonfigurasiMetodeInput('TRANSFER', { batasWaktuMenit: 60 }).batasWaktuMenit,
    ).toBe(60);
    expect(
      parseKonfigurasiMetodeInput('TRANSFER', { batasWaktuMenit: null }).batasWaktuMenit,
    ).toBeNull();
  });

  it('hanya menerima URL https untuk gambar QRIS', () => {
    expect(() =>
      parseKonfigurasiMetodeInput('QRIS_STATIS', {
        qrisImageUrl: 'http://contoh.test/qr.png',
      }),
    ).toThrow(/https/i);
  });

  // Kombinasi "tampil di checkout + tanpa verifikasi" berarti pesanan lunas
  // tanpa ada seorang pun yang menerima uangnya.
  it('menolak checkout tanpa verifikasi kasir', () => {
    expect(() =>
      parseKonfigurasiMetodeInput('TRANSFER', {
        tersediaDiCheckout: true,
        wajibVerifikasiKasir: false,
      }),
    ).toThrow(/wajib diverifikasi kasir/i);
  });

  it('mengabaikan field yang bukan milik metodenya', () => {
    const hasil = parseKonfigurasiMetodeInput('EDC', {
      bankNomorRekening: '1234567890',
      edcProvider: 'BCA',
    });
    expect(hasil.edcProvider).toBe('BCA');
    expect(hasil.bankNomorRekening).toBeUndefined();
  });

  it('mengubah teks kosong menjadi null, bukan string kosong', () => {
    expect(parseKonfigurasiMetodeInput('EDC', { edcProvider: '   ' }).edcProvider).toBeNull();
  });
});

describe('parseKredensialInput — awalan kunci bukan penentu mode', () => {
  // ── Inti perbaikan ─────────────────────────────────────────────────────────
  // Dasbor Midtrans Sandbox tidak selalu menerbitkan kunci berawalan `SB-`.
  // Menolak kunci karena awalannya berarti menolak kredensial yang sah, dan
  // itulah yang terjadi di server produksi: HTTP 400 "Slot Sandbox butuh kunci
  // berawalan SB-" untuk kunci yang disalin langsung dari tab Sandbox.

  it('menerima kunci Sandbox BERAWALAN SB-', () => {
    expect(
      parseKredensialInput('SANDBOX', {
        clientKey: 'SB-Mid-client-abc12345',
        serverKey: 'SB-Mid-server-abc12345',
      }),
    ).toMatchObject({
      clientKey: 'SB-Mid-client-abc12345',
      serverKey: 'SB-Mid-server-abc12345',
    });
  });

  it('menerima kunci Sandbox TANPA awalan SB- (kasus yang dulu ditolak 400)', () => {
    const hasil = parseKredensialInput('SANDBOX', {
      clientKey: 'Mid-client-abc12345',
      serverKey: 'Mid-server-abc12345',
    });
    expect(hasil.clientKey).toBe('Mid-client-abc12345');
    expect(hasil.serverKey).toBe('Mid-server-abc12345');
  });

  it('kunci tanpa SB- di slot Sandbox hanya memberi peringatan, bukan galat', () => {
    const hasil = parseKredensialInput('SANDBOX', { serverKey: 'Mid-server-abc12345' });
    expect(hasil.serverKey).toBe('Mid-server-abc12345');
    expect(hasil.peringatan?.join(' ')).toMatch(/wajar/i);
  });

  it('kunci berawalan SB- di slot Production juga hanya peringatan', () => {
    const hasil = parseKredensialInput('PRODUCTION', {
      serverKey: 'SB-Mid-server-abc12345',
    });
    // Tersimpan — tes koneksi ke endpoint Production yang akan menolaknya
    // kalau ia memang kunci Sandbox. Bukan tebakan dari teks.
    expect(hasil.serverKey).toBe('SB-Mid-server-abc12345');
    expect(hasil.peringatan?.join(' ')).toMatch(/Sandbox/i);
  });

  it('menerima kunci yang sama sekali tidak berpola Mid-…', () => {
    // Format kunci Midtrans di luar kendali kami dan bisa berubah. Yang berhak
    // menyatakan sebuah kunci tidak sah adalah Midtrans sendiri.
    expect(
      parseKredensialInput('SANDBOX', { serverKey: 'kunci-gaya-baru-2026-xyz' }).serverKey,
    ).toBe('kunci-gaya-baru-2026-xyz');
  });

  // ── Bentuk: yang tetap ditolak ────────────────────────────────────────────

  it('menolak Client Key kosong', () => {
    expect(() => parseKredensialInput('SANDBOX', { clientKey: '   ' })).toThrow(
      /wajib diisi/i,
    );
    expect(() => parseKredensialInput('SANDBOX', { clientKey: null })).toThrow(
      /wajib diisi/i,
    );
  });

  it('menolak kunci yang mengandung spasi atau baris baru di tengah', () => {
    expect(() =>
      parseKredensialInput('SANDBOX', { serverKey: 'Mid-server-abc Mid-server-def' }),
    ).toThrow(/spasi/i);
    expect(() =>
      parseKredensialInput('SANDBOX', { clientKey: 'Mid-client\nabc12345' }),
    ).toThrow(/spasi/i);
  });

  it('menolak kunci yang panjangnya tidak masuk akal', () => {
    expect(() => parseKredensialInput('SANDBOX', { serverKey: 'abc' })).toThrow(
      /panjang/i,
    );
    expect(() =>
      parseKredensialInput('SANDBOX', { serverKey: 'M'.repeat(500) }),
    ).toThrow(/panjang/i);
  });

  // ── Trim ──────────────────────────────────────────────────────────────────

  it('memangkas whitespace & newline di ujung tanpa mengubah isi kunci', () => {
    const hasil = parseKredensialInput('SANDBOX', {
      clientKey: '  Mid-client-abc12345\n',
      serverKey: '\t Mid-server-abc12345 \r\n',
    });
    expect(hasil.clientKey).toBe('Mid-client-abc12345');
    expect(hasil.serverKey).toBe('Mid-server-abc12345');
  });

  // Kolom Server Key selalu kosong saat dialog dibuka; mengirim string kosong
  // berarti "jangan sentuh yang lama", bukan "kosongkan".
  it('mengabaikan Server Key kosong', () => {
    expect(parseKredensialInput('SANDBOX', { serverKey: '   ' }).serverKey).toBeUndefined();
  });

  it('menolak serverKey yang bukan teks', () => {
    expect(() => parseKredensialInput('SANDBOX', { serverKey: 12345 })).toThrow(
      /harus berupa teks/i,
    );
  });
});

describe('parseMode & parseKodeMetode', () => {
  it('hanya menerima dua mode yang ada', () => {
    expect(parseMode('SANDBOX')).toBe('SANDBOX');
    expect(parseMode('PRODUCTION')).toBe('PRODUCTION');
    expect(() => parseMode('STAGING')).toThrow(ApiError);
    expect(() => parseMode(undefined)).toThrow(ApiError);
  });

  it('menolak kode metode karangan pada URL', () => {
    expect(parseKodeMetode('TUNAI')).toBe('TUNAI');
    expect(() => parseKodeMetode('PAYPAL')).toThrow(ApiError);
  });
});

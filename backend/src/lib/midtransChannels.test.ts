import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KANAL_QRIS_DINAMIS,
  bangunEnabledPayments,
  isKanalSnap,
} from './midtransChannels';

// Uji ini menjaga satu hal yang tidak terlihat di layar mana pun sampai
// terlambat: `enabled_payments` yang salah eja tidak ditolak Midtrans, ia cuma
// diabaikan. Kanal yang hilang karenanya baru ketahuan ketika ada tamu berdiri
// di depan kasir dengan QRIS yang tidak muncul di HP-nya.

const KAFE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const dasar = { cafeId: KAFE, mode: 'SANDBOX' as const };

let envSemula: string | undefined;

beforeEach(() => {
  envSemula = process.env.MIDTRANS_ENABLED_PAYMENTS;
  delete process.env.MIDTRANS_ENABLED_PAYMENTS;
});

afterEach(() => {
  if (envSemula === undefined) delete process.env.MIDTRANS_ENABLED_PAYMENTS;
  else process.env.MIDTRANS_ENABLED_PAYMENTS = envSemula;
  vi.restoreAllMocks();
});

describe('identifier Snap', () => {
  it('mengenali `other_qris` sebagai kanal QRIS dinamis', () => {
    expect(KANAL_QRIS_DINAMIS).toBe('other_qris');
    expect(isKanalSnap('other_qris')).toBe(true);
  });

  // Inilah kekeliruan yang menyembunyikan QRIS di HP selama ini. `qris` adalah
  // identifier Core API untuk `payment_type`, bukan nilai `enabled_payments`.
  it('menolak nilai yang sering dikira benar', () => {
    for (const salah of ['qris', 'QRIS', 'qris_dynamic', 'qris_statis', 'mandiri_bill']) {
      expect(isKanalSnap(salah)).toBe(false);
    }
  });

  it('menolak nilai yang bukan teks', () => {
    expect(isKanalSnap(undefined)).toBe(false);
    expect(isKanalSnap(42)).toBe(false);
  });
});

describe('bangunEnabledPayments — bawaan', () => {
  it('SELALU menyertakan other_qris', () => {
    expect(bangunEnabledPayments(dasar)).toContain('other_qris');
  });

  it('menaruh QRIS paling depan agar tampil lebih dulu di Snap', () => {
    expect(bangunEnabledPayments(dasar)[0]).toBe('other_qris');
  });

  // Daftar lama berniat menawarkan QRIS, GoPay, OVO, BCA VA, BNI VA, dan
  // Mandiri Bill. Yang berubah hanya ejaannya — bukan metodenya.
  it('mempertahankan niat daftar lama dengan ejaan yang benar', () => {
    expect(bangunEnabledPayments(dasar)).toEqual([
      'other_qris',
      'gopay',
      'bca_va',
      'bni_va',
      'echannel',
    ]);
  });

  it('tidak pernah mengirim identifier yang tak dikenal Snap', () => {
    for (const kanal of bangunEnabledPayments(dasar)) {
      expect(isKanalSnap(kanal)).toBe(true);
    }
  });

  it('memberi daftar yang sama untuk Sandbox maupun Production', () => {
    expect(bangunEnabledPayments({ ...dasar, mode: 'PRODUCTION' })).toEqual(
      bangunEnabledPayments({ ...dasar, mode: 'SANDBOX' }),
    );
  });
});

describe('bangunEnabledPayments — pilihan kafe', () => {
  it('memakai kanal pilihan kafe bila ada', () => {
    const hasil = bangunEnabledPayments({
      ...dasar,
      kanalPilihanKafe: ['gopay', 'credit_card'],
    });
    expect(hasil).toEqual(['other_qris', 'gopay', 'credit_card']);
  });

  // Konfigurasi yang mengeja `qris`/`ovo` tetap berujung pada kanal QRIS yang
  // benar, bukan pada kanal yang diam-diam hilang.
  it('membetulkan ejaan yang salah kaprah', () => {
    expect(
      bangunEnabledPayments({ ...dasar, kanalPilihanKafe: ['qris', 'ovo', 'gopay'] }),
    ).toEqual(['other_qris', 'gopay']);
  });

  it('membuang nilai yang tidak dikenal sama sekali', () => {
    expect(
      bangunEnabledPayments({ ...dasar, kanalPilihanKafe: ['gopay', 'tidak-ada'] }),
    ).toEqual(['other_qris', 'gopay']);
  });

  it('tidak menggandakan QRIS bila pilihan kafe sudah memuatnya', () => {
    const hasil = bangunEnabledPayments({
      ...dasar,
      kanalPilihanKafe: ['other_qris', 'gopay'],
    });
    expect(hasil.filter((k) => k === 'other_qris')).toHaveLength(1);
  });
});

describe('bangunEnabledPayments — QRIS dinamis dimatikan', () => {
  it('membuang other_qris tapi tetap menyisakan metode lain', () => {
    const hasil = bangunEnabledPayments({ ...dasar, qrisDinamis: false });
    expect(hasil).not.toContain('other_qris');
    expect(hasil.length).toBeGreaterThan(0);
  });

  // Daftar kosong membuat Snap menampilkan NOL metode — halaman bayar yang
  // tidak bisa dipakai sama sekali.
  it('tidak pernah mengembalikan daftar kosong', () => {
    const hasil = bangunEnabledPayments({
      ...dasar,
      qrisDinamis: false,
      kanalPilihanKafe: ['other_qris'],
    });
    expect(hasil.length).toBeGreaterThan(0);
  });
});

describe('bangunEnabledPayments — MIDTRANS_ENABLED_PAYMENTS', () => {
  it('memakai daftar dari environment', () => {
    process.env.MIDTRANS_ENABLED_PAYMENTS = 'gopay, credit_card ,bca_va';
    expect(bangunEnabledPayments(dasar)).toEqual([
      'other_qris',
      'gopay',
      'credit_card',
      'bca_va',
    ]);
  });

  it('mengabaikan nilai tak dikenal dan mencatatnya', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.MIDTRANS_ENABLED_PAYMENTS = 'gopay,bukan_kanal';

    expect(bangunEnabledPayments(dasar)).toEqual(['other_qris', 'gopay']);
    expect(warn).toHaveBeenCalled();
  });

  it('jatuh ke katalog bawaan bila seluruh isinya tak dikenal', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.MIDTRANS_ENABLED_PAYMENTS = 'ini,itu';
    expect(bangunEnabledPayments(dasar)).toEqual([
      'other_qris',
      'gopay',
      'bca_va',
      'bni_va',
      'echannel',
    ]);
  });

  it('pilihan kafe menang atas environment', () => {
    process.env.MIDTRANS_ENABLED_PAYMENTS = 'credit_card';
    expect(
      bangunEnabledPayments({ ...dasar, kanalPilihanKafe: ['gopay'] }),
    ).toEqual(['other_qris', 'gopay']);
  });
});

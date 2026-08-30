import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  KesalahanDekripsi,
  KesalahanKonfigurasiEnkripsi,
  bentukCiphertextDikenal,
  dekripsi,
  dekripsiAman,
  enkripsi,
  enkripsiSiap,
  enkripsiTerverifikasi,
  pastikanEnkripsiSiap,
} from './enkripsi';

// Uji ini memakai kriptografi ASLI (bukan tiruan): yang sedang diperiksa persis
// perilaku yang gagal di server produksi — kredensial tersimpan yang tidak bisa
// dibuka lagi, dan pertanyaan "salah siapa: kuncinya atau servernya?".

const KUNCI_A = 'a'.repeat(64);
const KUNCI_B = randomBytes(32).toString('hex');
const SERVER_KEY = 'Mid-server-rahasiaSekali123';

const kunciAsli = process.env.ENCRYPTION_KEY;

function pakaiKunci(nilai: string | undefined) {
  if (nilai === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = nilai;
}

beforeEach(() => pakaiKunci(KUNCI_A));
afterEach(() => pakaiKunci(kunciAsli));

// ── Bulak-balik ──────────────────────────────────────────────────────────────

describe('enkripsi & dekripsi', () => {
  it('mengembalikan teks yang sama persis', () => {
    expect(dekripsi(enkripsi(SERVER_KEY))).toBe(SERVER_KEY);
  });

  it('menghasilkan ciphertext berbeda tiap kali (IV acak)', () => {
    expect(enkripsi(SERVER_KEY)).not.toBe(enkripsi(SERVER_KEY));
  });

  it('tidak pernah memuat plaintext di dalam ciphertext', () => {
    expect(enkripsi(SERVER_KEY)).not.toContain('Mid-server');
  });

  it('memakai format iv:authTag:data yang dikenal', () => {
    const c = enkripsi(SERVER_KEY);
    expect(bentukCiphertextDikenal(c)).toBe(true);
    expect(c.split(':')).toHaveLength(3);
  });

  it('menolak ciphertext yang auth tag-nya diubah', () => {
    const [iv, tag, data] = enkripsi(SERVER_KEY).split(':');
    const tagRusak = tag.replace(/^./, tag[0] === 'a' ? 'b' : 'a');
    expect(() => dekripsi(`${iv}:${tagRusak}:${data}`)).toThrow(KesalahanDekripsi);
  });
});

// ── Kompatibilitas ciphertext lama ───────────────────────────────────────────

describe('ciphertext lama', () => {
  // Format tidak pernah berganti, jadi ciphertext yang dipindahkan migrasi
  // `20260830000000_pengaturan_pembayaran` HARUS tetap terbaca dengan kunci
  // yang sama. Kalau uji ini pecah, migrasi berikutnya wajib memigrasikan data.
  it('tetap terbaca selama ENCRYPTION_KEY-nya sama', () => {
    const lama = enkripsi(SERVER_KEY); // dienkripsi "versi lama"
    expect(dekripsi(lama)).toBe(SERVER_KEY); // dibaca "versi baru"
  });

  it('ciphertext dari kunci LAIN dilaporkan sebagai masalah ciphertext', () => {
    pakaiKunci(KUNCI_B);
    const dariKunciLain = enkripsi(SERVER_KEY);
    pakaiKunci(KUNCI_A);

    const hasil = dekripsiAman(dariKunciLain);
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.sebab).toBe('CIPHERTEXT');
  });

  it('blob format asing (mis. plaintext yang telanjur masuk kolom) juga CIPHERTEXT', () => {
    for (const blob of ['Mid-server-plaintext', 'bukan:ciphertext', 'a:b:c', '']) {
      const hasil = dekripsiAman(blob);
      expect(hasil.ok).toBe(false);
      if (!hasil.ok) expect(hasil.sebab).toBe('CIPHERTEXT');
    }
  });

  it('bentukCiphertextDikenal menolak panjang IV/tag yang salah', () => {
    expect(bentukCiphertextDikenal('aa:bb:cc')).toBe(false);
    expect(bentukCiphertextDikenal(enkripsi(SERVER_KEY))).toBe(true);
  });
});

// ── ENCRYPTION_KEY tidak tersedia ────────────────────────────────────────────

describe('ENCRYPTION_KEY tidak tersedia', () => {
  const tidakSah = [undefined, '', '   ', 'terlalu-pendek', 'z'.repeat(64), 'a'.repeat(63)];

  it('enkripsi GAGAL, tidak membuat kunci baru diam-diam', () => {
    for (const nilai of tidakSah) {
      pakaiKunci(nilai);
      expect(enkripsiSiap()).toBe(false);
      // Gagal keras. Kunci dadakan akan berbeda tiap restart dan membuat
      // seluruh kredensial tersimpan menjadi sampah tanpa ada yang tahu.
      expect(() => enkripsi(SERVER_KEY)).toThrow(KesalahanKonfigurasiEnkripsi);
      expect(() => pastikanEnkripsiSiap()).toThrow(KesalahanKonfigurasiEnkripsi);
    }
  });

  it('dekripsi membedakan salah-server dari salah-data', () => {
    const sah = enkripsi(SERVER_KEY);
    pakaiKunci(undefined);

    const hasil = dekripsiAman(sah);
    expect(hasil.ok).toBe(false);
    // KONFIGURASI, bukan CIPHERTEXT: menyuruh pemilik kafe mengetik ulang
    // kuncinya di sini adalah nasihat yang salah — simpanannya pun akan gagal.
    if (!hasil.ok) expect(hasil.sebab).toBe('KONFIGURASI');
    expect(() => dekripsi(sah)).toThrow(KesalahanKonfigurasiEnkripsi);
  });

  it('pesan galatnya tidak pernah memuat kunci enkripsi maupun plaintext', () => {
    pakaiKunci(KUNCI_A);
    const sah = enkripsi(SERVER_KEY);
    pakaiKunci('kunci-tidak-sah');

    const pesan = dekripsiAman(sah).ok ? '' : (dekripsiAman(sah) as { pesan: string }).pesan;
    expect(pesan).not.toContain('kunci-tidak-sah');
    expect(pesan).not.toContain(SERVER_KEY);
  });

  it('menerima kunci sah yang kebetulan berspasi di ujung', () => {
    pakaiKunci(`  ${KUNCI_A}  `);
    expect(enkripsiSiap()).toBe(true);
    expect(dekripsi(enkripsi(SERVER_KEY))).toBe(SERVER_KEY);
  });
});

// ── Round-trip terverifikasi ─────────────────────────────────────────────────

describe('enkripsiTerverifikasi', () => {
  it('mengembalikan ciphertext yang terbukti bisa dibaca lagi', () => {
    const c = enkripsiTerverifikasi(SERVER_KEY);
    expect(dekripsi(c)).toBe(SERVER_KEY);
  });

  it('menolak menyimpan apa pun bila kuncinya tidak ada', () => {
    pakaiKunci(undefined);
    expect(() => enkripsiTerverifikasi(SERVER_KEY)).toThrow(KesalahanKonfigurasiEnkripsi);
  });

  it('bekerja untuk kunci berawalan SB- maupun tanpa awalan', () => {
    for (const kunci of ['SB-Mid-server-abc123', 'Mid-server-abc123']) {
      expect(dekripsi(enkripsiTerverifikasi(kunci))).toBe(kunci);
    }
  });
});

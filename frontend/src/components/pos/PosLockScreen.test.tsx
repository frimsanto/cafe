import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const petugas = vi.fn();
const bukaSesi = vi.fn();
vi.mock('../../api/pos', () => ({
  posApi: {
    petugas: (...a: unknown[]) => petugas(...a),
    bukaSesi: (...a: unknown[]) => bukaSesi(...a),
  },
}));

const masuk = vi.fn();
vi.mock('../../pos/PosSessionContext', () => ({
  usePos: () => ({ perangkat: { label: 'Kasir Depan' }, masuk }),
}));

const { PosError } = await import('../../lib/posClient');
const { default: PosLockScreen } = await import('./PosLockScreen');

/**
 * Layar pergantian petugas.
 *
 * Dua hal yang diuji di sini bukan soal tampilan melainkan soal apa yang BOLEH
 * DIKETAHUI orang yang berdiri di depan layar: daftar petugas terbaca siapa
 * saja yang lewat, dan pesan galat tidak boleh membantu penebak menyempitkan
 * sasarannya.
 */

const DAFTAR = [
  { id: 'staf-1', name: 'Budi', role: 'KASIR' as const },
  { id: 'staf-2', name: 'Sari', role: 'OWNER' as const },
];

beforeEach(() => {
  petugas.mockReset().mockResolvedValue(DAFTAR);
  bukaSesi.mockReset();
  masuk.mockReset().mockResolvedValue(undefined);
});

/** Pilih seorang petugas lalu ketik PIN lewat papan angka di layar. */
async function ketikPin(nama: string, pin: string) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(nama) }));
  for (const angka of pin) {
    await userEvent.click(screen.getByRole('button', { name: angka }));
  }
}

describe('daftar petugas', () => {
  it('menampilkan nama dan peran saja', async () => {
    render(<PosLockScreen />);

    expect(await screen.findByRole('button', { name: /Budi/ })).toBeInTheDocument();
    expect(screen.getByText('Kasir')).toBeInTheDocument();
    expect(screen.getByText('Pemilik')).toBeInTheDocument();
  });

  /**
   * Layar ini berdiri di area kasir dan terbaca tamu yang mengantre. Email dan
   * nomor HP staf tidak punya urusan di sana — dan penanda "akun ini terkunci"
   * pada daftarnya akan memberi tahu penebak akun mana yang sedang rapuh.
   */
  it('tidak membocorkan email, nomor HP, atau status penguncian', async () => {
    await screen.findByText('Kasir Depan', undefined, { timeout: 0 }).catch(() => undefined);
    const { container } = render(<PosLockScreen />);
    await screen.findAllByRole('button', { name: /Budi/ });

    const teks = container.textContent ?? '';
    expect(teks).not.toMatch(/@/);
    expect(teks).not.toMatch(/terkunci/i);
    expect(teks).not.toMatch(/08\d{2}/);
  });

  it('mengatakan apa yang harus dilakukan bila belum ada staf ber-PIN', async () => {
    petugas.mockResolvedValue([]);
    render(<PosLockScreen />);

    expect(await screen.findByText(/Mintalah pemilik menetapkan PIN/i)).toBeInTheDocument();
  });
});

describe('PIN', () => {
  it('membuka sesi saat PIN benar', async () => {
    render(<PosLockScreen />);
    await ketikPin('Budi', '4837');
    await userEvent.click(screen.getByRole('button', { name: /^Masuk$/ }));

    await waitFor(() => expect(masuk).toHaveBeenCalledWith('staf-1', '4837'));
  });

  it('menampilkan pesan gagal dan mengosongkan PIN saat salah', async () => {
    masuk.mockRejectedValue(new PosError('PIN salah. Coba lagi.', 400, 'LAIN'));
    render(<PosLockScreen />);

    await ketikPin('Budi', '9999');
    await userEvent.click(screen.getByRole('button', { name: /^Masuk$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/PIN salah/i);
    // Dikosongkan supaya percobaan berikutnya tidak menambah digit ke yang lama.
    expect(screen.getByRole('button', { name: /^Masuk$/ })).toBeDisabled();
  });

  /**
   * Penguncian ditampilkan lengkap dengan hitung mundurnya — tapi baru SETELAH
   * seseorang memilih nama yang memang ada di daftar, jadi ia tidak
   * membocorkan apa pun yang belum diketahui.
   */
  it('menampilkan hitung mundur saat PIN terkunci', async () => {
    masuk.mockRejectedValue(
      new PosError('Terlalu banyak percobaan. Coba lagi dalam 45 detik.', 409, 'LAIN'),
    );
    render(<PosLockScreen />);

    await ketikPin('Budi', '1111');
    await userEvent.click(screen.getByRole('button', { name: /^Masuk$/ }));

    expect(await screen.findByText(/Coba lagi dalam 45 detik/i)).toBeInTheDocument();
    // Papan angka dikunci — menekan tombol saat terkunci tidak boleh menambah
    // percobaan yang toh akan ditolak.
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Masuk$/ })).toBeDisabled();
  });

  it('tidak mengirim PIN yang lebih pendek dari 4 digit', async () => {
    render(<PosLockScreen />);
    await ketikPin('Budi', '12');

    expect(screen.getByRole('button', { name: /^Masuk$/ })).toBeDisabled();
    expect(masuk).not.toHaveBeenCalled();
  });

  it('bisa kembali memilih petugas lain', async () => {
    render(<PosLockScreen />);
    await ketikPin('Budi', '48');
    await userEvent.click(screen.getByRole('button', { name: /^Batal$/ }));

    expect(await screen.findByRole('button', { name: /Sari/ })).toBeInTheDocument();
  });

  // PIN diketik di layar yang terlihat antrean tamu.
  it('menyembunyikan digit yang sudah diketik', async () => {
    render(<PosLockScreen />);
    await ketikPin('Budi', '4837');

    const input = screen.getByLabelText('PIN') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('4837');
    // Nilainya tidak pernah muncul sebagai teks di layar.
    expect(screen.queryByText('4837')).toBeNull();
  });
});

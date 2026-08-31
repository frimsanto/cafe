import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '../../types/auth';

const kunci = vi.fn();
const nilaiPos = {
  sesi: {
    userId: 'staf-1',
    nama: 'Budi',
    role: 'KASIR' as UserRole,
    cafeId: 'cafe-a',
    cafeName: 'Kopi Senja',
    deviceId: 'terminal-1',
    deviceLabel: 'Kasir Depan',
  },
  perangkat: { terpasang: true, deviceId: 'terminal-1', label: 'Kasir Depan', cafeId: 'cafe-a' },
  shift: null as unknown,
  kunci,
};
vi.mock('../../pos/PosSessionContext', () => ({ usePos: () => nilaiPos }));

const pengguna = { nilai: null as { role: UserRole; name: string; cafeName: string } | null };
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: pengguna.nilai }) }));

const { default: PosShell } = await import('./PosShell');

/**
 * Kerangka layar POS.
 *
 * Bagian A menuntut satu hal yang mudah dilanggar tanpa disadari: kasir TIDAK
 * boleh melihat rel navigasi pemilik. Setiap tautan ke area pemilik yang tampak
 * di layar kasir adalah tautan yang cepat atau lambat ditekan seseorang lalu
 * berakhir di halaman 403 — dan kasir yang melihatnya menyimpulkan aplikasinya
 * rusak, bukan bahwa ia memang tidak berhak.
 */

const SHIFT_AKTIF = {
  id: 'shift-1',
  status: 'AKTIF',
  namaShift: 'Pagi',
  dibukaPada: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  rekap: { tunaiSeharusnya: 150_000 },
};

function pasang(role: UserRole | null) {
  pengguna.nilai = role ? { role, name: 'Budi', cafeName: 'Kopi Senja' } : null;
  return render(
    <MemoryRouter>
      <PosShell tab="KASIR" onTab={vi.fn()}>
        <p>isi</p>
      </PosShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  kunci.mockReset();
  nilaiPos.shift = null;
  nilaiPos.sesi.role = 'KASIR';
});

describe('pemisahan peran', () => {
  it('tidak menampilkan tautan ke dasbor untuk kasir', () => {
    pasang('KASIR');

    expect(screen.queryByRole('link', { name: /Kembali ke Dasbor/i })).toBeNull();
    // Tidak ada satu pun tautan ke area pemilik.
    for (const nama of [/Manajemen Menu/i, /Manajemen Meja/i, /Pembayaran/i, /Dasbor/i]) {
      expect(screen.queryByRole('link', { name: nama })).toBeNull();
    }
  });

  it('memberi pemilik jalan pulang ke dasbor', () => {
    pasang('OWNER');

    const tautan = screen.getByRole('link', { name: /Kembali ke Dasbor/i });
    expect(tautan).toHaveAttribute('href', '/dasbor');
  });

  // Terminal bersama sering tidak ada yang login sama sekali — identitasnya
  // datang dari PIN, bukan dari sesi staf.
  it('tetap berjalan tanpa pengguna yang login', () => {
    pasang(null);

    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dasbor/i })).toBeNull();
  });
});

describe('kepala layar', () => {
  it('menampilkan kafe, terminal, dan nama petugas', () => {
    pasang('KASIR');

    expect(screen.getByText('Kopi Senja')).toBeInTheDocument();
    expect(screen.getByText(/Kasir Depan/)).toBeInTheDocument();
    expect(screen.getByText('Budi')).toBeInTheDocument();
  });

  it('mengatakan terus terang saat shift belum dibuka', () => {
    pasang('KASIR');
    expect(screen.getByText(/Belum membuka shift/i)).toBeInTheDocument();
  });

  it('menampilkan nama shift, durasi berjalan, dan tunai seharusnya', () => {
    nilaiPos.shift = SHIFT_AKTIF;
    pasang('KASIR');

    expect(screen.getByText(/Pagi · 2j 0m/)).toBeInTheDocument();
    expect(screen.getByText('Rp 150.000')).toBeInTheDocument();
  });

  it('menyediakan Ganti Petugas di setiap keadaan', async () => {
    pasang('KASIR');
    await userEvent.click(screen.getByRole('button', { name: /Ganti Petugas/i }));
    expect(kunci).toHaveBeenCalled();
  });
});

describe('navigasi internal', () => {
  it('menampilkan kelima tab milik kasir', () => {
    pasang('KASIR');

    for (const label of [
      'Kasir',
      'Shift Saya',
      'Jadwal Saya',
      'Absensi Saya',
      'Riwayat Saya',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('menandai tab yang sedang aktif', () => {
    pasang('KASIR');
    expect(screen.getByRole('button', { name: 'Kasir' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

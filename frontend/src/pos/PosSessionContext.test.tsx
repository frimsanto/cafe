import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const statusPerangkat = vi.fn();
const sesi = vi.fn();
const statusAbsensi = vi.fn();
const shiftAktif = vi.fn();
const kunciSesi = vi.fn();
const bukaSesi = vi.fn();
const pasang = vi.fn();

vi.mock('../api/pos', () => ({
  posApi: {
    statusPerangkat: (...a: unknown[]) => statusPerangkat(...a),
    sesi: (...a: unknown[]) => sesi(...a),
    statusAbsensi: (...a: unknown[]) => statusAbsensi(...a),
    shiftAktif: (...a: unknown[]) => shiftAktif(...a),
    kunciSesi: (...a: unknown[]) => kunciSesi(...a),
    bukaSesi: (...a: unknown[]) => bukaSesi(...a),
    pasang: (...a: unknown[]) => pasang(...a),
  },
}));

const { PosError } = await import('../lib/posClient');
const { PosSessionProvider, usePos } = await import('./PosSessionContext');

/**
 * Keadaan terminal POS.
 *
 * Yang diuji adalah PEMULIHAN, bukan jalur bahagia: apa yang terjadi saat
 * halaman dimuat ulang di tengah shift, saat sesi kedaluwarsa diam-diam, dan
 * saat "Ganti Petugas" ditekan sementara jaringan sedang putus. Ketiganya
 * menentukan apakah sebuah terminal bisa ditinggalkan tanpa khawatir.
 */

const PERANGKAT = {
  terpasang: true,
  deviceId: 'terminal-1',
  label: 'Kasir Depan',
  cafeId: 'cafe-a',
};
const SESI = {
  userId: 'staf-1',
  nama: 'Budi',
  role: 'KASIR' as const,
  cafeId: 'cafe-a',
  cafeName: 'Kopi Senja',
  deviceId: 'terminal-1',
  deviceLabel: 'Kasir Depan',
};
const SHIFT = {
  id: 'shift-1',
  status: 'AKTIF' as const,
  namaShift: 'Pagi',
  kasir: { id: 'staf-1', nama: 'Budi' },
  terminal: { id: 'terminal-1', label: 'Kasir Depan' },
  dibukaPada: '2026-03-05T00:00:00.000Z',
  ditutupPada: null,
  catatanBuka: null,
  catatanTutup: null,
  attendanceId: 'absen-1',
  rekap: {
    modalAwal: 100_000,
    penjualanTunai: 0,
    kasMasuk: 0,
    kasKeluar: 0,
    tunaiSeharusnya: 100_000,
    tunaiAktual: null,
    selisih: null,
    nonTunai: [],
    totalNonTunai: 0,
    jumlahTransaksi: 0,
    pesananDibatalkan: 0,
    pembayaranDitolak: 0,
  },
  pergerakanKas: [],
  dikoreksi: null,
};

/** Layar telanjang yang hanya menuliskan keadaan context. */
function Papan() {
  const { keadaan, sesi: s, shift, kunci } = usePos();
  return (
    <div>
      <p data-testid="keadaan">{keadaan}</p>
      <p data-testid="nama">{s?.nama ?? '-'}</p>
      <p data-testid="shift">{shift?.namaShift ?? '-'}</p>
      <button type="button" onClick={() => void kunci()}>
        Ganti Petugas
      </button>
    </div>
  );
}

function pasangPapan() {
  return render(
    <PosSessionProvider>
      <Papan />
    </PosSessionProvider>,
  );
}

beforeEach(() => {
  statusPerangkat.mockReset();
  sesi.mockReset();
  statusAbsensi.mockReset().mockResolvedValue({ absensi: null, jadwalCocok: [] });
  shiftAktif.mockReset().mockResolvedValue(null);
  kunciSesi.mockReset().mockResolvedValue({ terkunci: true });
  bukaSesi.mockReset();
  pasang.mockReset();
});

describe('menentukan keadaan saat halaman dibuka', () => {
  it('meminta pemasangan bila perangkat belum dikenali', async () => {
    statusPerangkat.mockRejectedValue(
      new PosError('Perangkat ini belum terdaftar', 401, 'PERANGKAT'),
    );
    pasangPapan();

    await waitFor(() =>
      expect(screen.getByTestId('keadaan')).toHaveTextContent('PERANGKAT'),
    );
  });

  it('mengunci bila perangkat terpasang tapi belum ada petugas', async () => {
    statusPerangkat.mockResolvedValue(PERANGKAT);
    sesi.mockRejectedValue(new PosError('Belum ada petugas', 401, 'SESI'));
    pasangPapan();

    await waitFor(() =>
      expect(screen.getByTestId('keadaan')).toHaveTextContent('TERKUNCI'),
    );
  });

  /**
   * Inilah yang membuat F5 di tengah shift aman: seluruh keadaan hidup di
   * cookie dan di server, tidak ada satu pun yang disimpan di localStorage.
   * Memuat ulang halaman menghasilkan layar yang sama persis.
   */
  it('memulihkan sesi dan shift yang sedang berjalan', async () => {
    statusPerangkat.mockResolvedValue(PERANGKAT);
    sesi.mockResolvedValue(SESI);
    shiftAktif.mockResolvedValue(SHIFT);

    pasangPapan();

    await waitFor(() => expect(screen.getByTestId('keadaan')).toHaveTextContent('SIAP'));
    expect(screen.getByTestId('nama')).toHaveTextContent('Budi');
    expect(screen.getByTestId('shift')).toHaveTextContent('Pagi');
  });

  it('tidak menulis apa pun ke localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    statusPerangkat.mockResolvedValue(PERANGKAT);
    sesi.mockResolvedValue(SESI);

    pasangPapan();
    await waitFor(() => expect(screen.getByTestId('keadaan')).toHaveTextContent('SIAP'));

    // Sesi POS tidak boleh punya jejak yang bisa dibaca JavaScript.
    const kunciDitulis = setItem.mock.calls.map((c) => String(c[0]));
    expect(kunciDitulis.filter((k) => /pos|device|sesi|pin/i.test(k))).toEqual([]);
    setItem.mockRestore();
  });
});

describe('Ganti Petugas', () => {
  it('mengunci sesi dan melupakan identitas petugas lama', async () => {
    statusPerangkat.mockResolvedValue(PERANGKAT);
    sesi.mockResolvedValue(SESI);
    shiftAktif.mockResolvedValue(SHIFT);

    pasangPapan();
    await waitFor(() => expect(screen.getByTestId('keadaan')).toHaveTextContent('SIAP'));

    await userEvent.click(screen.getByRole('button', { name: /Ganti Petugas/i }));

    await waitFor(() =>
      expect(screen.getByTestId('keadaan')).toHaveTextContent('TERKUNCI'),
    );
    expect(kunciSesi).toHaveBeenCalled();
    // Nama DAN shift petugas lama hilang dari layar — terminal tidak boleh
    // menyisakan jejak siapa yang barusan memakainya.
    expect(screen.getByTestId('nama')).toHaveTextContent('-');
    expect(screen.getByTestId('shift')).toHaveTextContent('-');
  });

  /**
   * Yang paling tidak boleh terjadi saat jaringan putus adalah terminal tetap
   * terbuka atas nama orang yang sudah berjalan pergi. Layarnya dikunci apa pun
   * hasil permintaannya.
   */
  it('tetap mengunci layar meski permintaan ke server gagal', async () => {
    statusPerangkat.mockResolvedValue(PERANGKAT);
    sesi.mockResolvedValue(SESI);
    kunciSesi.mockRejectedValue(new PosError('Jaringan putus', 0, 'LAIN'));

    pasangPapan();
    await waitFor(() => expect(screen.getByTestId('keadaan')).toHaveTextContent('SIAP'));

    await userEvent.click(screen.getByRole('button', { name: /Ganti Petugas/i }));

    await waitFor(() =>
      expect(screen.getByTestId('keadaan')).toHaveTextContent('TERKUNCI'),
    );
    expect(screen.getByTestId('nama')).toHaveTextContent('-');
  });
});

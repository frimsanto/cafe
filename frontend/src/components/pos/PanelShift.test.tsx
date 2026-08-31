import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const bukaShift = vi.fn();
const tutupShift = vi.fn();
const catatKas = vi.fn();
const absen = vi.fn();

vi.mock('../../api/pos', () => ({
  posApi: {
    bukaShift: (...a: unknown[]) => bukaShift(...a),
    tutupShift: (...a: unknown[]) => tutupShift(...a),
    catatKas: (...a: unknown[]) => catatKas(...a),
    absen: (...a: unknown[]) => absen(...a),
  },
}));

// Kamera diganti tombol sederhana: yang diuji di berkas ini adalah alur shift,
// bukan kameranya — itu punya berkas ujinya sendiri.
vi.mock('./KameraAbsensi', () => ({
  default: ({ onSiap }: { onSiap: (h: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSiap({ blob: new Blob(['x']), pratinjau: 'blob:x', diambilPada: new Date() })
      }
    >
      Ambil Foto
    </button>
  ),
}));

const nilaiPos = {
  absensi: null as unknown,
  jadwalCocok: [] as unknown[],
  shift: null as unknown,
  segarkan: vi.fn(),
  pakaiShift: vi.fn(),
  pakaiAbsensi: vi.fn(),
};
vi.mock('../../pos/PosSessionContext', () => ({
  usePos: () => nilaiPos,
}));

const { default: PanelShift } = await import('./PanelShift');

/**
 * Panel "Shift Saya".
 *
 * Urutan langkahnya bukan pilihan tampilan melainkan aturan yang ditegakkan
 * backend. Yang diuji di sini adalah bahwa layar MENAMPILKAN urutan itu dengan
 * jujur — dan bahwa angka yang dilihat kasir sebelum menekan tombol sama
 * dengan angka yang akan dikirim.
 */

const ABSENSI = {
  id: 'absen-1',
  userId: 'staf-1',
  nama: 'Budi',
  status: 'PRESENT',
  masukPada: '2026-03-05T00:00:00.000Z',
  keluarPada: null,
  terlambatMenit: 0,
  lemburMenit: null,
  durasiMenit: null,
  pengecualianFoto: false,
  alasanPengecualian: null,
  disetujuiPada: null,
  jadwal: null,
  foto: [],
  catatan: null,
};

const SHIFT = {
  id: 'shift-1',
  status: 'AKTIF',
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
    penjualanTunai: 50_000,
    kasMasuk: 0,
    kasKeluar: 0,
    tunaiSeharusnya: 150_000,
    tunaiAktual: null,
    selisih: null,
    nonTunai: [{ metode: 'QRIS', total: 25_000, jumlahTransaksi: 1 }],
    totalNonTunai: 25_000,
    jumlahTransaksi: 3,
    pesananDibatalkan: 0,
    pembayaranDitolak: 0,
  },
  pergerakanKas: [],
  dikoreksi: null,
};

beforeEach(() => {
  nilaiPos.absensi = null;
  nilaiPos.jadwalCocok = [];
  nilaiPos.shift = null;
  nilaiPos.segarkan = vi.fn();
  nilaiPos.pakaiShift = vi.fn();
  nilaiPos.pakaiAbsensi = vi.fn();
  bukaShift.mockReset().mockResolvedValue(SHIFT);
  tutupShift.mockReset();
  catatKas.mockReset();
  absen.mockReset().mockResolvedValue(ABSENSI);
});

describe('urutan langkah', () => {
  /**
   * Bagian F: absen masuk adalah SYARAT membuka shift. Layar tidak boleh
   * menawarkan tombol yang pasti ditolak backend.
   */
  it('tidak menawarkan buka shift sebelum absen masuk', () => {
    render(<PanelShift />);

    expect(screen.getByText('Absen Masuk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Buka Shift$/ })).toBeNull();
  });

  it('menawarkan buka shift setelah absen masuk', () => {
    nilaiPos.absensi = ABSENSI;
    render(<PanelShift />);

    expect(screen.getByText('Kehadiran Hari Ini')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Buka Shift$/ })).toBeInTheDocument();
  });

  it('mencatat absen masuk beserta waktu tangkap fotonya', async () => {
    render(<PanelShift />);
    await userEvent.click(screen.getByRole('button', { name: /Ambil Foto/i }));

    await waitFor(() => expect(absen).toHaveBeenCalled());
    const [arah, input] = absen.mock.calls[0];
    expect(arah).toBe('masuk');
    expect(input.foto).toBeInstanceOf(Blob);
    expect(input.diambilPada).toBeInstanceOf(Date);
  });
});

describe('buka shift', () => {
  beforeEach(() => {
    nilaiPos.absensi = ABSENSI;
  });

  it('mengirim modal awal sebagai angka bulat', async () => {
    render(<PanelShift />);

    await userEvent.type(
      screen.getByLabelText(/Modal awal/i),
      '250000',
    );
    await userEvent.click(screen.getByRole('button', { name: /^Buka Shift$/ }));

    await waitFor(() => expect(bukaShift).toHaveBeenCalled());
    expect(bukaShift.mock.calls[0][0].modalAwal).toBe(250_000);
  });

  it('menolak membuka tanpa mengisi modal', async () => {
    render(<PanelShift />);
    await userEvent.click(screen.getByRole('button', { name: /^Buka Shift$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Masukkan modal awal/i);
    expect(bukaShift).not.toHaveBeenCalled();
  });
});

describe('shift berjalan', () => {
  beforeEach(() => {
    nilaiPos.absensi = ABSENSI;
    nilaiPos.shift = SHIFT;
  });

  it('menampilkan rekap hidup beserta tunai seharusnya', () => {
    render(<PanelShift />);

    expect(screen.getByText(/Shift Berjalan — Pagi/)).toBeInTheDocument();
    expect(screen.getByText('Tunai seharusnya di laci')).toBeInTheDocument();
    expect(screen.getByText('Rp 150.000')).toBeInTheDocument();
    // Non-tunai dipisah — ia tidak pernah masuk laci.
    expect(screen.getByText('QRIS')).toBeInTheDocument();
  });

  describe('pergerakan kas', () => {
    it('mengirim jenis, nominal, dan alasan', async () => {
      catatKas.mockResolvedValue(SHIFT);
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Catat uang masuk/i }));
      await userEvent.type(screen.getByLabelText(/Nominal/i), '15000');
      await userEvent.type(screen.getByLabelText(/Alasan/i), 'beli es batu');
      await userEvent.click(screen.getByRole('button', { name: /^Catat$/ }));

      await waitFor(() => expect(catatKas).toHaveBeenCalled());
      expect(catatKas.mock.calls[0][1]).toEqual({
        jenis: 'KELUAR',
        nominal: 15_000,
        alasan: 'beli es batu',
      });
    });

    // Uang yang berpindah tanpa alasan tertulis tidak bisa
    // dipertanggungjawabkan besok.
    it('menolak tanpa alasan', async () => {
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Catat uang masuk/i }));
      await userEvent.type(screen.getByLabelText(/Nominal/i), '15000');
      await userEvent.click(screen.getByRole('button', { name: /^Catat$/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/Alasan wajib/i);
      expect(catatKas).not.toHaveBeenCalled();
    });

    it('menolak nominal nol', async () => {
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Catat uang masuk/i }));
      await userEvent.type(screen.getByLabelText(/Alasan/i), 'uji');
      await userEvent.click(screen.getByRole('button', { name: /^Catat$/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/lebih dari nol/i);
      expect(catatKas).not.toHaveBeenCalled();
    });
  });

  describe('tutup shift', () => {
    /**
     * Selisih dihitung di layar SEBELUM dikirim — kasir melihat akibat angkanya
     * sambil masih bisa menghitung ulang isi laci.
     */
    it('menunjukkan selisih sebelum tombol ditekan', async () => {
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Tutup Shift & Hitung Kas/i }));
      await userEvent.type(screen.getByLabelText(/Tunai aktual/i), '145000');

      // `Intl` menaruh tanda minus SEBELUM simbol mata uang: "-Rp 5.000".
      // Dicari lewat "(kurang)" lebih dulu supaya tidak tertukar dengan angka
      // lain di rekap yang kebetulan memuat potongan digit yang sama.
      const penanda = await screen.findByText(/\(kurang\)/);
      expect(penanda.parentElement?.textContent).toMatch(/-Rp\s?5\.000/);
    });

    it('memberi tahu saat kas pas', async () => {
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Tutup Shift & Hitung Kas/i }));
      await userEvent.type(screen.getByLabelText(/Tunai aktual/i), '150000');

      expect(await screen.findByText(/Kas pas dengan hitungan sistem/i)).toBeInTheDocument();
    });

    it('mewajibkan catatan bila ada selisih', async () => {
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Tutup Shift & Hitung Kas/i }));
      await userEvent.type(screen.getByLabelText(/Tunai aktual/i), '145000');
      await userEvent.click(screen.getByRole('button', { name: /^Tutup Shift$/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/wajib disertai catatan/i);
      expect(tutupShift).not.toHaveBeenCalled();
    });

    it('mengirim tunai aktual dan catatannya', async () => {
      tutupShift.mockResolvedValue({
        ...SHIFT,
        status: 'DITUTUP',
        rekap: { ...SHIFT.rekap, selisih: -5_000 },
      });
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Tutup Shift & Hitung Kas/i }));
      await userEvent.type(screen.getByLabelText(/Tunai aktual/i), '145000');
      await userEvent.type(screen.getByLabelText(/Catatan/i), 'uang kurang, dicek ulang');
      await userEvent.click(screen.getByRole('button', { name: /^Tutup Shift$/ }));

      await waitFor(() => expect(tutupShift).toHaveBeenCalled());
      expect(tutupShift.mock.calls[0][1]).toEqual({
        kasAktual: 145_000,
        catatan: 'uang kurang, dicek ulang',
      });
    });

    it('tidak mewajibkan catatan saat kas pas', async () => {
      tutupShift.mockResolvedValue({ ...SHIFT, status: 'DITUTUP' });
      render(<PanelShift />);

      await userEvent.click(screen.getByRole('button', { name: /Tutup Shift & Hitung Kas/i }));
      await userEvent.type(screen.getByLabelText(/Tunai aktual/i), '150000');
      await userEvent.click(screen.getByRole('button', { name: /^Tutup Shift$/ }));

      await waitFor(() => expect(tutupShift).toHaveBeenCalled());
      expect(tutupShift.mock.calls[0][1].catatan).toBeNull();
    });
  });
});

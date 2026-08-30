import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PengaturanPembayaranDTO } from '../types/api';

// ── Tiruan ───────────────────────────────────────────────────────────────────

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Pemilik', role: 'OWNER', cafeId: 'kafe-a', cafeName: 'Kopi Senja' },
  }),
}));

// AppLayout menyeret rel navigasi, framer-motion, dan react-router. Tidak ada
// satu pun yang diuji di sini, jadi ia diganti pembungkus polos.
vi.mock('../components/layout/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));

const api = {
  getSettings: vi.fn(),
  simpanMetode: vi.fn(),
  simpanKonfigurasiMetode: vi.fn(),
  unggahQris: vi.fn(),
  simpanKredensial: vi.fn(),
  putusKredensial: vi.fn(),
  tesKoneksi: vi.fn(),
  statusWebhook: vi.fn(),
  setMode: vi.fn(),
};
vi.mock('../api/pembayaran', () => ({ pembayaranApi: api }));

const { default: PaymentSettingsPage } = await import('./PaymentSettingsPage');

// ── Data ─────────────────────────────────────────────────────────────────────

function metode(kode: string, ubah: Record<string, unknown> = {}) {
  return {
    metode: kode,
    aktif: kode === 'TUNAI',
    tersediaDiKasir: true,
    tersediaDiCheckout: false,
    bolehDiCheckout: kode === 'QRIS_STATIS' || kode === 'TRANSFER',
    wajibVerifikasiKasir: true,
    instruksi: null,
    batasWaktuMenit: null,
    qrisImageUrl: null,
    qrisMerchantName: null,
    qrisNmid: null,
    bankNama: null,
    bankNomorRekening: null,
    bankAtasNama: null,
    edcProvider: null,
    edcTerminalLabel: null,
    konfigurasiLengkap: kode === 'TUNAI' || kode === 'EDC',
    ...ubah,
  };
}

function pengaturan(ubah: Partial<PengaturanPembayaranDTO> = {}): PengaturanPembayaranDTO {
  return {
    cafeId: 'kafe-a',
    metode: [
      metode('TUNAI'),
      metode('QRIS_STATIS'),
      metode('TRANSFER'),
      metode('EDC'),
    ],
    midtrans: {
      modeAktif: 'SANDBOX',
      kredensial: [
        {
          mode: 'SANDBOX',
          clientKey: null,
          serverKeyTersimpan: false,
          serverKeyPetunjuk: null,
          statusKoneksi: 'BELUM_DIUJI',
          koneksiDiperiksa: null,
          koneksiPesan: null,
          statusWebhook: 'BELUM_DIPERIKSA',
          webhookDiperiksa: null,
          lengkap: false,
        },
        {
          mode: 'PRODUCTION',
          clientKey: null,
          serverKeyTersimpan: false,
          serverKeyPetunjuk: null,
          statusKoneksi: 'BELUM_DIUJI',
          koneksiDiperiksa: null,
          koneksiPesan: null,
          statusWebhook: 'BELUM_DIPERIKSA',
          webhookDiperiksa: null,
          lengkap: false,
        },
      ],
      statusIntegrasi: 'BELUM_DIKONFIGURASI',
      bisaTransaksi: false,
      penghalangProduction: ['Server Key Production belum diisi'],
      webhookUrl: 'https://cafe.contoh.test/api/pembayaran/notifikasi/kafe-a',
    },
    jumlahMetodeAktif: 1,
    ...ubah,
  } as PengaturanPembayaranDTO;
}

/** Tunggu sampai pemuatan awal selesai. */
async function tungguMuat() {
  await screen.findByRole('heading', { name: /Pembayaran di Kasir/i });
}

beforeEach(() => {
  api.getSettings.mockResolvedValue(pengaturan());
  api.simpanMetode.mockResolvedValue(pengaturan());
});

// ── Uji ──────────────────────────────────────────────────────────────────────

describe('PaymentSettingsPage — pemuatan', () => {
  it('menampilkan keadaan memuat lalu isinya', async () => {
    render(<PaymentSettingsPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/Memuat pengaturan/i);
    await tungguMuat();
    expect(screen.getByRole('heading', { name: /Pembayaran Online/i })).toBeInTheDocument();
  });

  it('menawarkan "Coba lagi" saat pemuatan gagal', async () => {
    api.getSettings.mockRejectedValueOnce(new Error('jaringan mati'));
    render(<PaymentSettingsPage />);

    expect(await screen.findByText(/Gagal memuat/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba lagi/i })).toBeInTheDocument();
  });

  it('menampilkan keempat metode manual', async () => {
    render(<PaymentSettingsPage />);
    await tungguMuat();

    for (const nama of ['Tunai', 'QRIS Statis', 'Transfer Bank', 'Kartu Debit/Kredit (EDC)']) {
      expect(screen.getByRole('heading', { name: nama })).toBeInTheDocument();
    }
  });
});

describe('PaymentSettingsPage — dirty state tombol simpan', () => {
  // Tombol simpan yang selalu menyala tidak memberi tahu apa pun. Yang berguna
  // justru sebaliknya: ia muncul PERSIS ketika ada yang belum tersimpan.
  it('menyembunyikan action bar sebelum ada perubahan', async () => {
    render(<PaymentSettingsPage />);
    await tungguMuat();

    expect(
      screen.queryByText(/Ada perubahan yang belum disimpan/i),
    ).not.toBeInTheDocument();
  });

  it('memunculkan action bar setelah sakelar diubah', async () => {
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    await user.click(screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i }));
    expect(screen.getByText(/Ada perubahan yang belum disimpan/i)).toBeVisible();
  });

  // Pengguna yang menyalakan lalu mematikan lagi tidak seharusnya ditahan
  // tombol simpan yang menyala tanpa alasan.
  it('menyembunyikannya lagi bila perubahan dikembalikan', async () => {
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const sakelar = screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i });
    await user.click(sakelar);
    expect(screen.getByText(/Ada perubahan yang belum disimpan/i)).toBeVisible();

    await user.click(sakelar);
    expect(
      screen.queryByText(/Ada perubahan yang belum disimpan/i),
    ).not.toBeInTheDocument();
  });

  it('"Batalkan" mengembalikan sakelar ke keadaan tersimpan', async () => {
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const sakelar = screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i });
    await user.click(sakelar);
    expect(sakelar).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Batalkan' }));
    expect(sakelar).not.toBeChecked();
  });
});

describe('PaymentSettingsPage — menyimpan', () => {
  it('mengirim keempat metode sekaligus', async () => {
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    await user.click(screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i }));
    await user.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(api.simpanMetode).toHaveBeenCalledTimes(1));
    const kirim = api.simpanMetode.mock.calls[0][0] as Array<{ metode: string; aktif: boolean }>;
    expect(kirim).toHaveLength(4);
    expect(kirim.find((m) => m.metode === 'EDC')?.aktif).toBe(true);
  });

  it('menampilkan pesan berhasil lalu menyembunyikan action bar', async () => {
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    await user.click(screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i }));
    await user.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));

    expect(await screen.findByText(/Metode pembayaran tersimpan/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Ada perubahan yang belum disimpan/i),
    ).not.toBeInTheDocument();
  });

  // Memaksa pengguna mengulang suntingannya karena jaringan sempat putus adalah
  // cara tercepat kehilangan kepercayaannya.
  it('MEMPERTAHANKAN perubahan ketika penyimpanan gagal', async () => {
    api.simpanMetode.mockRejectedValueOnce(new Error('server sedang bermasalah'));
    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const sakelar = screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i });
    await user.click(sakelar);
    await user.click(screen.getByRole('button', { name: /Simpan Perubahan/i }));

    expect(await screen.findByText(/server sedang bermasalah/i)).toBeInTheDocument();
    expect(sakelar).toBeChecked();
    expect(screen.getByText(/Ada perubahan yang belum disimpan/i)).toBeVisible();
  });

  it('mengunci tombol selama menyimpan agar tidak terkirim dua kali', async () => {
    let lepaskan: (v: unknown) => void = () => {};
    api.simpanMetode.mockReturnValueOnce(
      new Promise((resolve) => {
        lepaskan = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<PaymentSettingsPage />);
    await tungguMuat();

    await user.click(screen.getByRole('switch', { name: /Aktifkan Kartu Debit\/Kredit/i }));
    const tombol = screen.getByRole('button', { name: /Simpan Perubahan/i });
    await user.click(tombol);

    const sedangMenyimpan = await screen.findByRole('button', { name: /Menyimpan…/i });
    expect(sedangMenyimpan).toBeDisabled();

    lepaskan(pengaturan());
    await waitFor(() => expect(api.simpanMetode).toHaveBeenCalledTimes(1));
  });
});

describe('PaymentSettingsPage — metode yang belum lengkap', () => {
  // Metode yang menyala tapi tidak bisa dibayar siapa pun lebih buruk daripada
  // metode yang mati: tamu memilihnya, lalu buntu.
  it('mengunci sakelar QRIS statis sebelum gambarnya diunggah', async () => {
    render(<PaymentSettingsPage />);
    await tungguMuat();

    expect(screen.getByRole('switch', { name: /Aktifkan QRIS Statis/i })).toBeDisabled();
    expect(screen.getByText(/Unggah gambar QRIS/i)).toBeInTheDocument();
  });

  it('membuka sakelar setelah konfigurasinya lengkap', async () => {
    api.getSettings.mockResolvedValue(
      pengaturan({
        metode: [
          metode('TUNAI'),
          metode('QRIS_STATIS', {
            konfigurasiLengkap: true,
            qrisImageUrl: 'https://res.cloudinary.com/x/qr.png',
            qrisMerchantName: 'Kopi Senja',
          }),
          metode('TRANSFER'),
          metode('EDC'),
        ],
      } as Partial<PengaturanPembayaranDTO>),
    );

    render(<PaymentSettingsPage />);
    await tungguMuat();

    expect(screen.getByRole('switch', { name: /Aktifkan QRIS Statis/i })).toBeEnabled();
  });

  // Metode yang telanjur aktif lalu konfigurasinya dikosongkan tidak boleh
  // terkunci menyala selamanya.
  it('metode aktif yang belum lengkap tetap bisa DIMATIKAN', async () => {
    api.getSettings.mockResolvedValue(
      pengaturan({
        metode: [
          metode('TUNAI'),
          metode('QRIS_STATIS', { aktif: true, konfigurasiLengkap: false }),
          metode('TRANSFER'),
          metode('EDC'),
        ],
      } as Partial<PengaturanPembayaranDTO>),
    );

    render(<PaymentSettingsPage />);
    await tungguMuat();

    expect(screen.getByRole('switch', { name: /Aktifkan QRIS Statis/i })).toBeEnabled();
  });
});

describe('PaymentSettingsPage — DOKU', () => {
  // Panel konfigurasi DOKU yang besar membuat pemilik kafe mengira ada sesuatu
  // yang perlu ia isi. Yang tersisa cuma satu baris penanda.
  it('hanya muncul sebagai penanda "Segera hadir", bukan panel', async () => {
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const baris = screen.getByLabelText('Gateway lain');
    expect(within(baris).getByText('DOKU Checkout')).toBeInTheDocument();
    expect(within(baris).getByText('Segera hadir')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Server Key/i)).not.toBeInTheDocument();
  });
});

describe('PaymentSettingsPage — ringkasan', () => {
  it('menyebut jumlah metode aktif dan mode', async () => {
    api.getSettings.mockResolvedValue(pengaturan({ jumlahMetodeAktif: 3 }));
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const ringkasan = screen.getByLabelText('Ringkasan pembayaran');
    expect(within(ringkasan).getByText('3')).toBeInTheDocument();
    expect(within(ringkasan).getByText('Sandbox')).toBeInTheDocument();
  });

  // Badge "aktif" yang muncul hanya karena ada key adalah bug yang diperbaiki
  // modul ini; ringkasan harus jujur soal itu.
  it('tidak mengaku siap ketika Midtrans belum dikonfigurasi', async () => {
    render(<PaymentSettingsPage />);
    await tungguMuat();

    const ringkasan = screen.getByLabelText('Ringkasan pembayaran');
    expect(within(ringkasan).getByText('Belum aktif')).toBeInTheDocument();
    expect(within(ringkasan).getByText('Midtrans belum terhubung')).toBeInTheDocument();
  });
});

import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashierOrderDTO } from '../types/api';

// Layar kasir sebagai satu halaman utuh: tab, angka kepala, kartu, dan tombol
// yang muncul mengikuti KEADAAN pesanan (bukan tab yang sedang dibuka).
//
// API-nya ditiru; yang diperiksa adalah apa yang dilihat & bisa ditekan kasir.

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      name: 'Rani',
      role: 'KASIR',
      cafeId: 'kafe-a',
      cafeName: 'Kopi Senja',
    },
  }),
}));

// AppLayout menyeret rel navigasi, framer-motion, dan react-router. Tidak ada
// satu pun yang diuji di sini, jadi ia diganti pembungkus polos.
vi.mock('../components/layout/AppLayout', () => ({
  default: ({ children, subtitle }: { children: ReactNode; subtitle?: string }) => (
    <div>
      <p data-testid="subtitle">{subtitle}</p>
      {children}
    </div>
  ),
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
  useNavigate: () => vi.fn(),
}));

const cashierApi = {
  listOrders: vi.fn(),
  summary: vi.fn(),
  tables: vi.fn(async () => []),
  createOrder: vi.fn(),
  cancelOrder: vi.fn(),
  completeOrder: vi.fn(),
};
vi.mock('../api/orders', () => ({ cashierApi }));
vi.mock('../api/menu', () => ({ menuApi: { grouped: vi.fn(async () => []) } }));
vi.mock('../api/pembayaran', () => ({
  pembayaranApi: {
    konfirmasiManual: vi.fn(),
    tolakManual: vi.fn(),
    buatMidtrans: vi.fn(),
    getConfig: vi.fn(async () => ({
      metodeDiterima: ['TUNAI'],
      metodeDetail: [],
      midtransAktif: false,
      clientKey: null,
      isProduction: false,
    })),
  },
}));

// Realtime dimatikan: uji ini tentang tampilan, bukan tentang WebSocket.
vi.mock('../lib/realtime', () => ({
  subscribeRealtime: (_c: string, _h: unknown, opts?: { onStatus?: (s: string) => void }) => {
    opts?.onStatus?.('online');
    return () => undefined;
  },
}));

const { default: CashierPage } = await import('./CashierPage');

function pesanan(ubah: Partial<CashierOrderDTO> = {}): CashierOrderDTO {
  return {
    id: '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c',
    cafeId: 'kafe-a',
    tableId: 'meja-1',
    tableName: 'Meja 3',
    status: 'MENUNGGU_PEMBAYARAN',
    statusPesanan: 'AWAITING_CASHIER',
    kitchenStatus: 'NOT_SENT',
    fulfillmentType: 'DINE_IN',
    orderSource: 'TABLE_QR',
    customerName: null,
    catatan: null,
    queueNumber: 4,
    items: [
      {
        id: 'i1',
        menuItemId: 'm1',
        name: 'Kopi Susu',
        price: 25000,
        quantity: 2,
        notes: 'tanpa gula',
        kitchenStatus: 'WAITING',
      },
    ],
    totalAmount: 50000,
    payment: null,
    statusPembayaran: 'AWAITING_VERIFICATION',
    metodePembayaran: 'TRANSFER',
    nominalDibayar: null,
    midtransOrderId: null,
    pembayaranManual: null,
    kasir: null,
    pembatal: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...ubah,
  } as CashierOrderDTO;
}

const ringkasan = {
  perluKonfirmasi: 1,
  sudahDibayar: 2,
  sedangDiproses: 3,
  selesaiHariIni: 4,
  totalHariIni: 750000,
  transaksiHariIni: 12,
  sejak: new Date().toISOString(),
};

beforeEach(() => {
  cashierApi.listOrders.mockResolvedValue([pesanan()]);
  cashierApi.summary.mockResolvedValue(ringkasan);
});

describe('CashierPage — kepala halaman', () => {
  it('menampilkan antrean & uang masuk hari ini', async () => {
    render(<CashierPage />);
    // Dilingkupi ke daftar ringkasan: angka yang sama juga muncul di subjudul
    // halaman, dan uji yang menangkap keduanya tidak membuktikan apa pun.
    const ringkasanEl = await screen.findByLabelText('Ringkasan kasir');
    expect(within(ringkasanEl).getByText(/Rp\s?750\.000/)).toBeInTheDocument();
    expect(within(ringkasanEl).getByText(/12 transaksi/)).toBeInTheDocument();
    expect(within(ringkasanEl).getByText('1')).toBeInTheDocument();
  });

  it('menyediakan tombol Pesanan Baru dan membukanya', async () => {
    render(<CashierPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /\+ Pesanan Baru/ }));
    expect(
      await screen.findByRole('dialog', { name: /Pesanan Baru/ }),
    ).toBeInTheDocument();
  });
});

describe('CashierPage — tab', () => {
  it('membuka tab "Perlu Konfirmasi" lebih dulu', async () => {
    render(<CashierPage />);
    await screen.findByText('Meja 3');
    expect(cashierApi.listOrders.mock.calls[0][1]).toMatchObject({
      tab: 'PERLU_KONFIRMASI',
    });
  });

  it('meminta daftar baru saat kasir berpindah tab', async () => {
    render(<CashierPage />);
    const user = userEvent.setup();
    await screen.findByText('Meja 3');

    await user.click(screen.getByRole('tab', { name: /Sedang Diproses/ }));
    await waitFor(() =>
      expect(
        cashierApi.listOrders.mock.calls.some(
          (c) => (c[1] as { tab: string }).tab === 'SEDANG_DIPROSES',
        ),
      ).toBe(true),
    );
  });

  it('menampilkan jumlah pada tab dari ringkasan server', async () => {
    render(<CashierPage />);
    const tab = await screen.findByRole('tab', { name: /Selesai/ });
    expect(within(tab).getByText('4')).toBeInTheDocument();
  });
});

describe('CashierPage — kartu pesanan', () => {
  it('menyebut jenis, sumber, dan status pembayaran sekaligus', async () => {
    render(<CashierPage />);
    await screen.findByText('Meja 3');
    // Dilingkupi ke kartunya: kata yang sama juga ada di daftar filter header.
    const kartu = screen.getByRole('article');
    expect(within(kartu).getByText('Makan di Tempat')).toBeInTheDocument();
    expect(within(kartu).getByText('QR Meja')).toBeInTheDocument();
    expect(within(kartu).getByText('Menunggu Verifikasi')).toBeInTheDocument();
    // Muncul dua kali di kartu ini — sebagai badge metode DAN di dalam
    // peringatan "tamu mengaku sudah membayar lewat …". Keduanya disengaja.
    expect(within(kartu).getAllByText('Transfer Bank')).toHaveLength(2);
  });

  it('pesanan yang menunggu verifikasi menawarkan Terima DAN Tolak', async () => {
    render(<CashierPage />);
    expect(await screen.findByRole('button', { name: /^Terima$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tolak$/ })).toBeInTheDocument();
  });

  it('pesanan lunas yang sudah siap menawarkan "Diserahkan", bukan tombol bayar', async () => {
    cashierApi.listOrders.mockResolvedValue([
      pesanan({
        status: 'DIPROSES_DAPUR',
        statusPesanan: 'CONFIRMED',
        statusPembayaran: 'PAID',
        kitchenStatus: 'READY',
      }),
    ]);
    render(<CashierPage />);

    expect(
      await screen.findByRole('button', { name: /Selesai \/ Diserahkan/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Terima Pembayaran/ }),
    ).not.toBeInTheDocument();
  });

  it('pesanan bawa pulang dipanggil dengan nomor antriannya', async () => {
    cashierApi.listOrders.mockResolvedValue([
      pesanan({
        tableId: null,
        tableName: null,
        fulfillmentType: 'TAKEAWAY',
        orderSource: 'CASHIER',
        queueNumber: 7,
      }),
    ]);
    render(<CashierPage />);
    expect(await screen.findByText('Bawa Pulang A-007')).toBeInTheDocument();
    const kartu = screen.getByRole('article');
    expect(within(kartu).getByText('Kasir')).toBeInTheDocument();
    expect(within(kartu).getByText('Bawa Pulang')).toBeInTheDocument();
  });
});

describe('CashierPage — kondisi kosong', () => {
  it('menjelaskan tab yang kosong dengan kalimatnya sendiri', async () => {
    cashierApi.listOrders.mockResolvedValue([]);
    render(<CashierPage />);
    expect(
      await screen.findByText(/Tidak ada pembayaran tertunda/i),
    ).toBeInTheDocument();
  });

  it('membedakan "tidak ada hasil pencarian" dari "memang kosong"', async () => {
    cashierApi.listOrders.mockResolvedValue([]);
    render(<CashierPage />);
    const user = userEvent.setup();

    await screen.findByText(/Tidak ada pembayaran tertunda/i);
    await user.type(screen.getByLabelText('Cari pesanan'), 'meja 99');

    expect(
      await screen.findByText(/Tidak ada pesanan yang cocok/i),
    ).toBeInTheDocument();
  });

  it('memberi jalan keluar saat daftar gagal dimuat', async () => {
    cashierApi.listOrders.mockRejectedValue(new Error('jaringan mati'));
    render(<CashierPage />);
    expect(await screen.findByText(/Gagal memuat daftar pesanan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Coba lagi/ })).toBeInTheDocument();
  });
});

describe('CashierPage — detail pesanan', () => {
  it('membuka rincian lengkap beserta riwayat statusnya', async () => {
    render(<CashierPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Lihat Detail/ }));

    const dialog = await screen.findByRole('dialog', { name: /Meja 3/ });
    expect(within(dialog).getByText(/Riwayat status/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Pesanan dibuat/i)).toBeInTheDocument();
    // Catatan per item ikut terbaca — kasir sering diminta mengonfirmasinya.
    expect(within(dialog).getByText(/tanpa gula/)).toBeInTheDocument();
  });
});

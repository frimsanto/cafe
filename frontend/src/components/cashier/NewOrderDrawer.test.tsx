import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuatPesananKasirInput, PaymentConfigDTO } from '../../types/api';
import NewOrderDrawer from './NewOrderDrawer';

// Dialog "Pesanan Baru" — jalur C (pelanggan memesan langsung di kasir).
//
// Yang diuji: apa yang benar-benar DIKIRIM ke server. Bukan tata letaknya —
// kelas Tailwind boleh berganti kapan saja. Yang tidak boleh berganti adalah:
// tidak ada harga yang ikut dikirim, meja wajib untuk makan di tempat, dan satu
// keranjang hanya pernah punya SATU kunci idempotensi.

const grouped = vi.fn();
const tables = vi.fn();
vi.mock('../../api/menu', () => ({ menuApi: { grouped: (...a: unknown[]) => grouped(...a) } }));
vi.mock('../../api/orders', () => ({
  cashierApi: { tables: (...a: unknown[]) => tables(...a) },
}));

const KOPI = {
  id: 'menu-kopi',
  cafeId: 'kafe-1',
  categoryId: 'kat-1',
  name: 'Kopi Susu',
  description: '',
  price: 25000,
  imageUrl: '',
  isAvailable: true,
};

const config: PaymentConfigDTO = {
  metodeDiterima: ['TUNAI'],
  metodeDetail: [],
  midtransAktif: false,
  clientKey: null,
  isProduction: false,
};

function pasang(onSubmit = vi.fn(), busy = false) {
  render(
    <NewOrderDrawer
      cafeId="kafe-1"
      config={config}
      error={null}
      busy={busy}
      onSubmit={onSubmit}
      onClose={vi.fn()}
    />,
  );
  return onSubmit;
}

/**
 * Ubin menu "Kopi Susu" di papan kiri.
 *
 * Anchor `^` penting: begitu item masuk keranjang, ada tiga kontrol lain yang
 * ikut menyebut namanya ("Tambah Kopi Susu", "Kurangi Kopi Susu", "Catatan
 * untuk Kopi Susu"). Tanpa anchor, pencarian yang sama tiba-tiba menemukan
 * empat tombol dan uji gagal karena hal yang tidak ada hubungannya dengan
 * perilaku yang sedang diperiksa.
 */
function ubinMenu() {
  return screen.getByRole('button', { name: /^Kopi Susu/ });
}

/** Menunggu papan menu selesai dimuat. */
async function tungguMenu() {
  await screen.findByRole('button', { name: /^Kopi Susu/ });
}

beforeEach(() => {
  grouped.mockResolvedValue([
    { id: 'kat-1', cafeId: 'kafe-1', name: 'Kopi', orderPosition: 0, items: [KOPI] },
  ]);
  tables.mockResolvedValue([
    {
      id: 'meja-1',
      tableName: 'Meja 3',
      status: 'TERSEDIA',
      activeOrderCount: 0,
      unpaidOrderCount: 0,
    },
    {
      id: 'meja-2',
      tableName: 'Meja 4',
      status: 'TERISI',
      activeOrderCount: 1,
      unpaidOrderCount: 0,
    },
  ]);
});

describe('NewOrderDrawer — menyusun pesanan', () => {
  it('hanya menawarkan menu yang TERSEDIA', async () => {
    pasang();
    await tungguMenu();
    // `true` = availableOnly; kasir tidak boleh bisa menjual yang sedang habis.
    expect(grouped).toHaveBeenCalledWith('kafe-1', true);
  });

  it('mengirim id menu & jumlah saja — tanpa harga atau total', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(screen.getByRole('button', { name: /Meja 3/ }));
    await user.click(ubinMenu());
    await user.click(ubinMenu());
    await user.click(screen.getByLabelText('Uang diterima'));
    await user.click(screen.getByRole('button', { name: /^Uang pas$/ }));
    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0] as BuatPesananKasirInput;
    expect(input.items).toEqual([
      { menuItemId: 'menu-kopi', quantity: 2, notes: '' },
    ]);
    expect(input).not.toHaveProperty('totalAmount');
    expect(input.items[0]).not.toHaveProperty('price');
  });

  it('meja WAJIB dipilih untuk makan di tempat', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(ubinMenu());
    await user.click(screen.getByRole('button', { name: /^Uang pas$/ }));
    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Pilih meja dulu sebelum pesanan bisa dikirim/i),
    ).toBeInTheDocument();
  });

  it('bawa pulang tidak meminta meja sama sekali', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(screen.getByRole('button', { name: /Bawa Pulang/ }));
    expect(screen.queryByRole('button', { name: /Meja 3/ })).not.toBeInTheDocument();

    await user.click(ubinMenu());
    await user.click(screen.getByRole('button', { name: /^Uang pas$/ }));
    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));

    const input = onSubmit.mock.calls[0][0] as BuatPesananKasirInput;
    expect(input.fulfillmentType).toBe('TAKEAWAY');
    expect(input.tableId).toBeNull();
  });

  it('meja yang sudah terisi tetap bisa dipilih (pesanan tambahan)', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(screen.getByRole('button', { name: /Meja 4/ }));
    await user.click(ubinMenu());
    await user.click(screen.getByRole('button', { name: /^Uang pas$/ }));
    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));

    expect((onSubmit.mock.calls[0][0] as BuatPesananKasirInput).tableId).toBe('meja-2');
  });
});

describe('NewOrderDrawer — uang & kembalian', () => {
  it('menghitung kembalian dan menolak uang yang kurang', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(screen.getByRole('button', { name: /Meja 3/ }));
    await user.click(ubinMenu());

    await user.type(screen.getByLabelText('Uang diterima'), '10000');
    expect(screen.getByText(/Kurang Rp\s?15\.000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Uang diterima'));
    await user.type(screen.getByLabelText('Uang diterima'), '50000');
    expect(screen.getByText(/Kembalian Rp\s?25\.000/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ }));
    const input = onSubmit.mock.calls[0][0] as BuatPesananKasirInput;
    // Yang dikirim adalah uang yang DITERIMA; kembaliannya dihitung server.
    expect(input.pembayaran.nominal).toBe(50000);
  });
});

describe('NewOrderDrawer — kirim ganda', () => {
  it('memakai kunci idempotensi yang SAMA saat dikirim ulang', async () => {
    const onSubmit = pasang();
    const user = userEvent.setup();
    await tungguMenu();

    await user.click(screen.getByRole('button', { name: /Meja 3/ }));
    await user.click(ubinMenu());
    await user.click(screen.getByRole('button', { name: /^Uang pas$/ }));

    const tombol = screen.getByRole('button', { name: /Bayar & Kirim ke Dapur/ });
    await user.click(tombol);
    await user.click(tombol);

    // Dua ketukan tetap boleh sampai ke halaman (yang menahannya adalah
    // `busy`), tapi keduanya membawa kunci yang sama sehingga server hanya
    // membuat SATU pesanan.
    const kunci = onSubmit.mock.calls.map(
      (c) => (c[0] as BuatPesananKasirInput).idempotencyKey,
    );
    expect(new Set(kunci).size).toBe(1);
  });

  it('tombol mati selagi permintaan berjalan', async () => {
    pasang(vi.fn(), true);
    await tungguMenu();
    expect(screen.getByRole('button', { name: /Menyimpan…/ })).toBeDisabled();
  });
});

describe('NewOrderDrawer — kondisi kosong', () => {
  it('menjelaskan apa yang harus dilakukan saat tidak ada menu aktif', async () => {
    grouped.mockResolvedValue([]);
    pasang();
    expect(await screen.findByText(/Belum ada menu aktif/i)).toBeInTheDocument();
  });

  it('menawarkan bawa pulang saat tidak ada meja aktif', async () => {
    tables.mockResolvedValue([]);
    pasang();
    await waitFor(() =>
      expect(screen.getByText(/Belum ada meja aktif/i)).toBeInTheDocument(),
    );
  });

  it('memberi tahu kasir bila belum ada metode pembayaran aktif', async () => {
    render(
      <NewOrderDrawer
        cafeId="kafe-1"
        config={{ ...config, metodeDiterima: [] }}
        error={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/Belum ada metode pembayaran yang aktif untuk kasir/i),
    ).toBeInTheDocument();
  });
});

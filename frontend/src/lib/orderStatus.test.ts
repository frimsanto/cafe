import { describe, expect, it } from 'vitest';
import type { Order } from '../types/order';
import {
  jenisPesanan,
  kodePesanan,
  labelTujuan,
  statusPesanan,
  tahapDapur,
} from './orderStatus';

// Yang diuji: apakah layar tetap benar ketika server BELUM mengirim kolom baru.
//
// Ini bukan kehati-hatian teoretis. PWA kasir dipasang di perangkat kafe dan
// bisa saja berjalan beberapa jam sebelum servernya ikut diperbarui — selama
// jendela itu, seluruh keadaan pesanan harus diturunkan dari kolom lama.

function order(ubah: Partial<Order> = {}): Order {
  return {
    id: '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c',
    cafeId: 'kafe-1',
    tableId: 'meja-1',
    tableName: 'Meja 3',
    status: 'MENUNGGU_PEMBAYARAN',
    queueNumber: 17,
    items: [],
    totalAmount: 50000,
    payment: null,
    statusPembayaran: 'UNPAID',
    metodePembayaran: null,
    nominalDibayar: null,
    midtransOrderId: null,
    createdAt: '2026-08-30T03:00:00.000Z',
    updatedAt: '2026-08-30T03:00:00.000Z',
    ...ubah,
  };
}

const item = (kitchenStatus: Order['items'][number]['kitchenStatus'], id = 'i1') => ({
  id,
  menuItemId: 'm1',
  name: 'Kopi Susu',
  price: 25000,
  quantity: 1,
  notes: '',
  kitchenStatus,
});

describe('status pesanan', () => {
  it('memakai nilai dari server bila ada', () => {
    expect(statusPesanan(order({ statusPesanan: 'CANCELLED' }))).toBe('CANCELLED');
  });

  it('membedakan "menunggu tamu" dari "menunggu kasir"', () => {
    expect(statusPesanan(order())).toBe('AWAITING_PAYMENT');
    expect(
      statusPesanan(order({ statusPembayaran: 'AWAITING_VERIFICATION' })),
    ).toBe('AWAITING_CASHIER');
  });

  it('menurunkan status dari kosakata lama saat server belum diperbarui', () => {
    expect(statusPesanan(order({ status: 'DIPROSES_DAPUR' }))).toBe('CONFIRMED');
    expect(statusPesanan(order({ status: 'SELESAI' }))).toBe('COMPLETED');
    expect(statusPesanan(order({ status: 'DIBATALKAN' }))).toBe('CANCELLED');
  });
});

describe('tahap dapur', () => {
  it('memakai nilai dari server bila ada', () => {
    expect(tahapDapur(order({ kitchenStatus: 'PREPARING' }))).toBe('PREPARING');
  });

  it('pesanan yang belum dirilis tidak pernah tampak masuk dapur', () => {
    expect(tahapDapur(order({ items: [item('WAITING')] }))).toBe('NOT_SENT');
  });

  it('menurunkan tahap dari status masak per item', () => {
    const dasar = { status: 'DIPROSES_DAPUR' as const };
    expect(tahapDapur(order({ ...dasar, items: [item('WAITING')] }))).toBe('QUEUED');
    expect(
      tahapDapur(order({ ...dasar, items: [item('COOKING'), item('WAITING', 'i2')] })),
    ).toBe('PREPARING');
    expect(
      tahapDapur(order({ ...dasar, items: [item('READY'), item('READY', 'i2')] })),
    ).toBe('READY');
  });
});

describe('identitas tujuan pesanan', () => {
  it('memakai nama meja untuk pesanan makan di tempat', () => {
    expect(labelTujuan(order())).toBe('Meja 3');
    expect(jenisPesanan(order())).toBe('DINE_IN');
  });

  it('memanggil nomor antrian untuk pesanan bawa pulang', () => {
    const takeaway = order({ tableId: null, tableName: null, queueNumber: 7 });
    // Bukan string kosong: tiket tanpa identitas tidak bisa dipanggil siapa pun.
    expect(labelTujuan(takeaway)).toBe('Bawa Pulang A-007');
    expect(jenisPesanan(takeaway)).toBe('TAKEAWAY');
  });

  it('menganggap pesanan tanpa meja sebagai bawa pulang meski kolomnya kosong', () => {
    // Penanda yang lebih tua daripada `fulfillmentType`, dan tetap benar.
    expect(jenisPesanan(order({ tableId: null, tableName: null }))).toBe('TAKEAWAY');
  });

  it('memendekkan kode pesanan menjadi delapan karakter terakhir', () => {
    // Id-nya berakhiran `…0d1e2f3a4b5c`; yang dibaca kasir hanya ekornya.
    expect(kodePesanan(order())).toBe('#2F3A4B5C');
    expect(kodePesanan(order())).toHaveLength(9);
  });
});

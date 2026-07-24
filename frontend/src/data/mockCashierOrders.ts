import type { Order } from '../types/order';
import { mockCafe } from './mockMenu';

// Pesanan tiruan yang MENUNGGU pembayaran di kasir (pelanggan memilih
// "bayar tunai/EDC"). Pesanan baru dirilis ke dapur setelah kasir menandai
// lunas — sesuai aturan "pesanan masuk dapur hanya setelah dibayar".

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

/** Payment placeholder selama masih menunggu konfirmasi kasir. */
const pendingPayment = {
  method: 'CASH' as const,
  status: 'PENDING' as const,
  transactionId: '',
};

export const mockCashierOrders: Order[] = [
  {
    id: 'ORD-C1A2B3',
    cafeId: mockCafe.id,
    tableId: 'table-02',
    tableName: 'Meja 2',
    status: 'MENUNGGU_PEMBAYARAN',
    totalAmount: 63000,
    createdAt: minsAgo(3),
    payment: pendingPayment,
    items: [
      { id: 'ci-1', menuItemId: 'item-latte', name: 'Caffè Latte', price: 28000, quantity: 1, notes: '', kitchenStatus: 'WAITING' },
      { id: 'ci-2', menuItemId: 'item-spaghetti', name: 'Spaghetti Aglio Olio', price: 38000, quantity: 1, notes: 'Tanpa cabai', kitchenStatus: 'WAITING' },
    ],
  },
  {
    id: 'ORD-D4E5F6',
    cafeId: mockCafe.id,
    tableId: 'table-09',
    tableName: 'Meja 9',
    status: 'MENUNGGU_PEMBAYARAN',
    totalAmount: 46000,
    createdAt: minsAgo(7),
    payment: pendingPayment,
    items: [
      { id: 'ci-3', menuItemId: 'item-kopisusu', name: 'Kopi Susu Gula Aren', price: 24000, quantity: 1, notes: '', kitchenStatus: 'WAITING' },
      { id: 'ci-4', menuItemId: 'item-pisangkeju', name: 'Pisang Goreng Keju', price: 18000, quantity: 1, notes: '', kitchenStatus: 'WAITING' },
    ],
  },
  {
    id: 'ORD-G7H8I9',
    cafeId: mockCafe.id,
    tableId: 'table-14',
    tableName: 'Meja 14',
    status: 'MENUNGGU_PEMBAYARAN',
    totalAmount: 96000,
    createdAt: minsAgo(1),
    payment: pendingPayment,
    items: [
      { id: 'ci-5', menuItemId: 'item-nasigoreng', name: 'Nasi Goreng Spesial', price: 35000, quantity: 2, notes: 'Extra pedas', kitchenStatus: 'WAITING' },
      { id: 'ci-6', menuItemId: 'item-lemontea', name: 'Lemon Tea', price: 20000, quantity: 1, notes: '', kitchenStatus: 'WAITING' },
    ],
  },
];

import type { Order, OrderItem } from '../types/order';
import { mockMenuItems } from './mockMenu';

// Data pesanan tiruan untuk Layar Dapur (KDS). Semua sudah dibayar (status
// DIPROSES_DAPUR) karena pesanan hanya masuk dapur setelah pembayaran sukses.
//
// Fase backend akan mengganti sumber ini dengan data realtime via WebSocket.

const CAFE_ID = 'cafe-demo-001';

// Waktu dibuat relatif terhadap sekarang agar "lama pesanan" terlihat hidup.
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

export const mockKitchenOrders: Order[] = [
  {
    id: 'ORD-3f9a2b',
    cafeId: CAFE_ID,
    tableId: 'table-05',
    tableName: 'Meja 5',
    status: 'DIPROSES_DAPUR',
    totalAmount: 81000,
    createdAt: minsAgo(2),
    payment: { method: 'QRIS', status: 'SUCCESS', transactionId: 'TRX-a1b2c3' },
    items: [
      { id: 'oi-1', menuItemId: 'item-latte', name: 'Caffè Latte', price: 28000, quantity: 1, notes: 'Less sugar', kitchenStatus: 'WAITING' },
      { id: 'oi-2', menuItemId: 'item-nasigoreng', name: 'Nasi Goreng Spesial', price: 35000, quantity: 1, notes: 'Extra pedas', kitchenStatus: 'WAITING' },
      { id: 'oi-3', menuItemId: 'item-frenchfries', name: 'French Fries', price: 22000, quantity: 1, notes: '', kitchenStatus: 'WAITING' },
    ],
  },
  {
    id: 'ORD-7c1d84',
    cafeId: CAFE_ID,
    tableId: 'table-12',
    tableName: 'Meja 12',
    status: 'DIPROSES_DAPUR',
    totalAmount: 96000,
    createdAt: minsAgo(6),
    payment: { method: 'GOPAY', status: 'SUCCESS', transactionId: 'TRX-d4e5f6' },
    items: [
      { id: 'oi-4', menuItemId: 'item-spaghetti', name: 'Spaghetti Aglio Olio', price: 38000, quantity: 2, notes: '', kitchenStatus: 'COOKING' },
      { id: 'oi-5', menuItemId: 'item-matcha', name: 'Matcha Latte', price: 30000, quantity: 1, notes: 'Pakai oat milk', kitchenStatus: 'WAITING' },
    ],
  },
  {
    id: 'ORD-9b2e57',
    cafeId: CAFE_ID,
    tableId: 'table-03',
    tableName: 'Meja 3',
    status: 'DIPROSES_DAPUR',
    totalAmount: 47000,
    createdAt: minsAgo(9),
    payment: { method: 'CARD', status: 'SUCCESS', transactionId: 'TRX-g7h8i9' },
    items: [
      { id: 'oi-6', menuItemId: 'item-coklat', name: 'Cokelat Panas', price: 27000, quantity: 1, notes: '', kitchenStatus: 'READY' },
      { id: 'oi-7', menuItemId: 'item-pisangkeju', name: 'Pisang Goreng Keju', price: 18000, quantity: 1, notes: '', kitchenStatus: 'COOKING' },
    ],
  },
  {
    id: 'ORD-2a6f01',
    cafeId: CAFE_ID,
    tableId: 'table-08',
    tableName: 'Meja 8',
    status: 'DIPROSES_DAPUR',
    totalAmount: 62000,
    createdAt: minsAgo(13),
    payment: { method: 'QRIS', status: 'SUCCESS', transactionId: 'TRX-j1k2l3' },
    items: [
      { id: 'oi-8', menuItemId: 'item-cheesecake', name: 'Classic Cheesecake', price: 33000, quantity: 1, notes: '', kitchenStatus: 'READY' },
      { id: 'oi-9', menuItemId: 'item-kopisusu', name: 'Kopi Susu Gula Aren', price: 24000, quantity: 1, notes: 'Es sedikit', kitchenStatus: 'READY' },
    ],
  },
  {
    id: 'ORD-5d8c93',
    cafeId: CAFE_ID,
    tableId: 'table-15',
    tableName: 'Meja 15',
    status: 'DIPROSES_DAPUR',
    totalAmount: 40000,
    createdAt: minsAgo(1),
    payment: { method: 'GOPAY', status: 'SUCCESS', transactionId: 'TRX-m4n5o6' },
    items: [
      { id: 'oi-10', menuItemId: 'item-lemontea', name: 'Lemon Tea', price: 20000, quantity: 2, notes: 'Tanpa es', kitchenStatus: 'WAITING' },
    ],
  },
];

// ── Generator pesanan acak (simulasi "pesanan masuk realtime") ───────────────

const SAMPLE_NOTES = ['Extra pedas', 'Less sugar', 'Tanpa es', 'Pakai oat milk', ''];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Buat satu pesanan acak baru dari pool menu — dipakai untuk mensimulasikan
 * pesanan yang baru masuk ke dapur. Semua item mulai berstatus WAITING dan
 * waktu masuk = sekarang.
 *
 * `cafeId` menentukan kafe pemilik pesanan (isolasi tenant); default ke kafe
 * demo bila tidak diberikan.
 */
export function generateRandomKitchenOrder(cafeId: string = CAFE_ID): Order {
  const pool = mockMenuItems.filter((m) => m.isAvailable);
  const count = 1 + Math.floor(Math.random() * 3); // 1–3 item
  const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

  const items: OrderItem[] = chosen.map((menuItem) => ({
    id: randomId('oi'),
    menuItemId: menuItem.id,
    name: menuItem.name,
    price: menuItem.price,
    quantity: 1 + Math.floor(Math.random() * 2), // 1–2
    notes: rand(SAMPLE_NOTES),
    kitchenStatus: 'WAITING',
  }));

  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    id: randomId('ORD'),
    cafeId,
    tableId: randomId('table'),
    tableName: `Meja ${1 + Math.floor(Math.random() * 20)}`,
    status: 'DIPROSES_DAPUR',
    totalAmount,
    createdAt: new Date().toISOString(),
    payment: { method: rand(['QRIS', 'GOPAY', 'CARD'] as const), status: 'SUCCESS', transactionId: randomId('TRX') },
    items,
  };
}

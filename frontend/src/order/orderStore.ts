import type { CartLine } from '../types/cart';
import type { TableInfo } from '../types/menu';
import type { Order, PaymentMethodCode } from '../types/order';

const LAST_ORDER_KEY = 'cafeos-last-order';

/** ID acak sederhana untuk mock (fase frontend). */
function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Susun sebuah Order dari isi keranjang. Pada fase frontend ini murni lokal;
 * fase backend akan menggantinya dengan POST /orders yang mengembalikan order
 * asli beserta id transaksi dari gateway.
 */
export function buildOrder(
  lines: CartLine[],
  table: TableInfo,
  cafeId: string,
  method: PaymentMethodCode,
): Order {
  const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.item.price, 0);

  return {
    id: randomId('ORD'),
    cafeId,
    tableId: table.id,
    tableName: table.tableName,
    status: 'DIPROSES_DAPUR', // setelah pembayaran sukses, pesanan masuk dapur
    items: lines.map((l) => ({
      id: randomId('OI'),
      menuItemId: l.item.id,
      name: l.item.name,
      price: l.item.price,
      quantity: l.quantity,
      notes: l.notes,
      kitchenStatus: 'WAITING',
    })),
    totalAmount,
    payment: {
      method,
      status: 'SUCCESS',
      transactionId: randomId('TRX'),
    },
    createdAt: new Date().toISOString(),
  };
}

export function saveLastOrder(order: Order): void {
  try {
    window.sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* storage tidak tersedia — abaikan */
  }
}

export function getLastOrder(): Order | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? (JSON.parse(raw) as Order) : null;
  } catch {
    return null;
  }
}

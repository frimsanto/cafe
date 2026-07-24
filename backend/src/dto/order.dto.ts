import type {
  KitchenStatus,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Table,
} from '@prisma/client';

// DTO respons untuk pesanan & pembayaran — Decimal → number, tanggal → ISO
// string. Selaras dengan tipe `Order` di frontend.

export interface OrderItemDTO {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  kitchenStatus: KitchenStatus;
}

export interface PaymentDTO {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId: string | null;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  cafeId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
  createdAt: string;
  updatedAt: string;
}

export function toOrderItemDTO(item: OrderItem): OrderItemDTO {
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.name,
    price: Number(item.price),
    quantity: item.quantity,
    notes: item.notes,
    kitchenStatus: item.kitchenStatus,
  };
}

export function toPaymentDTO(payment: Payment): PaymentDTO {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    status: payment.status,
    amount: Number(payment.amount),
    transactionId: payment.transactionId,
    createdAt: payment.createdAt.toISOString(),
  };
}

/** Bentuk Order lengkap dengan relasi items & payment. */
type OrderWithRelations = Order & {
  items: OrderItem[];
  payment: Payment | null;
};

export function toOrderDTO(order: OrderWithRelations): OrderDTO {
  return {
    id: order.id,
    cafeId: order.cafeId,
    tableId: order.tableId,
    status: order.status,
    totalAmount: Number(order.totalAmount),
    items: order.items.map(toOrderItemDTO),
    payment: order.payment ? toPaymentDTO(order.payment) : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Pesanan beserta nama mejanya.
 *
 * Layar kasir DAN Layar Dapur sama-sama memanggil tamu dengan nama meja
 * ("Meja 12"), bukan id. Menyertakannya di sini menghemat satu pemanggilan
 * tambahan dari klien — dan untuk dapur memang tidak ada jalan lain: peran
 * DAPUR tidak berhak memanggil endpoint daftar meja (khusus OWNER).
 */
export interface OrderWithTableDTO extends OrderDTO {
  tableName: string;
}

export type OrderWithTable = OrderWithRelations & {
  table: Pick<Table, 'tableName'>;
};

export function toOrderWithTableDTO(order: OrderWithTable): OrderWithTableDTO {
  return { ...toOrderDTO(order), tableName: order.table.tableName };
}

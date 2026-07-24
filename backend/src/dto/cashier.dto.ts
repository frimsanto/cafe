import type { Order, OrderItem, Payment, Table } from '@prisma/client';
import { toOrderDTO, type OrderDTO } from './order.dto';

/**
 * Pesanan untuk layar kasir — sama dengan `OrderDTO` plus nama meja.
 *
 * Kasir memanggil tamu dengan nama mejanya ("Meja 12"), bukan id; menyertakan
 * namanya di sini menghemat satu pemanggilan tambahan dari klien.
 */
export interface CashierOrderDTO extends OrderDTO {
  tableName: string;
}

type OrderWithTable = Order & {
  items: OrderItem[];
  payment: Payment | null;
  table: Pick<Table, 'tableName'>;
};

export function toCashierOrderDTO(order: OrderWithTable): CashierOrderDTO {
  return { ...toOrderDTO(order), tableName: order.table.tableName };
}

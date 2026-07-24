import {
  toOrderWithTableDTO,
  type OrderWithTable,
  type OrderWithTableDTO,
} from './order.dto';

/**
 * Pesanan untuk layar kasir — sama dengan `OrderDTO` plus nama meja.
 *
 * Bentuknya kini dipakai bersama Layar Dapur, jadi definisinya tinggal di
 * `order.dto.ts`; nama `CashierOrderDTO` dipertahankan agar kode kasir yang
 * sudah ada tidak perlu ikut berubah.
 */
export type CashierOrderDTO = OrderWithTableDTO;

export const toCashierOrderDTO = toOrderWithTableDTO;
export type { OrderWithTable };

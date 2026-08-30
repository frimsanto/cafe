import type { Prisma } from '@prisma/client';
import { ITEM_TERURUT } from './orderItems';

/**
 * Relasi yang SELALU ikut saat sebuah pesanan dikirim ke layar staf.
 *
 * Satu konstanta, bukan objek `include` yang disalin di tiap service. Sebelum
 * ini ada tiga salinan yang hampir sama (kasir, dapur, rilis), dan setiap kali
 * satu layar butuh relasi baru hanya salah satunya yang diperbarui — sehingga
 * pesanan yang sama tampil berbeda tergantung endpoint mana yang membawanya.
 *
 * `pembayaranManual` ikut karena kartu kasir menyebut metode yang diajukan tamu
 * dan kembaliannya; `cashier`/`pembatal` karena setiap keputusan uang harus
 * bisa dibaca ulang bersama nama pelakunya, bukan hanya id-nya.
 */
export const ORDER_INCLUDE = {
  items: ITEM_TERURUT,
  payment: true,
  pembayaranManual: true,
  table: { select: { id: true, tableName: true } },
  cashier: { select: { id: true, name: true } },
  pembatal: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

export type OrderLengkap = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

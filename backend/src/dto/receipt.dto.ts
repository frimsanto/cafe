import type { ReceiptOrder } from '../lib/receiptPdf';

// Data struk siap-cetak dalam bentuk JSON — dipakai pratinjau & cetak di
// peramban kasir (kertas 80mm). Berbeda dari endpoint struk PDF yang mengirim
// berkas jadi; di sini klien yang menyusun tampilannya.

export interface ReceiptLineDTO {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  notes: string;
}

export interface ReceiptDataDTO {
  cafe: { id: string; name: string; address: string | null };
  order: {
    id: string;
    tableName: string;
    createdAt: string;
    totalAmount: number;
  };
  payment: {
    method: string;
    status: string;
    transactionId: string | null;
    paidAt: string;
  };
  lines: ReceiptLineDTO[];
  /** Waktu struk ini dibuat — dicetak sebagai penanda salinan. */
  printedAt: string;
}

export function toReceiptDataDTO(order: ReceiptOrder): ReceiptDataDTO {
  const payment = order.payment!;

  return {
    cafe: {
      id: order.cafe.id,
      name: order.cafe.name,
      address: order.cafe.address,
    },
    order: {
      id: order.id,
      tableName: order.table.tableName,
      createdAt: order.createdAt.toISOString(),
      totalAmount: Number(order.totalAmount),
    },
    payment: {
      method: payment.method,
      status: payment.status,
      transactionId: payment.transactionId,
      paidAt: payment.createdAt.toISOString(),
    },
    lines: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price),
      subtotal: Number(item.price) * item.quantity,
      notes: item.notes,
    })),
    printedAt: new Date().toISOString(),
  };
}

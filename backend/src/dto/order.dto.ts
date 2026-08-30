import type {
  KitchenStatus,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PembayaranManual,
  Table,
} from '@prisma/client';
import {
  normalisasiFulfillment,
  normalisasiKitchenStatus,
  normalisasiOrderSource,
  turunkanStatusPesanan,
  type FulfillmentType,
  type KitchenStatusPesanan,
  type OrderSource,
  type StatusPesanan,
} from '../lib/orderStatus';

// DTO respons untuk pesanan & pembayaran — Decimal → number, tanggal → ISO
// string. Selaras dengan tipe `Order` di frontend.
//
// LIMA STATUS YANG TERPISAH ikut dikirim di sini, dan itu disengaja: layar
// kasir harus bisa menjawab "uangnya sudah masuk?" dan "makanannya sudah
// jalan?" sebagai dua pertanyaan berbeda. Menggabungkannya kembali menjadi satu
// kata di klien akan menghidupkan lagi persis kekeliruan yang dipisahkan di
// sini.

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

/**
 * Ringkasan pembayaran manual sebuah pesanan.
 *
 * `kembalian` dihitung di server dari nominal yang benar-benar tercatat, bukan
 * dikirim ulang oleh layar kasir — struk dan laporan harus menunjukkan angka
 * yang sama dengan yang tersimpan.
 */
export interface PembayaranManualDTO {
  metode: string;
  nominal: number;
  /** Selisih uang diterima − tagihan; 0 untuk metode non-tunai. */
  kembalian: number;
  sumber: string;
  statusVerifikasi: string;
  catatanKasir: string | null;
  referensi: string | null;
  buktiUrl: string | null;
  alasanPenolakan: string | null;
  diverifikasiPada: string | null;
}

/** Staf yang namanya melekat pada sebuah keputusan (kasir / pembatal). */
export interface StafRingkasDTO {
  id: string;
  name: string;
}

export interface OrderDTO {
  id: string;
  cafeId: string;
  /** NULL pada pesanan bawa pulang — tidak ada meja yang bisa disebut. */
  tableId: string | null;
  /** Status kasar (enum lama). Dipertahankan agar klien lama tidak patah. */
  status: OrderStatus;
  /** Status pesanan kanonik, turunan `status` + `statusPembayaran`. */
  statusPesanan: StatusPesanan;
  /** NOT_SENT | QUEUED | PREPARING | READY | COMPLETED. */
  kitchenStatus: KitchenStatusPesanan;
  fulfillmentType: FulfillmentType;
  orderSource: OrderSource;
  customerName: string | null;
  /** Catatan untuk seluruh pesanan (catatan per item ada di `items[].notes`). */
  catatan: string | null;
  totalAmount: number;
  /**
   * Nomor antrian harian yang dipanggil ke tamu (1–999), ditampilkan `A-001`.
   * Null pada pesanan lama yang dibuat sebelum nomor ini disimpan.
   */
  queueNumber: number | null;
  items: OrderItemDTO[];
  payment: PaymentDTO | null;
  // ── Pembayaran dua jalur (manual + Midtrans) ──
  /** Kosakata `StatusPembayaran`; lihat `lib/paymentStatus.ts`. */
  statusPembayaran: string | null;
  /** Metode aktual: kode manual (TUNAI/…) atau label Midtrans (GoPay/…). */
  metodePembayaran: string | null;
  /** Nominal yang disepakati saat lunas. */
  nominalDibayar: number | null;
  /** `order_id` yang dikirim ke Midtrans (null bila bukan jalur Midtrans). */
  midtransOrderId: string | null;
  // ── Garis waktu ──
  paidAt: string | null;
  confirmedAt: string | null;
  kitchenQueuedAt: string | null;
  kitchenStartedAt: string | null;
  kitchenReadyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  alasanPembatalan: string | null;
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

/** ISO string, atau null bila tanggalnya memang belum pernah terjadi. */
function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
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
    statusPesanan: turunkanStatusPesanan(order),
    kitchenStatus: normalisasiKitchenStatus(order.kitchenStatus),
    fulfillmentType: normalisasiFulfillment(order.fulfillmentType),
    orderSource: normalisasiOrderSource(order.orderSource),
    customerName: order.customerName,
    catatan: order.catatan,
    totalAmount: Number(order.totalAmount),
    queueNumber: order.queueNumber,
    items: order.items.map(toOrderItemDTO),
    payment: order.payment ? toPaymentDTO(order.payment) : null,
    statusPembayaran: order.statusPembayaran,
    metodePembayaran: order.metodePembayaran,
    nominalDibayar: order.nominalDibayar === null ? null : Number(order.nominalDibayar),
    midtransOrderId: order.midtransOrderId,
    paidAt: iso(order.paidAt),
    confirmedAt: iso(order.confirmedAt),
    kitchenQueuedAt: iso(order.kitchenQueuedAt),
    kitchenStartedAt: iso(order.kitchenStartedAt),
    kitchenReadyAt: iso(order.kitchenReadyAt),
    completedAt: iso(order.completedAt),
    cancelledAt: iso(order.cancelledAt),
    alasanPembatalan: order.alasanPembatalan,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Pesanan beserta nama mejanya dan jejak keputusan kasirnya.
 *
 * Layar kasir DAN Layar Dapur sama-sama memanggil tamu dengan nama meja
 * ("Meja 12") atau nomor antrian bawa pulang ("A-017"), bukan id. Menyertakannya
 * di sini menghemat satu pemanggilan tambahan dari klien — dan untuk dapur
 * memang tidak ada jalan lain: peran DAPUR tidak berhak memanggil endpoint
 * daftar meja (khusus OWNER).
 *
 * `tableName` NULL berarti pesanan bawa pulang; klien menampilkan nomor
 * antriannya. Jangan menggantinya dengan teks penanda seperti "Take Away" di
 * sini — kolom yang berisi nama meja palsu akan ikut tercetak di struk.
 */
export interface OrderWithTableDTO extends OrderDTO {
  tableName: string | null;
  /** Ringkasan pembayaran manual, bila pesanan ini melewatinya. */
  pembayaranManual: PembayaranManualDTO | null;
  /** Kasir yang membuat pesanan ini di layar kasir. */
  kasir: StafRingkasDTO | null;
  /** Staf yang membatalkan pesanan ini. */
  pembatal: StafRingkasDTO | null;
}

export type OrderWithTable = OrderWithRelations & {
  table?: Pick<Table, 'tableName'> | null;
  pembayaranManual?: PembayaranManual | null;
  cashier?: StafRingkasDTO | null;
  pembatal?: StafRingkasDTO | null;
};

export function toPembayaranManualDTO(
  manual: PembayaranManual,
  totalAmount: number,
): PembayaranManualDTO {
  const nominal = Number(manual.nominal);
  return {
    metode: manual.metode,
    nominal,
    // Hanya kelebihan uang yang dihitung sebagai kembalian. Nominal yang KURANG
    // dari tagihan tidak pernah menjadi kembalian negatif di struk — kalau itu
    // terjadi, yang salah adalah pembayarannya, bukan angkanya.
    kembalian: Math.max(0, nominal - totalAmount),
    sumber: manual.sumber,
    statusVerifikasi: manual.statusVerifikasi,
    catatanKasir: manual.catatanKasir,
    referensi: manual.referensi,
    buktiUrl: manual.buktiUrl,
    alasanPenolakan: manual.alasanPenolakan,
    diverifikasiPada: iso(manual.diverifikasiPada),
  };
}

export function toOrderWithTableDTO(order: OrderWithTable): OrderWithTableDTO {
  const dasar = toOrderDTO(order);
  return {
    ...dasar,
    tableName: order.table?.tableName ?? null,
    pembayaranManual: order.pembayaranManual
      ? toPembayaranManualDTO(order.pembayaranManual, dasar.totalAmount)
      : null,
    kasir: order.cashier ?? null,
    pembatal: order.pembatal ?? null,
  };
}

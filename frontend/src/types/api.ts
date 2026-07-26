// Nama-nama DTO sesuai penamaan backend (`backend/src/dto/*.ts`).
//
// Bentuk pesanan sudah didefinisikan sekali di `types/order.ts` dan dipakai
// bersama; di sini hanya dibuat aliasnya supaya kode yang berbicara dalam
// istilah API tetap terbaca wajar, tanpa ada dua definisi yang bisa melenceng.

import type { Order, OrderItem, Payment } from './order';

export type OrderDTO = Order;
export type OrderItemDTO = OrderItem;
export type PaymentDTO = Payment;

/**
 * Pesanan yang dipastikan membawa nama meja — dipakai layar kasir dan Layar
 * Dapur. Keduanya memanggil tamu dengan nama meja, bukan id.
 */
export interface OrderWithTableDTO extends Order {
  tableName: string;
}

/** Nama lama yang masih dipakai modul kasir. */
export type CashierOrderDTO = OrderWithTableDTO;

/** Meja + kafe hasil pemindaian QR pelanggan (`GET /api/tables/by-qr/:qrCode`). */
export interface PublicTableDTO {
  tableId: string;
  tableName: string;
  cafeId: string;
  cafeName: string;
}

/** Meja lengkap untuk halaman Manajemen Meja. */
export interface TableDTO {
  id: string;
  cafeId: string;
  tableName: string;
  qrCode: string;
  /** URL lengkap yang dienkode ke QR — ditentukan server, bukan peramban. */
  menuUrl: string;
}

export interface TableWithStatusDTO extends TableDTO {
  status: 'KOSONG' | 'DIGUNAKAN';
  activeOrderCount: number;
}

/** Ringkasan omzet satu periode. */
export interface RevenueSummaryDTO {
  period: 'today' | 'week' | 'month';
  from: string;
  to: string;
  revenue: number;
  orderCount: number;
  previous: {
    revenue: number;
    orderCount: number;
  };
  /** Pertumbuhan vs periode sebelumnya (persen); null bila tak ada pembanding. */
  growthPercent: number | null;
}

export interface TopMenuItemDTO {
  menuItemId: string;
  name: string;
  imageUrl: string;
  soldCount: number;
}

/** Konfigurasi pembayaran kafe (GET /api/cafe/payment-config). serverKey TIDAK ada. */
export interface PaymentConfigDTO {
  metodeDiterima: string[];
  midtransAktif: boolean;
  clientKey: string | null;
  isProduction: boolean;
}

/** Hasil pembuatan transaksi Midtrans (POST /api/pembayaran/midtrans/buat). */
export interface MidtransBuatDTO {
  snapToken: string;
  /** `order_id` Midtrans — dipakai halaman status & polling. */
  orderId: string;
  grossAmount: number;
  clientKey: string | null;
  isProduction: boolean;
}

/** Status transaksi Midtrans (GET /api/pembayaran/:midtransOrderId/status). */
export interface StatusPembayaranDTO {
  status: string;
  metodePembayaran: string | null;
  grossAmount: number;
  updatedAt: string;
}

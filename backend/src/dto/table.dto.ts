import type { Table } from '@prisma/client';
import { tableMenuUrl } from '../lib/qrUrl';

// DTO respons API meja — bentuknya sama persis dengan tipe `CafeTable` di
// frontend, sehingga halaman Manajemen Meja & QR bisa memakainya apa adanya.

export interface TableDTO {
  id: string;
  cafeId: string;
  tableName: string;
  /** Token yang dienkode ke QR meja; QR-nya sendiri dibuat di sisi klien. */
  qrCode: string;
  /**
   * URL lengkap yang dipindai pelanggan. Dikirim server agar stiker QR yang
   * dicetak tidak pernah menunjuk `localhost` milik perangkat pemilik.
   */
  menuUrl: string;
}

export function toTableDTO(table: Table): TableDTO {
  return {
    id: table.id,
    cafeId: table.cafeId,
    tableName: table.tableName,
    qrCode: table.qrCode,
    menuUrl: tableMenuUrl(table.qrCode),
  };
}

/**
 * Status pemakaian meja. BUKAN kolom database: diturunkan dari ada tidaknya
 * pesanan yang belum SELESAI di meja tersebut, sehingga tidak mungkin
 * "ketinggalan" seperti kolom status yang harus diperbarui manual.
 */
export type TableStatus = 'KOSONG' | 'DIGUNAKAN';

export interface TableWithStatusDTO extends TableDTO {
  status: TableStatus;
  /** Jumlah pesanan yang masih berjalan di meja ini. */
  activeOrderCount: number;
}

/** Data meja untuk pelanggan yang memindai QR — tanpa bocoran data internal. */
export interface PublicTableDTO {
  tableId: string;
  tableName: string;
  cafeId: string;
  cafeName: string;
}

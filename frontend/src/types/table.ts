// Tipe data domain meja — mengikuti skema `tables` pada PRD/Prisma
// (id, cafe_id, table_name, qr_code). Dipakai fitur Manajemen Meja & QR.

export interface CafeTable {
  id: string;
  cafeId: string;
  /** Nama/label meja yang dilihat staf & pelanggan, mis. "Meja 12". */
  tableName: string;
  /** Token unik yang dienkode ke QR code meja (kolom `qr_code`). */
  qrCode: string;
}

/** Data meja yang diisi lewat formulir — `id`, `cafeId`, & token QR dibuat sistem. */
export type CafeTableInput = Pick<CafeTable, 'tableName'>;

/**
 * Status pemakaian meja. Tidak disimpan sebagai kolom sendiri: diturunkan dari
 * ada/tidaknya pesanan yang masih berjalan pada meja tersebut.
 */
export type TableStatus = 'KOSONG' | 'DIGUNAKAN';

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import {
  toTableDTO,
  type PublicTableDTO,
  type TableDTO,
  type TableStatus,
  type TableWithStatusDTO,
} from '../dto/table.dto';
import { realtime } from '../realtime/realtime';

/** Berapa kali mencoba ulang bila token QR acak kebetulan bentrok. */
const QR_RETRY = 5;

/** Token QR meja: pendek, acak, dan aman dipakai di URL. */
function generateQrToken(): string {
  return `mj-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/** Field mana yang memicu pelanggaran unique (nama meja vs token QR). */
function violatedTableName(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('table_name');
}

/**
 * Layanan meja — seluruh query berjalan dalam konteks tenant, jadi otomatis
 * dibatasi `cafeId` pengguna (lihat `tenantExtension`). Operasi
 * `update`/`delete` tidak ikut disaring otomatis, karena itu setiap perubahan
 * selalu didahului `findFirst` bertenant.
 */
export const tableService = {
  /** Daftar meja hidup milik tenant aktif, terurut menurut nama. */
  async listTables(): Promise<TableDTO[]> {
    const tables = await prisma.table.findMany({
      where: { deletedAt: null },
      orderBy: { tableName: 'asc' },
    });
    return tables.map(toTableDTO);
  },

  /**
   * Daftar meja + status pemakaiannya.
   *
   * Status dihitung dari pesanan yang belum SELESAI — tidak ada kolom status
   * yang perlu diperbarui manual, jadi mustahil "meja tertinggal DIGUNAKAN"
   * hanya karena satu proses lupa menuliskannya. Hitungan diambil sekali lewat
   * `groupBy` (bukan satu query per meja) supaya tetap ringan saat kafe punya
   * puluhan meja.
   */
  async listTablesWithStatus(): Promise<TableWithStatusDTO[]> {
    const tables = await prisma.table.findMany({
      where: { deletedAt: null },
      orderBy: { tableName: 'asc' },
    });

    const active = await prisma.order.groupBy({
      by: ['tableId'],
      where: { status: { not: 'SELESAI' } },
      _count: { _all: true },
    });

    const activeByTable = new Map(
      active.map((row) => [row.tableId, row._count._all]),
    );

    return tables.map((table) => {
      const activeOrderCount = activeByTable.get(table.id) ?? 0;
      return {
        ...toTableDTO(table),
        activeOrderCount,
        status: activeOrderCount > 0 ? 'DIGUNAKAN' : 'KOSONG',
      };
    });
  },

  /** Status satu meja (dipakai saat menyiarkan perubahan realtime). */
  async getTableStatus(tableId: string): Promise<TableStatus> {
    const activeOrderCount = await prisma.order.count({
      where: { tableId, status: { not: 'SELESAI' } },
    });
    return activeOrderCount > 0 ? 'DIGUNAKAN' : 'KOSONG';
  },

  /**
   * Siarkan status terbaru sebuah meja ke klien kafe tersebut.
   *
   * Dipanggil di titik-titik yang mengubah pesanan (pesanan masuk, pesanan
   * selesai) sehingga halaman Manajemen Meja ikut berubah tanpa dimuat ulang.
   * Kegagalan siaran tidak boleh menggagalkan transaksi utama — karena itu
   * error-nya ditelan dan hanya dicatat.
   */
  async broadcastTableStatus(cafeId: string, tableId: string): Promise<void> {
    try {
      const status = await tableService.getTableStatus(tableId);
      realtime.emitTableStatusChanged(cafeId, { tableId, status });
    } catch (error) {
      console.error('[cafeos-backend] Gagal menyiarkan status meja:', error);
    }
  },

  /**
   * Terjemahkan token QR (hasil pindai pelanggan) menjadi identitas meja & kafe.
   *
   * PUBLIK — pelanggan memesan tanpa akun. Karena itu responsnya sengaja
   * seminimal mungkin: hanya yang dibutuhkan halaman menu, tanpa data internal
   * kafe. Berjalan di luar konteks tenant, jadi `cafeId` diambil dari barisnya
   * sendiri, bukan dari token pengguna.
   */
  async resolveByQrCode(qrCode: string): Promise<PublicTableDTO> {
    const table = await prisma.table.findFirst({
      where: { qrCode, deletedAt: null },
      select: {
        id: true,
        tableName: true,
        cafeId: true,
        cafe: { select: { name: true } },
      },
    });
    if (!table) throw ApiError.notFound('QR meja tidak dikenali');

    return {
      tableId: table.id,
      tableName: table.tableName,
      cafeId: table.cafeId,
      cafeName: table.cafe.name,
    };
  },

  /** Satu meja milik tenant aktif; 404 bila tidak ada / sudah dihapus. */
  async getTableOrFail(tableId: string): Promise<TableDTO> {
    const table = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
    });
    if (!table) throw ApiError.notFound('Meja tidak ditemukan');
    return toTableDTO(table);
  },

  /**
   * Tambah meja baru beserta token QR-nya.
   *
   * Token dibuat di server (bukan dikirim klien) supaya tidak bisa ditebak atau
   * ditumpuk milik kafe lain. Bila token acak kebetulan bentrok, dicoba lagi
   * dengan token baru — bentrok nama meja tetap dilaporkan sebagai 409.
   */
  async createTable(cafeId: string, tableName: string): Promise<TableDTO> {
    for (let attempt = 1; attempt <= QR_RETRY; attempt += 1) {
      try {
        const created = await prisma.table.create({
          data: { cafeId, tableName, qrCode: generateQrToken() },
        });
        return toTableDTO(created);
      } catch (error) {
        if (isUniqueViolation(error) && violatedTableName(error)) {
          throw ApiError.conflict('Sudah ada meja dengan nama itu');
        }
        // Token QR bentrok (sangat jarang) — coba token lain.
        if (isUniqueViolation(error) && attempt < QR_RETRY) continue;
        throw error;
      }
    }

    throw new Error('Gagal membuat token QR unik untuk meja baru');
  },

  /**
   * Ganti nama meja. Token QR sengaja TIDAK ikut berubah supaya stiker QR yang
   * sudah tercetak dan tertempel di meja tetap berlaku.
   */
  async renameTable(tableId: string, tableName: string): Promise<TableDTO> {
    const existing = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Meja tidak ditemukan');

    try {
      const updated = await prisma.table.update({
        where: { id: tableId },
        data: { tableName },
      });
      return toTableDTO(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiError.conflict('Sudah ada meja dengan nama itu');
      }
      throw error;
    }
  },

  /**
   * Hapus meja — SOFT DELETE, karena pesanan lama menunjuk meja ini dan
   * riwayat/laporan harus tetap utuh. Ditolak bila meja masih punya pesanan
   * berjalan: tamu yang sedang duduk di sana belum selesai dilayani.
   */
  async deleteTable(tableId: string): Promise<{ id: string }> {
    const existing = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Meja tidak ditemukan');

    const activeOrders = await prisma.order.count({
      where: { tableId, status: { not: 'SELESAI' } },
    });
    if (activeOrders > 0) {
      throw ApiError.conflict(
        'Meja ini masih punya pesanan berjalan — selesaikan dulu sebelum dihapus',
      );
    }

    await prisma.table.update({
      where: { id: tableId },
      data: { deletedAt: new Date() },
    });

    return { id: tableId };
  },
};

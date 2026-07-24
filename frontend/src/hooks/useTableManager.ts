import { useCallback, useEffect, useState } from 'react';
import type { TableWithStatusDTO } from '../types/api';
import { tablesApi } from '../api/tables';
import { describeApiError } from '../lib/apiClient';

export interface TableManager {
  tables: TableWithStatusDTO[];
  loading: boolean;
  /** Pesan kegagalan memuat/mengubah data — null bila semuanya lancar. */
  error: string | null;
  /** Muat ulang dari API. */
  reload: () => void;
  /** Tambah meja baru; token QR dibuat server. */
  addTable: (tableName: string) => Promise<void>;
  /** Ganti nama meja. Token QR tidak ikut berubah — stiker lama tetap sah. */
  renameTable: (id: string, tableName: string) => Promise<void>;
  /**
   * Hapus meja. Di backend ini adalah soft delete (`deleted_at`) supaya pesanan
   * lama yang menunjuk meja tersebut tetap utuh.
   */
  removeTable: (id: string) => Promise<void>;
  /** Nama meja berikutnya yang disarankan, mis. "Meja 15". */
  suggestNextName: () => string;
}

/**
 * Sumber data meja untuk halaman Manajemen Meja & QR — seluruhnya dari API
 * (`/api/cafes/:cafeId/tables`), disaring per `cafeId` di backend.
 *
 * Tidak ada lagi cadangan data contoh: kalau API gagal, halaman menampilkan
 * pesan kesalahan. Menampilkan meja palsu saat backend mati justru berbahaya —
 * pemilik bisa mengira punya belasan meja yang sebenarnya tidak ada, dan
 * mencetak stiker QR yang tidak menunjuk ke mana pun.
 *
 * Setiap perubahan memuat ulang daftar dari server, bukan menambal state
 * lokal: status pemakaian meja (KOSONG/DIGUNAKAN) dihitung backend dari
 * pesanan berjalan, jadi hanya server yang tahu nilai barunya.
 */
export function useTableManager(cafeId: string): TableManager {
  const [tables, setTables] = useState<TableWithStatusDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    tablesApi
      .list(cafeId)
      .then((data) => {
        if (cancelled) return;
        setTables(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTables([]);
        setError(describeApiError(err, 'Gagal memuat daftar meja.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const addTable = useCallback(
    async (tableName: string): Promise<void> => {
      await tablesApi.create(cafeId, tableName.trim());
      reload();
    },
    [cafeId, reload],
  );

  const renameTable = useCallback(
    async (id: string, tableName: string): Promise<void> => {
      await tablesApi.rename(cafeId, id, tableName.trim());
      reload();
    },
    [cafeId, reload],
  );

  const removeTable = useCallback(
    async (id: string): Promise<void> => {
      await tablesApi.remove(cafeId, id);
      reload();
    },
    [cafeId, reload],
  );

  const suggestNextName = useCallback((): string => {
    // Ambil angka terbesar dari nama meja yang sudah ada, lalu +1.
    const highest = tables.reduce((max, table) => {
      const found = table.tableName.match(/(\d+)/);
      return found ? Math.max(max, Number(found[1])) : max;
    }, 0);
    return `Meja ${highest + 1}`;
  }, [tables]);

  return {
    tables,
    loading,
    error,
    reload,
    addTable,
    renameTable,
    removeTable,
    suggestNextName,
  };
}

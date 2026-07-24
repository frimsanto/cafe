import { useCallback, useEffect, useState } from 'react';
import type { CafeTable } from '../types/table';
import { getTablesForCafe } from '../data/mockTables';
import { tablesApi } from '../api/tables';
import { describeApiError } from '../lib/apiClient';

/** Dari mana data meja yang sedang tampil berasal. */
export type TableSource = 'api' | 'mock';

export interface TableManager {
  tables: CafeTable[];
  loading: boolean;
  source: TableSource;
  /** Alasan gagal memakai API — dipakai untuk memberi tahu pengguna. */
  apiError: string | null;
  /** Muat ulang dari API. */
  reload: () => void;
  /** Tambah meja baru; token QR dibuat server (atau lokal saat mode contoh). */
  addTable: (tableName: string) => Promise<CafeTable>;
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

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Meja "lokal" untuk mode data contoh — bentuknya sama dengan hasil API. */
function makeLocalTable(cafeId: string, tableName: string): CafeTable {
  const suffix = randomSuffix();
  return {
    id: `table-${suffix}`,
    cafeId,
    tableName: tableName.trim(),
    qrCode: `mj-${suffix}-${cafeId.slice(-3)}`,
  };
}

/**
 * Sumber data meja untuk halaman Manajemen Meja & QR.
 *
 * Mengambil data dari API backend (`/api/cafes/:cafeId/tables`). Bila backend
 * belum tersedia — endpoint meja baru dibuat pada layer backend fase ini —
 * hook ini JATUH KE DATA CONTOH agar halaman tetap bisa dipakai dan diuji,
 * sambil menandai `source: 'mock'` supaya UI bisa berterus terang.
 *
 * Semua perubahan disaring per `cafeId` (isolasi multi-tenant).
 */
export function useTableManager(cafeId: string): TableManager {
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<TableSource>('api');
  const [apiError, setApiError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    tablesApi
      .list(cafeId)
      .then((data) => {
        if (cancelled) return;
        setTables(data);
        setSource('api');
        setApiError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Backend belum siap/tidak terjangkau — tampilkan data contoh apa adanya.
        setTables(getTablesForCafe(cafeId));
        setSource('mock');
        setApiError(describeApiError(error, 'Gagal memuat daftar meja.'));
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
    async (tableName: string): Promise<CafeTable> => {
      const table =
        source === 'api'
          ? await tablesApi.create(cafeId, tableName.trim())
          : makeLocalTable(cafeId, tableName);

      setTables((prev) => [...prev, table]);
      return table;
    },
    [cafeId, source],
  );

  const renameTable = useCallback(
    async (id: string, tableName: string): Promise<void> => {
      const trimmed = tableName.trim();
      if (source === 'api') await tablesApi.rename(cafeId, id, trimmed);

      setTables((prev) =>
        prev.map((table) =>
          table.id === id ? { ...table, tableName: trimmed } : table,
        ),
      );
    },
    [cafeId, source],
  );

  const removeTable = useCallback(
    async (id: string): Promise<void> => {
      if (source === 'api') await tablesApi.remove(cafeId, id);
      setTables((prev) => prev.filter((table) => table.id !== id));
    },
    [cafeId, source],
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
    source,
    apiError,
    reload,
    addTable,
    renameTable,
    removeTable,
    suggestNextName,
  };
}

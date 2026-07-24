import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PublicTableDTO } from '../types/api';
import { ordersApi } from '../api/orders';
import { describeApiError } from '../lib/apiClient';

/**
 * Meja & kafe hasil pindai QR, dipakai bersama seluruh halaman pelanggan.
 *
 * Token QR ada di URL (`/menu/<qrCode>`) — bentuk yang memang dienkode server
 * ke stiker meja. Hasil terjemahannya disimpan di sessionStorage supaya
 * pelanggan bisa berpindah ke keranjang/checkout, atau memuat ulang halaman,
 * tanpa harus memindai ulang. Sengaja sessionStorage, bukan localStorage:
 * identitas meja tidak boleh ikut terbawa ke kunjungan berikutnya di meja lain.
 */
const SESSION_KEY = 'cafeos-table-session';

interface TableSessionValue {
  table: PublicTableDTO | null;
  loading: boolean;
  error: string | null;
  /** Bersihkan sesi meja (mis. setelah pesanan tuntas). */
  clear: () => void;
}

const TableSessionContext = createContext<TableSessionValue | null>(null);

function readStored(): PublicTableDTO | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PublicTableDTO) : null;
  } catch {
    return null;
  }
}

function persist(table: PublicTableDTO): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(table));
  } catch {
    /* storage tidak tersedia — sesi hanya bertahan di memori */
  }
}

export function TableSessionProvider({
  qrCode,
  children,
}: {
  /** Token QR dari URL; kosong bila halaman dibuka tanpa memindai. */
  qrCode?: string;
  children: ReactNode;
}) {
  const [table, setTable] = useState<PublicTableDTO | null>(readStored);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrCode) return;

    let cancelled = false;
    setLoading(true);

    ordersApi
      .resolveTableByQr(qrCode)
      .then((data) => {
        if (cancelled) return;
        setTable(data);
        persist(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          describeApiError(err, 'QR meja tidak dikenali. Coba pindai ulang.'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `table` sengaja tidak jadi dependensi: yang menentukan pemanggilan ulang
    // hanyalah token QR di URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrCode]);

  const clear = useCallback(() => {
    setTable(null);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  const value = useMemo<TableSessionValue>(
    () => ({ table, loading, error, clear }),
    [table, loading, error, clear],
  );

  return (
    <TableSessionContext.Provider value={value}>
      {children}
    </TableSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTableSession(): TableSessionValue {
  const ctx = useContext(TableSessionContext);
  if (!ctx) {
    throw new Error('useTableSession harus dipakai di dalam <TableSessionProvider>');
  }
  return ctx;
}

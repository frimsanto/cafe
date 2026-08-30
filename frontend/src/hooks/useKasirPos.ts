import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MenuCategoryWithItems, MenuItem } from '../types/menu';
import type { CartLine } from '../types/cart';
import type { MejaKasirDTO } from '../types/api';
import { menuApi } from '../api/menu';
import { cashierApi } from '../api/orders';
import { describeApiError } from '../lib/apiClient';

/**
 * Data & keranjang untuk pesanan yang dibuat DI kasir.
 *
 * Terpisah dari `useCashierOrders` (yang mengurus daftar pesanan) karena
 * keduanya hidup di irama yang berbeda: daftar pesanan diperbarui terus-menerus
 * lewat realtime, sedangkan menu & meja hanya perlu dimuat saat kasir membuka
 * dialog pesanan baru. Menggabungkannya berarti setiap siaran realtime ikut
 * merender ulang seluruh papan menu yang sedang dipakai memilih.
 */

/** Batas jumlah per baris — sama dengan batas server (`MAX_QTY` di validasi). */
const MAKS_QTY = 99;

export interface KasirPos {
  kategori: MenuCategoryWithItems[];
  meja: MejaKasirDTO[];
  loading: boolean;
  error: string | null;
  reload: () => void;

  /** Baris keranjang, urut sesuai urutan ditambahkan. */
  keranjang: CartLine[];
  subtotal: number;
  jumlahItem: number;
  tambah: (item: MenuItem) => void;
  ubahJumlah: (menuItemId: string, notes: string, quantity: number) => void;
  ubahCatatan: (menuItemId: string, notesLama: string, notesBaru: string) => void;
  hapus: (menuItemId: string, notes: string) => void;
  kosongkan: () => void;
}

/** Kunci identitas satu baris keranjang: menu + catatannya. */
function kunciBaris(menuItemId: string, notes: string): string {
  return `${menuItemId}|${notes}`;
}

export function useKasirPos(cafeId: string, aktif: boolean): KasirPos {
  const [kategori, setKategori] = useState<MenuCategoryWithItems[]>([]);
  const [meja, setMeja] = useState<MejaKasirDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [keranjang, setKeranjang] = useState<CartLine[]>([]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // Menu & meja baru diambil saat dialognya benar-benar dibuka. Memuatnya di
    // latar sepanjang hari akan membebani layar kasir yang justru harus ringan.
    if (!cafeId || !aktif) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      // Hanya menu yang TERSEDIA: kasir tidak boleh bisa menjual apa yang
      // sedang habis, dan server akan menolaknya juga.
      menuApi.grouped(cafeId, true),
      cashierApi.tables(cafeId),
    ])
      .then(([menu, tables]) => {
        if (cancelled) return;
        setKategori(menu.filter((k) => k.items.length > 0));
        setMeja(tables);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeApiError(err, 'Gagal memuat menu & meja.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, aktif, reloadKey]);

  const tambah = useCallback((item: MenuItem) => {
    setKeranjang((prev) => {
      // Item yang sama tanpa catatan menaikkan jumlah baris yang ada, bukan
      // melahirkan baris kedua — persis aturan yang dipakai keranjang tamu.
      const index = prev.findIndex(
        (b) => kunciBaris(b.item.id, b.notes) === kunciBaris(item.id, ''),
      );
      if (index === -1) return [...prev, { item, quantity: 1, notes: '' }];
      const baris = prev[index];
      if (baris.quantity >= MAKS_QTY) return prev;
      const next = [...prev];
      next[index] = { ...baris, quantity: baris.quantity + 1 };
      return next;
    });
  }, []);

  const ubahJumlah = useCallback(
    (menuItemId: string, notes: string, quantity: number) => {
      setKeranjang((prev) => {
        const kunci = kunciBaris(menuItemId, notes);
        if (quantity < 1) {
          return prev.filter((b) => kunciBaris(b.item.id, b.notes) !== kunci);
        }
        return prev.map((b) =>
          kunciBaris(b.item.id, b.notes) === kunci
            ? { ...b, quantity: Math.min(quantity, MAKS_QTY) }
            : b,
        );
      });
    },
    [],
  );

  const ubahCatatan = useCallback(
    (menuItemId: string, notesLama: string, notesBaru: string) => {
      setKeranjang((prev) =>
        prev.map((b) =>
          kunciBaris(b.item.id, b.notes) === kunciBaris(menuItemId, notesLama)
            ? { ...b, notes: notesBaru }
            : b,
        ),
      );
    },
    [],
  );

  const hapus = useCallback((menuItemId: string, notes: string) => {
    setKeranjang((prev) =>
      prev.filter((b) => kunciBaris(b.item.id, b.notes) !== kunciBaris(menuItemId, notes)),
    );
  }, []);

  const kosongkan = useCallback(() => setKeranjang([]), []);

  const subtotal = useMemo(
    () => keranjang.reduce((sum, b) => sum + b.item.price * b.quantity, 0),
    [keranjang],
  );

  const jumlahItem = useMemo(
    () => keranjang.reduce((sum, b) => sum + b.quantity, 0),
    [keranjang],
  );

  return {
    kategori,
    meja,
    loading,
    error,
    reload,
    keranjang,
    subtotal,
    jumlahItem,
    tambah,
    ubahJumlah,
    ubahCatatan,
    hapus,
    kosongkan,
  };
}

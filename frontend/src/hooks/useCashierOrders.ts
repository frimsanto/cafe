import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ManualMethodCode } from '../types/order';
import type { CashierOrderDTO } from '../types/api';
import { cashierApi } from '../api/orders';
import { pembayaranApi } from '../api/pembayaran';
import { describeApiError } from '../lib/apiClient';
import { subscribeRealtime, type RealtimeStatus } from '../lib/realtime';

/**
 * Jaring pengaman bila sambungan WebSocket sedang putus.
 *
 * Selama realtime hidup, perubahan sudah tiba lewat siaran, jadi polling cukup
 * jarang — ia hanya penjaga terakhir bila ada siaran yang terlewat. Begitu
 * realtime jatuh, polling-lah satu-satunya sumber data dan wajib rapat.
 */
const POLL_ONLINE_MS = 30_000;
const POLL_OFFLINE_MS = 5_000;

/**
 * Apakah dua antrean benar-benar sama? Dipakai untuk MEMPERTAHANKAN array lama
 * saat isinya tidak berubah.
 *
 * Tanpa ini, setiap polling menghasilkan array baru dengan isi identik; React
 * melihat referensi berbeda lalu merender ulang seluruh kartu antrean secara
 * berkala tanpa ada yang berubah di layar.
 */
function sameOrders(a: CashierOrderDTO[], b: CashierOrderDTO[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((order, index) => {
    const other = b[index];
    return (
      order.id === other.id &&
      order.status === other.status &&
      order.statusPembayaran === other.statusPembayaran &&
      order.totalAmount === other.totalAmount &&
      order.updatedAt === other.updatedAt
    );
  });
}

export interface CashierOrders {
  /** Pesanan yang menunggu pembayaran, terlama di urutan pertama (FIFO). */
  pending: CashierOrderDTO[];
  /** Jumlah rupiah seluruh pesanan yang masih menunggu. */
  totalPending: number;
  /** Hanya untuk muat PERTAMA — pembaruan latar tidak menyalakannya. */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Keadaan sambungan realtime, untuk indikator di layar. */
  realtimeStatus: RealtimeStatus;
  /** Sambung ulang manual setelah realtime menyerah. */
  retryRealtime: () => void;
  /**
   * Konfirmasi pembayaran manual lewat jalur pembayaran baru. Backend mencatat
   * bukti, memindahkan pesanan ke dapur, dan menyiarkannya. Mengembalikan
   * pesanan versi terbayar untuk struk & notifikasi.
   */
  markPaidManual: (
    orderId: string,
    metode: ManualMethodCode,
    nominal: number,
    catatan: string | null,
  ) => Promise<CashierOrderDTO>;
}

/**
 * Antrean pembayaran kasir untuk kafe yang sedang masuk.
 *
 * Isolasi tenant ditegakkan backend lewat token; daftar yang dikembalikan
 * sudah hanya berisi pesanan kafe pengguna. Antrean ikut diperbarui realtime
 * agar kasir kedua tidak menagih pesanan yang baru saja dibayar di kasir lain.
 */
export function useCashierOrders(cafeId: string): CashierOrders {
  const [orders, setOrders] = useState<CashierOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [realtimeKey, setRealtimeKey] = useState(0);

  /**
   * Kafe yang antreannya sudah pernah selesai dimuat. Dibandingkan dengan
   * `cafeId` untuk membedakan muat PERTAMA dari pembaruan latar — dan ikut
   * menyalakan kerangka lagi bila sesi berpindah ke kafe lain.
   */
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const retryRealtime = useCallback(() => setRealtimeKey((key) => key + 1), []);

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;

    // Kerangka muat HANYA untuk permintaan pertama tiap kafe. Sebelumnya setiap
    // pemuatan ulang — polling tiap 5 detik dan tiap event realtime —
    // menyalakan `loading`, sehingga seluruh daftar kartu berkedip menjadi
    // kerangka lalu kembali. Itulah "kedip-kedip" di halaman kasir.
    const firstLoad = loadedForRef.current !== cafeId;
    if (firstLoad) setLoading(true);

    cashierApi
      .listPendingOrders(cafeId)
      .then((data) => {
        if (cancelled) return;
        // Pertahankan array lama bila isinya sama — lihat `sameOrders`.
        setOrders((prev) => (sameOrders(prev, data) ? prev : data));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Kegagalan pembaruan latar tidak boleh mengosongkan antrean yang sudah
        // tampil; kasir lebih baik melihat data lama daripada layar kosong.
        if (firstLoad) setOrders([]);
        setError(describeApiError(err, 'Gagal memuat antrean kasir.'));
      })
      .finally(() => {
        if (cancelled) return;
        loadedForRef.current = cafeId;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, reloadKey]);

  // Pesanan baru masuk antrean, atau status pembayarannya berubah dari tempat
  // lain: kasir kedua, atau webhook Midtrans yang datang tanpa ada layar yang
  // menunggunya. `payment.status.changed` inilah yang membuat badge LUNAS/GAGAL
  // muncul seketika, bukan pada tick polling berikutnya.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(
      cafeId,
      (message) => {
        if (
          message.type === 'kitchen.order.created' ||
          message.type === 'payment.status.changed' ||
          message.type === 'table.status.changed'
        ) {
          reload();
        }
      },
      { onStatus: setRealtimeStatus },
    );
    // `realtimeKey` berubah hanya saat pengguna menekan "sambungkan ulang".
  }, [cafeId, reload, realtimeKey]);

  // Jaring pengaman bila siaran realtime tidak sampai. Iramanya mengikuti
  // keadaan sambungan: rapat saat realtime mati, jarang saat realtime hidup.
  useEffect(() => {
    if (!cafeId) return;
    const period = realtimeStatus === 'online' ? POLL_ONLINE_MS : POLL_OFFLINE_MS;
    const id = setInterval(reload, period);
    return () => clearInterval(id);
  }, [cafeId, reload, realtimeStatus]);

  const pending = useMemo(
    () =>
      [...orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [orders],
  );

  const totalPending = useMemo(
    () => pending.reduce((sum, order) => sum + order.totalAmount, 0),
    [pending],
  );

  const markPaidManual = useCallback(
    async (
      orderId: string,
      metode: ManualMethodCode,
      nominal: number,
      catatan: string | null,
    ): Promise<CashierOrderDTO> => {
      const paid = await pembayaranApi.konfirmasiManual({
        orderId,
        metode,
        nominal,
        catatanKasir: catatan ?? undefined,
      });
      // Keluarkan dari antrean seketika; siaran realtime menyusul untuk
      // perangkat lain.
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
      return paid;
    },
    [],
  );

  return {
    pending,
    totalPending,
    loading,
    error,
    reload,
    realtimeStatus,
    retryRealtime,
    markPaidManual,
  };
}

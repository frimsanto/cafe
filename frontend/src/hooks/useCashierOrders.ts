import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ManualMethodCode } from '../types/order';
import type {
  BuatPesananKasirInput,
  CashierOrderDTO,
  FilterKasir,
  RingkasanKasirDTO,
  TabKasir,
} from '../types/api';
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
 * Jeda sebelum kata kunci pencarian dikirim ke server.
 *
 * Pencarian kini dilakukan server (kode pesanan & nomor antrian ada di
 * database, bukan di daftar yang sedang tampil), jadi tiap ketukan huruf berarti
 * satu permintaan. 300 ms cukup pendek untuk terasa seketika dan cukup panjang
 * untuk tidak mengirim delapan permintaan saat kasir mengetik "Meja 12".
 */
const DEBOUNCE_CARI_MS = 300;

export const FILTER_AWAL: FilterKasir = {
  tab: 'PERLU_KONFIRMASI',
  q: '',
  fulfillmentType: null,
  orderSource: null,
  statusPembayaran: null,
};

/**
 * Apakah dua daftar benar-benar sama? Dipakai untuk MEMPERTAHANKAN array lama
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
      order.kitchenStatus === other.kitchenStatus &&
      order.totalAmount === other.totalAmount &&
      order.updatedAt === other.updatedAt
    );
  });
}

export interface CashierOrders {
  /** Pesanan pada tab yang sedang aktif. */
  orders: CashierOrderDTO[];
  /** Jumlah rupiah seluruh pesanan yang tampil. */
  totalTampil: number;
  /** Angka-angka kepala halaman; null selama belum termuat. */
  summary: RingkasanKasirDTO | null;
  filter: FilterKasir;
  setTab: (tab: TabKasir) => void;
  setQuery: (q: string) => void;
  setFilter: (ubah: Partial<FilterKasir>) => void;
  /** Hanya untuk muat PERTAMA — pembaruan latar tidak menyalakannya. */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Keadaan sambungan realtime, untuk indikator di layar. */
  realtimeStatus: RealtimeStatus;
  /** Sambung ulang manual setelah realtime menyerah. */
  retryRealtime: () => void;
  /**
   * Konfirmasi pembayaran manual sebuah pesanan yang SUDAH ADA. Backend
   * mencatat bukti, memindahkan pesanan ke dapur, dan menyiarkannya.
   */
  markPaidManual: (
    orderId: string,
    metode: ManualMethodCode,
    nominal: number,
    catatan: string | null,
    referensi?: string | null,
  ) => Promise<CashierOrderDTO>;
  /**
   * Tolak pengajuan pembayaran manual dari tamu. Alasannya WAJIB dan tersimpan
   * di jejak audit — penolakan tanpa alasan tidak bisa dijelaskan besok, dan
   * tamunya berhak tahu kenapa pesanannya tidak jadi diproses.
   *
   * Pesanan TIDAK keluar dari antrean setelah ditolak: ia kembali menunggu
   * pembayaran, dan kasir masih harus menagihnya dengan cara lain.
   */
  rejectManual: (orderId: string, alasan: string) => Promise<CashierOrderDTO>;
  /** Kasir membuat pesanan sendiri (POS) sekaligus menagihnya. */
  createOrder: (input: BuatPesananKasirInput) => Promise<CashierOrderDTO>;
  /** Batalkan pesanan dengan alasan wajib. */
  cancelOrder: (orderId: string, alasan: string) => Promise<CashierOrderDTO>;
  /** "Selesai/Diserahkan" — menutup pesanan & membebaskan mejanya. */
  completeOrder: (orderId: string) => Promise<CashierOrderDTO>;
}

/**
 * Antrean & riwayat pesanan layar kasir untuk kafe yang sedang masuk.
 *
 * Isolasi tenant ditegakkan backend lewat token; daftar yang dikembalikan
 * sudah hanya berisi pesanan kafe pengguna. Daftar ikut diperbarui realtime
 * agar kasir kedua tidak menagih pesanan yang baru saja dibayar di kasir lain.
 */
export function useCashierOrders(cafeId: string): CashierOrders {
  const [orders, setOrders] = useState<CashierOrderDTO[]>([]);
  const [summary, setSummary] = useState<RingkasanKasirDTO | null>(null);
  const [filter, setFilterState] = useState<FilterKasir>(FILTER_AWAL);
  const [qTertunda, setQTertunda] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [realtimeKey, setRealtimeKey] = useState(0);

  /**
   * Kombinasi kafe + tab yang antreannya sudah pernah selesai dimuat.
   * Dibandingkan untuk membedakan muat PERTAMA dari pembaruan latar — dan ikut
   * menyalakan kerangka lagi saat kasir berpindah tab.
   */
  const loadedForRef = useRef<string | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const retryRealtime = useCallback(() => setRealtimeKey((key) => key + 1), []);

  const setTab = useCallback((tab: TabKasir) => {
    setFilterState((prev) => (prev.tab === tab ? prev : { ...prev, tab }));
  }, []);

  const setFilter = useCallback((ubah: Partial<FilterKasir>) => {
    setFilterState((prev) => ({ ...prev, ...ubah }));
  }, []);

  // Kata kunci disimpan dua kali: `qTertunda` mengikuti ketikan seketika supaya
  // kotak pencarian tidak terasa berat, sedangkan `filter.q` — yang memicu
  // permintaan — menyusul sesudah kasir berhenti mengetik.
  const setQuery = useCallback((q: string) => setQTertunda(q), []);

  useEffect(() => {
    if (qTertunda === filter.q) return;
    const id = setTimeout(
      () => setFilterState((prev) => ({ ...prev, q: qTertunda })),
      DEBOUNCE_CARI_MS,
    );
    return () => clearTimeout(id);
  }, [qTertunda, filter.q]);

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;

    // Kerangka muat HANYA untuk permintaan pertama tiap kafe/tab. Tanpa
    // penjagaan ini, polling tiap beberapa detik dan tiap event realtime
    // menyalakan `loading`, sehingga seluruh daftar kartu berkedip menjadi
    // kerangka lalu kembali.
    const kunci = `${cafeId}|${filter.tab}`;
    const firstLoad = loadedForRef.current !== kunci;
    if (firstLoad) setLoading(true);

    Promise.all([
      cashierApi.listOrders(cafeId, filter),
      cashierApi.summary(cafeId),
    ])
      .then(([daftar, ringkasan]) => {
        if (cancelled) return;
        // Pertahankan array lama bila isinya sama — lihat `sameOrders`.
        setOrders((prev) => (sameOrders(prev, daftar) ? prev : daftar));
        setSummary(ringkasan);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Kegagalan pembaruan latar tidak boleh mengosongkan daftar yang sudah
        // tampil; kasir lebih baik melihat data lama daripada layar kosong.
        if (firstLoad) setOrders([]);
        setError(describeApiError(err, 'Gagal memuat daftar pesanan kasir.'));
      })
      .finally(() => {
        if (cancelled) return;
        loadedForRef.current = kunci;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, filter, reloadKey]);

  // Pesanan baru masuk antrean, atau statusnya berubah dari tempat lain: kasir
  // kedua, Layar Dapur, atau webhook Midtrans yang datang tanpa ada layar yang
  // menunggunya. Inilah yang membuat badge berubah seketika, bukan pada tick
  // polling berikutnya.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(
      (message) => {
        if (
          message.type === 'kitchen.order.created' ||
          // Tamu menambah item ke pesanan yang belum dibayar, atau dapur
          // menggerakkan tiketnya. Tanpa mendengarkan ini kasir menagih dari
          // TOTAL LAMA sampai polling berikutnya.
          message.type === 'kitchen.order.updated' ||
          message.type === 'order.ready' ||
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

  const totalTampil = useMemo(
    () => orders.reduce((sum, order) => sum + order.totalAmount, 0),
    [orders],
  );

  /**
   * Terapkan hasil sebuah tindakan ke daftar yang sedang tampil.
   *
   * Pesanan yang tidak lagi cocok dengan tab aktif dikeluarkan seketika supaya
   * kasir tidak menekan tombol pada kartu yang sudah tidak berlaku; muat ulang
   * berikutnya tetap menjadi penentu akhirnya.
   */
  const terapkan = useCallback((hasil: CashierOrderDTO) => {
    setOrders((prev) => prev.map((o) => (o.id === hasil.id ? hasil : o)));
    reload();
  }, [reload]);

  const markPaidManual = useCallback(
    async (
      orderId: string,
      metode: ManualMethodCode,
      nominal: number,
      catatan: string | null,
      referensi?: string | null,
    ): Promise<CashierOrderDTO> => {
      const paid = await pembayaranApi.konfirmasiManual({
        orderId,
        metode,
        nominal,
        catatanKasir: catatan ?? undefined,
        referensi: referensi ?? undefined,
      });
      terapkan(paid);
      return paid;
    },
    [terapkan],
  );

  const rejectManual = useCallback(
    async (orderId: string, alasan: string): Promise<CashierOrderDTO> => {
      const ditolak = await pembayaranApi.tolakManual(orderId, alasan);
      // Pesanan TETAP di antrean — statusnya kembali "belum dibayar", dan
      // kasir masih harus menagihnya. Yang diperbarui hanya barisnya.
      terapkan(ditolak);
      return ditolak;
    },
    [terapkan],
  );

  const createOrder = useCallback(
    async (input: BuatPesananKasirInput): Promise<CashierOrderDTO> => {
      const dibuat = await cashierApi.createOrder(cafeId, input);
      reload();
      return dibuat;
    },
    [cafeId, reload],
  );

  const cancelOrder = useCallback(
    async (orderId: string, alasan: string): Promise<CashierOrderDTO> => {
      const dibatalkan = await cashierApi.cancelOrder(cafeId, orderId, alasan);
      terapkan(dibatalkan);
      return dibatalkan;
    },
    [cafeId, terapkan],
  );

  const completeOrder = useCallback(
    async (orderId: string): Promise<CashierOrderDTO> => {
      const selesai = await cashierApi.completeOrder(cafeId, orderId);
      terapkan(selesai);
      return selesai;
    },
    [cafeId, terapkan],
  );

  return {
    orders,
    totalTampil,
    summary,
    filter: { ...filter, q: qTertunda },
    setTab,
    setQuery,
    setFilter,
    loading,
    error,
    reload,
    realtimeStatus,
    retryRealtime,
    markPaidManual,
    rejectManual,
    createOrder,
    cancelOrder,
    completeOrder,
  };
}

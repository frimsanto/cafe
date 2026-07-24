import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KitchenStatus } from '../types/order';
import type { OrderWithTableDTO } from '../types/api';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../types/auth';
import { kitchenApi } from '../api/orders';
import { describeApiError } from '../lib/apiClient';
import { subscribeRealtime } from '../lib/realtime';
import { playChime, playReadyChime } from '../lib/sound';
import KitchenOrderCard from '../components/kds/KitchenOrderCard';
import ReadyToastContainer, {
  type ReadyToastData,
} from '../components/kds/ReadyToast';

const READY_TOAST_MS = 6000; // durasi toast "pesanan siap"
const HIGHLIGHT_MS = 6000; // durasi sorotan "BARU"

/** True bila seluruh item pesanan sudah berstatus READY. */
function isAllReady(order: { items: { kitchenStatus: KitchenStatus }[] }): boolean {
  return order.items.length > 0 && order.items.every((i) => i.kitchenStatus === 'READY');
}

/**
 * Layar Dapur (KDS) — halaman utama.
 *
 * Tiket diambil dari `GET /kitchen/orders` (pesanan berstatus DIPROSES_DAPUR,
 * urut FIFO) lalu dijaga tetap mutakhir lewat WebSocket: `kitchen.order.created`
 * saat kasir/pelanggan menuntaskan pembayaran, `kitchen.order.updated` saat
 * status masak berubah — termasuk perubahan dari layar dapur lain — dan
 * `order.ready` saat seluruh item rampung.
 *
 * Perubahan status masak dikirim ke server dan state lokal memakai pesanan
 * versi server sebagai jawabannya, sehingga dua layar dapur tidak bisa saling
 * menimpa dengan tebakan lokal.
 */
export default function KitchenDisplayPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Halaman ini dilindungi ProtectedRoute, jadi `user` selalu ada di sini.
  const cafeId = user?.cafeId ?? '';
  const cafeName = user?.cafeName ?? '';

  // Clock live — memperbarui jam & lama pesanan tiap detik.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [orders, setOrders] = useState<OrderWithTableDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [readyToasts, setReadyToasts] = useState<ReadyToastData[]>([]);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /**
   * Pesanan yang toast "siap"-nya sudah ditampilkan, supaya siaran ulang atau
   * pemuatan ulang daftar tidak memunculkan notifikasi dobel.
   */
  const notifiedRef = useRef<Set<string>>(new Set());

  const dismissToast = useCallback(
    (id: string) => setReadyToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const highlight = useCallback((id: string) => {
    setNewIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
  }, []);

  const announceReady = useCallback(
    (order: OrderWithTableDTO) => {
      if (notifiedRef.current.has(order.id)) return;
      notifiedRef.current.add(order.id);
      setReadyToasts((prev) => [...prev, { id: order.id, tableName: order.tableName }]);
      if (!mutedRef.current) playReadyChime();
      setTimeout(() => dismissToast(order.id), READY_TOAST_MS);
    },
    [dismissToast],
  );

  const load = useCallback(async () => {
    if (!cafeId) return;
    setLoading(true);
    try {
      const data = await kitchenApi.listActiveOrders(cafeId);
      setOrders(data);
      // Pesanan yang sudah siap saat layar dibuka tidak boleh memicu toast.
      data.filter(isAllReady).forEach((o) => notifiedRef.current.add(o.id));
      setError(null);
    } catch (err) {
      setOrders([]);
      setError(describeApiError(err, 'Gagal memuat pesanan dapur.'));
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Aliran realtime dari server.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      const order = message.data as OrderWithTableDTO | undefined;
      if (!order?.id) return;

      switch (message.type) {
        case 'kitchen.order.created':
          setOrders((prev) => {
            if (prev.some((o) => o.id === order.id)) return prev;
            return [...prev, order];
          });
          highlight(order.id);
          if (!mutedRef.current) playChime();
          break;

        case 'kitchen.order.updated':
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? order : o)),
          );
          break;

        case 'order.ready':
          // Backend menandainya SELESAI — tiketnya keluar dari layar.
          announceReady(order);
          setOrders((prev) => prev.filter((o) => o.id !== order.id));
          break;
      }
    });
  }, [cafeId, highlight, announceReady]);

  /**
   * Ubah status masak satu item. Server adalah penentu: balasannya dipakai apa
   * adanya, termasuk saat pesanan otomatis berpindah ke SELESAI.
   */
  const handleItemStatusChange = async (
    orderId: string,
    itemId: string,
    status: KitchenStatus,
  ) => {
    // Optimistik dulu supaya sentuhan chef terasa seketika di layar sentuh.
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              items: order.items.map((item) =>
                item.id === itemId ? { ...item, kitchenStatus: status } : item,
              ),
            }
          : order,
      ),
    );

    try {
      const updated = await kitchenApi.updateItemStatus(cafeId, itemId, status);
      if (isAllReady(updated)) {
        announceReady(updated);
        setOrders((prev) => prev.filter((o) => o.id !== updated.id));
      } else {
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      }
      setError(null);
    } catch (err) {
      // Gagal — kembalikan ke keadaan server agar layar tidak berbohong.
      setError(describeApiError(err, 'Status masak gagal disimpan.'));
      void load();
    }
  };

  const clock = new Date(now).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍳</span>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Layar Dapur</h1>
            <p className="text-sm text-slate-400">{cafeName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 active:scale-95"
          >
            Muat ulang
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={muted}
            aria-label={muted ? 'Bunyikan notifikasi' : 'Bisukan notifikasi'}
            className="rounded-xl bg-slate-800 px-3 py-2.5 text-lg transition hover:bg-slate-700 active:scale-95"
          >
            {muted ? '🔇' : '🔔'}
          </button>
          <div className="rounded-xl bg-slate-800 px-4 py-2 text-center">
            <p className="text-2xl font-extrabold leading-none tabular-nums">
              {orders.length}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">Aktif</p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-2xl font-bold tabular-nums text-brand-300">{clock}</p>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Waktu sekarang
            </p>
          </div>

          {/* Identitas staf dapur yang sedang bertugas */}
          {user ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-slate-400">{ROLE_LABEL[user.role]}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                className="ml-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-rose-300"
              >
                Keluar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold transition hover:bg-slate-700"
            >
              Masuk
            </button>
          )}
        </div>
      </header>

      {/* Grid tiket */}
      <main className="p-5">
        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-950 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-800"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-rose-900 px-3 py-1.5 font-semibold transition hover:bg-rose-800"
            >
              Coba lagi
            </button>
          </div>
        )}

        {loading ? (
          <div
            role="status"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <span className="sr-only">Memuat pesanan dapur…</span>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                aria-hidden
                className="h-64 animate-pulse rounded-2xl bg-slate-800"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center text-slate-500">
            <span className="text-6xl">🍽️</span>
            <p className="mt-4 text-xl font-semibold">Belum ada pesanan masuk</p>
            <p className="text-sm">Pesanan yang sudah dibayar akan muncul di sini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                now={now}
                isNew={newIds.has(order.id)}
                onItemStatusChange={(itemId, status) =>
                  void handleItemStatusChange(order.id, itemId, status)
                }
              />
            ))}
          </div>
        )}
      </main>

      <ReadyToastContainer toasts={readyToasts} onDismiss={dismissToast} />
    </div>
  );
}

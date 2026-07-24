import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KitchenStatus } from '../types/order';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../types/auth';
import { mockCafe } from '../data/mockMenu';
import {
  generateRandomKitchenOrder,
  mockKitchenOrders,
} from '../data/mockKitchenOrders';
import {
  getKitchenQueue,
  removeFromKitchenQueue,
  subscribeKitchenQueue,
} from '../order/kitchenQueue';
import { playChime, playReadyChime } from '../lib/sound';
import KitchenOrderCard from '../components/kds/KitchenOrderCard';
import ReadyToastContainer, {
  type ReadyToastData,
} from '../components/kds/ReadyToast';

const READY_TOAST_MS = 6000; // durasi toast "pesanan siap"

const AUTO_INTERVAL_MS = 18000; // pesanan baru otomatis tiap ~18 detik
const HIGHLIGHT_MS = 6000; // durasi sorotan "BARU"
const MAX_ORDERS = 16; // batas jumlah tiket di layar

/** True bila seluruh item pesanan sudah berstatus READY. */
function isAllReady(order: { items: { kitchenStatus: KitchenStatus }[] }): boolean {
  return order.items.length > 0 && order.items.every((i) => i.kitchenStatus === 'READY');
}

/**
 * Layar Dapur (KDS) — halaman utama.
 *
 * Menampilkan pesanan terbayar sebagai grid tiket dengan tampilan khusus dapur.
 * Chef bisa mengubah status masak per item, dan pesanan baru "masuk realtime"
 * disimulasikan secara berkala (data tiruan) dengan sorotan + bunyi.
 *
 * Fase backend akan mengganti simulasi ini dengan WebSocket sungguhan.
 */
export default function KitchenDisplayPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Kafe aktif menentukan pesanan mana yang boleh tampil (isolasi tenant).
  // Tanpa login, layar memakai kafe demo agar tetap bisa dilihat.
  const cafeId = user?.cafeId ?? mockCafe.id;
  const cafeName = user?.cafeName ?? mockCafe.name;

  // Clock live — memperbarui jam & lama pesanan tiap detik.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tiket awal: contoh bawaan + pesanan yang sudah dilunasi kasir.
  const [orders, setOrders] = useState(() => [
    ...getKitchenQueue(cafeId),
    ...mockKitchenOrders.filter((o) => o.cafeId === cafeId),
  ]);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [readyToasts, setReadyToasts] = useState<ReadyToastData[]>([]);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Pesanan yang sudah "diberitahukan" ke pelanggan (agar tak dobel notif).
  // Diinisialisasi dengan pesanan yang memang sudah siap saat halaman dibuka,
  // supaya tidak memunculkan toast/bunyi palsu pada saat mount.
  const notifiedRef = useRef<Set<string>>(
    new Set(mockKitchenOrders.filter(isAllReady).map((o) => o.id)),
  );

  const dismissToast = (id: string) =>
    setReadyToasts((prev) => prev.filter((t) => t.id !== id));

  // Deteksi pesanan yang baru saja menjadi "semua siap" → notifikasi pelanggan.
  useEffect(() => {
    orders.forEach((order) => {
      if (isAllReady(order) && !notifiedRef.current.has(order.id)) {
        notifiedRef.current.add(order.id);
        // Pesanan selesai — keluarkan dari antrean bersama supaya tidak
        // muncul lagi saat layar dimuat ulang.
        removeFromKitchenQueue(order.id);
        setReadyToasts((prev) => [
          ...prev,
          { id: order.id, tableName: order.tableName },
        ]);
        if (!mutedRef.current) playReadyChime();
        setTimeout(() => dismissToast(order.id), READY_TOAST_MS);
      }
    });
  }, [orders]);

  const handleItemStatusChange = (
    orderId: string,
    itemId: string,
    status: KitchenStatus,
  ) => {
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
  };

  // Simulasikan satu pesanan masuk baru: taruh di depan, sorot sementara, bunyi.
  const spawnOrder = useCallback(() => {
    const order = generateRandomKitchenOrder(cafeId);
    setOrders((prev) => [order, ...prev].slice(0, MAX_ORDERS));
    setNewIds((prev) => new Set(prev).add(order.id));
    if (!mutedRef.current) playChime();
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }, HIGHLIGHT_MS);
  }, [cafeId]);

  // Timer otomatis pesanan masuk.
  useEffect(() => {
    const id = setInterval(spawnOrder, AUTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [spawnOrder]);

  // Jejak tiket yang sudah pernah tampil, agar pesanan dari kasir tidak dobel.
  const knownIdsRef = useRef<Set<string>>(new Set(orders.map((o) => o.id)));
  useEffect(() => {
    orders.forEach((order) => knownIdsRef.current.add(order.id));
  }, [orders]);

  /**
   * Pesanan yang baru dikonfirmasi lunas oleh kasir langsung muncul di layar —
   * termasuk bila kasir bekerja di tab/perangkat lain. Perlakuannya sama dengan
   * pesanan masuk lainnya: disorot "BARU" dan berbunyi.
   *
   * Fase backend: ini digantikan event WebSocket `kitchen.order.created`.
   */
  useEffect(() => {
    const handleQueueChange = () => {
      const incoming = getKitchenQueue(cafeId).filter(
        (order) => !knownIdsRef.current.has(order.id),
      );
      if (incoming.length === 0) return;

      const incomingIds = incoming.map((order) => order.id);
      incomingIds.forEach((id) => knownIdsRef.current.add(id));

      setOrders((prev) => [...incoming, ...prev].slice(0, MAX_ORDERS));
      setNewIds((prev) => new Set([...prev, ...incomingIds]));
      if (!mutedRef.current) playChime();

      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          incomingIds.forEach((id) => next.delete(id));
          return next;
        });
      }, HIGHLIGHT_MS);
    };

    return subscribeKitchenQueue(handleQueueChange);
  }, [cafeId]);

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
            onClick={spawnOrder}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-500 active:scale-95"
          >
            + Simulasi Pesanan Baru
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
        {orders.length === 0 ? (
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
                  handleItemStatusChange(order.id, itemId, status)
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

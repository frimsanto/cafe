import type { Order } from '../types/order';

const STORAGE_KEY = 'cafeos-kitchen-queue';
/** Simpan sebentar saja — antrean ini hanya jembatan kasir → dapur. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 jam

type Listener = (orders: Order[]) => void;

const listeners = new Set<Listener>();

/**
 * Jembatan "pesanan sudah dibayar" dari kasir ke Layar Dapur selama fase
 * frontend.
 *
 * Aturan produk: pesanan hanya masuk dapur SETELAH pembayaran dikonfirmasi.
 * Di fase backend, jembatan ini digantikan event WebSocket `kitchen.order.created`;
 * di sini localStorage yang memerankannya sehingga KDS di tab lain — atau di
 * perangkat dapur yang membuka halaman yang sama — ikut menerima pesanannya.
 */
function read(): Order[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Order[];
    if (!Array.isArray(parsed)) return [];

    // Buang pesanan basi supaya antrean tidak menumpuk tanpa batas.
    const fresh = parsed.filter(
      (order) => Date.now() - Date.parse(order.createdAt) < MAX_AGE_MS,
    );
    return fresh;
  } catch {
    return [];
  }
}

function write(orders: Order[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    /* storage penuh/tidak tersedia — antrean cukup hidup di memori tab ini */
  }
  listeners.forEach((listener) => listener(orders));
}

/** Pesanan yang sudah dibayar & dirilis ke dapur untuk satu kafe. */
export function getKitchenQueue(cafeId: string): Order[] {
  return read().filter((order) => order.cafeId === cafeId);
}

/** Kasir menandai lunas → pesanan dirilis ke dapur. */
export function releaseToKitchen(order: Order): void {
  const current = read().filter((existing) => existing.id !== order.id);
  write([...current, order]);
}

/** Dapur menyelesaikan pesanan → keluar dari antrean bersama. */
export function removeFromKitchenQueue(orderId: string): void {
  write(read().filter((order) => order.id !== orderId));
}

/**
 * Berlangganan perubahan antrean — baik dari tab ini maupun tab lain
 * (event `storage` hanya terkirim ke tab lain, jadi keduanya diperlukan).
 */
export function subscribeKitchenQueue(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    listener(read());
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

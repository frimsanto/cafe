import type { Order } from '../types/order';

const LAST_ORDER_KEY = 'cafeos-last-order';

/**
 * Pesanan terakhir yang berhasil dibayar, disimpan untuk halaman sukses &
 * struk. Isinya adalah pesanan versi SERVER (hasil `POST /orders` lalu
 * `/pay`) — bukan lagi susunan lokal, sehingga id pesanan, id transaksi, dan
 * totalnya sama persis dengan yang tercatat di database.
 *
 * sessionStorage, bukan localStorage: struk satu kunjungan tidak boleh muncul
 * lagi pada kunjungan berikutnya.
 */
export function saveLastOrder(order: Order): void {
  try {
    window.sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* storage tidak tersedia — abaikan */
  }
}

export function getLastOrder(): Order | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? (JSON.parse(raw) as Order) : null;
  } catch {
    return null;
  }
}

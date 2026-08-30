import type { KitchenStage, KitchenStatus } from '../types/order';
import type {
  BuatPesananKasirInput,
  CashierOrderDTO,
  FilterKasir,
  MejaKasirDTO,
  OrderDTO,
  OrderWithTableDTO,
  PublicTableDTO,
  RingkasanKasirDTO,
} from '../types/api';
import { apiFetch } from '../lib/apiClient';

// Endpoint pesanan, kasir, dapur, dan struk. Semuanya berbagi bentuk `Order`
// yang sama (`OrderDTO` di backend), jadi dikumpulkan dalam satu modul.

const cafeBase = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}`;
const id = encodeURIComponent;

/** Satu baris pesanan yang dikirim pelanggan saat checkout. */
export interface NewOrderItem {
  menuItemId: string;
  quantity: number;
  notes: string;
}

export const ordersApi = {
  /**
   * Terjemahkan hasil pindai QR menjadi meja + kafe. PUBLIK — pemindainya
   * pelanggan yang memang tidak punya akun.
   */
  resolveTableByQr(qrCode: string): Promise<PublicTableDTO> {
    return apiFetch<PublicTableDTO>(`/api/tables/by-qr/${id(qrCode)}`);
  },

  /**
   * Buat pesanan baru (status awal: menunggu pembayaran).
   *
   * Pembayarannya sendiri dilakukan lewat `pembayaranApi` — pesanan tercatat
   * di database SEBELUM uang berpindah, sehingga pembayaran yang berhasil tidak
   * pernah kehilangan pesanannya.
   */
  create(cafeId: string, tableId: string, items: NewOrderItem[]): Promise<OrderDTO> {
    return apiFetch<OrderDTO>(`${cafeBase(cafeId)}/orders`, {
      method: 'POST',
      body: JSON.stringify({ tableId, items }),
    });
  },

  /**
   * Tambahkan item ke pesanan yang MASIH menunggu pembayaran.
   *
   * Dipakai saat tamu memesan lagi sebelum tagihannya dilunasi: isinya masuk ke
   * pesanan yang sama, bukan melahirkan pesanan kedua di antrean kasir. Server
   * menolak (409) bila pesanan sudah dibayar atau sudah masuk dapur.
   */
  tambahItem(
    cafeId: string,
    orderId: string,
    items: NewOrderItem[],
  ): Promise<OrderDTO> {
    return apiFetch<OrderDTO>(`${cafeBase(cafeId)}/orders/${id(orderId)}/items`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

/** Susun query string dari filter; kunci kosong tidak ikut dikirim. */
function queryKasir(filter: FilterKasir): string {
  const params = new URLSearchParams({ tab: filter.tab });
  if (filter.q) params.set('q', filter.q);
  if (filter.fulfillmentType) params.set('fulfillmentType', filter.fulfillmentType);
  if (filter.orderSource) params.set('orderSource', filter.orderSource);
  if (filter.statusPembayaran) params.set('statusPembayaran', filter.statusPembayaran);
  return params.toString();
}

export const cashierApi = {
  /**
   * Antrean pesanan yang menunggu konfirmasi pembayaran di kasir.
   *
   * Dipertahankan sebagai pintasan tab "Perlu Konfirmasi" — bentuk dan artinya
   * sama persis dengan versi sebelum layar kasir menjadi POS.
   */
  listPendingOrders(cafeId: string): Promise<CashierOrderDTO[]> {
    return apiFetch<CashierOrderDTO[]>(`${cafeBase(cafeId)}/cashier/orders`);
  },

  /** Daftar pesanan untuk sebuah tab, dengan pencarian & filter. */
  listOrders(cafeId: string, filter: FilterKasir): Promise<CashierOrderDTO[]> {
    return apiFetch<CashierOrderDTO[]>(
      `${cafeBase(cafeId)}/cashier/orders?${queryKasir(filter)}`,
    );
  },

  /** Angka-angka di kepala halaman: antrean & uang masuk hari ini. */
  summary(cafeId: string): Promise<RingkasanKasirDTO> {
    return apiFetch<RingkasanKasirDTO>(`${cafeBase(cafeId)}/cashier/summary`);
  },

  /**
   * Meja kafe untuk pemilihan di POS.
   *
   * Endpoint tersendiri, bukan daftar meja milik halaman Manajemen Meja: yang
   * itu khusus OWNER karena memuat token QR & URL cetak, sedangkan kasir hanya
   * perlu nama dan keadaannya.
   */
  tables(cafeId: string): Promise<MejaKasirDTO[]> {
    return apiFetch<MejaKasirDTO[]>(`${cafeBase(cafeId)}/cashier/tables`);
  },

  detail(cafeId: string, orderId: string): Promise<CashierOrderDTO> {
    return apiFetch<CashierOrderDTO>(
      `${cafeBase(cafeId)}/cashier/orders/${id(orderId)}`,
    );
  },

  /**
   * Kasir membuat pesanan sendiri sekaligus menagihnya.
   *
   * `idempotencyKey` WAJIB: server mengembalikan pesanan yang sama bila kunci
   * itu sudah pernah dipakai, sehingga tombol yang ditekan dua kali tidak
   * melahirkan tagihan kedua.
   */
  createOrder(
    cafeId: string,
    input: BuatPesananKasirInput,
  ): Promise<CashierOrderDTO> {
    return apiFetch<CashierOrderDTO>(`${cafeBase(cafeId)}/cashier/orders`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Batalkan pesanan; alasan WAJIB dan tersimpan di jejak audit. */
  cancelOrder(
    cafeId: string,
    orderId: string,
    alasan: string,
  ): Promise<CashierOrderDTO> {
    return apiFetch<CashierOrderDTO>(
      `${cafeBase(cafeId)}/cashier/orders/${id(orderId)}/batal`,
      { method: 'POST', body: JSON.stringify({ alasan }) },
    );
  },

  /** "Selesai/Diserahkan" — menutup pesanan dan membebaskan mejanya. */
  completeOrder(cafeId: string, orderId: string): Promise<CashierOrderDTO> {
    return apiFetch<CashierOrderDTO>(
      `${cafeBase(cafeId)}/cashier/orders/${id(orderId)}/selesai`,
      { method: 'POST' },
    );
  },
};

export const kitchenApi = {
  /** Pesanan aktif untuk Layar Dapur (sudah membawa `tableName`). */
  listActiveOrders(cafeId: string): Promise<OrderWithTableDTO[]> {
    return apiFetch<OrderWithTableDTO[]>(`${cafeBase(cafeId)}/kitchen/orders`);
  },

  /** Ubah status masak satu item; balasannya pesanan versi terbaru. */
  updateItemStatus(
    cafeId: string,
    itemId: string,
    status: KitchenStatus,
  ): Promise<OrderWithTableDTO> {
    return apiFetch<OrderWithTableDTO>(`${cafeBase(cafeId)}/kitchen/items/${id(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  /**
   * Gerakkan SATU TIKET: "Mulai Proses" (PREPARING) / "Siap Disajikan" (READY).
   *
   * Menutup pesanan (COMPLETED) tidak bisa dari sini — server menolaknya. Itu
   * milik kasir, yang tahu makanannya benar-benar sampai ke tamu.
   */
  updateOrderStage(
    cafeId: string,
    orderId: string,
    status: Exclude<KitchenStage, 'NOT_SENT' | 'COMPLETED'>,
  ): Promise<OrderWithTableDTO> {
    return apiFetch<OrderWithTableDTO>(
      `${cafeBase(cafeId)}/kitchen/orders/${id(orderId)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
  },
};

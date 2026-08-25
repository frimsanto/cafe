import type { ManualMethodCode } from '../types/order';
import type {
  CashierOrderDTO,
  DokuBuatDTO,
  MidtransBuatDTO,
  OpsiPembayaranDTO,
  PaymentConfigDTO,
  StatusPembayaranDTO,
} from '../types/api';
import { apiFetch } from '../lib/apiClient';

// Endpoint pembayaran: konfigurasi kafe + Midtrans (jalur utama) + konfirmasi
// manual oleh kasir (fallback bila kafe belum menyetel Midtrans).
//
// Endpoint staf mengambil `cafeId` dari token, jadi tidak dikirim di URL.
// Endpoint pelanggan (`opsi`, `buatMidtrans`, `buatDoku`, `status`) publik —
// tamu di meja tidak punya akun.

const id = encodeURIComponent;

export interface PaymentConfigInput {
  metodeDiterima: ManualMethodCode[];
  serverKey?: string;
  clientKey?: string;
  isProduction?: boolean;
}

/** Balasan PUT /api/cafe/payment-config. */
export interface SavePaymentConfigResult {
  berhasil: boolean;
  metodeDiterima: string[];
  midtransAktif: boolean;
  clientKey: string | null;
}

export interface ManualPaymentInput {
  orderId: string;
  metode: ManualMethodCode;
  nominal: number;
  catatanKasir?: string;
}

export interface RiwayatQuery {
  status?: 'LUNAS' | 'MENUNGGU' | 'GAGAL';
  dari?: string;
  sampai?: string;
}

export const pembayaranApi = {
  /** Konfigurasi pembayaran kafe aktif. */
  getConfig(): Promise<PaymentConfigDTO> {
    return apiFetch<PaymentConfigDTO>('/api/cafe/payment-config');
  },

  /** Simpan konfigurasi pembayaran (OWNER). */
  saveConfig(input: PaymentConfigInput): Promise<SavePaymentConfigResult> {
    // Endpoint ini membalas objek langsung (bukan amplop { data }); apiFetch
    // mengembalikan body apa adanya saat tak ada field `data`.
    return apiFetch<SavePaymentConfigResult>('/api/cafe/payment-config', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** Konfirmasi pembayaran manual; balasannya pesanan versi terbayar. */
  konfirmasiManual(input: ManualPaymentInput): Promise<CashierOrderDTO> {
    // Balasan: { berhasil, order } — ambil `order`.
    return apiFetch<{ berhasil: boolean; order: CashierOrderDTO }>(
      '/api/pembayaran/manual',
      { method: 'POST', body: JSON.stringify(input) },
    ).then((res) => res.order);
  },

  /** Metode yang tersedia di sebuah kafe. PUBLIK — dipakai checkout pelanggan. */
  opsi(cafeId: string): Promise<OpsiPembayaranDTO> {
    return apiFetch<OpsiPembayaranDTO>(`/api/cafes/${id(cafeId)}/pembayaran/opsi`);
  },

  /** Buat transaksi Midtrans (Snap) untuk sebuah pesanan. PUBLIK. */
  buatMidtrans(orderId: string): Promise<MidtransBuatDTO> {
    return apiFetch<MidtransBuatDTO>('/api/pembayaran/midtrans/buat', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  },

  /**
   * Buat tagihan DOKU Checkout untuk sebuah pesanan. PUBLIK.
   *
   * Tidak ada kredensial yang ikut dikirim: DOKU dipakai dengan akun platform,
   * jadi server yang memegang seluruh rahasianya.
   */
  buatDoku(orderId: string): Promise<DokuBuatDTO> {
    return apiFetch<DokuBuatDTO>('/api/pembayaran/doku/buat', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  },

  /**
   * Status pembayaran sebuah pesanan (untuk polling). PUBLIK. Menerima id
   * pesanan CafeOS maupun `order_id` Midtrans — halaman pelanggan memegang yang
   * pertama, callback Snap mengembalikan yang kedua.
   */
  status(orderId: string): Promise<StatusPembayaranDTO> {
    return apiFetch<StatusPembayaranDTO>(`/api/pembayaran/${id(orderId)}/status`);
  },

  /** Riwayat pembayaran kafe. */
  riwayat(query: RiwayatQuery = {}): Promise<CashierOrderDTO[]> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.dari) params.set('dari', query.dari);
    if (query.sampai) params.set('sampai', query.sampai);
    const qs = params.toString();
    return apiFetch<CashierOrderDTO[]>(`/api/pembayaran/riwayat${qs ? `?${qs}` : ''}`);
  },
};

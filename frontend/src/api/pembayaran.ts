import type { ManualMethodCode } from '../types/order';
import type {
  CashierOrderDTO,
  MidtransBuatDTO,
  PaymentConfigDTO,
  StatusPembayaranDTO,
} from '../types/api';
import { apiFetch } from '../lib/apiClient';

// Endpoint jalur pembayaran dua rel: konfigurasi kafe + konfirmasi manual +
// Midtrans. `cafeId` diambil backend dari token, jadi tidak dikirim di URL.

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

  /** Buat transaksi Midtrans (Snap) untuk sebuah pesanan. */
  buatMidtrans(orderId: string): Promise<MidtransBuatDTO> {
    return apiFetch<MidtransBuatDTO>('/api/pembayaran/midtrans/buat', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  },

  /** Status transaksi Midtrans (untuk polling). */
  statusMidtrans(midtransOrderId: string): Promise<StatusPembayaranDTO> {
    return apiFetch<StatusPembayaranDTO>(
      `/api/pembayaran/${id(midtransOrderId)}/status`,
    );
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

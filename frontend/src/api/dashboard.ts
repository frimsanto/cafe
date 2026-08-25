import type { RevenueSummaryDTO, TopMenuItemDTO } from '../types/api';
import type { DashboardPreferences, RevenuePeriod } from '../types/dashboard';
import { apiFetch, apiFetchBlob } from '../lib/apiClient';

// Endpoint dasbor pemilik. Omzet & menu terlaris dihitung per periode; hanya
// pesanan dengan pembayaran SUKSES yang dihitung sebagai omzet.

const cafeBase = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}`;
const id = encodeURIComponent;

export const dashboardApi = {
  revenue(cafeId: string, period: RevenuePeriod): Promise<RevenueSummaryDTO> {
    return apiFetch<RevenueSummaryDTO>(
      `${cafeBase(cafeId)}/dashboard/revenue?period=${period}`,
    );
  },

  topMenu(
    cafeId: string,
    period: RevenuePeriod,
    limit = 5,
  ): Promise<TopMenuItemDTO[]> {
    return apiFetch<TopMenuItemDTO[]>(
      `${cafeBase(cafeId)}/dashboard/top-menu?period=${period}&limit=${limit}`,
    );
  },

  /** Preferensi widget milik pengguna token (bukan milik kafe). */
  async getPreferences(cafeId: string): Promise<DashboardPreferences> {
    const res = await apiFetch<{ widgets: DashboardPreferences }>(
      `${cafeBase(cafeId)}/dashboard/preferences`,
    );
    return res.widgets;
  },

  async savePreferences(
    cafeId: string,
    widgets: DashboardPreferences,
  ): Promise<DashboardPreferences> {
    const res = await apiFetch<{ widgets: DashboardPreferences }>(
      `${cafeBase(cafeId)}/dashboard/preferences`,
      { method: 'PUT', body: JSON.stringify({ widgets }) },
    );
    return res.widgets;
  },
};

export const receiptsApi = {
  /**
   * Struk PDF siap cetak. Sama seperti QR meja, endpointnya butuh header
   * Authorization sehingga harus diambil lewat fetch, bukan tautan langsung.
   */
  downloadPdf(cafeId: string, orderId: string): Promise<Blob> {
    return apiFetchBlob(
      `${cafeBase(cafeId)}/orders/${id(orderId)}/receipt`,
      'Gagal mengunduh struk.',
    );
  },
};

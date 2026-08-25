import type { TableDTO, TableWithStatusDTO } from '../types/api';
import { apiFetch, apiFetchBlob } from '../lib/apiClient';

// Endpoint meja (OWNER). Daftar meja membawa status pemakaian KOSONG/DIGUNAKAN
// yang diturunkan backend dari pesanan berjalan — bukan kolom yang bisa basi.

const base = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}/tables`;
const id = encodeURIComponent;

export const tablesApi = {
  list(cafeId: string): Promise<TableWithStatusDTO[]> {
    return apiFetch<TableWithStatusDTO[]>(base(cafeId));
  },

  create(cafeId: string, tableName: string): Promise<TableDTO> {
    return apiFetch<TableDTO>(base(cafeId), {
      method: 'POST',
      body: JSON.stringify({ tableName }),
    });
  },

  rename(cafeId: string, tableId: string, tableName: string): Promise<TableDTO> {
    return apiFetch<TableDTO>(`${base(cafeId)}/${id(tableId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ tableName }),
    });
  },

  remove(cafeId: string, tableId: string): Promise<void> {
    return apiFetch<void>(`${base(cafeId)}/${id(tableId)}`, { method: 'DELETE' });
  },

  /**
   * Unduh QR meja beresolusi cetak sebagai Blob.
   *
   * Tidak bisa memakai `<img src>`: endpointnya butuh header Authorization,
   * sedangkan tag `<img>` tidak mengirim header apa pun. Jadi diambil lewat
   * fetch lalu dijadikan object URL oleh pemanggil.
   */
  downloadQrPng(cafeId: string, tableId: string, size = 1024): Promise<Blob> {
    return apiFetchBlob(
      `${base(cafeId)}/${id(tableId)}/qr.png?size=${size}`,
      'Gagal mengunduh QR meja.',
    );
  },
};

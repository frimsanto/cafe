import type { CafeTable } from '../types/table';
import { apiFetch } from '../lib/apiClient';

// Kontrak API meja yang akan diimplementasikan pada layer backend fase ini.
// Mengikuti pola endpoint yang sudah ada (`/api/cafes/:cafeId/...`) dan amplop
// respons `{ data }`.
//
//   GET    /api/cafes/:cafeId/tables            -> CafeTable[]
//   POST   /api/cafes/:cafeId/tables            { tableName } -> CafeTable
//   PATCH  /api/cafes/:cafeId/tables/:tableId   { tableName } -> CafeTable
//   DELETE /api/cafes/:cafeId/tables/:tableId   -> { id }

const base = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}/tables`;

export const tablesApi = {
  list(cafeId: string): Promise<CafeTable[]> {
    return apiFetch<CafeTable[]>(base(cafeId));
  },

  create(cafeId: string, tableName: string): Promise<CafeTable> {
    return apiFetch<CafeTable>(base(cafeId), {
      method: 'POST',
      body: JSON.stringify({ tableName }),
    });
  },

  rename(cafeId: string, tableId: string, tableName: string): Promise<CafeTable> {
    return apiFetch<CafeTable>(`${base(cafeId)}/${encodeURIComponent(tableId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ tableName }),
    });
  },

  remove(cafeId: string, tableId: string): Promise<void> {
    return apiFetch<void>(`${base(cafeId)}/${encodeURIComponent(tableId)}`, {
      method: 'DELETE',
    });
  },
};

import type { CafeTable } from '../types/table';
import { mockCafe } from './mockMenu';

// ── Data tiruan meja untuk fase frontend ────────────────────────────────────
// Fase backend akan menggantinya dengan GET /api/cafes/:id/tables. Bentuk data
// sengaja sama dengan skema `tables` (id, cafe_id, table_name, qr_code) agar
// penggantian ke data asli mulus.

const CAFE_ID = mockCafe.id;

/** Nomor meja 1..14 — id & token QR mengikuti pola yang sama dengan data pesanan. */
export const mockTables: CafeTable[] = Array.from({ length: 14 }, (_, index) => {
  const number = index + 1;
  const padded = String(number).padStart(2, '0');
  return {
    id: `table-${padded}`,
    cafeId: CAFE_ID,
    tableName: `Meja ${number}`,
    qrCode: `mj-${padded}-${CAFE_ID.slice(-3)}`,
  };
});

/**
 * Meja milik SATU kafe saja (isolasi data multi-tenant). Kafe yang baru
 * mendaftar otomatis mendapat daftar kosong karena belum punya meja sendiri.
 */
export function getTablesForCafe(cafeId: string): CafeTable[] {
  return mockTables.filter((table) => table.cafeId === cafeId);
}

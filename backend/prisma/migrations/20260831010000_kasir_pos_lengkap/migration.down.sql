-- Pembatalan migrasi `20260831010000_kasir_pos_lengkap`.
--
-- Prisma TIDAK menjalankan berkas ini sendiri (tidak ada `migrate down`); ia
-- disimpan agar rollback punya naskah yang sudah ditulis dan diperiksa, bukan
-- SQL yang dikarang di tengah insiden. Jalankan manual dengan `psql` bila
-- rilisnya harus ditarik:
--
--     psql "$DATABASE_URL" -f migration.down.sql
--     # lalu hapus dua barisnya dari tabel _prisma_migrations:
--     #   DELETE FROM "_prisma_migrations"
--     #   WHERE migration_name IN ('20260831010000_kasir_pos_lengkap',
--     #                            '20260831000000_tambah_status_dibatalkan');
--
-- PERINGATAN: `table_id` dikembalikan menjadi NOT NULL, jadi pesanan BAWA
-- PULANG (yang memang tidak punya meja) harus dibereskan lebih dulu. Perintah
-- di bawah menolak berjalan bila masih ada — sengaja: menghapus pesanan
-- pelanggan diam-diam jauh lebih buruk daripada rollback yang berhenti dan
-- meminta keputusan manusia.

DO $$
DECLARE
  jumlah_takeaway INT;
BEGIN
  SELECT COUNT(*) INTO jumlah_takeaway FROM "orders" WHERE "table_id" IS NULL;
  IF jumlah_takeaway > 0 THEN
    RAISE EXCEPTION
      'Rollback dihentikan: ada % pesanan bawa pulang tanpa meja. Pindahkan/arsipkan dulu sebelum mengembalikan NOT NULL.',
      jumlah_takeaway;
  END IF;
END $$;

-- Pesanan yang sempat dibatalkan tidak punya padanan di kosakata lama.
-- Dikembalikan ke MENUNGGU_PEMBAYARAN (bukan SELESAI) supaya tidak ada
-- pembatalan yang berubah menjadi penjualan pada laporan versi lama.
UPDATE "orders" SET "status" = 'MENUNGGU_PEMBAYARAN' WHERE "status" = 'DIBATALKAN';

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cashier_user_id_fkey";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cancelled_by_fkey";

DROP INDEX IF EXISTS "orders_cafe_id_idempotency_key_key";
DROP INDEX IF EXISTS "orders_cafe_id_order_source_idx";
DROP INDEX IF EXISTS "orders_cafe_id_kitchen_status_idx";
DROP INDEX IF EXISTS "orders_cafe_id_status_pembayaran_idx";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "idempotency_key",
  DROP COLUMN IF EXISTS "alasan_pembatalan",
  DROP COLUMN IF EXISTS "cancelled_by",
  DROP COLUMN IF EXISTS "cancelled_at",
  DROP COLUMN IF EXISTS "confirmed_at",
  DROP COLUMN IF EXISTS "cashier_user_id",
  DROP COLUMN IF EXISTS "completed_at",
  DROP COLUMN IF EXISTS "kitchen_ready_at",
  DROP COLUMN IF EXISTS "kitchen_started_at",
  DROP COLUMN IF EXISTS "kitchen_queued_at",
  DROP COLUMN IF EXISTS "kitchen_status",
  DROP COLUMN IF EXISTS "catatan",
  DROP COLUMN IF EXISTS "customer_name",
  DROP COLUMN IF EXISTS "order_source",
  DROP COLUMN IF EXISTS "fulfillment_type";

ALTER TABLE "orders" ALTER COLUMN "table_id" SET NOT NULL;

-- Nilai enum 'DIBATALKAN' TIDAK dicabut: PostgreSQL tidak menyediakan
-- `ALTER TYPE ... DROP VALUE`, dan membiarkannya ada sama sekali tidak
-- berpengaruh pada kode versi lama karena tidak ada baris yang memakainya lagi.

-- Kasir sebagai POS penuh: pesanan bisa lahir DI kasir, bisa dibawa pulang,
-- dan perjalanan dapurnya dicatat terpisah dari status pembayaran.
--
-- SELURUHNYA ADITIF. Tidak ada kolom yang dihapus, tidak ada tipe yang diubah,
-- tidak ada baris yang kehilangan nilainya. Kode versi lama tetap berjalan di
-- atas skema ini: kolom baru punya DEFAULT yang mewakili keadaan lama dengan
-- jujur (semua pesanan terdahulu memang dine-in dari QR meja).
--
-- Rollback: lihat `migration.down.sql` di folder yang sama.

-- ── 1. Meja menjadi opsional ─────────────────────────────────────────────────
-- Pesanan bawa pulang tidak punya meja. Menautkannya ke meja mana pun akan
-- membuat meja itu tampak terisi padahal tidak ada yang duduk di sana.
ALTER TABLE "orders" ALTER COLUMN "table_id" DROP NOT NULL;

-- ── 2. Bentuk pesanan & perjalanan dapur ─────────────────────────────────────
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "fulfillment_type"   TEXT NOT NULL DEFAULT 'DINE_IN',
  ADD COLUMN IF NOT EXISTS "order_source"       TEXT NOT NULL DEFAULT 'TABLE_QR',
  ADD COLUMN IF NOT EXISTS "customer_name"      TEXT,
  ADD COLUMN IF NOT EXISTS "catatan"            TEXT,
  ADD COLUMN IF NOT EXISTS "kitchen_status"     TEXT NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS "kitchen_queued_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kitchen_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kitchen_ready_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completed_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cashier_user_id"    UUID,
  ADD COLUMN IF NOT EXISTS "confirmed_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_by"       UUID,
  ADD COLUMN IF NOT EXISTS "alasan_pembatalan"  TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key"    TEXT;

-- ── 3. Isi kolom dapur untuk pesanan yang sudah ada ──────────────────────────
--
-- Tanpa langkah ini, seluruh pesanan yang sedang berjalan saat rilis dipasang
-- akan berstatus NOT_SENT dan HILANG dari Layar Dapur — tiket yang sedang
-- dimasak lenyap dari layar chef di tengah jam sibuk.
--
-- Pemetaannya membaca status masak per item yang memang sudah tersimpan,
-- sehingga tiket yang setengah jalan tetap muncul sebagai "sedang diproses",
-- bukan mundur ke antrean.
UPDATE "orders" o
SET "kitchen_status" = CASE
  WHEN o."status" = 'SELESAI' THEN 'COMPLETED'
  WHEN o."status" = 'DIPROSES_DAPUR' THEN (
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM "order_items" i
        WHERE i."order_id" = o."id" AND i."kitchen_status" <> 'READY'
      ) AND EXISTS (SELECT 1 FROM "order_items" i WHERE i."order_id" = o."id")
        THEN 'READY'
      WHEN EXISTS (
        SELECT 1 FROM "order_items" i
        WHERE i."order_id" = o."id" AND i."kitchen_status" <> 'WAITING'
      ) THEN 'PREPARING'
      ELSE 'QUEUED'
    END
  )
  ELSE 'NOT_SENT'
END;

-- Waktu-waktu yang bisa dipulihkan dengan jujur dari data yang ada. Yang tidak
-- pernah tercatat (kapan chef mulai memasak) sengaja DIBIARKAN NULL — menebak
-- angkanya akan membuat laporan durasi berbohong.
UPDATE "orders"
SET "confirmed_at"      = COALESCE("confirmed_at", "paid_at"),
    "kitchen_queued_at" = COALESCE("kitchen_queued_at", "paid_at")
WHERE "status" IN ('DIPROSES_DAPUR', 'SELESAI');

UPDATE "orders"
SET "completed_at" = COALESCE("completed_at", "updated_at")
WHERE "status" = 'SELESAI';

-- ── 4. Index ────────────────────────────────────────────────────────────────
-- Layar kasir menyaring per status pembayaran & tahap dapur, dan memfilter
-- sumber pesanan. Semuanya selalu dalam lingkup satu kafe, jadi `cafe_id`
-- menjadi kolom pertama.
CREATE INDEX IF NOT EXISTS "orders_cafe_id_status_pembayaran_idx"
  ON "orders" ("cafe_id", "status_pembayaran");
CREATE INDEX IF NOT EXISTS "orders_cafe_id_kitchen_status_idx"
  ON "orders" ("cafe_id", "kitchen_status");
CREATE INDEX IF NOT EXISTS "orders_cafe_id_order_source_idx"
  ON "orders" ("cafe_id", "order_source");

-- Anti-kirim-ganda pesanan kasir. PostgreSQL menganggap dua NULL berbeda satu
-- sama lain pada unique index, jadi pesanan dari QR meja — yang tidak pernah
-- membawa kunci ini — sama sekali tidak terpengaruh.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_cafe_id_idempotency_key_key"
  ON "orders" ("cafe_id", "idempotency_key");

-- ── 5. Kunci asing ke pengguna ──────────────────────────────────────────────
-- ON DELETE SET NULL: pesanan lama tidak boleh ikut hilang ketika seorang kasir
-- dihapus dari kafe, tapi jejaknya juga tidak boleh menunjuk baris yang tiada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_cashier_user_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_cashier_user_id_fkey"
      FOREIGN KEY ("cashier_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_cancelled_by_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_cancelled_by_fkey"
      FOREIGN KEY ("cancelled_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

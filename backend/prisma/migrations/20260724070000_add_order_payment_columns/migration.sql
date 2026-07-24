-- Pembayaran di Kasir (Fase 3): ringkasan pembayaran pada tabel `orders`.
--
-- Mengapa disalin, padahal tabel `payments` sudah menyimpannya?
--   * Laporan omzet sebelumnya menyaring memakai `orders.created_at` — waktu
--     pesanan DIBUAT. Pesanan yang dibuat 23.55 lalu dibayar 00.05 masuk ke
--     hari yang salah. `paid_at` membuat omzet dihitung saat uang benar-benar
--     diterima.
--   * Menyaring/mengelompokkan per metode bayar (tunai vs EDC vs QRIS) jadi
--     tidak perlu join ke `payments` di setiap query laporan.
--
-- Sumber kebenaran tetap tabel `payments`. Kedua kolom ini HANYA ditulis oleh
-- gerbang rilis pesanan (`release.service.ts`) agar tidak bisa berbeda.

-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "payment_method" "PaymentMethod",
  ADD COLUMN "paid_at" TIMESTAMP(3);

-- Isi data lama dari pembayaran yang sudah sukses.
UPDATE "orders" AS o
SET "payment_method" = p."method",
    "paid_at"        = p."created_at"
FROM "payments" AS p
WHERE p."order_id" = o."id"
  AND p."status" = 'SUCCESS';

-- CreateIndex
CREATE INDEX "orders_cafe_id_paid_at_idx" ON "orders"("cafe_id", "paid_at");

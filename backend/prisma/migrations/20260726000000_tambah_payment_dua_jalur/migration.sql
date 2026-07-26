-- Integrasi Pembayaran Dua Jalur: konfirmasi manual + Midtrans opsional per kafe.
--
-- 1) Konfigurasi pembayaran per kafe pada tabel `cafes`:
--    - metode_diterima      : metode manual yang diterima (default hanya TUNAI)
--    - midtrans_server_key   : kredensial rahasia, DISIMPAN TERENKRIPSI (AES-256-GCM)
--    - midtrans_client_key   : kredensial publik (aman terekspos ke frontend)
--    - midtrans_production    : sandbox (false) vs production (true)
--    - midtrans_aktif         : gerbang cepat "boleh buat transaksi Midtrans"
-- 2) Ringkasan pembayaran versi baru pada tabel `orders` (lintas jalur).
-- 3) Tabel `pembayaran_manual` : bukti pembayaran yang dikonfirmasi kasir.

-- AlterTable: konfigurasi pembayaran kafe
ALTER TABLE "cafes"
  ADD COLUMN "metode_diterima" TEXT[] NOT NULL DEFAULT ARRAY['TUNAI']::TEXT[],
  ADD COLUMN "midtrans_server_key" TEXT,
  ADD COLUMN "midtrans_client_key" TEXT,
  ADD COLUMN "midtrans_production" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "midtrans_aktif" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: ringkasan pembayaran dua jalur pada pesanan
ALTER TABLE "orders"
  ADD COLUMN "midtrans_order_id" TEXT,
  ADD COLUMN "snap_token" TEXT,
  ADD COLUMN "status_pembayaran" TEXT DEFAULT 'MENUNGGU',
  ADD COLUMN "metode_pembayaran" TEXT,
  ADD COLUMN "nominal_dibayar" DECIMAL(12,2);

-- Selaraskan status pembayaran baris lama: pesanan yang sudah LUNAS (punya
-- pembayaran SUCCESS) ditandai LUNAS beserta metode & nominalnya.
UPDATE "orders" AS o
SET "status_pembayaran" = 'LUNAS',
    "metode_pembayaran"  = o."payment_method"::TEXT,
    "nominal_dibayar"    = o."total_amount"
FROM "payments" AS p
WHERE p."order_id" = o."id"
  AND p."status" = 'SUCCESS';

-- CreateIndex: pencarian pesanan dari webhook / polling Midtrans lewat order_id.
CREATE INDEX "orders_midtrans_order_id_idx" ON "orders"("midtrans_order_id");

-- CreateTable: pembayaran manual (satu baris per pesanan)
CREATE TABLE "pembayaran_manual" (
    "id" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "metode" TEXT NOT NULL,
    "nominal" DECIMAL(12,2) NOT NULL,
    "catatan_kasir" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pembayaran_manual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pembayaran_manual_order_id_key" ON "pembayaran_manual"("order_id");

-- AddForeignKey
ALTER TABLE "pembayaran_manual"
  ADD CONSTRAINT "pembayaran_manual_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

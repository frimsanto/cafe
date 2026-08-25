-- Jalur pembayaran DOKU Checkout (gateway GLOBAL milik platform — kredensialnya
-- di environment, bukan per kafe, jadi tabel `cafes` tidak berubah).
--
-- `doku_invoice_number` adalah `invoice_number` yang dikirim ke DOKU saat
-- membuat tagihan; notifikasi (webhook) DOKU mencocokkan pesanan lewat kolom ini,
-- sebagaimana `midtrans_order_id` pada jalur Midtrans.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "doku_invoice_number" TEXT;

-- CreateIndex: pencarian pesanan dari webhook DOKU lewat invoice_number.
CREATE INDEX "orders_doku_invoice_number_idx" ON "orders"("doku_invoice_number");

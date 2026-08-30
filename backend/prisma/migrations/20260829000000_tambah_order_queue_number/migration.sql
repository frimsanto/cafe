-- Nomor antrian harian per kafe — angka yang dipanggil ke tamu (`A-001`).
--
-- Sebelumnya nomor antrian diturunkan dari hash UUID pesanan: stabil, tapi acak
-- (pesanan pertama hari itu bisa muncul sebagai `Q-742`) dan tidak memberi tahu
-- siapa pun urutan datangnya. Kolom ini menyimpan nomor yang sebenarnya:
-- berurutan 1..999 per kafe, dimulai lagi dari 1 setiap pergantian hari.
--
-- Nullable karena pesanan LAMA tidak punya nomor ini dan tidak bisa diberi
-- nomor secara jujur — urutan harian mereka sudah tidak dapat direkonstruksi.
-- Tampilan menjatuhkannya ke `A-001` bila null.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "queue_number" INTEGER;

-- CreateIndex: mencari nomor tertinggi milik satu kafe pada hari berjalan.
CREATE INDEX "orders_cafe_id_created_at_queue_number_idx"
  ON "orders"("cafe_id", "created_at", "queue_number");

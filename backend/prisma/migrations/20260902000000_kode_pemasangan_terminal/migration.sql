-- Kode pemasangan terminal POS.
--
-- Sebelum ini, satu-satunya kredensial terminal adalah token 64 heksadesimal
-- yang diperlihatkan sekali kepada pemilik. Di produksi itu berakhir sebagai
-- tiga terminal bernama `0b41506b3ca29a87…`, `budiman@gmail.com`, dan `123123`
-- yang dicabut semua dalam dua setengah menit tanpa satu pun pernah terpasang:
-- tokennya tidak bisa dibawa manusia dari layar pemilik ke tablet kasir.
--
-- Migrasi ini memisahkan kredensial manusia dari kredensial mesin. Seluruhnya
-- ADITIF dan nullable, jadi kode lama tetap berjalan di skema ini — kecuali
-- satu pelonggaran yang memang diperlukan: `token_hash` boleh NULL, karena
-- terminal sekarang lahir sebelum tokennya ada.

ALTER TABLE "cashier_devices" ALTER COLUMN "token_hash" DROP NOT NULL;

ALTER TABLE "cashier_devices"
  ADD COLUMN "kode_hash"           TEXT,
  ADD COLUMN "kode_berlaku_hingga" TIMESTAMP(3),
  ADD COLUMN "kode_dipakai_pada"   TIMESTAMP(3),
  ADD COLUMN "terpasang_pada"      TIMESTAMP(3);

-- Unik seperti `token_hash`: satu kode, satu terminal. Di Postgres sebuah
-- UNIQUE membiarkan NULL berapa pun banyaknya, jadi terminal yang tidak sedang
-- menunggu pemasangan tidak saling bertabrakan.
CREATE UNIQUE INDEX "cashier_devices_kode_hash_key" ON "cashier_devices"("kode_hash");

-- Terminal yang SUDAH terpasang sebelum migrasi ini: tokennya sudah dipakai,
-- jadi waktu pemasangannya diperkirakan dari pemakaian pertama yang tercatat.
-- Yang belum pernah dipakai sengaja dibiarkan NULL — menebak tanggal pemasangan
-- untuk terminal yang tidak pernah terpasang hanya akan menjadi angka karangan
-- di layar pemilik.
UPDATE "cashier_devices"
   SET "terpasang_pada" = "created_at"
 WHERE "terakhir_dipakai" IS NOT NULL;

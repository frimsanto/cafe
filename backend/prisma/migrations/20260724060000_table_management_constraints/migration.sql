-- Manajemen Meja & QR (Fase 3).
--
-- Tabel `tables` sudah dibuat pada migrasi awal (20260724000000_init) lengkap
-- dengan `qr_code` unik lintas sistem. Migrasi ini menambahkan:
--
--   1. Nama meja unik per kafe — dua "Meja 5" dalam satu kafe membuat kasir,
--      dapur, dan struk menunjuk meja yang ambigu.
--   2. Uniknya PARSIAL (`WHERE deleted_at IS NULL`) supaya nama meja yang sudah
--      dihapus bisa dipakai lagi saat penataan ulang ruangan.
--   3. Index (cafe_id, table_name) untuk daftar meja yang terurut rapi.
--
-- Sama seperti migrasi menu: bentuk index parsial/ekspresi ini belum bisa
-- dinyatakan di schema.prisma, jadi ditulis sebagai SQL mentah. `prisma migrate
-- dev` bisa menganggapnya drift — JANGAN terima tawaran menghapusnya.

-- CreateIndex
CREATE INDEX "tables_cafe_id_table_name_idx" ON "tables"("cafe_id", "table_name");

-- CreateIndex (partial unique — nama meja per kafe)
CREATE UNIQUE INDEX "tables_cafe_id_table_name_live_key"
  ON "tables"("cafe_id", lower("table_name"))
  WHERE "deleted_at" IS NULL;

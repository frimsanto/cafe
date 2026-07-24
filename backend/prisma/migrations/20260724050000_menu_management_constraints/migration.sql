-- Manajemen Menu (Fase 3).
--
-- Tabel `menu_categories` & `menu_items` sudah dibuat pada migrasi awal
-- (20260724000000_init). Migrasi ini menambahkan aturan integritas & index yang
-- dibutuhkan fitur kelola menu:
--
--   1. Nama kategori unik per kafe, dan nama item unik per kategori — supaya
--      pemilik tidak punya dua "Kopi" atau dua "Espresso" yang membingungkan
--      pelanggan maupun laporan penjualan.
--   2. Uniknya PARSIAL (`WHERE deleted_at IS NULL`) sehingga nama yang sudah
--      dihapus (soft delete) bisa dipakai lagi.
--   3. Perbandingan memakai `lower(...)`: "Kopi" dan "kopi" dianggap sama.
--
-- Prisma belum bisa menyatakan index parsial/ekspresi di schema.prisma, jadi
-- keduanya ditulis sebagai SQL mentah di sini. `prisma migrate dev` bisa
-- menganggapnya "drift" dan menawarkan penghapusan — JANGAN diterima.

-- CreateIndex
CREATE INDEX "menu_categories_cafe_id_order_position_idx"
  ON "menu_categories"("cafe_id", "order_position");

-- CreateIndex
CREATE INDEX "menu_items_cafe_id_is_available_idx"
  ON "menu_items"("cafe_id", "is_available");

-- CreateIndex (partial unique — nama kategori per kafe)
CREATE UNIQUE INDEX "menu_categories_cafe_id_name_live_key"
  ON "menu_categories"("cafe_id", lower("name"))
  WHERE "deleted_at" IS NULL;

-- CreateIndex (partial unique — nama item per kategori)
CREATE UNIQUE INDEX "menu_items_category_id_name_live_key"
  ON "menu_items"("category_id", lower("name"))
  WHERE "deleted_at" IS NULL;

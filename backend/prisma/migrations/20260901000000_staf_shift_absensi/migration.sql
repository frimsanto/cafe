-- CafeOS — Staf & PIN, perangkat POS, jadwal kerja, absensi berfoto, shift
-- kasir, pergerakan kas, dan penggantian petugas.
--
-- SIFAT MIGRASI INI: ADITIF DAN NON-DESTRUKTIF.
--   * Tidak ada tabel/kolom yang di-DROP.
--   * Tidak ada tipe kolom yang diubah (tidak ada ALTER COLUMN ... TYPE).
--   * Tidak ada baris yang disentuh — semua kolom baru punya DEFAULT atau
--     boleh NULL, sehingga baris yang sudah ada tetap sah apa adanya.
--   * Kode versi LAMA tetap berjalan di atas skema ini: tidak ada kolom yang
--     dibacanya berubah arti. Itu yang membuat rollback kode (tanpa rollback
--     database) tetap aman bila penggelaran harus dibatalkan.
--
-- ── Yang ditambahkan ──
--
--   cafes              + pengaturan operasional (zona waktu, awal hari
--                        operasional, retensi foto, kebijakan pengganti)
--   users              + nomor HP, status aktif, dan PIN perangkat POS
--                        (hash bcrypt + penghitung percobaan & penguncian)
--   orders             + cashier_shift_id, device_id
--   pembayaran_manual  + cashier_shift_id, device_id
--   payment_audit_logs + entity_type/entity_id, alasan, device_id,
--                        correlation_id — tabelnya naik pangkat dari jejak
--                        pembayaran menjadi jejak audit umum, TANPA berganti
--                        nama (baris lama tetap terbaca persis seperti dulu)
--
--   shift_templates      pola shift berulang (Pagi/Siang/Malam)
--   shift_schedules      penugasan staf pada satu tanggal
--   cashier_devices      terminal POS milik kafe (hash token, bisa dicabut)
--   attendance_records   kehadiran: masuk, pulang, terlambat, lembur
--   attendance_photos    referensi foto absensi (berkasnya di disk privat)
--   cashier_shifts       tanggung jawab atas laci kas + rekap selisihnya
--   cash_movements       uang masuk/keluar laci di luar penjualan
--   shift_replacements   permintaan kasir pengganti & persetujuannya
--
-- ── Mengapa transaksi lama boleh punya cashier_shift_id NULL ──
--
-- Tidak ada backfill yang mengarang shift untuk penjualan yang sudah lewat.
-- Mengarang berarti menuliskan bahwa seseorang memegang laci pada jam yang
-- tidak pernah ia buka — persis jenis data yang membuat laporan berhenti bisa
-- dipercaya. Pesanan lama tetap NULL dan ditampilkan laporan dengan label
-- "Data lama"; omzetnya tetap dihitung penuh, hanya rekap per-shift yang tidak
-- mengklaimnya.
--
-- ── Uang bertipe BIGINT di tabel baru ──
--
-- Rupiah tidak mengenal sen. Tabel lama (`orders`, `payments`) tetap
-- Decimal(12,2) dan SENGAJA tidak diubah: mengubah tipe kolom berisi data
-- penjualan menuntut penguncian tabel, harga yang tidak sepadan dengan
-- keseragaman. Konversi antar keduanya terpusat di `lib/rupiah.ts`.

-- AlterTable
ALTER TABLE "cafes" ADD COLUMN     "awal_hari_operasional" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "awal_minggu" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "kasir_lihat_riwayat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pengganti_boleh_langsung" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "retensi_foto_hari" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "aktif" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pin_diperbarui_pada" TIMESTAMP(3),
ADD COLUMN     "pin_gagal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_terkunci_sampai" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cashier_shift_id" UUID,
ADD COLUMN     "device_id" UUID;

-- AlterTable
ALTER TABLE "pembayaran_manual" ADD COLUMN     "cashier_shift_id" UUID,
ADD COLUMN     "device_id" UUID;

-- AlterTable
ALTER TABLE "payment_audit_logs" ADD COLUMN     "alasan" TEXT,
ADD COLUMN     "correlation_id" TEXT,
ADD COLUMN     "device_id" UUID,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "entity_type" TEXT;

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "nama" TEXT NOT NULL,
    "menit_mulai" INTEGER NOT NULL,
    "menit_selesai" INTEGER NOT NULL,
    "lewat_tengah_malam" BOOLEAN NOT NULL DEFAULT false,
    "toleransi_terlambat_menit" INTEGER NOT NULL DEFAULT 10,
    "hari_berlaku" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_schedules" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tanggal" DATE NOT NULL,
    "device_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'DIJADWALKAN',
    "catatan" TEXT,
    "dibuat_oleh" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_devices" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "terakhir_dipakai" TIMESTAMP(3),
    "dicabut_pada" TIMESTAMP(3),
    "dicabut_oleh" UUID,
    "dibuat_oleh" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "schedule_id" UUID,
    "masuk_pada" TIMESTAMP(3),
    "keluar_pada" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "terlambat_menit" INTEGER,
    "lembur_menit" INTEGER,
    "durasi_menit" INTEGER,
    "device_masuk_id" UUID,
    "device_keluar_id" UUID,
    "pengecualian_foto" BOOLEAN NOT NULL DEFAULT false,
    "alasan_pengecualian" TEXT,
    "disetujui_oleh" UUID,
    "disetujui_pada" TIMESTAMP(3),
    "catatan" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_photos" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "jenis" TEXT NOT NULL,
    "nama_berkas" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "ukuran_byte" INTEGER NOT NULL,
    "diterima_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diambil_pada" TIMESTAMP(3),
    "terlambat_diunggah" BOOLEAN NOT NULL DEFAULT false,
    "dihapus_pada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_shifts" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attendance_id" UUID,
    "schedule_id" UUID,
    "device_id" UUID,
    "template_id" UUID,
    "nama_shift" TEXT NOT NULL,
    "dibuka_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ditutup_pada" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "modal_awal" BIGINT NOT NULL DEFAULT 0,
    "kas_aktual" BIGINT,
    "kas_seharusnya" BIGINT,
    "selisih" BIGINT,
    "catatan_buka" TEXT,
    "catatan_tutup" TEXT,
    "dikoreksi_oleh" UUID,
    "dikoreksi_pada" TIMESTAMP(3),
    "alasan_koreksi" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "jenis" TEXT NOT NULL,
    "nominal" BIGINT NOT NULL,
    "alasan" TEXT NOT NULL,
    "actor_user_id" UUID,
    "disetujui_oleh" UUID,
    "disetujui_pada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_replacements" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "staff_terjadwal_id" UUID NOT NULL,
    "staff_pengganti_id" UUID NOT NULL,
    "alasan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "diajukan_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diputuskan_oleh" UUID,
    "diputuskan_pada" TIMESTAMP(3),
    "alasan_keputusan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_templates_cafe_id_idx" ON "shift_templates"("cafe_id");

-- CreateIndex
CREATE INDEX "shift_templates_cafe_id_aktif_idx" ON "shift_templates"("cafe_id", "aktif");

-- CreateIndex
CREATE INDEX "shift_schedules_cafe_id_tanggal_idx" ON "shift_schedules"("cafe_id", "tanggal");

-- CreateIndex
CREATE INDEX "shift_schedules_user_id_tanggal_idx" ON "shift_schedules"("user_id", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "shift_schedules_cafe_id_template_id_user_id_tanggal_key" ON "shift_schedules"("cafe_id", "template_id", "user_id", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_devices_token_hash_key" ON "cashier_devices"("token_hash");

-- CreateIndex
CREATE INDEX "cashier_devices_cafe_id_idx" ON "cashier_devices"("cafe_id");

-- CreateIndex
CREATE INDEX "cashier_devices_cafe_id_aktif_idx" ON "cashier_devices"("cafe_id", "aktif");

-- CreateIndex
CREATE INDEX "attendance_records_cafe_id_masuk_pada_idx" ON "attendance_records"("cafe_id", "masuk_pada");

-- CreateIndex
CREATE INDEX "attendance_records_user_id_masuk_pada_idx" ON "attendance_records"("user_id", "masuk_pada");

-- CreateIndex
CREATE INDEX "attendance_records_cafe_id_status_idx" ON "attendance_records"("cafe_id", "status");

-- CreateIndex
CREATE INDEX "attendance_photos_attendance_id_idx" ON "attendance_photos"("attendance_id");

-- CreateIndex
CREATE INDEX "attendance_photos_cafe_id_diterima_pada_idx" ON "attendance_photos"("cafe_id", "diterima_pada");

-- CreateIndex
CREATE INDEX "cashier_shifts_cafe_id_dibuka_pada_idx" ON "cashier_shifts"("cafe_id", "dibuka_pada");

-- CreateIndex
CREATE INDEX "cashier_shifts_cafe_id_status_idx" ON "cashier_shifts"("cafe_id", "status");

-- CreateIndex
CREATE INDEX "cashier_shifts_user_id_dibuka_pada_idx" ON "cashier_shifts"("user_id", "dibuka_pada");

-- CreateIndex
CREATE INDEX "cash_movements_shift_id_idx" ON "cash_movements"("shift_id");

-- CreateIndex
CREATE INDEX "cash_movements_cafe_id_created_at_idx" ON "cash_movements"("cafe_id", "created_at");

-- CreateIndex
CREATE INDEX "shift_replacements_cafe_id_status_idx" ON "shift_replacements"("cafe_id", "status");

-- CreateIndex
CREATE INDEX "shift_replacements_schedule_id_idx" ON "shift_replacements"("schedule_id");

-- CreateIndex
CREATE INDEX "orders_cashier_shift_id_idx" ON "orders"("cashier_shift_id");

-- CreateIndex
CREATE INDEX "payment_audit_logs_entity_type_entity_id_idx" ON "payment_audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_shift_id_fkey" FOREIGN KEY ("cashier_shift_id") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "cashier_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_devices" ADD CONSTRAINT "cashier_devices_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "cashier_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cashier_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_replacements" ADD CONSTRAINT "shift_replacements_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_replacements" ADD CONSTRAINT "shift_replacements_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "shift_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_replacements" ADD CONSTRAINT "shift_replacements_staff_terjadwal_id_fkey" FOREIGN KEY ("staff_terjadwal_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_replacements" ADD CONSTRAINT "shift_replacements_staff_pengganti_id_fkey" FOREIGN KEY ("staff_pengganti_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Index parsial yang tidak bisa dinyatakan Prisma ──────────────────────────
--
-- "Satu kasir hanya boleh memegang SATU shift aktif" dan "satu terminal hanya
-- boleh menjalankan SATU shift aktif" adalah aturan yang harus dijaga
-- DATABASE, bukan aplikasi: dua permintaan "Buka Shift" yang tiba bersamaan
-- sama-sama lolos pemeriksaan "sudah ada shift aktif belum" lalu sama-sama
-- menulis, dan kafe berakhir dengan dua laci yang mengklaim uang yang sama.
--
-- Harus PARSIAL (WHERE status = 'AKTIF'). Unique constraint biasa pada
-- `user_id` akan melarang kasir yang sama membuka shift KEDUA besok pagi —
-- yaitu melarang pekerjaan sehari-hari, bukan melarang kesalahan.
--
-- `device_id` boleh NULL (shift yang dibuka tanpa terminal terdaftar).
-- PostgreSQL menganggap setiap NULL berbeda satu sama lain, jadi baris-baris
-- itu tidak saling menghalangi — persis yang diinginkan.
CREATE UNIQUE INDEX "cashier_shifts_satu_aktif_per_kasir"
  ON "cashier_shifts" ("user_id")
  WHERE "status" = 'AKTIF';

CREATE UNIQUE INDEX "cashier_shifts_satu_aktif_per_terminal"
  ON "cashier_shifts" ("device_id")
  WHERE "status" = 'AKTIF' AND "device_id" IS NOT NULL;

-- ── Batasan nilai ────────────────────────────────────────────────────────────
--
-- Dipasang sebagai CHECK, bukan hanya validasi aplikasi: kolom menit yang
-- berisi 1500 tidak akan pernah menghasilkan pesan galat yang bisa dimengerti
-- di kemudian hari, ia cuma membuat jadwal berperilaku aneh. Prisma belum bisa
-- menyatakan CHECK di schema — JANGAN hapus saat `prisma migrate dev`.
ALTER TABLE "shift_templates"
  ADD CONSTRAINT "shift_templates_menit_valid"
  CHECK ("menit_mulai" BETWEEN 0 AND 1439 AND "menit_selesai" BETWEEN 0 AND 1439);

ALTER TABLE "cafes"
  ADD CONSTRAINT "cafes_awal_hari_valid"
  CHECK ("awal_hari_operasional" BETWEEN 0 AND 1439);

ALTER TABLE "cafes"
  ADD CONSTRAINT "cafes_awal_minggu_valid"
  CHECK ("awal_minggu" BETWEEN 1 AND 7);

-- Uang di laci tidak pernah negatif, dan pergerakan kas nol tidak berarti apa-apa.
ALTER TABLE "cashier_shifts"
  ADD CONSTRAINT "cashier_shifts_modal_tidak_negatif"
  CHECK ("modal_awal" >= 0 AND ("kas_aktual" IS NULL OR "kas_aktual" >= 0));

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_nominal_positif"
  CHECK ("nominal" > 0);

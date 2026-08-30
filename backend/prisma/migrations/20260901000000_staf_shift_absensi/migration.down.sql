-- Pembatalan migrasi `20260901000000_staf_shift_absensi`.
--
-- Prisma TIDAK menjalankan berkas ini sendiri (tidak ada `migrate down`); ia
-- disimpan agar rollback punya naskah yang sudah ditulis dan diperiksa, bukan
-- SQL yang dikarang di tengah insiden. Jalankan manual dengan `psql` bila
-- rilisnya harus ditarik:
--
--     psql "$DATABASE_URL" -f migration.down.sql
--     # lalu hapus barisnya dari tabel _prisma_migrations:
--     #   DELETE FROM "_prisma_migrations"
--     #   WHERE migration_name = '20260901000000_staf_shift_absensi';
--
-- ── APA YANG HILANG BILA INI DIJALANKAN ──
--
-- Delapan tabel baru DIHAPUS beserta seluruh isinya: jadwal, absensi (termasuk
-- catatan kehadiran), shift kasir dan rekap selisih kasnya, pergerakan kas, dan
-- penggantian petugas. Itu data operasional sungguhan, bukan data turunan yang
-- bisa dihitung ulang — AMBIL DUMP DULU:
--
--     pg_dump "$DATABASE_URL" \
--       -t shift_templates -t shift_schedules -t cashier_devices \
--       -t attendance_records -t attendance_photos -t cashier_shifts \
--       -t cash_movements -t shift_replacements \
--       > shift-absensi-sebelum-rollback.sql
--
-- Foto absensi di disk TIDAK ikut terhapus oleh berkas ini (berkasnya memang
-- tidak pernah ada di database). Bersihkan terpisah bila memang diinginkan.
--
-- Yang TIDAK hilang: seluruh pesanan, pembayaran, dan audit log. Kolom yang
-- ditambahkan pada tabel lama memang ikut di-DROP, tetapi isinya hanya
-- penunjuk ke shift/terminal — penjualannya sendiri utuh, dan setelah rollback
-- ia kembali terbaca persis seperti sebelum migrasi ini ada.
--
-- Pengaturan kafe (zona waktu, awal hari operasional, retensi foto) juga
-- kembali ke perilaku lama: seluruh tanggal dihitung dengan waktu lokal server.

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_cashier_shift_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_templates" DROP CONSTRAINT "shift_templates_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_schedules" DROP CONSTRAINT "shift_schedules_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_schedules" DROP CONSTRAINT "shift_schedules_template_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_schedules" DROP CONSTRAINT "shift_schedules_user_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_schedules" DROP CONSTRAINT "shift_schedules_device_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_devices" DROP CONSTRAINT "cashier_devices_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_user_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_photos" DROP CONSTRAINT "attendance_photos_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_photos" DROP CONSTRAINT "attendance_photos_attendance_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_attendance_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_device_id_fkey";

-- DropForeignKey
ALTER TABLE "cashier_shifts" DROP CONSTRAINT "cashier_shifts_template_id_fkey";

-- DropForeignKey
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_shift_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_replacements" DROP CONSTRAINT "shift_replacements_cafe_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_replacements" DROP CONSTRAINT "shift_replacements_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_replacements" DROP CONSTRAINT "shift_replacements_staff_terjadwal_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_replacements" DROP CONSTRAINT "shift_replacements_staff_pengganti_id_fkey";

-- DropIndex
DROP INDEX "orders_cashier_shift_id_idx";

-- DropIndex
DROP INDEX "payment_audit_logs_entity_type_entity_id_idx";

-- AlterTable
ALTER TABLE "cafes" DROP COLUMN "awal_hari_operasional",
DROP COLUMN "awal_minggu",
DROP COLUMN "kasir_lihat_riwayat",
DROP COLUMN "pengganti_boleh_langsung",
DROP COLUMN "retensi_foto_hari",
DROP COLUMN "timezone";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "aktif",
DROP COLUMN "phone",
DROP COLUMN "pin_diperbarui_pada",
DROP COLUMN "pin_gagal",
DROP COLUMN "pin_hash",
DROP COLUMN "pin_terkunci_sampai";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "cashier_shift_id",
DROP COLUMN "device_id";

-- AlterTable
ALTER TABLE "pembayaran_manual" DROP COLUMN "cashier_shift_id",
DROP COLUMN "device_id";

-- AlterTable
ALTER TABLE "payment_audit_logs" DROP COLUMN "alasan",
DROP COLUMN "correlation_id",
DROP COLUMN "device_id",
DROP COLUMN "entity_id",
DROP COLUMN "entity_type";

-- DropTable
DROP TABLE "shift_templates";

-- DropTable
DROP TABLE "shift_schedules";

-- DropTable
DROP TABLE "cashier_devices";

-- DropTable
DROP TABLE "attendance_records";

-- DropTable
DROP TABLE "attendance_photos";

-- DropTable
DROP TABLE "cashier_shifts";

-- DropTable
DROP TABLE "cash_movements";

-- DropTable
DROP TABLE "shift_replacements";


-- Permintaan pendaftaran dari formulir publik `/daftar`.
--
-- Baris di sini BUKAN akun — pendaftaran hanya menjadi kafe aktif setelah admin
-- menindaklanjutinya. Panel super admin (fessolution.my.id) membaca tabel ini
-- lewat koneksi `pg` tersendiri, jadi nama kolomnya mengikuti kontrak panel
-- tersebut (`nama_bisnis`, `jenis_aplikasi`), bukan istilah khas CafeOS.
--
-- `IF NOT EXISTS` di seluruh berkas ini disengaja: tabelnya dibaca aplikasi
-- lain dan bisa saja sudah dibuat manual di server yang sudah jalan. Migrasi
-- harus menyusul keadaan itu tanpa menghancurkan barisnya.

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_registrations" (
    "id" UUID NOT NULL,
    "nama_bisnis" TEXT NOT NULL,
    "nama_pemilik" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "no_hp" TEXT,
    "jenis_aplikasi" TEXT NOT NULL DEFAULT 'CafeOS',
    "pesan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'baru',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_registrations_pkey" PRIMARY KEY ("id")
);

-- AlterTable: lengkapi kolom bila tabelnya sudah ada lebih dulu.
ALTER TABLE "tenant_registrations" ADD COLUMN IF NOT EXISTS "no_hp" TEXT;
ALTER TABLE "tenant_registrations" ADD COLUMN IF NOT EXISTS "jenis_aplikasi" TEXT NOT NULL DEFAULT 'CafeOS';
ALTER TABLE "tenant_registrations" ADD COLUMN IF NOT EXISTS "pesan" TEXT;
ALTER TABLE "tenant_registrations" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'baru';
ALTER TABLE "tenant_registrations" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenant_registrations_status_idx" ON "tenant_registrations"("status");
CREATE INDEX IF NOT EXISTS "tenant_registrations_created_at_idx" ON "tenant_registrations"("created_at");

-- Status hanya boleh berisi label yang dikenal panel admin. Prisma belum bisa
-- menyatakan CHECK di `schema.prisma`, jadi constraint ini dipasang lewat SQL
-- mentah dan tidak boleh ikut terhapus saat `prisma migrate dev`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_registrations_status_check'
  ) THEN
    ALTER TABLE "tenant_registrations"
      ADD CONSTRAINT "tenant_registrations_status_check"
      CHECK ("status" IN ('baru', 'dihubungi', 'aktif', 'batal'));
  END IF;
END
$$;

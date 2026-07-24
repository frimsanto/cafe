-- Tabel `users` (staf & pemilik kafe) untuk Autentikasi & Multi-Tenant.
-- Tabel `cafes` (tenant) sudah dibuat pada migrasi awal.
-- Sekaligus memasang foreign key `dashboard_preferences.user_id` → `users.id`
-- yang sebelumnya ditunda karena tabel users belum ada.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'KASIR', 'DAPUR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_cafe_id_idx" ON "users"("cafe_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

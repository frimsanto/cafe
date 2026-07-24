-- Preferensi tampilan dasbor per pengguna (widget mana yang ditampilkan).
-- Catatan: foreign key `user_id` → `users` ditambahkan pada migrasi fase
-- Autentikasi & Multi-Tenant, karena tabel `users` belum ada saat ini.

-- CreateTable
CREATE TABLE "dashboard_preferences" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "widgets" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_preferences_user_id_key" ON "dashboard_preferences"("user_id");

-- CreateIndex
CREATE INDEX "dashboard_preferences_cafe_id_idx" ON "dashboard_preferences"("cafe_id");

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CafeOS — Pengaturan Pembayaran: konfigurasi per metode, kredensial Midtrans
-- per mode, jejak audit, dan idempotensi webhook.
--
-- SIFAT MIGRASI INI: ADITIF DAN NON-DESTRUKTIF.
--   * Tidak ada tabel/kolom yang di-DROP.
--   * Kolom lama di `cafes` (metode_diterima, midtrans_*) SENGAJA dibiarkan
--     hidup dan tetap diisi aplikasi, supaya rollback kode (tanpa rollback
--     database) masih menemukan konfigurasi yang benar.
--   * Satu-satunya perubahan data adalah pemetaan kosakata status pembayaran
--     lama -> baru pada `orders.status_pembayaran` (lihat bagian 6), yang
--     dapat dibalik dengan mudah — perintahnya ada di komentar bagian itu.

-- ── 1. Tipe enum baru ────────────────────────────────────────────────────────

CREATE TYPE "MidtransMode" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "KanalPembayaran" AS ENUM ('KASIR', 'CHECKOUT');
CREATE TYPE "StatusVerifikasi" AS ENUM ('MENUNGGU', 'DITERIMA', 'DITOLAK');

-- ── 2. Konfigurasi metode pembayaran manual per kafe ─────────────────────────

CREATE TABLE "metode_pembayaran_kafe" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "metode" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "tersedia_di_kasir" BOOLEAN NOT NULL DEFAULT true,
    "tersedia_di_checkout" BOOLEAN NOT NULL DEFAULT false,
    "wajib_verifikasi_kasir" BOOLEAN NOT NULL DEFAULT true,
    "instruksi" TEXT,
    "batas_waktu_menit" INTEGER,
    "qris_image_url" TEXT,
    "qris_image_public_id" TEXT,
    "qris_merchant_name" TEXT,
    "qris_nmid" TEXT,
    "bank_nama" TEXT,
    "bank_nomor_rekening" TEXT,
    "bank_atas_nama" TEXT,
    "edc_provider" TEXT,
    "edc_terminal_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metode_pembayaran_kafe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metode_pembayaran_kafe_cafe_id_metode_key"
    ON "metode_pembayaran_kafe"("cafe_id", "metode");
CREATE INDEX "metode_pembayaran_kafe_cafe_id_idx"
    ON "metode_pembayaran_kafe"("cafe_id");

ALTER TABLE "metode_pembayaran_kafe"
    ADD CONSTRAINT "metode_pembayaran_kafe_cafe_id_fkey"
    FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hanya kode metode yang dikenal aplikasi yang boleh masuk. Prisma belum bisa
-- menyatakan CHECK di schema — jangan hapus saat `prisma migrate dev`.
ALTER TABLE "metode_pembayaran_kafe"
    ADD CONSTRAINT "metode_pembayaran_kafe_metode_check"
    CHECK ("metode" IN ('TUNAI', 'QRIS_STATIS', 'TRANSFER', 'EDC'));

-- ── 3. Kredensial Midtrans per kafe PER MODE ─────────────────────────────────

CREATE TABLE "midtrans_credentials" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "mode" "MidtransMode" NOT NULL,
    "client_key" TEXT,
    "server_key_enc" TEXT,
    "server_key_hint" TEXT,
    "status_koneksi" TEXT NOT NULL DEFAULT 'BELUM_DIUJI',
    "koneksi_diperiksa" TIMESTAMP(3),
    "koneksi_pesan" TEXT,
    "status_webhook" TEXT NOT NULL DEFAULT 'BELUM_DIPERIKSA',
    "webhook_diperiksa" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "midtrans_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "midtrans_credentials_cafe_id_mode_key"
    ON "midtrans_credentials"("cafe_id", "mode");
CREATE INDEX "midtrans_credentials_cafe_id_idx"
    ON "midtrans_credentials"("cafe_id");

ALTER TABLE "midtrans_credentials"
    ADD CONSTRAINT "midtrans_credentials_cafe_id_fkey"
    FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Jejak audit pembayaran ────────────────────────────────────────────────

CREATE TABLE "payment_audit_logs" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "aksi" TEXT NOT NULL,
    "order_id" UUID,
    "nilai_lama" JSONB,
    "nilai_baru" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_audit_logs_cafe_id_created_at_idx"
    ON "payment_audit_logs"("cafe_id", "created_at");
CREATE INDEX "payment_audit_logs_order_id_idx"
    ON "payment_audit_logs"("order_id");

ALTER TABLE "payment_audit_logs"
    ADD CONSTRAINT "payment_audit_logs_cafe_id_fkey"
    FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Idempotensi notifikasi gateway ────────────────────────────────────────

CREATE TABLE "gateway_webhook_events" (
    "id" UUID NOT NULL,
    "cafe_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "order_id" UUID,
    "transaction_status" TEXT,
    "gross_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_webhook_events_pkey" PRIMARY KEY ("id")
);

-- Inti idempotensi: notifikasi kembar KALAH DI DATABASE, bukan di logika
-- aplikasi yang bisa balapan.
CREATE UNIQUE INDEX "gateway_webhook_events_gateway_event_key_key"
    ON "gateway_webhook_events"("gateway", "event_key");
CREATE INDEX "gateway_webhook_events_cafe_id_created_at_idx"
    ON "gateway_webhook_events"("cafe_id", "created_at");

ALTER TABLE "gateway_webhook_events"
    ADD CONSTRAINT "gateway_webhook_events_cafe_id_fkey"
    FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 6. Alur verifikasi pada pembayaran manual ────────────────────────────────

ALTER TABLE "pembayaran_manual"
    ADD COLUMN "sumber" "KanalPembayaran" NOT NULL DEFAULT 'KASIR',
    ADD COLUMN "status_verifikasi" "StatusVerifikasi" NOT NULL DEFAULT 'DITERIMA',
    ADD COLUMN "diverifikasi_oleh" UUID,
    ADD COLUMN "diverifikasi_pada" TIMESTAMP(3),
    ADD COLUMN "alasan_penolakan" TEXT,
    ADD COLUMN "referensi" TEXT,
    ADD COLUMN "bukti_url" TEXT,
    ADD COLUMN "bukti_public_id" TEXT,
    ADD COLUMN "updated_at" TIMESTAMP(3);

-- Baris lama semuanya lahir dari layar kasir dan memang sudah diterima —
-- default kolom di atas (KASIR/DITERIMA) sudah benar untuk mereka. Yang belum
-- ada hanyalah cap waktunya.
UPDATE "pembayaran_manual"
   SET "updated_at" = "created_at",
       "diverifikasi_pada" = "created_at"
 WHERE "updated_at" IS NULL;

ALTER TABLE "pembayaran_manual" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX "pembayaran_manual_status_verifikasi_idx"
    ON "pembayaran_manual"("status_verifikasi");

-- CATATAN UUID: baris backfill di bawah memakai ekspresi md5, bukan
-- `gen_random_uuid()`. Fungsi itu baru bawaan sejak PostgreSQL 13; di versi
-- lebih lama ia menuntut ekstensi `pgcrypto`, yang pemasangannya butuh hak
-- istimewa yang belum tentu dimiliki pengguna database aplikasi. Id di sini
-- hanyalah kunci pengganti buram — tidak ada yang membaca bit versinya.

-- ── 7. Isi konfigurasi metode dari kolom cermin `cafes.metode_diterima` ───────
--
-- Setiap kafe mendapat SATU BARIS UNTUK SETIAP metode yang dikenal, bukan hanya
-- yang sedang aktif: halaman pengaturan menampilkan keempatnya (aktif maupun
-- tidak), dan menyiapkan barisnya di sini membuat layar itu tidak perlu
-- membuat baris sambil jalan.
--
-- `tersedia_di_checkout` sengaja false untuk SEMUA metode, termasuk QRIS statis
-- dan transfer bank yang secara teknis bisa dipakai tamu. Menyalakannya di sini
-- akan diam-diam mengubah apa yang dilihat pelanggan kafe yang sudah berjalan.
-- Pemilik yang menginginkannya menyalakannya sendiri dari halaman pengaturan.

INSERT INTO "metode_pembayaran_kafe" (
    "id", "cafe_id", "metode", "aktif",
    "tersedia_di_kasir", "tersedia_di_checkout", "wajib_verifikasi_kasir",
    "created_at", "updated_at"
)
SELECT
    (md5(random()::text || clock_timestamp()::text))::uuid,
    c."id",
    m."metode",
    m."metode" = ANY (c."metode_diterima"),
    true,
    false,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "cafes" c
CROSS JOIN (
    VALUES ('TUNAI'), ('QRIS_STATIS'), ('TRANSFER'), ('EDC')
) AS m("metode")
ON CONFLICT ("cafe_id", "metode") DO NOTHING;

-- ── 8. Pindahkan kredensial Midtrans ke baris mode yang sesuai ───────────────
--
-- Kunci yang ada sekarang milik mode yang sedang aktif (`midtrans_production`).
-- Ia disalin HANYA ke baris mode itu — mode yang lain tetap kosong, sehingga
-- menyalakan Production mengharuskan pemilik memasukkan kunci Production yang
-- sebenarnya. Itulah inti perbaikannya.
--
-- Ciphertext disalin apa adanya (tetap AES-256-GCM dengan ENCRYPTION_KEY yang
-- sama); tidak ada dekripsi di dalam migrasi.

INSERT INTO "midtrans_credentials" (
    "id", "cafe_id", "mode", "client_key", "server_key_enc",
    "status_koneksi", "status_webhook", "created_at", "updated_at"
)
SELECT
    (md5(random()::text || clock_timestamp()::text))::uuid,
    c."id",
    CASE WHEN c."midtrans_production" THEN 'PRODUCTION'::"MidtransMode"
         ELSE 'SANDBOX'::"MidtransMode" END,
    NULLIF(c."midtrans_client_key", ''),
    NULLIF(c."midtrans_server_key", ''),
    'BELUM_DIUJI',
    'BELUM_DIPERIKSA',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "cafes" c
WHERE COALESCE(c."midtrans_server_key", '') <> ''
   OR COALESCE(c."midtrans_client_key", '') <> ''
ON CONFLICT ("cafe_id", "mode") DO NOTHING;

-- ── 9. Kosakata status pembayaran: Indonesia -> kanonik ──────────────────────
--
-- `orders.status_pembayaran` adalah kolom TEKS (bukan enum PostgreSQL), jadi
-- pemetaan ini cuma UPDATE biasa — tidak ada tipe yang perlu diubah dan tidak
-- ada tabel yang terkunci lama.
--
-- Status pembayaran kini punya kosakata yang lebih kaya (menunggu verifikasi,
-- kedaluwarsa, dibatalkan, refund) dan dipisah tegas dari status pesanan/dapur.
-- Nilai lama tidak punya padanan untuk semua itu, jadi pemetaannya konservatif:
-- yang belum jelas tetap "belum dibayar".
--
-- MEMBALIKKAN (bila kode diturunkan versinya):
--   UPDATE "orders" SET "status_pembayaran" = 'MENUNGGU'
--    WHERE "status_pembayaran" IN ('UNPAID','AWAITING_VERIFICATION');
--   UPDATE "orders" SET "status_pembayaran" = 'LUNAS'  WHERE "status_pembayaran" = 'PAID';
--   UPDATE "orders" SET "status_pembayaran" = 'GAGAL'
--    WHERE "status_pembayaran" IN ('FAILED','EXPIRED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED');
--   ALTER TABLE "orders" ALTER COLUMN "status_pembayaran" SET DEFAULT 'MENUNGGU';

UPDATE "orders" SET "status_pembayaran" = 'UNPAID' WHERE "status_pembayaran" = 'MENUNGGU';
UPDATE "orders" SET "status_pembayaran" = 'PAID'   WHERE "status_pembayaran" = 'LUNAS';
UPDATE "orders" SET "status_pembayaran" = 'FAILED' WHERE "status_pembayaran" = 'GAGAL';

-- Pesanan lama (sebelum kolom ini ada) bernilai NULL. Dibiarkan NULL: aplikasi
-- membacanya sebagai UNPAID lewat `normalisasiStatus()`, dan menulisinya berarti
-- mengubah baris yang tidak perlu disentuh.

ALTER TABLE "orders" ALTER COLUMN "status_pembayaran" SET DEFAULT 'UNPAID';

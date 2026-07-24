# CafeOS Backend

Express + TypeScript + Prisma (PostgreSQL). Berjalan di port `4000`, dikelola
PM2, path di server: `/var/www/fes-backend`.

## Struktur

```
src/
  server.ts        # entrypoint (listen + graceful shutdown)
  app.ts           # Express app + health checks
  lib/prisma.ts    # PrismaClient singleton
prisma/
  schema.prisma    # skema database
  migrations/      # migrasi SQL (di-apply dengan `prisma migrate deploy`)
```

## Setup lokal

```bash
npm install
cp .env.example .env      # isi DATABASE_URL & PORT
npm run prisma:generate   # generate Prisma Client
npm run dev               # jalankan (tsx watch) di http://localhost:4000
```

Health check:

- `GET /health` → `{ status: "ok" }`
- `GET /health/db` → cek koneksi database

## Database & migrasi

Skema mencakup domain **Menu Digital & Pemesanan**: `cafes`, `tables`,
`menu_categories`, `menu_items`, `orders`, `order_items`, `payments`
(multi-tenant via kolom `cafe_id`). Tabel auth (`users`) menyusul pada fase
Autentikasi & Multi-Tenant.

Daftar migrasi (urut):

| Migrasi | Isi |
| --- | --- |
| `20260724000000_init` | Seluruh tabel domain awal |
| `20260724010000_add_order_item_kitchen_status_index` | Index status masak (KDS) |
| `20260724020000_add_push_subscriptions` | Tabel langganan Web Push |
| `20260724030000_add_dashboard_preferences` | Preferensi widget dasbor |
| `20260724040000_add_users` | Tabel `users` + enum `Role` |
| `20260724050000_menu_management_constraints` | Index urutan/ketersediaan menu + **partial unique index** nama kategori & item |
| `20260724060000_table_management_constraints` | Index daftar meja + **partial unique index** nama meja per kafe |
| `20260724070000_add_order_payment_columns` | Kolom `orders.payment_method` & `orders.paid_at` (+ backfill dari `payments`) |

⚠️ Migrasi `..._menu_management_constraints` & `..._table_management_constraints`
memakai **partial unique index**
(`WHERE deleted_at IS NULL`) dengan ekspresi `lower(name)` — bentuk yang belum
bisa dinyatakan di `schema.prisma`. Akibatnya `prisma migrate dev` bisa
melaporkannya sebagai *drift* dan menawarkan `DROP INDEX`; **jangan diterima**,
karena index itulah yang mencegah dua kategori/item bernama sama dalam satu
kafe sekaligus tetap mengizinkan nama bekas hapusan dipakai lagi.

### Menerapkan migrasi

Mesin dev ini tidak menjalankan PostgreSQL, jadi migrasi **diterapkan di VPS**
(tempat PostgreSQL 16 lokal berada, db `kasir_cafe`):

```bash
# di VPS, pada /var/www/fes-backend
npm ci
npm run prisma:generate
npm run db:migrate:deploy   # prisma migrate deploy — apply migrasi yang belum jalan
```

Alternatif tanpa Prisma CLI (apply SQL langsung):

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260724000000_init/migration.sql
```

### Mengubah skema (dev, saat ada DB lokal)

```bash
npm run db:migrate:dev -- --name <nama_perubahan>
```

## Otorisasi & isolasi tenant

Pelanggan memesan lewat scan QR **tanpa akun**, jadi endpoint alur pelanggan
sengaja publik. Seluruh area staf/pemilik wajib membawa
`Authorization: Bearer <JWT>`.

| Endpoint | Akses |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Publik |
| `GET /api/cafes/:cafeId/menu`, `/categories`, `/menu-items` | Publik (menu digital) |
| `POST /api/cafes/:cafeId/orders` | Publik (pelanggan memesan) |
| `POST /api/cafes/:cafeId/orders/:id/pay` | Publik (bayar di meja) |
| `POST /api/payments/webhook` | Publik (callback gateway) |
| `GET /api/cafes/:cafeId/orders/:id/receipt` | Publik (struk pelanggan) |
| `GET /api/push/vapid-public-key`, `POST …/push-subscription` | Publik |
| `GET /api/tables/by-qr/:qrCode` | Publik (hasil pindai QR meja) |
| `GET /api/menus` | Login (tenant dari token) |
| `GET/PATCH /api/cafes/:cafeId/kitchen/*` | **DAPUR, OWNER** |
| `GET /api/cafes/:cafeId/dashboard/revenue`, `/top-menu` | **OWNER** |
| `GET/PUT /api/cafes/:cafeId/dashboard/preferences` | Login (preferensi milik sendiri) |
| `POST/PATCH/DELETE …/menu-items*`, `…/categories*` | **OWNER** (kelola menu) |
| `GET/POST/PATCH/DELETE /api/cafes/:cafeId/tables*` | **OWNER** (kelola meja & QR) |
| `GET /api/cafes/:cafeId/cashier/*` | **KASIR, OWNER** |

### Endpoint Fase 3

**Manajemen Menu (OWNER)** — `POST/PATCH/DELETE …/menu-items[/:id]`,
`PATCH …/menu-items/:id/availability` (sembunyikan/tampilkan),
`POST …/menu-items/:id/move` (pindah kategori),
`POST/PATCH/DELETE …/categories[/:id]`, `PUT …/categories/order` (urutan).

**Manajemen Meja & QR (OWNER)** — `GET/POST/PATCH/DELETE …/tables[/:id]`
(daftar berisi status `KOSONG`/`DIGUNAKAN` yang diturunkan dari pesanan
berjalan), `GET …/tables/:id/qr.png?size=` (gambar QR resolusi cetak).
Publik: `GET /api/tables/by-qr/:qrCode` untuk pelanggan yang memindai.

**Pembayaran di Kasir (KASIR/OWNER)** — `GET …/cashier/orders` (antrean FIFO),
`POST …/cashier/orders/:id/pay` (tunai/EDC + kembalian),
`GET …/cashier/orders/:id/receipt-data` (data struk 80mm).

Seluruh jalur pembayaran — bayar di meja, kasir, dan callback gateway —
melewati **satu gerbang rilis** (`services/release.service.ts`): pesanan tanpa
pembayaran `SUCCESS` tidak pernah masuk dapur, dan panggilan ulang tidak
menggandakan tiket dapur.

Lapisan pengamanan pada rute terlindungi, berurutan:

1. `requireAuth` — verifikasi JWT, isi `req.auth` (tanpa query DB).
2. `requireRole(...)` — batasi peran (403).
3. `requireSameCafe` — `:cafeId` di URL harus sama dengan kafe pada token (403).
4. `attachUser` — muat pengguna dari DB; menolak sesi basi (user dihapus,
   pindah kafe, atau perannya berubah setelah token terbit).
5. `tenantScope` — jalankan permintaan dalam konteks tenant sehingga query
   Prisma pada model ber-tenant otomatis difilter `cafe_id`.

Urutan ini disengaja: penolakan 401/403 terjadi sebelum menyentuh database.

## Jalankan dengan PM2 (produksi)

```bash
npm run build
pm2 start dist/server.js --name fes-backend
```

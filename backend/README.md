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
| `20260726000000_tambah_payment_dua_jalur` | Kolom pembayaran dua jalur (Midtrans + manual) di `orders`, tabel `pembayaran_manual` |
| `20260810000000_add_doku_invoice_number` | Kolom `orders.doku_invoice_number` |
| `20260825000000_tambah_tenant_registrations` | Tabel `tenant_registrations` (+ CHECK status) |
| `20260829000000_tambah_order_queue_number` | Kolom `orders.queue_number` (nomor antrian harian) |
| `20260830000000_pengaturan_pembayaran` | Metode pembayaran per kafe, kredensial Midtrans per mode, audit log, idempotensi webhook |
| `20260831000000_tambah_status_dibatalkan` | Nilai enum `OrderStatus.DIBATALKAN` (berdiri sendiri — lihat catatan di bawah) |
| `20260831010000_kasir_pos_lengkap` | Kasir sebagai POS: `orders.table_id` boleh NULL (bawa pulang), kolom `fulfillment_type`, `order_source`, `kitchen_status` + cap waktunya, `customer_name`, `catatan`, jejak kasir/pembatalan, `idempotency_key`, dan index-nya |

⚠️ `20260831000000_tambah_status_dibatalkan` sengaja berdiri sendiri: PostgreSQL
melarang sebuah nilai enum DIPAKAI di dalam transaksi yang sama dengan yang
menambahkannya, dan Prisma menjalankan tiap berkas migrasi dalam satu
transaksi. Menggabungkannya dengan migrasi berikutnya akan gagal saat baris
`DIBATALKAN` ditulis. Naskah rollback migrasi POS ada di
`prisma/migrations/20260831010000_kasir_pos_lengkap/migration.down.sql`.

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
| `POST /api/public/daftar` | Publik (permintaan pendaftaran, maks 5×/jam per IP) |
| `POST /api/auth/login` | Publik |
| `POST /api/auth/register` | **Ditutup** — selalu 410 (lihat di bawah) |
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

### Pendaftaran kafe baru (butuh persetujuan admin)

Halaman `/daftar` **tidak lagi menerbitkan akun aktif**. Formulirnya mengirim
`POST /api/public/daftar` dengan body `{ nama_cafe, nama_pemilik, email, no_hp,
pesan? }`, dan yang tercipta hanya satu baris `tenant_registrations` berstatus
`baru` — tanpa `cafes`, tanpa `users`, tanpa token. Kuotanya 5 permintaan per
jam per IP (`middleware/rateLimit.ts`, hitungan di memori proses).

Kafe baru menjadi aktif setelah admin menindaklanjuti pendaftarnya dari panel
super admin, yang membaca tabel yang sama lewat koneksi terpisah — karena itu
kolomnya bernama `nama_bisnis` dan `jenis_aplikasi` (kontrak panel yang
melayani beberapa aplikasi), bukan `nama_cafe`. Statusnya berjalan
`baru` → `dihubungi` → `aktif`, atau `batal`.

Jalur lama sudah ditutup sampai ke akarnya: `authService.register` dan
`parseRegisterInput` dihapus, dan `POST /api/auth/register` hanya membalas 410
berisi penunjuk ke endpoint baru. Tidak ada lagi kode di backend yang bisa
membuat kafe atau akun dari permintaan publik.

### Endpoint Fase 3

**Manajemen Menu (OWNER)** — `POST/PATCH/DELETE …/menu-items[/:id]`,
`PATCH …/menu-items/:id/availability` (sembunyikan/tampilkan),
`POST …/menu-items/:id/move` (pindah kategori),
`POST/PATCH/DELETE …/categories[/:id]`, `PUT …/categories/order` (urutan).

**Manajemen Meja & QR (OWNER)** — `GET/POST/PATCH/DELETE …/tables[/:id]`
(daftar berisi status `KOSONG`/`DIGUNAKAN` yang diturunkan dari pesanan
berjalan), `GET …/tables/:id/qr.png?size=` (gambar QR resolusi cetak).
Publik: `GET /api/tables/by-qr/:qrCode` untuk pelanggan yang memindai.

**Layar Kasir / POS (KASIR/OWNER)** — semua di bawah `/api/cafes/:cafeId`:

| Endpoint | Guna |
| --- | --- |
| `GET …/cashier/orders?tab=&q=&fulfillmentType=&orderSource=&statusPembayaran=&limit=` | Daftar pesanan per tab. `tab` = `PERLU_KONFIRMASI` (bawaan) \| `SUDAH_DIBAYAR` \| `SEDANG_DIPROSES` \| `SELESAI` \| `SEMUA`. Tanpa parameter, jawabannya sama persis dengan versi lama endpoint ini. |
| `GET …/cashier/summary` | Angka kepala halaman: antrean per tahap + uang masuk hari ini (jam dinding kafe). |
| `GET …/cashier/tables` | Meja untuk pemilihan di POS: nama + keadaan (`TERSEDIA`/`TERISI`/`MENUNGGU_PEMBAYARAN`). Sengaja TANPA token QR — itu khusus OWNER. |
| `POST …/cashier/orders` | **Baru.** Kasir membuat pesanan sendiri sekaligus menagihnya. Wajib `idempotencyKey`; pesanan + pembayaran + tiket dapur ditulis dalam SATU transaksi. Body tidak pernah memuat harga. |
| `GET …/cashier/orders/:id` | Detail satu pesanan (isi modal rincian). |
| `POST …/cashier/orders/:id/batal` | **Baru.** Batalkan dengan `alasan` wajib. Pesanan yang sudah lunas ditolak (409) — pengembalian dana belum didukung. |
| `POST …/cashier/orders/:id/selesai` | **Baru.** "Diserahkan" — menutup pesanan & membebaskan mejanya. |
| `GET …/cashier/orders/:id/receipt-data` | Data struk 80mm (JSON). |

**Layar Dapur (DAPUR/OWNER)** — `GET …/kitchen/orders` (kini disaring per
`kitchen_status`, bukan status pesanan), `PATCH …/kitchen/items/:itemId`
(status masak satu baris), dan **baru** `PATCH …/kitchen/orders/:orderId/status`
untuk menggerakkan SATU TIKET (`QUEUED` → `PREPARING` → `READY`). Menutup
pesanan (`COMPLETED`) sengaja tidak bisa dari sini — itu milik kasir.

Menandai pesanan yang SUDAH ADA menjadi lunas tetap hanya lewat
`POST /api/pembayaran/manual` (manual) dan `/api/pembayaran/midtrans/*`
(gateway); tidak ada endpoint `/pay` di area kasir.

**Lima status yang terpisah** pada setiap respons pesanan — memakai satu kolom
untuk semuanya adalah persis kekeliruan yang dibongkar modul ini:

| Bidang | Nilai |
| --- | --- |
| `statusPesanan` (turunan) | `AWAITING_PAYMENT` \| `AWAITING_CASHIER` \| `CONFIRMED` \| `COMPLETED` \| `CANCELLED` |
| `statusPembayaran` | `UNPAID` \| `AWAITING_VERIFICATION` \| `PAID` \| `FAILED` \| `EXPIRED` \| `CANCELLED` \| `REFUNDED` \| `PARTIALLY_REFUNDED` |
| `kitchenStatus` | `NOT_SENT` \| `QUEUED` \| `PREPARING` \| `READY` \| `COMPLETED` |
| `fulfillmentType` | `DINE_IN` \| `TAKEAWAY` |
| `orderSource` | `TABLE_QR` \| `CASHIER` |

`status` (enum lama) tetap dikirim demi klien lama; `tableId`/`tableName` kini
bisa `null` pada pesanan bawa pulang.

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

### Kanal pembayaran Midtrans (`enabled_payments`)

Snap hanya menampilkan kanal yang disebut pada `enabled_payments`. Nilai yang
salah eja **tidak** menimbulkan galat — Midtrans mengabaikannya diam-diam, dan
kanalnya sekadar hilang dari halaman bayar. Karena itu daftarnya disusun
`src/lib/midtransChannels.ts`, yang memvalidasi setiap nilai terhadap katalog
identifier resmi sebelum dikirim.

| Metode | Identifier Snap | Sering dikira |
| --- | --- | --- |
| QRIS **dinamis** Midtrans | `other_qris` | ~~`qris`~~, ~~`QRIS`~~, ~~`qris_dynamic`~~ |
| GoPay | `gopay` | — |
| OVO / DANA | `other_qris` (dipindai dari QRIS yang sama) | ~~`ovo`~~, ~~`dana`~~ |
| BCA Virtual Account | `bca_va` | — |
| BNI Virtual Account | `bni_va` | — |
| Mandiri Bill Payment | `echannel` | ~~`mandiri_bill`~~ |

`other_qris` adalah satu-satunya yang membuat QR muncul di Snap pada layar HP.
Tanpa nilai itu Midtrans menyembunyikan QRIS di perangkat mobile; di desktop
kekeliruannya tidak terlihat karena GoPay di layar lebar digambar sebagai QR.

QRIS **statis** kafe (`QRIS_STATIS`) sama sekali bukan bagian dari daftar ini:
QR-nya milik kafe, tidak pernah melewati Snap, dan pembayarannya selalu
menunggu kasir.

Katalog bawaan berlaku untuk semua kafe. Ubah dengan
`MIDTRANS_ENABLED_PAYMENTS` di `.env` bila kanal yang ditawarkan perlu berbeda
di server ini (lihat `.env.example`). Kanal yang belum aktif di akun Midtrans
sebuah kafe tidak perlu dihilangkan — Snap hanya menampilkan yang memang aktif.

## Jalankan dengan PM2 (produksi)

```bash
npm run build
pm2 start dist/server.js --name fes-backend
```

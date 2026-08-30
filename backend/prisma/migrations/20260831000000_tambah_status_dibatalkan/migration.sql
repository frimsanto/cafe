-- Tambah nilai `DIBATALKAN` ke enum OrderStatus.
--
-- BERDIRI SENDIRI, terpisah dari migrasi berikutnya, karena PostgreSQL melarang
-- sebuah nilai enum DIPAKAI di dalam transaksi yang sama dengan yang
-- menambahkannya. Prisma menjalankan tiap berkas migrasi dalam satu transaksi,
-- jadi memisahkannya ke berkas sendiri adalah satu-satunya cara migrasi
-- berikutnya boleh menulis 'DIBATALKAN'.
--
-- ADITIF & AMAN: tidak ada baris yang disentuh, tidak ada kolom yang hilang.
-- Rollback: nilai enum tidak bisa dicabut PostgreSQL, tetapi membiarkannya ada
-- tidak berpengaruh apa pun pada versi kode lama — tidak ada baris yang
-- memakainya sampai kode baru dipasang.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DIBATALKAN';

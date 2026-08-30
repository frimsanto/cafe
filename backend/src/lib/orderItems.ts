import type { Prisma } from '@prisma/client';

/**
 * Relasi item pesanan dengan urutan yang PASTI SAMA di setiap pembacaan.
 *
 * Tanpa `orderBy`, PostgreSQL bebas mengembalikan baris dalam urutan apa pun —
 * dan setelah sebuah baris di-UPDATE, versi barunya ditulis di ujung heap
 * sehingga muncul PALING AKHIR pada pembacaan berikutnya. Di Layar Dapur itulah
 * yang tampak seperti bug tombol: chef menekan "Dimasak" pada item pertama,
 * balasan server memindahkan item itu ke urutan terakhir, dan layar terlihat
 * seolah item KEDUA yang berubah — padahal daftarnya yang bergeser.
 *
 * `createdAt` sama untuk seluruh item satu pesanan (dibuat dalam satu
 * transaksi, dan `now()` PostgreSQL adalah waktu MULAI transaksi), jadi `id`
 * yang menjadi penentu sebenarnya. Yang penting bukan urutannya "cantik",
 * melainkan tidak pernah berubah-ubah.
 */
export const ITEM_TERURUT = {
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
} satisfies { orderBy: Prisma.OrderItemOrderByWithRelationInput[] };

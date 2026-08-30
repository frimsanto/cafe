/**
 * Menjaga urutan item pesanan tetap sama di layar.
 *
 * Server mengirim pesanan versi terbarunya utuh setiap kali status masak
 * berubah. Bila urutan item pada balasan itu berbeda dari yang sedang tampil,
 * daftar akan bergeser tepat pada saat chef menyentuhnya — terlihat persis
 * seperti "tombol item pertama malah mengubah item kedua", padahal item yang
 * benar yang berubah, hanya posisinya yang pindah.
 *
 * Akarnya sudah diperbaiki di backend (item dibaca dengan `orderBy` tetap).
 * Penyelaras di sini adalah lapisan kedua: layar tidak pernah mengocok
 * daftarnya sendiri, bahkan bila suatu saat server mengirim urutan lain.
 */

/** Susun `sesudah` mengikuti urutan `sebelum` (dicocokkan lewat id item). */
export function samakanUrutanItem<T extends { id: string }>(
  sebelum: readonly T[],
  sesudah: readonly T[],
): T[] {
  if (sebelum.length === 0) return [...sesudah];

  const peringkat = new Map(sebelum.map((item, index) => [item.id, index]));
  // Item yang belum pernah terlihat ditaruh di belakang, urutan aslinya utuh
  // (Array.prototype.sort di JS modern bersifat stabil).
  const TERAKHIR = Number.MAX_SAFE_INTEGER;

  return [...sesudah].sort(
    (a, b) => (peringkat.get(a.id) ?? TERAKHIR) - (peringkat.get(b.id) ?? TERAKHIR),
  );
}

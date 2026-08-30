// Kosakata TUNGGAL untuk absensi, shift kasir, jadwal, penggantian, dan
// pergerakan kas.
//
// Mengikuti pola yang sudah dipakai `orderStatus.ts` dan `paymentStatus.ts`:
// nilainya disimpan di kolom TEKS, bukan enum PostgreSQL, dan validasinya ada
// di sini. Alasannya sama persis — menambah satu status baru (mis. `CUTI`)
// tidak boleh menuntut `ALTER TYPE` yang mengunci tabel pada database yang
// sedang dipakai berjualan. Konsekuensinya juga sama: SETIAP pembacaan
// melewati fungsi normalisasi, sehingga nilai tak dikenal jatuh ke keadaan
// paling aman alih-alih menjatuhkan layar yang sedang dipakai bekerja.

// ── Absensi ──────────────────────────────────────────────────────────────────

/**
 * Status kehadiran seorang staf pada satu jadwal.
 *
 * Dua kelompok yang sengaja hidup di satu daftar:
 *   - Yang DITURUNKAN dari fakta: PRESENT, LATE, OVERTIME, EARLY_LEAVE,
 *     COMPLETED. Sistem yang menetapkannya dari perbandingan jam.
 *   - Yang DINYATAKAN manusia: PERMISSION, SICK, ABSENT, REPLACED. Pemilik
 *     yang menetapkannya, dan tidak ada perhitungan jam yang bisa menebaknya.
 *
 * Keduanya disatukan karena pertanyaan pemilik hanya satu — "hari itu Budi
 * kenapa?" — dan jawabannya harus berupa satu kata, bukan dua kolom yang harus
 * dibaca bersamaan.
 */
export const STATUS_ABSENSI = [
  /** Dijadwalkan, belum ada kabar. Keadaan awal setiap penugasan. */
  'SCHEDULED',
  /** Hadir tepat waktu (masih di dalam toleransi). */
  'PRESENT',
  /** Hadir melewati batas toleransi. */
  'LATE',
  /** Izin, disetujui pemilik. */
  'PERMISSION',
  'SICK',
  /** Tidak hadir tanpa kabar. */
  'ABSENT',
  /** Digantikan orang lain — lihat `shift_replacements` untuk siapa. */
  'REPLACED',
  /** Pulang melewati jam selesai. */
  'OVERTIME',
  /** Pulang sebelum jam selesai. */
  'EARLY_LEAVE',
  /** Sudah absen masuk DAN pulang, tanpa catatan khusus. */
  'COMPLETED',
] as const;

export type StatusAbsensi = (typeof STATUS_ABSENSI)[number];

export const STATUS_ABSENSI_LABEL: Record<StatusAbsensi, string> = {
  SCHEDULED: 'Dijadwalkan',
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  PERMISSION: 'Izin',
  SICK: 'Sakit',
  ABSENT: 'Tidak Hadir',
  REPLACED: 'Digantikan',
  OVERTIME: 'Lembur',
  EARLY_LEAVE: 'Pulang Awal',
  COMPLETED: 'Selesai',
};

export function isStatusAbsensi(nilai: unknown): nilai is StatusAbsensi {
  return typeof nilai === 'string' && (STATUS_ABSENSI as readonly string[]).includes(nilai);
}

/** Nilai tak dikenal → `SCHEDULED`: anggapan paling netral, belum ada klaim. */
export function normalisasiStatusAbsensi(nilai: string | null | undefined): StatusAbsensi {
  return isStatusAbsensi(nilai) ? nilai : 'SCHEDULED';
}

/** Status yang berarti orangnya BENAR-BENAR bekerja hari itu. */
const HADIR = new Set<StatusAbsensi>([
  'PRESENT',
  'LATE',
  'OVERTIME',
  'EARLY_LEAVE',
  'COMPLETED',
]);

export function dianggapHadir(status: StatusAbsensi): boolean {
  return HADIR.has(status);
}

/** Status yang ditetapkan MANUSIA — tidak boleh ditimpa perhitungan jam. */
const DINYATAKAN_MANUSIA = new Set<StatusAbsensi>([
  'PERMISSION',
  'SICK',
  'ABSENT',
  'REPLACED',
]);

export function ditetapkanManusia(status: StatusAbsensi): boolean {
  return DINYATAKAN_MANUSIA.has(status);
}

/**
 * Status masuk berdasarkan keterlambatan.
 *
 * `toleransi` inklusif: datang tepat pada menit terakhir toleransi masih
 * dihitung tepat waktu. Batas yang eksklusif akan membuat seorang staf yang
 * datang persis pada batas yang diumumkan pemiliknya tercatat terlambat —
 * aturan yang tidak bisa dijelaskan kepada orang yang menaatinya.
 */
export function statusMasuk(terlambatMenit: number, toleransiMenit: number): StatusAbsensi {
  return terlambatMenit > toleransiMenit ? 'LATE' : 'PRESENT';
}

/**
 * Status akhir setelah absen pulang.
 *
 * Lembur dan pulang-awal MENGGANTIKAN `PRESENT`, tapi TIDAK menggantikan
 * `LATE`: seseorang yang datang terlambat lalu pulang lembur tetap terlambat,
 * dan menghapus fakta itu karena ia menebusnya di akhir hari akan membuat
 * laporan kedisiplinan berhenti berguna. Menitnya tetap tercatat terpisah di
 * `attendance_records.lembur_menit`.
 */
export function statusPulang(
  statusSaatMasuk: StatusAbsensi,
  lemburMenit: number,
  pulangAwalMenit: number,
  ambangMenit = 15,
): StatusAbsensi {
  if (statusSaatMasuk === 'LATE') return 'LATE';
  if (lemburMenit >= ambangMenit) return 'OVERTIME';
  if (pulangAwalMenit >= ambangMenit) return 'EARLY_LEAVE';
  return 'COMPLETED';
}

// ── Shift kasir ──────────────────────────────────────────────────────────────

export const STATUS_SHIFT = ['AKTIF', 'DITUTUP'] as const;
export type StatusShift = (typeof STATUS_SHIFT)[number];

export const STATUS_SHIFT_LABEL: Record<StatusShift, string> = {
  AKTIF: 'Sedang Berjalan',
  DITUTUP: 'Ditutup',
};

export function isStatusShift(nilai: unknown): nilai is StatusShift {
  return typeof nilai === 'string' && (STATUS_SHIFT as readonly string[]).includes(nilai);
}

/**
 * Nilai tak dikenal → `DITUTUP`.
 *
 * Sengaja memilih yang PALING MEMBATASI, berlawanan dengan kebiasaan
 * "normalisasi ke keadaan awal". Shift dengan status rusak yang dibaca sebagai
 * `AKTIF` akan mengizinkan penerimaan uang atas nama laci yang tidak jelas
 * keadaannya; dibaca sebagai `DITUTUP`, yang terjadi hanyalah kasir diminta
 * membuka shift lagi.
 */
export function normalisasiStatusShift(nilai: string | null | undefined): StatusShift {
  return isStatusShift(nilai) ? nilai : 'DITUTUP';
}

// ── Jadwal ───────────────────────────────────────────────────────────────────

export const STATUS_JADWAL = ['DIJADWALKAN', 'DIBATALKAN'] as const;
export type StatusJadwal = (typeof STATUS_JADWAL)[number];

export function normalisasiStatusJadwal(nilai: string | null | undefined): StatusJadwal {
  return nilai === 'DIBATALKAN' ? 'DIBATALKAN' : 'DIJADWALKAN';
}

// ── Penggantian petugas ──────────────────────────────────────────────────────

export const STATUS_PENGGANTIAN = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
] as const;

export type StatusPenggantian = (typeof STATUS_PENGGANTIAN)[number];

export const STATUS_PENGGANTIAN_LABEL: Record<StatusPenggantian, string> = {
  PENDING_APPROVAL: 'Menunggu Persetujuan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export function isStatusPenggantian(nilai: unknown): nilai is StatusPenggantian {
  return (
    typeof nilai === 'string' && (STATUS_PENGGANTIAN as readonly string[]).includes(nilai)
  );
}

/** Nilai tak dikenal → `PENDING_APPROVAL`: belum ada yang menyetujui apa pun. */
export function normalisasiStatusPenggantian(
  nilai: string | null | undefined,
): StatusPenggantian {
  return isStatusPenggantian(nilai) ? nilai : 'PENDING_APPROVAL';
}

// ── Pergerakan kas ───────────────────────────────────────────────────────────

export const JENIS_KAS = ['MASUK', 'KELUAR'] as const;
export type JenisKas = (typeof JENIS_KAS)[number];

export const JENIS_KAS_LABEL: Record<JenisKas, string> = {
  MASUK: 'Uang Masuk',
  KELUAR: 'Uang Keluar',
};

export function isJenisKas(nilai: unknown): nilai is JenisKas {
  return typeof nilai === 'string' && (JENIS_KAS as readonly string[]).includes(nilai);
}

// ── Foto absensi ─────────────────────────────────────────────────────────────

export const JENIS_FOTO = ['MASUK', 'KELUAR'] as const;
export type JenisFoto = (typeof JENIS_FOTO)[number];

export function isJenisFoto(nilai: unknown): nilai is JenisFoto {
  return typeof nilai === 'string' && (JENIS_FOTO as readonly string[]).includes(nilai);
}

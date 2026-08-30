// Waktu menurut KAFE, bukan menurut server.
//
// Sebelum berkas ini ada, setiap perhitungan tanggal di CafeOS memakai waktu
// lokal proses Node (`lib/period.ts`: `setHours`, `getDay`). Itu diam-diam
// benar selama server dan kafe kebetulan berada di zona yang sama — dan
// diam-diam salah pada dua hal yang justru paling sering ditanyakan pemilik:
//
//   1. "Omzet hari ini berapa?" untuk kafe yang tutup pukul 02:00. Penjualan
//      pukul 01:30 masuk ke tanggal berikutnya menurut kalender, padahal
//      kasirnya baru akan menutup laci setengah jam lagi — dan uang yang
//      dihitungnya malam itu berakhir terbelah di dua hari laporan.
//   2. Shift malam 22:00-06:00. Menghitungnya dengan tanggal kalender membuat
//      "jam pulang" selalu tampak lebih awal daripada "jam masuk".
//
// Keduanya bermuara pada satu konsep: HARI OPERASIONAL (business day). Bukan
// hari kalender, melainkan rentang antara dua kali kasir menutup hari. Kafe
// menentukan sendiri kapan pergantiannya lewat `cafes.awal_hari_operasional`.
//
// ── Tanpa pustaka zona waktu ──
//
// Semua perhitungan memakai `Intl.DateTimeFormat`, yang membawa basis data
// zona waktu IANA milik Node — jadi tidak ada dependensi baru, dan tidak ada
// tabel offset yang harus diperbarui sendiri saat sebuah negara mengubah
// aturannya. Yang perlu diperhatikan hanya satu: offset sebuah zona BERUBAH
// sepanjang tahun (DST), sehingga ia harus selalu dihitung terhadap satu
// INSTANT tertentu — tidak pernah dianggap tetap. Asia/Jakarta memang tidak
// mengenal DST, tapi menulis kode yang hanya benar untuk satu zona adalah
// jebakan yang menunggu kafe pertama di zona lain.

/** Zona waktu bawaan bila kafe belum menyetelnya. */
export const ZONA_BAWAAN = 'Asia/Jakarta';

/** Bagian-bagian waktu dinding pada sebuah zona. */
export interface BagianWaktu {
  tahun: number;
  bulan: number;
  hari: number;
  jam: number;
  menit: number;
  detik: number;
}

/** Pengaturan waktu sebuah kafe — persis kolom yang disimpan di `cafes`. */
export interface PengaturanWaktu {
  timezone: string;
  /** Menit dari tengah malam tempat hari operasional berganti (0-1439). */
  awalHariOperasional: number;
  /** Awal minggu ISO 1-7 (1 = Senin). */
  awalMinggu?: number;
}

const CACHE_FORMATTER = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = CACHE_FORMATTER.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      // `hourCycle: 'h23'` penting: tanpa itu tengah malam bisa terbaca sebagai
      // jam "24" pada sebagian runtime, dan seluruh aritmetika bergeser sehari.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    CACHE_FORMATTER.set(timezone, f);
  }
  return f;
}

/**
 * Apakah sebuah nama zona dikenal runtime ini.
 *
 * Dipakai validasi pengaturan: zona yang salah ketik tidak boleh tersimpan lalu
 * menjatuhkan setiap laporan sesudahnya.
 */
export function zonaValid(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Zona yang aman dipakai — jatuh ke bawaan bila tidak dikenal. */
export function zonaAman(timezone: string | null | undefined): string {
  if (!timezone || !zonaValid(timezone)) return ZONA_BAWAAN;
  return timezone;
}

/** Pecah sebuah instant menjadi waktu dinding pada zona tertentu. */
export function bagianWaktu(instant: Date, timezone: string): BagianWaktu {
  const bagian = formatter(zonaAman(timezone)).formatToParts(instant);
  const ambil = (jenis: string): number => {
    const p = bagian.find((b) => b.type === jenis);
    return p ? Number(p.value) : 0;
  };
  return {
    tahun: ambil('year'),
    bulan: ambil('month'),
    hari: ambil('day'),
    jam: ambil('hour'),
    menit: ambil('minute'),
    detik: ambil('second'),
  };
}

/** Offset zona (menit) yang berlaku PADA instant tertentu. Positif = timur UTC. */
function offsetMenit(instant: Date, timezone: string): number {
  const b = bagianWaktu(instant, timezone);
  const sebagaiUtc = Date.UTC(b.tahun, b.bulan - 1, b.hari, b.jam, b.menit, b.detik);
  // Dibulatkan ke menit: `instant` bisa membawa milidetik yang tidak ikut
  // terbaca `formatToParts`, dan sisa itu akan tampak sebagai offset ganjil.
  return Math.round((sebagaiUtc - instant.getTime()) / 60_000);
}

/**
 * Waktu dinding pada sebuah zona → instant UTC.
 *
 * Dihitung dua langkah, dan langkah keduanya bukan kehati-hatian berlebihan:
 * offset harus diukur pada instant yang BENAR, sementara instant yang benar
 * baru diketahui setelah offsetnya dipakai. Tebakan pertama memakai offset di
 * sekitar waktu itu, lalu hasilnya diukur ulang — yang menyelesaikan kasus
 * ketika waktu yang diminta berada di seberang pergantian DST.
 */
export function dariWaktuLokal(
  tahun: number,
  bulan: number,
  hari: number,
  jam: number,
  menit: number,
  timezone: string,
): Date {
  const tz = zonaAman(timezone);
  const sebagaiUtc = Date.UTC(tahun, bulan - 1, hari, jam, menit);
  const tebakan = new Date(sebagaiUtc - offsetMenit(new Date(sebagaiUtc), tz) * 60_000);
  return new Date(sebagaiUtc - offsetMenit(tebakan, tz) * 60_000);
}

/** Tanggal KALENDER kafe sebagai `YYYY-MM-DD`. */
export function kunciTanggal(instant: Date, timezone: string): string {
  const b = bagianWaktu(instant, timezone);
  return `${b.tahun}-${String(b.bulan).padStart(2, '0')}-${String(b.hari).padStart(2, '0')}`;
}

/** Menit sejak tengah malam pada zona kafe (0-1439). */
export function menitDalamHari(instant: Date, timezone: string): number {
  const b = bagianWaktu(instant, timezone);
  return b.jam * 60 + b.menit;
}

/** Hari dalam minggu menurut ISO: 1 = Senin … 7 = Minggu. */
export function hariISO(instant: Date, timezone: string): number {
  const b = bagianWaktu(instant, timezone);
  // `Date.UTC` dipakai sebagai kalender murni di sini — bagiannya sudah waktu
  // dinding kafe, jadi tidak ada zona yang ikut terbawa lagi.
  const hariJs = new Date(Date.UTC(b.tahun, b.bulan - 1, b.hari)).getUTCDay();
  return hariJs === 0 ? 7 : hariJs;
}

// ── Hari operasional ─────────────────────────────────────────────────────────

/** Rentang waktu setengah terbuka: `[mulai, selesai)`. */
export interface Rentang {
  mulai: Date;
  selesai: Date;
}

/**
 * HARI OPERASIONAL tempat sebuah instant jatuh, sebagai `YYYY-MM-DD`.
 *
 * Untuk kafe dengan `awalHariOperasional = 300` (05:00), penjualan pukul 02:00
 * tanggal 6 masih termasuk hari operasional tanggal 5 — karena kasir yang
 * menerimanya belum menutup laci. Inilah satu-satunya definisi "hari" yang
 * dipakai seluruh laporan.
 */
export function kunciHariOperasional(instant: Date, p: PengaturanWaktu): string {
  const tz = zonaAman(p.timezone);
  const awal = batasiMenitHari(p.awalHariOperasional);
  if (menitDalamHari(instant, tz) >= awal) return kunciTanggal(instant, tz);

  // Masih sebelum pergantian → hari operasionalnya adalah tanggal KEMARIN.
  const b = bagianWaktu(instant, tz);
  const kemarin = new Date(Date.UTC(b.tahun, b.bulan - 1, b.hari - 1));
  return `${kemarin.getUTCFullYear()}-${String(kemarin.getUTCMonth() + 1).padStart(2, '0')}-${String(kemarin.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Rentang UTC sebuah hari operasional — inilah yang masuk ke `WHERE` query.
 *
 * Setengah terbuka `[mulai, selesai)` supaya dua hari berurutan tidak pernah
 * sama-sama mengklaim satu transaksi yang jatuh persis di detik pergantian.
 */
export function rentangHariOperasional(kunci: string, p: PengaturanWaktu): Rentang {
  const tz = zonaAman(p.timezone);
  const awal = batasiMenitHari(p.awalHariOperasional);
  const [tahun, bulan, hari] = kunci.split('-').map(Number);

  const mulai = dariWaktuLokal(tahun, bulan, hari, 0, awal, tz);
  // Hari berikutnya dihitung lewat kalender UTC murni supaya pergantian bulan
  // dan tahun terurus sendiri, lalu diterjemahkan kembali ke zona kafe.
  const besok = new Date(Date.UTC(tahun, bulan - 1, hari + 1));
  const selesai = dariWaktuLokal(
    besok.getUTCFullYear(),
    besok.getUTCMonth() + 1,
    besok.getUTCDate(),
    0,
    awal,
    tz,
  );
  return { mulai, selesai };
}

/**
 * Geser sebuah kunci tanggal `YYYY-MM-DD` sebanyak `hari` (boleh negatif).
 *
 * Lewat kalender UTC murni: pergantian bulan, tahun, dan tahun kabisat diurus
 * `Date` sendiri. Tidak ada zona waktu yang terlibat — yang digeser adalah
 * label tanggalnya, bukan sebuah instant.
 */
export function geserKunci(kunci: string, hari: number): string {
  const [tahun, bulan, tanggal] = kunci.split('-').map(Number);
  const d = new Date(Date.UTC(tahun, bulan - 1, tanggal + hari));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Rentang yang menampung `jumlah` hari operasional dan berakhir di `kunciAkhir`. */
export function rentangBeberapaHari(
  kunciAkhir: string,
  jumlah: number,
  p: PengaturanWaktu,
): Rentang {
  const kunciAwal = geserKunci(kunciAkhir, -(Math.max(1, jumlah) - 1));
  return {
    mulai: rentangHariOperasional(kunciAwal, p).mulai,
    selesai: rentangHariOperasional(kunciAkhir, p).selesai,
  };
}

/** Deret kunci hari operasional dari `kunciAwal` sampai `kunciAkhir` (inklusif). */
export function deretHari(kunciAwal: string, kunciAkhir: string): string[] {
  const hasil: string[] = [];
  let kunci = kunciAwal;
  // Dibatasi supaya rentang yang terbalik (akhir < awal) atau salah ketik tidak
  // pernah menjadi perulangan tak berujung yang membekukan permintaan.
  for (let i = 0; i < 3660 && kunci <= kunciAkhir; i += 1) {
    hasil.push(kunci);
    kunci = geserKunci(kunci, 1);
  }
  return hasil;
}

/** Batasi sebuah nilai menit ke rentang sah dalam sehari (0-1439). */
function batasiMenitHari(menit: number | null | undefined): number {
  if (typeof menit !== 'number' || !Number.isFinite(menit)) return 0;
  const bulat = Math.trunc(menit);
  if (bulat < 0) return 0;
  if (bulat > 1439) return 1439;
  return bulat;
}

// ── Jadwal shift ─────────────────────────────────────────────────────────────

/** Bentuk minimal sebuah template shift yang dibutuhkan perhitungan waktu. */
export interface JadwalShift {
  menitMulai: number;
  menitSelesai: number;
  lewatTengahMalam: boolean;
}

/**
 * Instant mulai & selesai sebuah shift yang dijadwalkan pada `tanggal`.
 *
 * Shift yang melewati tengah malam berakhir pada TANGGAL BERIKUTNYA — di
 * sinilah satu-satunya tempat aturan itu ditulis, sehingga perhitungan
 * keterlambatan, lembur, dan durasi kerja tidak perlu masing-masing
 * mengingatnya (dan tidak perlu masing-masing melupakannya).
 */
export function rentangShift(
  tanggal: string,
  shift: JadwalShift,
  timezone: string,
): Rentang {
  const tz = zonaAman(timezone);
  const [tahun, bulan, hari] = tanggal.split('-').map(Number);

  const mulai = dariWaktuLokal(tahun, bulan, hari, 0, shift.menitMulai, tz);

  const hariSelesai = shift.lewatTengahMalam ? hari + 1 : hari;
  const kalender = new Date(Date.UTC(tahun, bulan - 1, hariSelesai));
  const selesai = dariWaktuLokal(
    kalender.getUTCFullYear(),
    kalender.getUTCMonth() + 1,
    kalender.getUTCDate(),
    0,
    shift.menitSelesai,
    tz,
  );

  return { mulai, selesai };
}

/** Selisih menit `b - a`, dibulatkan ke menit terdekat. */
export function selisihMenit(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** `menit` (0-1439) sebagai `HH:MM` — untuk ditampilkan, bukan disimpan. */
export function formatJam(menit: number): string {
  const bersih = batasiMenitHari(menit);
  return `${String(Math.floor(bersih / 60)).padStart(2, '0')}:${String(bersih % 60).padStart(2, '0')}`;
}

/** `HH:MM` → menit sejak tengah malam; `null` bila bentuknya salah. */
export function parseJam(teks: string): number | null {
  const cocok = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(teks.trim());
  if (!cocok) return null;
  return Number(cocok[1]) * 60 + Number(cocok[2]);
}

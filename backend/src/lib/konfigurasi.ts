import { accessSync, constants, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Konfigurasi yang harus BENAR sejak boot, bukan saat pertama dipakai.
 *
 * Dua hal di berkas ini punya sifat yang sama: kalau salah, gejalanya baru
 * muncul jauh dari penyebabnya. Direktori foto yang menunjuk ke dalam repository
 * baru ketahuan saat wajah karyawan ikut ter-commit; daftar origin yang salah
 * baru ketahuan saat kasir tidak bisa masuk pada pagi tersibuk. Karena itu
 * keduanya diperiksa saat proses dinyalakan, tempat kegagalannya masih bisa
 * dibaca orang yang menyalakannya.
 */

// ── Penyimpanan foto absensi ─────────────────────────────────────────────────

export interface KonfigurasiFoto {
  /** Jalur absolut direktori penyimpanan. */
  direktori: string;
  /** Berasal dari environment, atau jatuh ke bawaan pengembangan. */
  dariEnv: boolean;
}

function produksi(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Seberapa jauh ke atas `.git` dicari dari direktori kerja.
 *
 * Sengaja PENDEK, dan itu penting. Pencarian yang naik sampai akar disk akan
 * menemukan `.git` milik hal lain — direktori home yang dikelola sebagai repo
 * dotfiles adalah kebiasaan yang umum — lalu menyimpulkan bahwa SELURUH isi
 * home berada "di dalam aplikasi", dan menolak jalur yang sebenarnya sah dengan
 * pesan yang menuduh hal yang salah.
 *
 * Yang ingin dikenali hanyalah worktree aplikasi ini: `<repo>/backend` (satu
 * tingkat) atau `<repo>/apps/backend` (dua tingkat). Tiga sudah melampaui
 * keduanya.
 */
const KEDALAMAN_CARI_REPO = 3;

/**
 * Akar worktree aplikasi, bila prosesnya memang berjalan di dalam salah satu.
 *
 * Dipakai untuk satu hal saja: memastikan foto absensi TIDAK mendarat di dalam
 * worktree. Berkas di dalam worktree ikut terbawa `git add -A`, muncul di
 * `git status` sebagai berkas tak terlacak yang menggoda untuk ditambahkan, dan
 * ikut tersalin setiap kali seseorang menyalin folder proyek. Wajah karyawan
 * tidak boleh tinggal di tempat seperti itu.
 */
function akarRepo(mulai: string): string | null {
  let dir = path.resolve(mulai);
  for (let i = 0; i <= KEDALAMAN_CARI_REPO; i += 1) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const induk = path.dirname(dir);
    if (induk === dir) return null;
    dir = induk;
  }
  return null;
}

/** Apakah `anak` berada di dalam `induk` (atau sama dengannya). */
function beradaDiDalam(anak: string, induk: string): boolean {
  const relatif = path.relative(induk, anak);
  return relatif === '' || (!relatif.startsWith('..') && !path.isAbsolute(relatif));
}

/**
 * Tentukan & siapkan direktori foto absensi.
 *
 * Melempar di PRODUKSI bila jalurnya tidak aman. Itu disengaja: server yang
 * menolak menyala karena penyimpanannya salah jauh lebih baik daripada server
 * yang menyala lalu menumpuk foto di tempat yang tidak seorang pun kira.
 */
export function siapkanDirektoriFoto(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): KonfigurasiFoto {
  const dariEnv = typeof env.ATTENDANCE_PHOTO_DIR === 'string' && env.ATTENDANCE_PHOTO_DIR.trim() !== '';
  const direktori = dariEnv
    ? path.resolve(env.ATTENDANCE_PHOTO_DIR!.trim())
    : path.resolve(cwd, 'penyimpanan', 'absensi');

  if (produksi()) {
    if (!dariEnv) {
      throw new Error(
        'ATTENDANCE_PHOTO_DIR wajib diisi di produksi. Arahkan ke direktori privat ' +
          'DI LUAR folder aplikasi, mis. /var/lib/cafeos/absensi.',
      );
    }
    // Dua pagar, dan yang kedua bukan pengulangan yang pertama: penggelaran
    // produksi sering menyalin `dist/` TANPA `.git`, sehingga `akarRepo` tidak
    // menemukan apa pun — tapi direktori aplikasinya tetap tempat yang salah
    // untuk menyimpan wajah karyawan.
    const dilarang = [akarRepo(cwd), path.resolve(cwd)].filter(
      (d): d is string => d !== null,
    );
    for (const larangan of dilarang) {
      if (beradaDiDalam(direktori, larangan)) {
        throw new Error(
          `ATTENDANCE_PHOTO_DIR (${direktori}) berada di dalam folder aplikasi (${larangan}). ` +
            'Foto absensi adalah data pribadi dan tidak boleh tinggal di dalam worktree — ' +
            'pindahkan ke direktori privat di luarnya, mis. /var/lib/cafeos/absensi.',
        );
      }
    }
  }

  // Dibuat sekarang, bukan saat foto pertama diunggah: kegagalan izin tulis
  // harus terlihat di log boot, bukan sebagai absensi gagal di depan kasir.
  try {
    mkdirSync(direktori, { recursive: true, mode: 0o700 });
  } catch (err) {
    throw new Error(
      `Tidak bisa membuat direktori foto absensi (${direktori}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const info = statSync(direktori);
  if (!info.isDirectory()) {
    throw new Error(`ATTENDANCE_PHOTO_DIR (${direktori}) bukan direktori.`);
  }
  try {
    accessSync(direktori, constants.W_OK | constants.R_OK);
  } catch {
    throw new Error(
      `Direktori foto absensi (${direktori}) tidak bisa dibaca/ditulis oleh proses ini.`,
    );
  }

  return { direktori, dariEnv };
}

// ── Origin yang boleh membawa cookie ─────────────────────────────────────────

/** Origin pengembangan yang selalu diterima saat NODE_ENV bukan production. */
const ORIGIN_DEV = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://localhost:4000',
];

/** Normalkan sebuah URL menjadi origin (`skema://host[:port]`), atau null. */
export function keOrigin(nilai: string | undefined | null): string | null {
  if (!nilai) return null;
  const bersih = nilai.trim().replace(/\/+$/, '');
  if (bersih === '') return null;
  try {
    return new URL(bersih).origin;
  } catch {
    return null;
  }
}

/**
 * Daftar origin yang boleh mengirim permintaan ber-cookie.
 *
 * ── Kenapa daftar, bukan `origin: true` ──
 *
 * `origin: true` memantulkan origin siapa pun yang bertanya, dan digabung
 * dengan `credentials: true` artinya SETIAP situs boleh memanggil API ini
 * dengan cookie pengguna terbawa. `SameSite=Strict` memang menutup sebagian
 * besar jalannya, tetapi menyandarkan seluruh pertahanan pada satu atribut
 * cookie berarti tidak punya lapis kedua ketika ada peramban yang
 * memperlakukannya berbeda, atau ketika kelak sebuah cookie dipasang dengan
 * atribut yang lebih longgar tanpa disadari.
 *
 * Sumbernya, berurutan: `CORS_ORIGINS` (dipisah koma), lalu `PUBLIC_APP_URL`
 * dan `PUBLIC_API_URL` — keduanya sudah wajib diisi di produksi untuk keperluan
 * lain, sehingga penggelaran yang benar tidak perlu variabel tambahan.
 */
export function daftarOriginDiizinkan(env: NodeJS.ProcessEnv = process.env): string[] {
  const kumpulan = new Set<string>();

  for (const bagian of (env.CORS_ORIGINS ?? '').split(',')) {
    const origin = keOrigin(bagian);
    if (origin) kumpulan.add(origin);
  }
  for (const kunci of ['PUBLIC_APP_URL', 'PUBLIC_API_URL'] as const) {
    const origin = keOrigin(env[kunci]);
    if (origin) kumpulan.add(origin);
  }

  if (env.NODE_ENV !== 'production') {
    for (const origin of ORIGIN_DEV) kumpulan.add(origin);
  }

  return [...kumpulan];
}

/**
 * Apakah sebuah origin boleh membawa cookie.
 *
 * Permintaan TANPA header Origin diterima: itu bukan permintaan lintas-situs
 * dari peramban melainkan panggilan server-ke-server (webhook Midtrans/DOKU),
 * `curl`, dan health check — yang memang tidak pernah membawa cookie peramban
 * siapa pun. Menolaknya akan mematikan webhook pembayaran.
 */
export function originDiizinkan(
  origin: string | undefined,
  daftar: string[] = daftarOriginDiizinkan(),
): boolean {
  if (!origin) return true;
  const normal = keOrigin(origin);
  return normal !== null && daftar.includes(normal);
}

// ── Reverse proxy ────────────────────────────────────────────────────────────

/**
 * Nilai `trust proxy` untuk Express — dan kenapa bawaannya MEMATIKAN.
 *
 * ── Masalahnya ──
 *
 * Di belakang Nginx, `req.socket.remoteAddress` selalu 127.0.0.1. Pembatas laju
 * yang memakainya berlaku global: satu pendaftar yang membanjiri formulir
 * memblokir semua orang. Godaannya lalu membaca `X-Forwarded-For` sendiri —
 * dan itu justru menukar satu masalah dengan yang jauh lebih buruk.
 *
 * `X-Forwarded-For` adalah header biasa. Kalau proxy-nya tidak MENIMPA atau
 * MENAMBAHKAN ke header itu, nilai yang sampai ke backend adalah nilai yang
 * diketik klien. Memercayainya berarti kuota bisa dilewati seumur hidup hanya
 * dengan mengarang IP baru di tiap permintaan — pembatas laju yang terlihat
 * bekerja padahal tidak menahan apa pun.
 *
 * ── Karena itu variabel ini ada ──
 *
 * `TRUST_PROXY` dinyalakan HANYA setelah Nginx benar-benar dikonfigurasi dengan
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, yang menambahkan
 * alamat peer sungguhan di UJUNG rantai. Express lalu berjalan dari kanan,
 * melewati hop yang dipercaya, dan berhenti di alamat sungguhan itu.
 *
 * Selama variabel ini tidak diisi, header apa pun diabaikan dan kuota berlaku
 * global. Itu memang lebih tumpul — tapi kuota tumpul yang benar-benar menahan
 * jauh lebih baik daripada kuota per-IP yang bisa dikarang siapa saja.
 *
 * Nilai: `loopback` (Nginx satu mesin — yang dipakai di produksi), sebuah
 * angka hop, daftar CIDR dipisah koma, atau kosong/`false` untuk mematikan.
 */
export function trustProxy(env: NodeJS.ProcessEnv = process.env): string | number | false {
  const mentah = (env.TRUST_PROXY ?? '').trim();
  if (mentah === '' || mentah.toLowerCase() === 'false' || mentah === '0') return false;

  // Angka murni = jumlah hop proxy yang dipercaya.
  if (/^[1-9][0-9]*$/.test(mentah)) return Number(mentah);

  return mentah;
}

/**
 * Direktori foto yang sedang berlaku, dihitung sekali lalu diingat.
 *
 * Dipakai `fotoAbsensi.service` supaya jalur yang dipakai MENULIS persis sama
 * dengan yang diperiksa saat boot. Dua tempat yang masing-masing membaca
 * `ATTENDANCE_PHOTO_DIR` sendiri akan tetap benar hari ini dan menyimpang pada
 * hari seseorang menambahkan normalisasi di salah satunya.
 */
let terhitung: string | null = null;

export function direktoriFoto(): string {
  if (terhitung === null) {
    terhitung = siapkanDirektoriFoto().direktori;
  }
  return terhitung;
}

/** Hanya untuk uji: lupakan hasil hitungan supaya env baru terbaca. */
export function lupakanDirektoriFoto(): void {
  terhitung = null;
}

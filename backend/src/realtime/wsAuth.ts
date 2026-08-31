import type { IncomingMessage } from 'node:http';
import { COOKIE_PERANGKAT, COOKIE_SESI_KASIR, bacaCookie } from '../lib/cookie';
import { verifyAccessToken, verifySesiKasir } from '../lib/jwt';
import { originDiizinkan } from '../lib/konfigurasi';
import { prisma } from '../lib/prisma';
import { deviceService } from '../services/device.service';
import type { AuthRole } from '../types/auth';

/**
 * Autentikasi handshake WebSocket.
 *
 * ── Kenapa daftar origin saja tidak cukup ──
 *
 * Versi sebelumnya menjaga `/ws` dengan satu hal: daftar origin. Itu menjawab
 * pertanyaan "halaman dari alamat mana yang boleh membuka koneksi", dan sama
 * sekali BUKAN jawaban atas "siapa yang membukanya, dan kafe mana miliknya".
 * Dua celah mengikutinya, dan keduanya nyata:
 *
 *   1. `Origin` hanya dikirim peramban. `curl`, skrip Node, dan Postman tidak
 *      mengirimnya sama sekali — dan koneksi tanpa Origin sengaja diterima
 *      (webhook, health check). Jadi siapa pun di internet yang tahu alamat
 *      server ini cukup TIDAK mengirim Origin untuk lolos.
 *   2. `cafeId` diambil dari query string. Bahkan seorang kasir sah dari kafe A
 *      — yang origin-nya jelas terdaftar — hanya perlu mengganti satu parameter
 *      URL untuk ikut mendengarkan seluruh aliran pesanan kafe B: rincian
 *      pesanan, nama tamu, dan angka omzet dasbornya.
 *
 * Yang memperbaikinya bukan daftar origin yang lebih ketat, melainkan
 * pergeseran sumber kebenaran: `cafeId` sebuah koneksi TIDAK PERNAH lagi datang
 * dari klien. Ia diturunkan dari sesi yang dibuktikan saat handshake — persis
 * aturan yang sudah dipakai jalur POS di `middleware/perangkat.ts`.
 *
 * Daftar origin tetap ada sebagai lapis pertama; ia sekarang pertahanan
 * tambahan, bukan satu-satunya.
 */

// ── Bentuk identitas ─────────────────────────────────────────────────────────

/**
 * Siapa yang memegang sebuah koneksi.
 *
 * `cafeId` ada di ketiga bentuk dan SELALU berasal dari sisi server: dari baris
 * `users` untuk staf, dari token perangkat untuk POS, dari baris `orders` untuk
 * tamu. Tidak ada satu pun yang membacanya dari input klien.
 */
export type IdentitasWs =
  | { jenis: 'staf'; cafeId: string; userId: string; role: AuthRole }
  | { jenis: 'pos'; cafeId: string; userId: string; deviceId: string }
  | { jenis: 'tamu'; cafeId: string; orderId: string };

export interface HandshakeSah {
  ok: true;
  identitas: IdentitasWs;
}

export interface HandshakeTolak {
  ok: false;
  /** Status HTTP yang dikirim saat handshake ditolak. */
  status: 401 | 403;
  /** Kode singkat untuk log — sengaja tidak dikirim mentah ke klien. */
  kode: 'ORIGIN' | 'TANPA_SESI' | 'SESI_HABIS' | 'PESANAN' | 'LINTAS_TENANT';
  pesan: string;
}

export type HasilHandshake = HandshakeSah | HandshakeTolak;

function tolak(
  status: 401 | 403,
  kode: HandshakeTolak['kode'],
  pesan: string,
): HandshakeTolak {
  return { ok: false, status, kode, pesan };
}

// ── Token staf lewat subprotokol ─────────────────────────────────────────────

/** Subprotokol wajib; menandai klien yang bicara dengan protokol versi ini. */
export const PROTOKOL_UTAMA = 'cafeos.v1';

/** Awalan subprotokol yang membawa token akses staf. */
const AWALAN_BEARER = 'bearer.';

/**
 * Token staf dibawa di `Sec-WebSocket-Protocol`, BUKAN di query string.
 *
 * API WebSocket peramban tidak mengizinkan header tambahan — satu-satunya
 * header yang bisa diisi halaman adalah daftar subprotokol. Itu menjadikannya
 * satu-satunya tempat yang benar untuk menaruh token, karena alternatifnya
 * (`?token=…`) berakhir tertulis lengkap di access log Nginx, di riwayat proxy,
 * dan di header `Referer` — tempat-tempat yang tidak pernah diperlakukan
 * sebagai rahasia dan tidak pernah ikut dirotasi.
 *
 * JWT aman sebagai nilai subprotokol: base64url hanya memakai `A-Za-z0-9-_`
 * dengan pemisah `.`, semuanya karakter token yang sah menurut RFC 6455/7230.
 */
function tokenStaf(req: IncomingMessage): string | null {
  const mentah = req.headers['sec-websocket-protocol'];
  if (!mentah) return null;
  const daftar = (Array.isArray(mentah) ? mentah.join(',') : mentah).split(',');

  for (const bagian of daftar) {
    const p = bagian.trim();
    if (!p.startsWith(AWALAN_BEARER)) continue;
    const token = p.slice(AWALAN_BEARER.length).trim();
    if (token) return token;
  }
  return null;
}

/** Ambil nilai query yang tidak kosong; null bila tidak ada. */
function bacaParam(url: URL, nama: string): string | null {
  const nilai = url.searchParams.get(nama);
  return nilai && nilai.trim() !== '' ? nilai.trim() : null;
}

/** URL handshake, dengan basis boneka supaya `req.url` yang relatif bisa diurai. */
export function urlHandshake(req: IncomingMessage): URL {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return new URL('http://localhost/ws');
  }
}

// ── Tiga jalur identitas ─────────────────────────────────────────────────────

/**
 * Staf yang login lewat email/sandi: OWNER (dasbor), KASIR (antrean), DAPUR (KDS).
 *
 * Tanda tangan token saja tidak cukup — sama seperti `attachUser` pada jalur
 * REST, barisnya dibaca ulang dari database. Token bersifat stateless dan
 * berumur 15 menit, jadi klaim di dalamnya bisa basi: staf sudah dinonaktifkan,
 * dipindah kafe, atau perannya diturunkan setelah token terbit. Sebuah koneksi
 * WebSocket hidup berjam-jam, sehingga memercayai klaim basi di sini jauh lebih
 * mahal daripada pada satu permintaan REST.
 */
async function identitasStaf(token: string): Promise<HasilHandshake> {
  const klaim = verifyAccessToken(token);
  if (!klaim) {
    return tolak(401, 'SESI_HABIS', 'Sesi tidak valid atau sudah kedaluwarsa');
  }

  const user = await prisma.user.findFirst({
    where: { id: klaim.userId, deletedAt: null },
    select: { id: true, cafeId: true, role: true, aktif: true },
  });

  if (!user || !user.aktif || user.cafeId !== klaim.cafeId || user.role !== klaim.role) {
    return tolak(401, 'SESI_HABIS', 'Sesi tidak berlaku lagi');
  }

  return {
    ok: true,
    identitas: {
      jenis: 'staf',
      cafeId: user.cafeId,
      userId: user.id,
      role: user.role as AuthRole,
    },
  };
}

/**
 * Terminal POS: token perangkat DAN sesi kasir, keduanya dari cookie HttpOnly.
 *
 * Syaratnya sama persis dengan `requirePerangkat` + `requireSesiKasir` pada
 * jalur REST, termasuk pencocokan `deviceId`/`cafeId` yang membuat cookie sesi
 * yang disalin ke terminal lain berhenti berlaku di sana. Menyamakannya
 * disengaja: satu terminal tidak boleh punya dua definisi "sesi sah" yang bisa
 * menyimpang pada hari salah satunya diperketat.
 */
async function identitasPos(
  tokenPerangkat: string,
  tokenSesi: string | null,
): Promise<HasilHandshake> {
  const perangkat = await deviceService.dariToken(tokenPerangkat);
  if (!perangkat) {
    return tolak(401, 'SESI_HABIS', 'Perangkat belum terdaftar atau sudah dicabut');
  }

  if (!tokenSesi) {
    return tolak(401, 'TANPA_SESI', 'Belum ada petugas yang masuk di terminal ini');
  }

  const sesi = verifySesiKasir(tokenSesi);
  if (!sesi) {
    return tolak(401, 'SESI_HABIS', 'Sesi petugas sudah berakhir');
  }
  if (sesi.deviceId !== perangkat.id || sesi.cafeId !== perangkat.cafeId) {
    return tolak(403, 'LINTAS_TENANT', 'Sesi ini bukan milik terminal yang dipakai');
  }

  return {
    ok: true,
    identitas: {
      jenis: 'pos',
      // Dari PERANGKAT, bukan dari sesi — keduanya sudah dipastikan sama di
      // atas, dan mengambilnya dari perangkat menjaga sumber kebenarannya satu.
      cafeId: perangkat.cafeId,
      userId: sesi.userId,
      deviceId: perangkat.id,
    },
  };
}

/**
 * Ponsel tamu di halaman status pesanan.
 *
 * ── Kenapa jalur ini ada padahal tamu tidak punya sesi ──
 *
 * Tamu memindai QR meja, memesan, lalu menonton pesanannya matang. Ia tidak
 * pernah punya akun, dan tidak akan pernah punya. Menolak SELURUH koneksi tanpa
 * sesi berarti mematikan halaman itu.
 *
 * Yang membuatnya tetap aman adalah penyempitan yang tidak bisa dilepas:
 *
 *   - `orderId` WAJIB, dan barisnya harus benar-benar ada.
 *   - `cafeId` diambil dari baris pesanan itu, bukan dari query.
 *   - Langganannya terkunci pada satu pesanan seumur koneksi; pesan `subscribe`
 *     yang mencoba melebarkannya ke seluruh kafe ditolak dan koneksinya ditutup.
 *
 * Hasilnya persis seluas yang SUDAH publik lewat REST:
 * `GET /api/pembayaran/:orderId/status` melayani siapa pun yang memegang id
 * pesanan, karena itulah yang di-polling halaman yang sama. Jadi jalur ini tidak
 * membuka apa pun yang belum terbuka — ia memberi jalan yang lebih hemat
 * daripada polling, dengan batas yang sama persis.
 */
async function identitasTamu(orderId: string): Promise<HasilHandshake> {
  let pesanan: { id: string; cafeId: string } | null = null;
  try {
    pesanan = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, cafeId: true },
    });
  } catch {
    // id yang bukan UUID membuat Prisma melempar sebelum sempat mencari.
    // Diperlakukan sama dengan pesanan yang tidak ada — penebak id tidak perlu
    // diberi tahu bahwa bentuk tebakannya sudah benar.
    pesanan = null;
  }

  if (!pesanan) {
    return tolak(401, 'PESANAN', 'Pesanan tidak ditemukan');
  }

  return {
    ok: true,
    identitas: { jenis: 'tamu', cafeId: pesanan.cafeId, orderId: pesanan.id },
  };
}

// ── Pintu masuk ──────────────────────────────────────────────────────────────

/**
 * Verifikasi sebuah handshake WebSocket.
 *
 * Urutannya menentukan: kredensial yang DINYATAKAN klien (subprotokol bearer)
 * menang atas cookie yang terbawa otomatis. Tanpa itu, tab Layar Dapur yang
 * kebetulan dibuka di peramban yang sama dengan terminal POS akan
 * teridentifikasi sebagai terminal — kafenya memang sama, jadi bukan kebocoran,
 * tapi identitas yang salah di log dan pada pemeriksaan berkala berikutnya.
 */
export async function verifikasiHandshake(
  req: IncomingMessage,
  origin: string | undefined,
): Promise<HasilHandshake> {
  if (!originDiizinkan(origin)) {
    return tolak(403, 'ORIGIN', 'Origin tidak diizinkan');
  }

  const url = urlHandshake(req);
  const hasil = await pilihIdentitas(req, url);
  if (!hasil.ok) return hasil;

  // `cafeId` di query TIDAK dipakai untuk apa pun — tapi kalau ada dan berbeda
  // dari kafe sesinya, itu bukan kekeliruan yang pantas diabaikan. Klien lama
  // mengirimnya sama dengan kafenya sendiri (dan tetap jalan); yang mengirim
  // kafe orang lain sedang mencoba menyeberang, dan pantas ditolak dengan jelas
  // alih-alih diam-diam dilayani kafenya sendiri.
  const cafeIdQuery = bacaParam(url, 'cafeId');
  if (cafeIdQuery !== null && cafeIdQuery !== hasil.identitas.cafeId) {
    return tolak(403, 'LINTAS_TENANT', 'Kafe pada permintaan bukan kafe sesimu');
  }

  return hasil;
}

async function pilihIdentitas(req: IncomingMessage, url: URL): Promise<HasilHandshake> {
  const bearer = tokenStaf(req);
  if (bearer) return identitasStaf(bearer);

  const tokenPerangkat = bacaCookie(req, COOKIE_PERANGKAT);
  if (tokenPerangkat) {
    return identitasPos(tokenPerangkat, bacaCookie(req, COOKIE_SESI_KASIR));
  }

  const orderId = bacaParam(url, 'orderId');
  if (orderId) return identitasTamu(orderId);

  return tolak(
    401,
    'TANPA_SESI',
    'Koneksi realtime membutuhkan sesi staf, terminal POS, atau id pesanan',
  );
}

/**
 * Apakah sebuah identitas MASIH sah — dipanggil berkala selama koneksi hidup.
 *
 * Handshake hanya membuktikan keadaan pada satu detik. Sesi kasir berumur 14 jam
 * dan sebuah tab dasbor bisa dibiarkan terbuka semalaman, jadi tanpa pemeriksaan
 * ulang, mencabut sebuah terminal atau menonaktifkan seorang staf TIDAK
 * menghentikan aliran pesanan yang sedang mereka terima — pencabutannya baru
 * berlaku saat koneksinya kebetulan putus sendiri.
 *
 * Tamu tidak diperiksa ulang: tidak ada yang bisa dicabut dari sebuah pesanan,
 * dan langganannya sudah terkunci pada satu baris.
 */
export async function masihSah(identitas: IdentitasWs): Promise<boolean> {
  if (identitas.jenis === 'tamu') return true;

  const user = await prisma.user.findFirst({
    where: { id: identitas.userId, deletedAt: null },
    select: { cafeId: true, aktif: true },
  });
  if (!user || !user.aktif || user.cafeId !== identitas.cafeId) return false;

  if (identitas.jenis === 'pos') {
    const perangkat = await prisma.cashierDevice.findFirst({
      where: {
        id: identitas.deviceId,
        cafeId: identitas.cafeId,
        aktif: true,
        dicabutPada: null,
      },
      select: { id: true },
    });
    if (!perangkat) return false;
  }

  return true;
}

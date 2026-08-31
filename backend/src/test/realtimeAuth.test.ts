import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan, type PrismaMock } from './prismaMock';

/**
 * Autentikasi handshake WebSocket & isolasi antar kafe.
 *
 * ── Apa yang sebenarnya diuji di sini ──
 *
 * Sebelum perbaikan ini, `/ws` dijaga satu hal saja: daftar origin. Itu
 * menjawab "halaman dari alamat mana yang boleh menyambung", bukan "siapa yang
 * menyambung, dan kafe mana miliknya" — dan `cafeId` diambil apa adanya dari
 * query string. Dua akibatnya nyata dan keduanya diuji di bawah: klien yang
 * tidak mengirim `Origin` sama sekali lolos begitu saja, dan kasir sah kafe A
 * cukup mengganti satu parameter URL untuk mendengarkan aliran pesanan kafe B.
 *
 * Uji dijalankan DI ATAS KABEL, bukan dengan memanggil fungsi verifikasi
 * langsung: yang harus benar bukan "fungsi mengembalikan false" melainkan
 * "server menolak handshake-nya", termasuk status HTTP dan kode penutupan yang
 * benar-benar terkirim.
 *
 * Prisma ditiru (lihat `vitest.config.ts`) — tidak ada database yang disentuh.
 */

const prisma: PrismaMock = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

const ORIGIN_SAH = 'http://localhost:5173';
const PROTOKOL = 'cafeos.v1';

const CAFE_A = '11111111-1111-4111-8111-111111111111';
const CAFE_B = '22222222-2222-4222-8222-222222222222';
const STAF_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAF_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TERMINAL_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PESANAN_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// Environment disiapkan SEBELUM modul dimuat: `lib/jwt` membaca `JWT_SECRET`
// saat dimuat, dan daftar origin dibaca saat aplikasinya dirakit.
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'rahasia-uji-realtime';
process.env.CORS_ORIGINS = ORIGIN_SAH;
process.env.ATTENDANCE_PHOTO_DIR = '';

const { createApp } = await import('../app');
const { realtime } = await import('../realtime/realtime');
const { signAccessToken, signSesiKasir } = await import('../lib/jwt');

let server: Server;
let alamatWs: string;

/** Soket yang dibuka sebuah uji, ditutup paksa setelahnya. */
const terbuka: WebSocket[] = [];

beforeAll(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  realtime.init(server);
  alamatWs = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  isiBawaan(prisma);
});

afterEach(() => {
  while (terbuka.length) terbuka.pop()?.terminate();
});

// ── Baris palsu ──────────────────────────────────────────────────────────────

function stafPalsu(ubah: Record<string, unknown> = {}) {
  return { id: STAF_A, cafeId: CAFE_A, role: 'OWNER', aktif: true, ...ubah };
}

/** Terminal terdaftar; token mentahnya di-hash persis seperti `device.service`. */
function daftarkanTerminal(token: string, ubah: Record<string, unknown> = {}) {
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const perangkat = {
    id: TERMINAL_A,
    cafeId: CAFE_A,
    label: 'Kasir Depan',
    tokenHash,
    aktif: true,
    dicabutPada: null,
    ...ubah,
  };
  prisma.cashierDevice.findUnique.mockImplementation(
    async (args: { where: { tokenHash?: string } }) =>
      args.where.tokenHash === tokenHash ? perangkat : null,
  );
  prisma.cashierDevice.findFirst.mockResolvedValue(perangkat);
  return perangkat;
}

// ── Pembuka koneksi ──────────────────────────────────────────────────────────

interface OpsiKoneksi {
  /** Query string lengkap, mis. `?orderId=…`. */
  query?: string;
  /** Token akses staf — dikirim sebagai subprotokol `bearer.<jwt>`. */
  token?: string;
  /** Header Cookie mentah (jalur terminal POS). */
  cookie?: string;
  /** `null` = jangan kirim header Origin sama sekali. */
  origin?: string | null;
}

type HasilKoneksi =
  | { ok: true; ws: WebSocket; pertama: Record<string, unknown> }
  | { ok: false; status: number };

/**
 * Buka satu koneksi dan tunggu hasilnya: pesan `connected` pertama, atau status
 * HTTP penolakan handshake.
 *
 * Listener `error` dibiarkan terpasang selamanya — sebuah `error` tanpa
 * pendengar adalah exception tak tertangkap yang menjatuhkan seluruh berkas,
 * dan handshake yang ditolak selalu memancarkannya menyusul
 * `unexpected-response`.
 */
function buka(opsi: OpsiKoneksi = {}): Promise<HasilKoneksi> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    if (opsi.origin !== null) headers.Origin = opsi.origin ?? ORIGIN_SAH;
    if (opsi.cookie) headers.Cookie = opsi.cookie;

    const protokol = opsi.token ? [PROTOKOL, `bearer.${opsi.token}`] : [PROTOKOL];
    const ws = new WebSocket(`${alamatWs}${opsi.query ?? ''}`, protokol, { headers });
    terbuka.push(ws);

    let sudah = false;
    const selesai = (hasil: HasilKoneksi) => {
      if (sudah) return;
      sudah = true;
      resolve(hasil);
    };

    ws.on('message', (raw) =>
      selesai({ ok: true, ws, pertama: JSON.parse(raw.toString()) as Record<string, unknown> }),
    );
    ws.on('unexpected-response', (_req, res) =>
      selesai({ ok: false, status: res.statusCode ?? 0 }),
    );
    ws.on('error', () => selesai({ ok: false, status: 0 }));
  });
}

/** Buka koneksi yang HARUS berhasil; gagalkan uji dengan jelas bila tidak. */
async function bukaSah(opsi: OpsiKoneksi = {}) {
  const hasil = await buka(opsi);
  if (!hasil.ok) throw new Error(`handshake ditolak dengan status ${hasil.status}`);
  return hasil;
}

/** Pesan berikutnya dari sebuah koneksi. */
function pesanBerikut(ws: WebSocket, batasMs = 2_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const jam = setTimeout(() => reject(new Error('tidak ada pesan')), batasMs);
    ws.once('message', (raw) => {
      clearTimeout(jam);
      resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
    });
  });
}

/** Kode penutupan sebuah koneksi. */
function kodeTutup(ws: WebSocket, batasMs = 2_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const jam = setTimeout(() => reject(new Error('koneksi tidak ditutup')), batasMs);
    ws.once('close', (kode) => {
      clearTimeout(jam);
      resolve(kode);
    });
  });
}

/**
 * Kumpulkan pesan yang MASUK selama jeda singkat.
 *
 * Dipakai untuk membuktikan sesuatu TIDAK sampai. Membuktikan ketiadaan butuh
 * jendela waktu; 150 ms sudah lebih dari cukup untuk siaran yang dikirim
 * serentak di dalam proses yang sama.
 */
async function kumpulkan(ws: WebSocket, jedaMs = 150): Promise<Record<string, unknown>[]> {
  const masuk: Record<string, unknown>[] = [];
  const dengar = (raw: unknown) =>
    masuk.push(JSON.parse(String(raw)) as Record<string, unknown>);
  ws.on('message', dengar);
  await new Promise((r) => setTimeout(r, jedaMs));
  ws.off('message', dengar);
  return masuk;
}

// ── Staf ─────────────────────────────────────────────────────────────────────

describe('sesi staf', () => {
  it('menerima token yang sah dan menetapkan kafe dari DATABASE', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await bukaSah({ token });
    expect(hasil.pertama).toMatchObject({
      type: 'connected',
      cafeId: CAFE_A,
      jenis: 'staf',
    });
  });

  /**
   * Inti perbaikan. Kasirnya sah, origin-nya terdaftar, tokennya benar — yang
   * salah hanya satu parameter URL. Dulu itu cukup untuk ikut mendengarkan
   * seluruh aliran pesanan kafe lain.
   */
  it('menolak token kafe A yang menyebut kafe B di query', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token, query: `?cafeId=${CAFE_B}` });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(403);
  });

  // Klien lama yang menyertakan kafenya SENDIRI tetap dilayani — pergantian
  // versi frontend tidak boleh memutus layar yang belum sempat dimuat ulang.
  it('meloloskan query cafeId yang sama dengan kafe sesinya', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await bukaSah({ token, query: `?cafeId=${CAFE_A}` });
    expect(hasil.pertama).toMatchObject({ cafeId: CAFE_A });
  });

  it('menolak token kedaluwarsa', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: STAF_A, cafeId: CAFE_A, role: 'OWNER', typ: 'access' },
      process.env.JWT_SECRET!,
      { expiresIn: '-1s' },
    );

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak token yang tanda tangannya asing', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: STAF_A, cafeId: CAFE_A, role: 'OWNER', typ: 'access' },
      'secret-orang-lain',
    );

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  /**
   * Token stateless berumur 15 menit, koneksi WS hidup berjam-jam. Menonaktifkan
   * seorang staf harus berlaku pada sambungan BERIKUTNYA, bukan menunggu
   * tokennya kedaluwarsa sendiri.
   */
  it('menolak staf yang sudah dinonaktifkan meski tokennya masih berlaku', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ aktif: false }));
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak staf yang sudah dihapus', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  /**
   * Token yang klaimnya sudah tidak cocok dengan barisnya — staf dipindah kafe,
   * atau perannya diturunkan setelah token terbit.
   */
  it('menolak token yang kafenya tidak lagi cocok dengan baris penggunanya', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ cafeId: CAFE_B }));
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak token yang perannya sudah berubah', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ role: 'KASIR' }));
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  // Refresh token ditandatangani secret yang sama saat `JWT_REFRESH_SECRET`
  // kosong; klaim `typ` yang mencegahnya dipakai sebagai kunci masuk.
  it('menolak refresh token yang dipakai sebagai token akses', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const { signRefreshToken } = await import('../lib/jwt');
    const token = signRefreshToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });
});

// ── Terminal POS ─────────────────────────────────────────────────────────────

describe('sesi terminal POS', () => {
  const TOKEN_PERANGKAT = 'token-terminal-rahasia';

  it('menerima terminal terdaftar yang petugasnya sudah masuk', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT);
    const sesi = signSesiKasir({
      userId: STAF_A,
      cafeId: CAFE_A,
      role: 'KASIR',
      deviceId: TERMINAL_A,
    });

    const hasil = await bukaSah({
      cookie: `cafeos_device=${TOKEN_PERANGKAT}; cafeos_pos=${sesi}`,
    });
    expect(hasil.pertama).toMatchObject({
      type: 'connected',
      cafeId: CAFE_A,
      jenis: 'pos',
    });
  });

  it('menolak terminal yang belum ada petugas masuk', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT);
    const hasil = await buka({ cookie: `cafeos_device=${TOKEN_PERANGKAT}` });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak terminal yang aksesnya sudah dicabut', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT, { aktif: false, dicabutPada: new Date() });
    const sesi = signSesiKasir({
      userId: STAF_A,
      cafeId: CAFE_A,
      role: 'KASIR',
      deviceId: TERMINAL_A,
    });

    const hasil = await buka({
      cookie: `cafeos_device=${TOKEN_PERANGKAT}; cafeos_pos=${sesi}`,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  /**
   * Cookie sesi yang DISALIN ke terminal lain. Klaim `deviceId` di dalamnya
   * tidak lagi cocok dengan perangkat yang sedang memegangnya, dan itu yang
   * membuat penyalinan tidak berguna.
   */
  it('menolak sesi yang deviceId-nya bukan terminal ini', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT);
    const sesi = signSesiKasir({
      userId: STAF_A,
      cafeId: CAFE_A,
      role: 'KASIR',
      deviceId: 'terminal-lain',
    });

    const hasil = await buka({
      cookie: `cafeos_device=${TOKEN_PERANGKAT}; cafeos_pos=${sesi}`,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(403);
  });

  it('menolak sesi yang kafenya berbeda dari kafe terminal', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT);
    const sesi = signSesiKasir({
      userId: STAF_B,
      cafeId: CAFE_B,
      role: 'KASIR',
      deviceId: TERMINAL_A,
    });

    const hasil = await buka({
      cookie: `cafeos_device=${TOKEN_PERANGKAT}; cafeos_pos=${sesi}`,
    });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(403);
  });

  it('menolak token perangkat yang tidak dikenal', async () => {
    daftarkanTerminal(TOKEN_PERANGKAT);
    const hasil = await buka({ cookie: 'cafeos_device=token-karangan' });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });
});

// ── Tamu ─────────────────────────────────────────────────────────────────────

describe('ponsel tamu', () => {
  it('menerima langganan satu pesanan dan mengambil kafe dari baris pesanannya', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });

    const hasil = await bukaSah({ query: `?orderId=${PESANAN_A}` });
    expect(hasil.pertama).toMatchObject({
      type: 'connected',
      cafeId: CAFE_A,
      orderId: PESANAN_A,
      jenis: 'tamu',
    });
  });

  it('menolak orderId yang tidak ada', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    const hasil = await buka({ query: '?orderId=tidak-ada' });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  // id bukan UUID membuat Prisma melempar sebelum sempat mencari; penebak tidak
  // boleh bisa membedakan "bentuknya salah" dari "tidak ada".
  it('menolak orderId yang membuat query melempar', async () => {
    prisma.order.findUnique.mockRejectedValue(new Error('invalid uuid'));
    const hasil = await buka({ query: '?orderId=bukan-uuid' });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak query cafeId yang bukan kafe pesanannya', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const hasil = await buka({ query: `?orderId=${PESANAN_A}&cafeId=${CAFE_B}` });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(403);
  });

  /**
   * Langganan tamu TERKUNCI. Inilah yang membedakan "tamu boleh menonton
   * pesanannya" dari "siapa pun yang punya satu id pesanan boleh menonton
   * seluruh kafe" — termasuk omzet dasbor dan pesanan meja lain.
   */
  it('menolak upaya melebarkan langganan ke seluruh kafe', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const { ws } = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    ws.send(JSON.stringify({ type: 'subscribe' }));
    const balas = await pesanBerikut(ws);
    expect(balas).toMatchObject({ type: 'error', code: 'LANGGANAN_DITOLAK' });
    expect(await kodeTutup(ws)).toBe(4403);
  });

  it('menolak upaya berpindah ke pesanan lain', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const { ws } = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    ws.send(JSON.stringify({ type: 'subscribe', orderId: 'pesanan-orang-lain' }));
    expect(await pesanBerikut(ws)).toMatchObject({ type: 'error' });
    expect(await kodeTutup(ws)).toBe(4403);
  });

  it('meloloskan penegasan langganan yang sama saat menyambung ulang', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const { ws } = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    ws.send(JSON.stringify({ type: 'subscribe', orderId: PESANAN_A }));
    expect(await pesanBerikut(ws)).toMatchObject({
      type: 'subscribed',
      cafeId: CAFE_A,
      orderId: PESANAN_A,
    });
  });
});

// ── Tanpa kredensial ─────────────────────────────────────────────────────────

describe('tanpa kredensial', () => {
  it('menolak koneksi polos', async () => {
    const hasil = await buka();
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  /**
   * Regresi yang paling penting: sebelumnya koneksi TANPA `Origin` diterima
   * begitu saja — dan `Origin` justru header yang paling mudah dihilangkan oleh
   * klien non-peramban mana pun.
   */
  it('menolak koneksi tanpa Origin yang hanya menyebut cafeId', async () => {
    const hasil = await buka({ origin: null, query: `?cafeId=${CAFE_A}` });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(401);
  });

  it('menolak origin asing lebih dulu, sebelum sesi dicari', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });

    const hasil = await buka({ token, origin: 'https://situs-jahat.id' });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.status).toBe(403);
    // Sesi tidak pernah dicari — penolakan origin tidak menyentuh database.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

// ── Langganan lintas tenant lewat pesan ──────────────────────────────────────

describe('pesan subscribe', () => {
  it('memutus koneksi yang menyebut kafe lain', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });
    const { ws } = await bukaSah({ token });

    ws.send(JSON.stringify({ type: 'subscribe', cafeId: CAFE_B }));
    expect(await pesanBerikut(ws)).toMatchObject({
      type: 'error',
      code: 'LINTAS_TENANT',
    });
    expect(await kodeTutup(ws)).toBe(4403);
  });

  it('meloloskan subscribe yang menyebut kafenya sendiri', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });
    const { ws } = await bukaSah({ token });

    ws.send(JSON.stringify({ type: 'subscribe', cafeId: CAFE_A }));
    expect(await pesanBerikut(ws)).toMatchObject({
      type: 'subscribed',
      cafeId: CAFE_A,
      orderId: null,
    });
  });

  it('mengabaikan pesan yang bukan JSON tanpa memutus koneksi', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    const token = signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' });
    const { ws } = await bukaSah({ token });

    ws.send('bukan json');
    ws.send(JSON.stringify({ type: 'subscribe' }));
    expect(await pesanBerikut(ws)).toMatchObject({ type: 'subscribed' });
  });
});

// ── Isolasi siaran ───────────────────────────────────────────────────────────

describe('isolasi siaran antar kafe', () => {
  /**
   * Pembuktian akhir, dan satu-satunya yang benar-benar menjawab pertanyaan
   * pemilik kafe: apakah pesanan saya bisa muncul di layar kafe orang lain.
   * Dua koneksi staf dari dua kafe berbeda, satu siaran, dan hanya satu yang
   * boleh menerimanya.
   */
  it('hanya mengirim ke koneksi yang kafenya cocok', async () => {
    prisma.user.findFirst.mockImplementation(
      async (args: { where: { id?: string } }) =>
        args.where.id === STAF_B
          ? { id: STAF_B, cafeId: CAFE_B, role: 'OWNER', aktif: true }
          : stafPalsu(),
    );

    const a = await bukaSah({
      token: signAccessToken({ userId: STAF_A, cafeId: CAFE_A, role: 'OWNER' }),
    });
    const b = await bukaSah({
      token: signAccessToken({ userId: STAF_B, cafeId: CAFE_B, role: 'OWNER' }),
    });

    const diterimaA = kumpulkan(a.ws);
    const diterimaB = kumpulkan(b.ws);
    realtime.broadcastToCafe(CAFE_A, { type: 'table.status.changed', data: {} });

    expect((await diterimaA).map((m) => m.type)).toEqual(['table.status.changed']);
    expect(await diterimaB).toEqual([]);
  });

  it('tidak mengirim event tanpa orderId ke ponsel tamu', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const tamu = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    const diterima = kumpulkan(tamu.ws);
    // Omzet dasbor disiarkan ke seluruh kafe tanpa menyebut pesanan mana pun —
    // langganan tamu yang tersempit tidak boleh ikut menerimanya.
    realtime.broadcastToCafe(CAFE_A, { type: 'dashboard.order.paid', data: {} });

    expect(await diterima).toEqual([]);
  });

  it('mengirim event pesanan tamu itu sendiri kepadanya', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const tamu = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    const diterima = kumpulkan(tamu.ws);
    realtime.broadcastToCafe(CAFE_A, { type: 'order.ready', data: {} }, PESANAN_A);

    expect((await diterima).map((m) => m.type)).toEqual(['order.ready']);
  });

  it('tidak mengirim pesanan meja lain ke ponsel tamu', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: PESANAN_A, cafeId: CAFE_A });
    const tamu = await bukaSah({ query: `?orderId=${PESANAN_A}` });

    const diterima = kumpulkan(tamu.ws);
    realtime.broadcastToCafe(CAFE_A, { type: 'order.ready', data: {} }, 'pesanan-lain');

    expect(await diterima).toEqual([]);
  });
});

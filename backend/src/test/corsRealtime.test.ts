import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * REST dan WebSocket SETELAH pengetatan CORS.
 *
 * Uji ini benar-benar menyalakan server dan menembaknya lewat jaringan lokal,
 * bukan memanggil fungsi middleware secara langsung. Itu disengaja: yang ingin
 * dibuktikan bukan "fungsi mengembalikan false" melainkan "server berperilaku
 * begini di kabel" — termasuk urutan middleware, header yang benar-benar
 * terkirim, dan penolakan handshake WebSocket yang terjadi sebelum koneksi
 * terbentuk.
 *
 * Tidak ada database yang disentuh: seluruh jalur yang diuji ditolak (atau
 * dijawab) sebelum satu pun query dijalankan.
 */

const ORIGIN_SAH = 'http://localhost:5173';
const ORIGIN_ASING = 'https://situs-jahat.id';

let server: Server;
let alamat: string;
let alamatWs: string;

beforeAll(async () => {
  // Environment disiapkan SEBELUM modul dimuat — daftar origin dibaca saat
  // aplikasinya dirakit.
  process.env.NODE_ENV = 'development';
  process.env.CORS_ORIGINS = ORIGIN_SAH;
  process.env.ATTENDANCE_PHOTO_DIR = '';

  const { createApp } = await import('../app');
  const { realtime } = await import('../realtime/realtime');

  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  realtime.init(server);

  const port = (server.address() as AddressInfo).port;
  alamat = `http://127.0.0.1:${port}`;
  alamatWs = `ws://127.0.0.1:${port}/ws`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('REST tetap hidup', () => {
  it('menjawab health check tanpa Origin sama sekali', async () => {
    const res = await fetch(`${alamat}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  it('memberi header CORS untuk origin yang terdaftar', async () => {
    const res = await fetch(`${alamat}/health`, { headers: { Origin: ORIGIN_SAH } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN_SAH);
    // Tanpa ini peramban tidak akan mengirim cookie POS.
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  /**
   * Inti perbaikan: origin asing TIDAK mendapat header CORS.
   *
   * Sebelumnya `origin: true` memantulkan siapa pun yang bertanya, sehingga
   * setiap situs boleh memanggil API ini dengan cookie kasir terbawa.
   */
  it('tidak memberi header CORS untuk origin asing', async () => {
    const res = await fetch(`${alamat}/health`, { headers: { Origin: ORIGIN_ASING } });
    // Permintaannya sendiri tetap dilayani (peramban yang menolak membacanya),
    // tapi tanpa izin apa pun untuk membaca hasilnya.
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('menjawab preflight hanya untuk origin terdaftar', async () => {
    const preflight = (origin: string) =>
      fetch(`${alamat}/api/pos/sesi`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

    const sah = await preflight(ORIGIN_SAH);
    expect(sah.headers.get('access-control-allow-origin')).toBe(ORIGIN_SAH);

    const asing = await preflight(ORIGIN_ASING);
    expect(asing.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('CSRF pada jalur POS', () => {
  /**
   * Lapis yang menangkap apa yang dilewatkan CORS: permintaan "simple" berbentuk
   * form yang tidak memicu preflight sama sekali. CORS tidak pernah dimintai
   * pendapat untuk permintaan seperti itu — yang menolaknya adalah pemeriksaan
   * Origin di server.
   */
  it('menolak POST dari origin asing dengan 403', async () => {
    const res = await fetch(`${alamat}/api/pos/sesi`, {
      method: 'POST',
      headers: { Origin: ORIGIN_ASING, 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('menolak POST tanpa Origin maupun Referer', async () => {
    const res = await fetch(`${alamat}/api/pos/sesi`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  /**
   * Origin yang sah harus LOLOS pemeriksaan CSRF dan sampai ke lapis
   * berikutnya. 401 di sini justru bukti bahwa ia lolos: yang menolaknya adalah
   * ketiadaan token perangkat, bukan asal permintaannya.
   */
  it('meloloskan origin sah ke pemeriksaan perangkat', async () => {
    const res = await fetch(`${alamat}/api/pos/sesi`, {
      method: 'POST',
      headers: { Origin: ORIGIN_SAH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'x', pin: '1234' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error ?? '').toMatch(/perangkat/i);
  });

  // Webhook gateway datang tanpa Origin dan TIDAK lewat middleware POS —
  // menolaknya akan mematikan notifikasi pembayaran.
  it('tidak menghalangi webhook yang datang tanpa Origin', async () => {
    const res = await fetch(`${alamat}/api/pembayaran/doku/notifikasi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Webhook SELALU dijawab 200 supaya gateway tidak mengulang.
    expect(res.status).toBe(200);
  });
});

describe('WebSocket realtime', () => {
  /**
   * Buka WS dan laporkan apakah ia tersambung atau ditolak.
   *
   * Dua kehalusan `ws` yang harus diurus, keduanya soal membersihkan diri:
   *
   *   1. Handshake yang ditolak memancarkan `unexpected-response` DAN menyusul
   *      `error`. Listener `error` karena itu dibiarkan terpasang selamanya —
   *      sebuah `error` tanpa pendengar adalah exception yang tidak tertangkap,
   *      muncul di luar uji mana pun dan menjatuhkan seluruh berkas.
   *   2. `close()` pada koneksi yang belum pernah terbentuk melempar secara
   *      asinkron. `terminate()` aman di kedua keadaan.
   */
  function coba(origin?: string): Promise<'tersambung' | 'ditolak'> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${alamatWs}?cafeId=cafe-a`, {
        headers: origin ? { Origin: origin } : {},
      });
      let sudah = false;
      const selesai = (hasil: 'tersambung' | 'ditolak') => {
        if (sudah) return;
        sudah = true;
        ws.terminate();
        resolve(hasil);
      };
      ws.on('open', () => selesai('tersambung'));
      ws.on('unexpected-response', () => selesai('ditolak'));
      ws.on('error', () => selesai('ditolak'));
    });
  }

  it('menerima koneksi dari origin terdaftar', async () => {
    expect(await coba(ORIGIN_SAH)).toBe('tersambung');
  });

  /**
   * CORS TIDAK BERLAKU pada WebSocket — peramban mengirim `Origin` tapi tidak
   * ada aturan yang menghentikannya bila server diam saja. Tanpa pemeriksaan
   * ini, halaman mana pun bisa membuka `ws://…/ws?cafeId=<id>` dan ikut
   * mendengarkan aliran pesanan sebuah kafe.
   */
  it('menolak koneksi dari origin asing', async () => {
    expect(await coba(ORIGIN_ASING)).toBe('ditolak');
  });

  // Klien non-peramban (uji, skrip operator) tidak punya cookie siapa pun untuk
  // disalahgunakan.
  it('menerima koneksi tanpa header Origin', async () => {
    expect(await coba()).toBe('tersambung');
  });

  it('menyapa klien dengan status langganan awalnya', async () => {
    const pesan = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const ws = new WebSocket(`${alamatWs}?cafeId=cafe-a`, {
        headers: { Origin: ORIGIN_SAH },
      });
      ws.on('message', (raw) => {
        ws.terminate();
        resolve(JSON.parse(raw.toString()));
      });
      ws.on('error', reject);
    });

    expect(pesan).toMatchObject({ type: 'connected', cafeId: 'cafe-a' });
  });
});

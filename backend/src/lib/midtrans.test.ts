import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseUrlMidtrans, tesKoneksiMidtrans } from './midtrans';

// Yang diuji di sini adalah SATU aturan: mode yang dipilih pemilik — bukan
// bentuk teks kuncinya — yang menentukan endpoint Midtrans mana yang dihubungi.
//
// Aturan itu dulu bocor ke lapisan validasi, yang menebak environment dari
// awalan `SB-` dan menolak kunci Sandbox tanpa awalan dengan HTTP 400. Uji di
// bawah memakai kunci berawalan SB- DAN kunci polos pada kedua mode, dan
// menuntut pilihan endpoint-nya tidak bergeser sedikit pun.

const SANDBOX_URL = 'https://api.sandbox.midtrans.com';
const PRODUCTION_URL = 'https://api.midtrans.com';

/** `fetch` palsu yang merekam URL & header lalu menjawab dengan status pilihan. */
function pasangFetch(status: number, body: unknown = {}) {
  const mock = vi.fn(
    async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function kredensial(mode: 'SANDBOX' | 'PRODUCTION', serverKey: string) {
  return { cafeId: 'kafe-a', mode, clientKey: null, serverKey } as const;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

// ── Pemilihan endpoint ───────────────────────────────────────────────────────

describe('baseUrlMidtrans', () => {
  it('memetakan mode ke lingkungan yang benar', () => {
    expect(baseUrlMidtrans('SANDBOX')).toBe(SANDBOX_URL);
    expect(baseUrlMidtrans('PRODUCTION')).toBe(PRODUCTION_URL);
  });
});

describe('tesKoneksiMidtrans — endpoint ditentukan MODE, bukan awalan kunci', () => {
  // Kunci Sandbox yang tidak berawalan SB- adalah kasus yang membuat tenant
  // ditolak 400 di server produksi. Ia harus diuji ke endpoint Sandbox.
  it.each([
    ['SB-Mid-server-abc123', 'berawalan SB-'],
    ['Mid-server-abc123', 'tanpa awalan SB-'],
    ['kunci-gaya-lain-2026', 'tanpa pola Mid- sama sekali'],
  ])('mode SANDBOX selalu ke endpoint Sandbox — kunci %s (%s)', async (kunci) => {
    const fetchMock = pasangFetch(404);
    await tesKoneksiMidtrans(kredensial('SANDBOX', kunci));

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith(SANDBOX_URL)).toBe(true);
    expect(url).not.toContain(PRODUCTION_URL);
  });

  it.each([
    ['Mid-server-abc123', 'tanpa awalan'],
    ['SB-Mid-server-abc123', 'berawalan SB-'],
  ])('mode PRODUCTION selalu ke endpoint Production — kunci %s (%s)', async (kunci) => {
    const fetchMock = pasangFetch(404);
    await tesKoneksiMidtrans(kredensial('PRODUCTION', kunci));

    expect(String(fetchMock.mock.calls[0][0]).startsWith(PRODUCTION_URL)).toBe(true);
  });

  it('mengirim Server Key sebagai Basic auth, bukan di URL', async () => {
    const fetchMock = pasangFetch(404);
    await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('Mid-server');
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from('Mid-server-abc123:').toString('base64')}`);
  });

  it('tidak membuat transaksi apa pun — hanya GET status order yang tidak ada', async () => {
    const fetchMock = pasangFetch(404);
    await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
    expect(String(url)).toMatch(/\/v2\/CAFEOS-PING-\d+\/status$/);
  });
});

// ── Penerjemahan jawaban Midtrans ────────────────────────────────────────────

describe('tesKoneksiMidtrans — jawaban Midtrans adalah sumber kebenaran', () => {
  it('404 berarti kunci DITERIMA (transaksinya saja yang tidak ada)', async () => {
    pasangFetch(404);
    const hasil = await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));
    expect(hasil.berhasil).toBe(true);
  });

  it('200 juga berarti diterima', async () => {
    pasangFetch(200);
    expect(
      (await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'))).berhasil,
    ).toBe(true);
  });

  it.each([401, 403])('%i berarti kunci ditolak', async (status) => {
    pasangFetch(status);
    const hasil = await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));
    expect(hasil.berhasil).toBe(false);
    expect(hasil.pesan).toMatch(/Sandbox/);
  });

  it('penolakan di slot Production menyebut Production, bukan menyalahkan awalan', async () => {
    pasangFetch(401);
    const hasil = await tesKoneksiMidtrans(
      kredensial('PRODUCTION', 'SB-Mid-server-abc123'),
    );
    expect(hasil.pesan).toMatch(/Production/);
    // Awalan boleh disebut sebagai catatan, tapi tidak sebagai vonis.
    expect(hasil.pesan).not.toMatch(/butuh kunci berawalan/i);
  });

  it('status lain dilaporkan apa adanya tanpa membocorkan body balasan', async () => {
    pasangFetch(500, { rahasia: 'jangan-tampil' });
    const hasil = await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));
    expect(hasil.berhasil).toBe(false);
    expect(hasil.pesan).toContain('500');
    expect(hasil.pesan).not.toContain('jangan-tampil');
  });

  it('kegagalan jaringan tidak melempar, hanya melapor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const hasil = await tesKoneksiMidtrans(kredensial('SANDBOX', 'Mid-server-abc123'));
    expect(hasil.berhasil).toBe(false);
    expect(hasil.pesan).toMatch(/tidak bisa dihubungi/i);
  });

  // Pesan ini masuk ke database (`koneksi_pesan`) dan tampil di layar pemilik.
  it('TIDAK PERNAH memuat Server Key dalam pesan apa pun', async () => {
    const rahasia = 'Mid-server-SANGAT-RAHASIA-999';
    for (const status of [200, 401, 403, 404, 500, 502]) {
      pasangFetch(status);
      const hasil = await tesKoneksiMidtrans(kredensial('PRODUCTION', rahasia));
      expect(hasil.pesan).not.toContain(rahasia);
      expect(hasil.pesan).not.toContain('SANGAT-RAHASIA');
    }
  });
});

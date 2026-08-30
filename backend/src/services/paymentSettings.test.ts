import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// Modul yang diuji diambil lewat `await import()` di bawah — lihat catatan yang
// sama di `pembayaranWebhook.test.ts`.
const prisma = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

/** Parameter diberi tipe agar `mock.calls[i][0]` bisa dibaca uji. */
const catatAudit = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return {
    ...asli,
    auditLogService: {
      catat: (...a: unknown[]) => catatAudit(a[0] as Record<string, unknown>),
      riwayat: vi.fn(),
    },
  };
});

const tesKoneksiMidtrans = vi.fn(async () => ({ berhasil: true, pesan: 'ok' }));
vi.mock('../lib/midtrans', () => ({
  tesKoneksiMidtrans: (...a: unknown[]) => tesKoneksiMidtrans(...(a as [])),
  urlWebhookMidtrans: (cafeId: string) =>
    `https://cafe.contoh.test/api/pembayaran/notifikasi/${cafeId}`,
}));

// Enkripsi asli butuh ENCRYPTION_KEY 32 byte. Ditiru agar uji tidak menuntut
// environment tertentu — yang diperiksa di sini adalah ALUR kredensial, dan
// enkripsinya sendiri punya jaminannya sendiri (lihat `enkripsi.test.ts`).
//
// Tiruan ini memodelkan KEDUA kegagalan yang alur di atasnya harus bedakan:
//   * `punyaKunci = false`        → ENCRYPTION_KEY hilang (salah SERVER).
//   * ciphertext bukan `enc(...)` → blob tak terbaca (salah DATA).
const keadaanEnkripsi = { punyaKunci: true };

class KesalahanKonfigurasiEnkripsiPalsu extends Error {
  readonly kode = 'ENCRYPTION_KEY_TIDAK_TERSEDIA' as const;
}
class KesalahanDekripsiPalsu extends Error {
  readonly kode = 'CIPHERTEXT_TIDAK_TERBACA' as const;
}

vi.mock('../lib/enkripsi', () => {
  const enkripsi = (teks: string) => {
    if (!keadaanEnkripsi.punyaKunci) throw new KesalahanKonfigurasiEnkripsiPalsu();
    return `enc(${teks})`;
  };
  const dekripsi = (cipher: string) => {
    if (!keadaanEnkripsi.punyaKunci) throw new KesalahanKonfigurasiEnkripsiPalsu();
    if (!/^enc\(.*\)$/.test(cipher)) throw new KesalahanDekripsiPalsu();
    return cipher.replace(/^enc\(|\)$/g, '');
  };
  return {
    KesalahanKonfigurasiEnkripsi: KesalahanKonfigurasiEnkripsiPalsu,
    KesalahanDekripsi: KesalahanDekripsiPalsu,
    enkripsi,
    dekripsi,
    enkripsiTerverifikasi: (teks: string) => {
      const c = enkripsi(teks);
      dekripsi(c);
      return c;
    },
    enkripsiSiap: () => keadaanEnkripsi.punyaKunci,
    pastikanEnkripsiSiap: () => {
      if (!keadaanEnkripsi.punyaKunci) throw new KesalahanKonfigurasiEnkripsiPalsu();
    },
    dekripsiAman: (cipher: string) => {
      try {
        return { ok: true as const, teks: dekripsi(cipher) };
      } catch (err) {
        return {
          ok: false as const,
          sebab:
            err instanceof KesalahanKonfigurasiEnkripsiPalsu
              ? ('KONFIGURASI' as const)
              : ('CIPHERTEXT' as const),
          pesan: 'gagal',
        };
      }
    },
  };
});

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const aktor = { userId: 'u1', role: 'OWNER', ip: null, userAgent: null };

const { paymentSettingsService } = await import('./paymentSettings.service');

/** Baris metode dengan nilai bawaan yang lengkap. */
function metode(kode: string, ubah: Record<string, unknown> = {}) {
  return {
    id: `m-${kode}`,
    cafeId: KAFE_A,
    metode: kode,
    aktif: kode === 'TUNAI',
    tersediaDiKasir: true,
    tersediaDiCheckout: false,
    wajibVerifikasiKasir: true,
    instruksi: null,
    batasWaktuMenit: null,
    qrisImageUrl: null,
    qrisImagePublicId: null,
    qrisMerchantName: null,
    qrisNmid: null,
    bankNama: null,
    bankNomorRekening: null,
    bankAtasNama: null,
    edcProvider: null,
    edcTerminalLabel: null,
    ...ubah,
  };
}

function kredensial(mode: string, ubah: Record<string, unknown> = {}) {
  return {
    id: `k-${mode}`,
    cafeId: KAFE_A,
    mode,
    clientKey: mode === 'SANDBOX' ? 'SB-Mid-client-abc' : 'Mid-client-abc',
    serverKeyEnc: 'enc(SB-Mid-server-abc)',
    serverKeyHint: 'cabc',
    statusKoneksi: 'BELUM_DIUJI',
    koneksiDiperiksa: null,
    koneksiPesan: null,
    statusWebhook: 'BELUM_DIPERIKSA',
    webhookDiperiksa: null,
    ...ubah,
  };
}

beforeEach(() => {
  keadaanEnkripsi.punyaKunci = true;
  isiBawaan(prisma);
  prisma.cafe.findUnique.mockResolvedValue({ id: KAFE_A, midtransProduction: false });
  prisma.metodePembayaranKafe.findMany.mockResolvedValue([
    metode('TUNAI'),
    metode('QRIS_STATIS'),
    metode('TRANSFER'),
    metode('EDC'),
  ]);
  prisma.midtransCredential.findMany.mockResolvedValue([]);
});

// ── Kerahasiaan Server Key ───────────────────────────────────────────────────

describe('getSettings — Server Key tidak pernah keluar', () => {
  it('tidak menyertakan ciphertext maupun kunci di respons', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    const teks = JSON.stringify(hasil);

    expect(teks).not.toContain('Mid-server');
    expect(teks).not.toContain('enc(');
    expect(teks).not.toMatch(/serverKeyEnc/);
  });

  it('hanya melaporkan bahwa kuncinya tersimpan, plus 4 karakter petunjuk', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    const sandbox = hasil.midtrans.kredensial.find((k) => k.mode === 'SANDBOX');

    expect(sandbox?.serverKeyTersimpan).toBe(true);
    expect(sandbox?.serverKeyPetunjuk).toBe('cabc');
  });

  // Client Key memang publik (Snap.js membutuhkannya di browser tamu).
  it('mengirim Client Key apa adanya', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(
      hasil.midtrans.kredensial.find((k) => k.mode === 'SANDBOX')?.clientKey,
    ).toBe('SB-Mid-client-abc');
  });
});

// ── Pemisahan mode ───────────────────────────────────────────────────────────

describe('getSettings — Sandbox & Production terpisah', () => {
  it('selalu melaporkan KEDUA mode, walau salah satunya kosong', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    const production = hasil.midtrans.kredensial.find((k) => k.mode === 'PRODUCTION');

    expect(hasil.midtrans.kredensial).toHaveLength(2);
    // Kunci Sandbox TIDAK menular ke slot Production — itulah inti perbaikannya.
    expect(production?.serverKeyTersimpan).toBe(false);
    expect(production?.clientKey).toBeNull();
  });

  it('kredensial mode aktif yang menentukan `bisaTransaksi`', async () => {
    // Kafe berada di mode Production, tapi kuncinya hanya ada di Sandbox.
    prisma.cafe.findUnique.mockResolvedValue({ id: KAFE_A, midtransProduction: true });
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.modeAktif).toBe('PRODUCTION');
    expect(hasil.midtrans.bisaTransaksi).toBe(false);
  });
});

// ── Status integrasi ─────────────────────────────────────────────────────────

describe('getSettings — status integrasi', () => {
  // Badge hijau dulu muncul begitu Server Key tersimpan, padahal kunci yang
  // salah ketik pun tersimpan dengan senang hati.
  it('kredensial saja BELUM berarti siap', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('KREDENSIAL_TERSIMPAN');
  });

  it('koneksi berhasil tapi webhook belum diperiksa juga belum siap', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', { statusKoneksi: 'BERHASIL' }),
    ]);
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('KREDENSIAL_TERSIMPAN');
  });

  it('SIAP hanya setelah kredensial lengkap + koneksi + webhook', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', {
        statusKoneksi: 'BERHASIL',
        statusWebhook: 'TERVERIFIKASI',
      }),
    ]);
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('SIAP');
  });

  it('koneksi gagal dilaporkan sebagai gagal', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', { statusKoneksi: 'GAGAL' }),
    ]);
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('KONEKSI_GAGAL');
  });

  it('tanpa kredensial berarti belum dikonfigurasi', async () => {
    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('BELUM_DIKONFIGURASI');
  });
});

// ── Mode Production ──────────────────────────────────────────────────────────

describe('setMode — penjagaan Production', () => {
  it('menolak Production tanpa kredensial Production', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await expect(paymentSettingsService.setMode(KAFE_A, 'PRODUCTION', aktor)).rejects.toThrow(
      /Server Key Production belum diisi/i,
    );
    expect(prisma.cafe.update).not.toHaveBeenCalled();
  });

  it('menolak Production yang tes koneksinya belum berhasil', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('PRODUCTION', { statusKoneksi: 'BELUM_DIUJI' }),
    );

    await expect(paymentSettingsService.setMode(KAFE_A, 'PRODUCTION', aktor)).rejects.toThrow(
      /Tes koneksi Production belum berhasil/i,
    );
  });

  it('mengizinkan Production bila seluruh syarat terpenuhi', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('PRODUCTION', { statusKoneksi: 'BERHASIL' }),
    );

    await paymentSettingsService.setMode(KAFE_A, 'PRODUCTION', aktor);
    expect(prisma.cafe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: KAFE_A },
        data: { midtransProduction: true },
      }),
    );
  });

  // Kembali ke Sandbox tidak berbahaya — tidak ada syarat apa pun.
  it('selalu boleh kembali ke Sandbox', async () => {
    await paymentSettingsService.setMode(KAFE_A, 'SANDBOX', aktor);
    expect(prisma.cafe.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { midtransProduction: false } }),
    );
  });

  it('mencatat perubahan mode ke jejak audit', async () => {
    await paymentSettingsService.setMode(KAFE_A, 'SANDBOX', aktor);
    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'midtrans.mode.diubah' }),
    );
  });
});

// ── Menyimpan kredensial ─────────────────────────────────────────────────────

describe('simpanKredensial', () => {
  it('menuntut Server Key pada penyimpanan pertama', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await expect(
      paymentSettingsService.simpanKredensial(
        KAFE_A,
        'SANDBOX',
        { clientKey: 'SB-Mid-client-abc' },
        aktor,
      ),
    ).rejects.toThrow(/wajib diisi/i);
  });

  // Kolomnya selalu kosong saat dialog dibuka; membiarkannya berarti "pakai
  // yang lama", bukan "kosongkan".
  it('membolehkan ganti Client Key saja bila Server Key sudah tersimpan', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(kredensial('SANDBOX'));

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { clientKey: 'SB-Mid-client-baru' },
      aktor,
    );

    const args = prisma.midtransCredential.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(args.update.clientKey).toBe('SB-Mid-client-baru');
    expect(args.update).not.toHaveProperty('serverKeyEnc');
  });

  // Kunci baru = bukti lama tidak berlaku lagi.
  it('menyetel ulang status koneksi & webhook saat Server Key diganti', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('SANDBOX', { statusKoneksi: 'BERHASIL', statusWebhook: 'TERVERIFIKASI' }),
    );

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { serverKey: 'SB-Mid-server-baru' },
      aktor,
    );

    const args = prisma.midtransCredential.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(args.update.statusKoneksi).toBe('BELUM_DIUJI');
    expect(args.update.statusWebhook).toBe('BELUM_DIPERIKSA');
    expect(args.update.serverKeyEnc).toBe('enc(SB-Mid-server-baru)');
    expect(args.update.serverKeyHint).toBe('baru');
  });

  it('mencatat FAKTA penggantian ke audit, bukan kuncinya', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { serverKey: 'SB-Mid-server-rahasia' },
      aktor,
    );

    const panggilan = catatAudit.mock.calls.find(
      (c) => c[0]?.aksi === 'midtrans.kredensial.disimpan',
    );
    expect(panggilan).toBeDefined();
    expect(JSON.stringify(panggilan)).not.toContain('rahasia');
  });

  // ── Awalan kunci tidak lagi menghalangi apa pun ───────────────────────────

  it('menerima kunci Sandbox tanpa awalan SB- (bug yang diperbaiki)', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { clientKey: 'Mid-client-abc123', serverKey: 'Mid-server-abc123' },
      aktor,
    );

    const args = prisma.midtransCredential.upsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
    };
    expect(args.create.serverKeyEnc).toBe('enc(Mid-server-abc123)');
    expect(args.create.clientKey).toBe('Mid-client-abc123');
  });

  it('Sandbox & Production disimpan pada baris yang terpisah', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { serverKey: 'Mid-server-sandbox1' },
      aktor,
    );
    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'PRODUCTION',
      { serverKey: 'Mid-server-produksi1' },
      aktor,
    );

    const kunciUpsert = prisma.midtransCredential.upsert.mock.calls.map(
      (c) => (c[0] as { where: { cafeId_mode: { mode: string } } }).where.cafeId_mode,
    );
    expect(kunciUpsert).toEqual([
      { cafeId: KAFE_A, mode: 'SANDBOX' },
      { cafeId: KAFE_A, mode: 'PRODUCTION' },
    ]);
    // Tidak ada satu pun penulisan yang menyentuh mode selain yang diminta.
    const ditulis = prisma.midtransCredential.upsert.mock.calls.map(
      (c) => (c[0] as { create: { serverKeyEnc: string } }).create.serverKeyEnc,
    );
    expect(ditulis).toEqual(['enc(Mid-server-sandbox1)', 'enc(Mid-server-produksi1)']);
  });

  // ── Round-trip: "tersimpan" harus fakta, bukan harapan ────────────────────

  it('membuktikan kunci baru bisa dibaca lagi SEBELUM menandainya tersimpan', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    const hasil = await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { serverKey: 'Mid-server-abc123' },
      aktor,
    );

    // `enkripsiTerverifikasi` (tiruan maupun asli) mendekripsi balik hasilnya;
    // kalau round-trip gagal ia melempar dan tidak ada yang ditulis.
    expect(prisma.midtransCredential.upsert).toHaveBeenCalled();
    expect(hasil.midtrans).toBeDefined();
  });

  it('menguji koneksi ke endpoint mode itu segera setelah menyimpan', async () => {
    // Pembacaan pertama (sebelum simpan) belum ada barisnya; pembacaan kedua
    // dilakukan tes otomatis, yang membaca baris hasil simpanan tadi.
    prisma.midtransCredential.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(kredensial('SANDBOX', { serverKeyEnc: 'enc(Mid-server-abc123)' }));
    tesKoneksiMidtrans.mockResolvedValueOnce({ berhasil: true, pesan: 'ok' });

    await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { serverKey: 'Mid-server-abc123' },
      aktor,
    );

    // Pemilik tidak perlu menekan Tes Koneksi sendiri untuk tahu hasilnya.
    expect(tesKoneksiMidtrans).toHaveBeenCalled();
    const dipakai = (tesKoneksiMidtrans.mock.calls.at(-1) as unknown as [{ mode: string }])[0];
    expect(dipakai.mode).toBe('SANDBOX');
  });

  it('tes koneksi yang gagal TIDAK membatalkan penyimpanan', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);
    tesKoneksiMidtrans.mockRejectedValueOnce(new Error('jaringan mati'));

    await expect(
      paymentSettingsService.simpanKredensial(
        KAFE_A,
        'SANDBOX',
        { serverKey: 'Mid-server-abc123' },
        aktor,
      ),
    ).resolves.toBeDefined();
    expect(prisma.midtransCredential.upsert).toHaveBeenCalled();
  });

  // ── ENCRYPTION_KEY hilang: gagal aman, jangan menyimpan apa pun ───────────

  it('menolak menyimpan bila ENCRYPTION_KEY tidak tersedia', async () => {
    keadaanEnkripsi.punyaKunci = false;
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await expect(
      paymentSettingsService.simpanKredensial(
        KAFE_A,
        'SANDBOX',
        { serverKey: 'Mid-server-abc123' },
        aktor,
      ),
    ).rejects.toMatchObject({ statusCode: 500 });

    // Tidak ada kredensial yang tersimpan dalam keadaan tak terbaca.
    expect(prisma.midtransCredential.upsert).not.toHaveBeenCalled();
  });

  it('pesan galat konfigurasi tidak menyuruh mengetik ulang kunci', async () => {
    keadaanEnkripsi.punyaKunci = false;
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    await expect(
      paymentSettingsService.simpanKredensial(
        KAFE_A,
        'SANDBOX',
        { serverKey: 'Mid-server-abc123' },
        aktor,
      ),
    ).rejects.toThrow(/pengelola server/i);
  });

  // Ciphertext lama yang tak terbaca BUKAN cadangan.
  it('menuntut Server Key baru bila yang tersimpan tidak bisa dibaca', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('SANDBOX', { serverKeyEnc: 'ciphertext-format-asing' }),
    );

    await expect(
      paymentSettingsService.simpanKredensial(
        KAFE_A,
        'SANDBOX',
        { clientKey: 'Mid-client-baru123' },
        aktor,
      ),
    ).rejects.toThrow(/tidak bisa dibaca/i);
  });
});

// ── Kredensial yang tidak bisa didekripsi ────────────────────────────────────

describe('kredensial tak terbaca — needsReentry, bukan "tersimpan"', () => {
  it('TIDAK melaporkan kredensial tersimpan bila ciphertext-nya tak terbaca', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', { serverKeyEnc: 'ciphertext-format-asing' }),
    ]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    const sandbox = hasil.midtrans.kredensial.find((k) => k.mode === 'SANDBOX');

    // Inilah kontradiksi yang dulu tampil di layar: badge "Kredensial
    // tersimpan" bersama pesan "tidak bisa dibaca".
    expect(sandbox?.serverKeyTersimpan).toBe(false);
    expect(sandbox?.perluDimasukkanUlang).toBe(true);
    expect(sandbox?.statusKredensial).toBe('PERLU_DIMASUKKAN_ULANG');
    expect(sandbox?.lengkap).toBe(false);
    expect(hasil.midtrans.statusIntegrasi).toBe('PERLU_DIMASUKKAN_ULANG');
    expect(hasil.midtrans.bisaTransaksi).toBe(false);
  });

  it('menyembunyikan petunjuk 4 karakter untuk kunci yang tak terbaca', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', { serverKeyEnc: 'ciphertext-format-asing' }),
    ]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(
      hasil.midtrans.kredensial.find((k) => k.mode === 'SANDBOX')?.serverKeyPetunjuk,
    ).toBeNull();
  });

  it('hasil tes koneksi lama tidak membuatnya tampak SIAP', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('SANDBOX', {
        serverKeyEnc: 'ciphertext-format-asing',
        statusKoneksi: 'BERHASIL',
        statusWebhook: 'TERVERIFIKASI',
      }),
    ]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.statusIntegrasi).toBe('PERLU_DIMASUKKAN_ULANG');
  });

  // Dua sebab, dua alamat: yang ini pekerjaan operator server.
  it('membedakan ENCRYPTION_KEY hilang dari ciphertext rusak', async () => {
    keadaanEnkripsi.punyaKunci = false;
    prisma.midtransCredential.findMany.mockResolvedValue([kredensial('SANDBOX')]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    const sandbox = hasil.midtrans.kredensial.find((k) => k.mode === 'SANDBOX');

    expect(sandbox?.masalahKonfigurasiServer).toBe(true);
    expect(sandbox?.perluDimasukkanUlang).toBe(false);
    expect(sandbox?.serverKeyTersimpan).toBe(false);
    expect(hasil.midtrans.statusIntegrasi).toBe('KONFIGURASI_SERVER');
  });

  it('kredensialMode menolak memakai kunci yang tak terbaca', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('SANDBOX', { serverKeyEnc: 'ciphertext-format-asing' }),
    );
    expect(await paymentSettingsService.kredensialMode(KAFE_A, 'SANDBOX')).toBeNull();
  });

  it('tesKoneksi menyuruh mengetik ulang HANYA saat ciphertext-nya yang rusak', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('SANDBOX', { serverKeyEnc: 'ciphertext-format-asing' }),
    );

    await expect(
      paymentSettingsService.tesKoneksi(KAFE_A, 'SANDBOX', aktor),
    ).rejects.toThrow(/Masukkan ulang Server Key/i);
    expect(tesKoneksiMidtrans).not.toHaveBeenCalled();
  });

  it('tesKoneksi melaporkan masalah SERVER saat ENCRYPTION_KEY hilang', async () => {
    keadaanEnkripsi.punyaKunci = false;
    prisma.midtransCredential.findUnique.mockResolvedValue(kredensial('SANDBOX'));

    await expect(
      paymentSettingsService.tesKoneksi(KAFE_A, 'SANDBOX', aktor),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(tesKoneksiMidtrans).not.toHaveBeenCalled();
  });

  it('penghalang Production menyebut isi ulang, bukan "belum diisi"', async () => {
    prisma.midtransCredential.findMany.mockResolvedValue([
      kredensial('PRODUCTION', { serverKeyEnc: 'ciphertext-format-asing' }),
    ]);

    const hasil = await paymentSettingsService.getSettings(KAFE_A);
    expect(hasil.midtrans.penghalangProduction.join(' ')).toMatch(/dimasukkan ulang/i);
  });
});

// ── Kerahasiaan pada jalur baru ──────────────────────────────────────────────

describe('Server Key tidak pernah bocor lewat jalur baru', () => {
  it('tidak muncul di respons simpanKredensial', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);

    const hasil = await paymentSettingsService.simpanKredensial(
      KAFE_A,
      'SANDBOX',
      { clientKey: 'Mid-client-abc', serverKey: 'Mid-server-SANGATRAHASIA' },
      aktor,
    );

    expect(JSON.stringify(hasil)).not.toContain('SANGATRAHASIA');
  });

  it('tidak muncul di log saat kredensial gagal didekripsi', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prisma.midtransCredential.findUnique.mockResolvedValue(
      kredensial('SANDBOX', { serverKeyEnc: 'enc(Mid-server-SANGATRAHASIA)-rusak' }),
    );

    await paymentSettingsService.kredensialMode(KAFE_A, 'SANDBOX');

    expect(JSON.stringify(log.mock.calls)).not.toContain('SANGATRAHASIA');
    log.mockRestore();
  });
});

// ── Memutus integrasi ────────────────────────────────────────────────────────

describe('hapusKredensial', () => {
  // Tagihan yang sudah terbit akan kehilangan kunci untuk memverifikasi
  // notifikasinya — tamu yang sudah membayar tidak akan pernah tercatat lunas.
  it('menolak memutus mode aktif bila masih ada tagihan menggantung', async () => {
    prisma.order.count.mockResolvedValue(2);

    await expect(
      paymentSettingsService.hapusKredensial(KAFE_A, 'SANDBOX', aktor),
    ).rejects.toThrow(/2 pesanan yang menunggu/i);
    expect(prisma.midtransCredential.deleteMany).not.toHaveBeenCalled();
  });

  it('memutus mode yang TIDAK aktif tanpa memeriksa tagihan', async () => {
    await paymentSettingsService.hapusKredensial(KAFE_A, 'PRODUCTION', aktor);

    expect(prisma.order.count).not.toHaveBeenCalled();
    expect(prisma.midtransCredential.deleteMany).toHaveBeenCalledWith({
      where: { cafeId: KAFE_A, mode: 'PRODUCTION' },
    });
  });
});

// ── Kelengkapan konfigurasi metode ───────────────────────────────────────────

describe('opsiMetode — hanya yang benar-benar bisa dibayar', () => {
  it('menyembunyikan QRIS statis yang belum punya gambar', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([
      metode('QRIS_STATIS', { aktif: true, tersediaDiCheckout: true }),
    ]);

    expect(await paymentSettingsService.opsiMetode(KAFE_A, 'CHECKOUT')).toEqual([]);
  });

  it('menampilkan QRIS statis yang lengkap', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([
      metode('QRIS_STATIS', {
        aktif: true,
        tersediaDiCheckout: true,
        qrisImageUrl: 'https://res.cloudinary.com/x/qr.png',
        qrisMerchantName: 'Kopi Senja',
      }),
    ]);

    const hasil = await paymentSettingsService.opsiMetode(KAFE_A, 'CHECKOUT');
    expect(hasil).toHaveLength(1);
    expect(hasil[0].qrisMerchantName).toBe('Kopi Senja');
  });

  it('menyembunyikan transfer yang rekeningnya belum lengkap', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([
      metode('TRANSFER', { aktif: true, tersediaDiKasir: true, bankNama: 'BCA' }),
    ]);

    expect(await paymentSettingsService.opsiMetode(KAFE_A, 'KASIR')).toEqual([]);
  });

  // Aturan domain menang atas data: baris yang entah bagaimana menyala di
  // checkout untuk metode yang tak boleh ke sana tetap tidak ditawarkan.
  it('menolak tunai di checkout meski barisnya menyala', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([
      metode('TUNAI', { aktif: true, tersediaDiCheckout: true }),
    ]);

    expect(await paymentSettingsService.opsiMetode(KAFE_A, 'CHECKOUT')).toEqual([]);
  });

  it('menyaring berdasarkan kanal yang diminta', async () => {
    await paymentSettingsService.opsiMetode(KAFE_A, 'KASIR');
    expect(prisma.metodePembayaranKafe.findMany).toHaveBeenCalledWith({
      where: { cafeId: KAFE_A, aktif: true, tersediaDiKasir: true },
    });

    await paymentSettingsService.opsiMetode(KAFE_A, 'CHECKOUT');
    expect(prisma.metodePembayaranKafe.findMany).toHaveBeenLastCalledWith({
      where: { cafeId: KAFE_A, aktif: true, tersediaDiCheckout: true },
    });
  });
});

// ── Menyimpan sakelar metode ─────────────────────────────────────────────────

describe('simpanMetodeAktif', () => {
  const semua = (ubah: Record<string, Record<string, unknown>> = {}) =>
    ['TUNAI', 'QRIS_STATIS', 'TRANSFER', 'EDC'].map((m) => ({
      metode: m as 'TUNAI',
      aktif: false,
      tersediaDiKasir: true,
      tersediaDiCheckout: false,
      wajibVerifikasiKasir: true,
      ...(ubah[m] ?? {}),
    }));

  // Kasir yang tidak punya satu pun metode tidak bisa menagih apa pun.
  it('menolak mematikan semua metode sekaligus', async () => {
    await expect(
      paymentSettingsService.simpanMetodeAktif(KAFE_A, { metode: semua() }, aktor),
    ).rejects.toThrow(/minimal satu metode/i);
  });

  it('menolak mengaktifkan metode yang konfigurasinya belum lengkap', async () => {
    await expect(
      paymentSettingsService.simpanMetodeAktif(
        KAFE_A,
        { metode: semua({ TRANSFER: { aktif: true } }) },
        aktor,
      ),
    ).rejects.toThrow(/Lengkapi dulu pengaturan/i);
  });

  // Apa pun yang tampil di checkout WAJIB diverifikasi kasir — uangnya belum
  // ada di tangan siapa pun saat tamu menekan bayar.
  it('memaksa verifikasi kasir untuk metode yang tampil di checkout', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([
      metode('TUNAI', { aktif: true }),
      metode('QRIS_STATIS', {
        qrisImageUrl: 'https://res.cloudinary.com/x/qr.png',
        qrisMerchantName: 'Kopi Senja',
      }),
      metode('TRANSFER'),
      metode('EDC'),
    ]);

    await paymentSettingsService.simpanMetodeAktif(
      KAFE_A,
      {
        metode: semua({
          TUNAI: { aktif: true },
          QRIS_STATIS: {
            aktif: true,
            tersediaDiCheckout: true,
            wajibVerifikasiKasir: false,
          },
        }),
      },
      aktor,
    );

    const panggilanQris = prisma.metodePembayaranKafe.update.mock.calls.find(
      (c) => (c[0] as { where: { cafeId_metode: { metode: string } } }).where.cafeId_metode
        .metode === 'QRIS_STATIS',
    );
    expect((panggilanQris?.[0] as { data: Record<string, unknown> }).data).toMatchObject({
      tersediaDiCheckout: true,
      wajibVerifikasiKasir: true,
    });
  });

  it('memelihara kolom cermin `cafes.metode_diterima`', async () => {
    prisma.metodePembayaranKafe.findMany.mockResolvedValue([metode('TUNAI', { aktif: true })]);

    await paymentSettingsService.simpanMetodeAktif(
      KAFE_A,
      { metode: semua({ TUNAI: { aktif: true }, EDC: { aktif: true } }) },
      aktor,
    );

    expect(prisma.cafe.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: KAFE_A },
        data: { metodeDiterima: ['TUNAI', 'EDC'] },
      }),
    );
  });
});

// ── Tes koneksi ──────────────────────────────────────────────────────────────

describe('tesKoneksi', () => {
  it('menolak menguji mode yang belum punya Server Key', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(null);
    await expect(paymentSettingsService.tesKoneksi(KAFE_A, 'SANDBOX', aktor)).rejects.toThrow(
      /belum diisi/i,
    );
  });

  it('menyimpan hasil uji beserta waktunya', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(kredensial('SANDBOX'));
    tesKoneksiMidtrans.mockResolvedValue({ berhasil: true, pesan: 'Kredensial diterima.' });

    const hasil = await paymentSettingsService.tesKoneksi(KAFE_A, 'SANDBOX', aktor);

    expect(hasil.berhasil).toBe(true);
    const args = prisma.midtransCredential.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.statusKoneksi).toBe('BERHASIL');
    expect(args.data.koneksiDiperiksa).toBeInstanceOf(Date);
  });

  it('mencatat kegagalan tanpa membuat permintaan gagal', async () => {
    prisma.midtransCredential.findUnique.mockResolvedValue(kredensial('SANDBOX'));
    tesKoneksiMidtrans.mockResolvedValue({ berhasil: false, pesan: 'Server Key ditolak.' });

    const hasil = await paymentSettingsService.tesKoneksi(KAFE_A, 'SANDBOX', aktor);

    expect(hasil.berhasil).toBe(false);
    const args = prisma.midtransCredential.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.statusKoneksi).toBe('GAGAL');
  });
});

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { rateLimit } from '../middleware/rateLimit';
import { uploadSingle } from '../middleware/upload';
import { ApiError } from '../lib/ApiError';
import { paymentSettingsService } from '../services/paymentSettings.service';
import { uploadService } from '../services/upload.service';
import { aktorDariRequest, auditLogService } from '../services/auditLog.service';
import {
  parseKodeMetode,
  parseKonfigurasiMetodeInput,
  parseKredensialInput,
  parseMetodeAktifInput,
  parseMode,
} from '../validation/paymentSettings.validation';

export const cafePaymentRouter = Router();

/**
 * Pengaturan pembayaran kafe.
 *
 * TIDAK ADA `:cafeId` di URL mana pun di berkas ini — tenant SELALU diambil
 * dari token. Itu bukan sekadar gaya: selama kafe tujuan tidak pernah datang
 * dari klien, tidak ada parameter yang bisa ditebak untuk menyeberang ke
 * konfigurasi (dan nomor rekening) kafe lain.
 *
 * PEMBAGIAN HAK:
 *   - OWNER  : membaca & mengubah seluruh pengaturan, termasuk kredensial.
 *   - KASIR  : hanya `GET /cafe/payment-config` — daftar metode yang bisa
 *              ditagihnya. Tidak pernah menyentuh kredensial apa pun.
 * Server Key tidak dikembalikan endpoint mana pun, untuk peran mana pun.
 */
const ownerOnly = [requireAuth, requireRole('OWNER'), attachUser, tenantScope];

/**
 * Tes koneksi memanggil server luar dengan kredensial kafe. Dibatasi supaya
 * tombolnya tidak bisa dipakai membanjiri Midtrans — atau membakar kuota kafe
 * lewat satu layar yang macet menekan berulang kali.
 */
const batasTesKoneksi = rateLimit({
  maks: 10,
  jendelaMs: 5 * 60_000,
  pesan: 'Terlalu sering menguji koneksi. Tunggu beberapa menit lalu coba lagi.',
});

/** Penyimpanan kredensial ikut dibatasi — endpoint paling sensitif di sini. */
const batasKredensial = rateLimit({
  maks: 20,
  jendelaMs: 5 * 60_000,
  pesan: 'Terlalu banyak perubahan kredensial. Tunggu beberapa menit lalu coba lagi.',
});

// ── Pengaturan lengkap ───────────────────────────────────────────────────────

// GET /api/cafe/payment-settings — seluruh pengaturan (halaman Pembayaran).
cafePaymentRouter.get(
  '/cafe/payment-settings',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await paymentSettingsService.getSettings(req.auth!.cafeId);
    res.json({ data });
  }),
);

// PUT /api/cafe/payment-settings/metode — sakelar aktif/kanal seluruh metode.
cafePaymentRouter.put(
  '/cafe/payment-settings/metode',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const input = parseMetodeAktifInput(req.body);
    const data = await paymentSettingsService.simpanMetodeAktif(
      req.auth!.cafeId,
      input,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// PUT /api/cafe/payment-settings/metode/:metode — rincian satu metode.
cafePaymentRouter.put(
  '/cafe/payment-settings/metode/:metode',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const metode = parseKodeMetode(req.params.metode);
    const input = parseKonfigurasiMetodeInput(metode, req.body);
    const data = await paymentSettingsService.simpanKonfigurasiMetode(
      req.auth!.cafeId,
      metode,
      input,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// ── Midtrans ─────────────────────────────────────────────────────────────────

// PUT /api/cafe/payment-settings/midtrans/:mode — simpan/ganti kredensial.
cafePaymentRouter.put(
  '/cafe/payment-settings/midtrans/:mode',
  ownerOnly,
  batasKredensial,
  asyncHandler(async (req, res) => {
    const mode = parseMode(req.params.mode);
    const input = parseKredensialInput(mode, req.body);
    const data = await paymentSettingsService.simpanKredensial(
      req.auth!.cafeId,
      mode,
      input,
      aktorDariRequest(req),
    );
    // `peringatan` = kejanggalan bentuk kunci (mis. awalan "SB-" di slot
    // Production). Ikut dikirim sebagai CATATAN, terpisah dari `data`, dan
    // tidak pernah menggagalkan penyimpanan: yang menentukan sah-tidaknya
    // sebuah kunci adalah jawaban endpoint Midtrans mode ini, bukan awalannya.
    res.json({ data, ...(input.peringatan?.length && { peringatan: input.peringatan }) });
  }),
);

// DELETE /api/cafe/payment-settings/midtrans/:mode — putuskan integrasi.
cafePaymentRouter.delete(
  '/cafe/payment-settings/midtrans/:mode',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await paymentSettingsService.hapusKredensial(
      req.auth!.cafeId,
      parseMode(req.params.mode),
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// POST /api/cafe/payment-settings/midtrans/:mode/tes-koneksi
cafePaymentRouter.post(
  '/cafe/payment-settings/midtrans/:mode/tes-koneksi',
  ownerOnly,
  batasTesKoneksi,
  asyncHandler(async (req, res) => {
    const hasil = await paymentSettingsService.tesKoneksi(
      req.auth!.cafeId,
      parseMode(req.params.mode),
      aktorDariRequest(req),
    );
    res.json({ data: hasil });
  }),
);

// GET /api/cafe/payment-settings/midtrans/:mode/webhook — status notifikasi.
cafePaymentRouter.get(
  '/cafe/payment-settings/midtrans/:mode/webhook',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await paymentSettingsService.statusWebhook(
      req.auth!.cafeId,
      parseMode(req.params.mode),
    );
    res.json({ data });
  }),
);

// PUT /api/cafe/payment-settings/midtrans-mode — ganti mode aktif kafe.
// Syarat mode Production diperiksa di service, bukan di sini: dialog konfirmasi
// di layar adalah pengingat, bukan penjaga.
cafePaymentRouter.put(
  '/cafe/payment-settings/midtrans-mode',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const mode = parseMode((req.body as { mode?: unknown })?.mode);
    const data = await paymentSettingsService.setMode(
      req.auth!.cafeId,
      mode,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// ── Unggahan gambar QRIS ─────────────────────────────────────────────────────

// POST /api/cafe/payment-settings/qris — unggah gambar QRIS statis (field: `foto`).
// Berkas disimpan di `cafeos/<cafeId>/qris/…`; `cafeId` dari token, sehingga
// tidak ada cara menitipkan berkas ke folder kafe lain.
cafePaymentRouter.post(
  '/cafe/payment-settings/qris',
  ownerOnly,
  uploadSingle,
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Belum ada gambar QRIS yang dipilih.');
    const data = await uploadService.unggahQris(req.auth!.cafeId, req.file.buffer);
    res.status(201).json({ data });
  }),
);

// ── Jejak audit ──────────────────────────────────────────────────────────────

// GET /api/cafe/payment-settings/audit?limit=&aksi=&orderId=
cafePaymentRouter.get(
  '/cafe/payment-settings/audit',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const limitMentah = req.query.limit;
    const limit = typeof limitMentah === 'string' ? Number(limitMentah) : undefined;
    if (limit !== undefined && !Number.isFinite(limit)) {
      throw ApiError.badRequest('Parameter "limit" harus berupa angka');
    }

    const data = await auditLogService.riwayat(req.auth!.cafeId, {
      limit,
      aksi: typeof req.query.aksi === 'string' ? req.query.aksi : undefined,
      orderId: typeof req.query.orderId === 'string' ? req.query.orderId : undefined,
    });
    res.json({ data });
  }),
);

// ── Kompatibilitas: konfigurasi ringkas untuk layar kasir ────────────────────

/**
 * GET /api/cafe/payment-config — bentuk ringkas yang dibaca layar kasir.
 *
 * Dipertahankan (bukan dihapus) karena inilah yang dipanggil modal pembayaran
 * kasir, dan peran KASIR memang tidak boleh membuka `payment-settings` yang
 * memuat nomor rekening & status kredensial. Isinya cuma: metode apa yang
 * boleh ditagih di kasir, dan apakah Midtrans bisa dipakai.
 *
 * `PUT` versi lama SUDAH DIHAPUS. Ia menyimpan satu pasang kunci untuk kedua
 * mode sekaligus — persis cacat yang diperbaiki modul ini — dan digantikan
 * endpoint granular di atas. Satu-satunya pemanggilnya adalah halaman
 * Pengaturan Pembayaran, yang ikut diperbarui.
 */
cafePaymentRouter.get(
  '/cafe/payment-config',
  requireAuth,
  requireRole('OWNER', 'KASIR'),
  attachUser,
  tenantScope,
  asyncHandler(async (req, res) => {
    const cafeId = req.auth!.cafeId;
    const [metode, kredensial] = await Promise.all([
      paymentSettingsService.opsiMetode(cafeId, 'KASIR'),
      paymentSettingsService.kredensialAktif(cafeId),
    ]);

    res.json({
      data: {
        metodeDiterima: metode.map((m) => m.metode),
        metodeDetail: metode,
        // Nama field dipertahankan supaya klien lama tetap jalan; artinya kini
        // tegas: "kredensial mode aktif tersedia", bukan "pernah ada key".
        midtransAktif: Boolean(kredensial?.clientKey),
        clientKey: kredensial?.clientKey ?? null,
        isProduction: kredensial?.mode === 'PRODUCTION',
      },
    });
  }),
);

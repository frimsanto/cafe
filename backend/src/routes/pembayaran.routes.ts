import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { ApiError } from '../lib/ApiError';
import { pembayaranService } from '../services/pembayaran.service';
import {
  parseDokuBuatInput,
  parseManualPaymentInput,
  parseMidtransBuatInput,
} from '../validation/pembayaran.validation';

export const pembayaranRouter = Router();

/**
 * Area pembayaran STAF (kasir & pemilik). `cafeId` selalu dari token —
 * tenantScope membatasi seluruh query Prisma ke kafe pengguna.
 *
 * Sebagian endpoint di berkas ini sengaja PUBLIK: pelanggan membayar dari HP-nya
 * sendiri tanpa akun. Endpoint publik tidak pernah menerima `cafeId` dari klien —
 * kafe selalu diturunkan dari pesanan — sehingga tidak ada jalan menyeberang
 * tenant lewat parameter yang ditebak.
 */
const kasirAccess = [
  requireAuth,
  requireRole('KASIR', 'OWNER'),
  attachUser,
  tenantScope,
];

const STATUS_VALUES = ['LUNAS', 'MENUNGGU', 'GAGAL'];

/** Baca tanggal opsional dari query; lempar bila formatnya tidak valid. */
function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Parameter "${field}" harus berupa tanggal`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(`Parameter "${field}" bukan tanggal yang valid`);
  }
  return date;
}

// POST /api/pembayaran/manual — konfirmasi pembayaran manual oleh kasir.
pembayaranRouter.post(
  '/pembayaran/manual',
  kasirAccess,
  asyncHandler(async (req, res) => {
    const input = parseManualPaymentInput(req.body);
    const order = await pembayaranService.konfirmasiManual(req.auth!.cafeId, input);
    res.json({ berhasil: true, order });
  }),
);

// GET /api/cafes/:cafeId/pembayaran/opsi — metode yang tersedia di sebuah kafe.
// PUBLIK: dibaca halaman checkout pelanggan untuk memilih Midtrans atau, bila
// kafe belum menyetelnya, menampilkan daftar metode manual. Tidak pernah
// mengembalikan kredensial apa pun.
pembayaranRouter.get(
  '/cafes/:cafeId/pembayaran/opsi',
  asyncHandler(async (req, res) => {
    const data = await pembayaranService.opsiPublik(req.params.cafeId);
    res.json({ data });
  }),
);

// POST /api/pembayaran/midtrans/buat — buat transaksi Snap untuk sebuah pesanan.
// PUBLIK: pemanggilnya pelanggan di meja yang memang tidak punya akun. Kafe
// (beserta kredensialnya) diturunkan dari pesanan, bukan dari body.
pembayaranRouter.post(
  '/pembayaran/midtrans/buat',
  asyncHandler(async (req, res) => {
    const { orderId } = parseMidtransBuatInput(req.body);
    const result = await pembayaranService.buatMidtrans(orderId);
    res.json({ data: result });
  }),
);

// POST /api/pembayaran/doku/buat — buat halaman pembayaran DOKU Checkout.
// PUBLIK: sama seperti jalur Midtrans, pemanggilnya pelanggan di meja. Kredensial
// DOKU milik platform (dari environment), jadi tidak ada apa pun soal kafe yang
// diterima dari body — kafe tetap diturunkan dari pesanan.
pembayaranRouter.post(
  '/pembayaran/doku/buat',
  asyncHandler(async (req, res) => {
    const { orderId } = parseDokuBuatInput(req.body);
    const result = await pembayaranService.buatDoku(orderId);
    res.json({ data: result });
  }),
);

// POST /api/pembayaran/doku/notifikasi — webhook DOKU. PUBLIK (tanpa auth):
// dipanggil server DOKU, bukan pengguna. SELALU balas 200 agar gateway tidak
// mengulang; keabsahannya dijaga verifikasi signature di dalam service.
//
// URL yang didaftarkan di dasbor DOKU:
//   https://cafe.fessolution.my.id/api/pembayaran/doku/notifikasi
pembayaranRouter.post(
  '/pembayaran/doku/notifikasi',
  asyncHandler(async (req, res) => {
    try {
      await pembayaranService.handleNotifikasiDoku(
        req.headers,
        (req.body ?? {}) as Record<string, unknown>,
        {
          // Body mentah (dipasang express.json) — wajib byte-identik agar digest
          // cocok. `originalUrl` = path lengkap yang dipanggil DOKU, yaitu
          // Request-Target yang ikut ditandatangani; query string dibuang.
          rawBody: (req as typeof req & { rawBody?: string }).rawBody ?? '',
          requestTarget: req.originalUrl.split('?')[0],
        },
      );
    } catch (err) {
      console.error('[doku] webhook error (ditelan, balas 200):', err);
    }
    res.status(200).json({ ok: true });
  }),
);

// GET /api/pembayaran/riwayat?status=&dari=&sampai= — riwayat pembayaran kafe.
pembayaranRouter.get(
  '/pembayaran/riwayat',
  kasirAccess,
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    if (status !== undefined) {
      if (typeof status !== 'string' || !STATUS_VALUES.includes(status)) {
        throw ApiError.badRequest(
          `Parameter "status" harus salah satu dari: ${STATUS_VALUES.join(', ')}`,
        );
      }
    }
    const data = await pembayaranService.riwayat({
      status: typeof status === 'string' ? status : undefined,
      dari: parseDate(req.query.dari, 'dari'),
      sampai: parseDate(req.query.sampai, 'sampai'),
    });
    res.json({ data });
  }),
);

// GET /api/pembayaran/:orderId/status — status pembayaran sebuah pesanan
// (polling halaman status). PUBLIK: yang menunggu hasilnya adalah pelanggan.
// Parameternya boleh id pesanan CafeOS maupun `order_id` Midtrans.
pembayaranRouter.get(
  '/pembayaran/:orderId/status',
  asyncHandler(async (req, res) => {
    const data = await pembayaranService.statusPembayaran(req.params.orderId);
    res.json({ data });
  }),
);

// POST /api/pembayaran/notifikasi/:cafeId — webhook Midtrans. PUBLIK (tanpa auth):
// dipanggil server Midtrans, bukan pengguna. SELALU balas 200 agar gateway tidak
// mengulang; galat internal cukup dicatat di service.
pembayaranRouter.post(
  '/pembayaran/notifikasi/:cafeId',
  asyncHandler(async (req, res) => {
    try {
      await pembayaranService.handleNotifikasi(
        req.params.cafeId,
        (req.body ?? {}) as Record<string, unknown>,
      );
    } catch (err) {
      console.error('[pembayaran] webhook error (ditelan, balas 200):', err);
    }
    res.status(200).json({ ok: true });
  }),
);

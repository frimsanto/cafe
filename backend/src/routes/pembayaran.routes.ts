import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { ApiError } from '../lib/ApiError';
import { pembayaranService } from '../services/pembayaran.service';
import {
  parseManualPaymentInput,
  parseMidtransBuatInput,
} from '../validation/pembayaran.validation';

export const pembayaranRouter = Router();

/**
 * Area pembayaran: kasir & pemilik. `cafeId` selalu dari token — tenantScope
 * membatasi seluruh query Prisma ke kafe pengguna.
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

// POST /api/pembayaran/midtrans/buat — buat transaksi Snap untuk sebuah pesanan.
pembayaranRouter.post(
  '/pembayaran/midtrans/buat',
  kasirAccess,
  asyncHandler(async (req, res) => {
    const { orderId } = parseMidtransBuatInput(req.body);
    const result = await pembayaranService.buatMidtrans(req.auth!.cafeId, orderId);
    res.json({ data: result });
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

// GET /api/pembayaran/:midtransOrderId/status — status transaksi Midtrans (polling).
pembayaranRouter.get(
  '/pembayaran/:midtransOrderId/status',
  kasirAccess,
  asyncHandler(async (req, res) => {
    const data = await pembayaranService.statusMidtrans(req.params.midtransOrderId);
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

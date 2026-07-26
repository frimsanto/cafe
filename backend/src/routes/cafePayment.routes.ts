import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { cafePaymentService } from '../services/cafePayment.service';
import { parsePaymentConfigInput } from '../validation/cafePayment.validation';

export const cafePaymentRouter = Router();

// Konfigurasi pembayaran memakai `cafeId` dari token (bukan dari URL), jadi tak
// ada `:cafeId` yang bisa ditebak — pengguna selalu menyetel kafenya sendiri.

// GET /api/cafe/payment-config — dibaca halaman pengaturan & modal kasir.
// Semua peran boleh membaca (kasir butuh daftar metode aktif). serverKey TIDAK
// pernah ikut dikembalikan.
cafePaymentRouter.get(
  '/cafe/payment-config',
  requireAuth,
  attachUser,
  asyncHandler(async (req, res) => {
    const data = await cafePaymentService.getConfig(req.auth!.cafeId);
    res.json({ data });
  }),
);

// PUT /api/cafe/payment-config — hanya OWNER yang boleh mengubah konfigurasi
// (termasuk kredensial Midtrans).
cafePaymentRouter.put(
  '/cafe/payment-config',
  requireAuth,
  requireRole('OWNER'),
  attachUser,
  asyncHandler(async (req, res) => {
    const input = parsePaymentConfigInput(req.body);
    const config = await cafePaymentService.saveConfig(req.auth!.cafeId, input);
    res.json({
      berhasil: true,
      metodeDiterima: config.metodeDiterima,
      midtransAktif: config.midtransAktif,
      clientKey: config.clientKey,
    });
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  attachUser,
  requireAuth,
  requireRole,
  requireSameCafe,
} from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { cashierService } from '../services/cashier.service';

export const cashierRouter = Router();

/**
 * Area kasir: kasir dan pemilik. Dapur tidak berkepentingan dengan uang, jadi
 * peran DAPUR sengaja tidak diberi akses.
 */
const cashierAccess = [
  requireAuth,
  requireRole('KASIR', 'OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
];

// GET /api/cafes/:cafeId/cashier/orders — antrean pesanan menunggu pembayaran.
cashierRouter.get(
  '/cafes/:cafeId/cashier/orders',
  cashierAccess,
  asyncHandler(async (_req, res) => {
    const data = await cashierService.listPendingOrders();
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/cashier/orders/:orderId/receipt-data — data struk
// (JSON) untuk pratinjau & cetak di peramban kasir. Struk PDF jadi tetap
// tersedia di `GET /api/cafes/:cafeId/orders/:orderId/receipt`.
cashierRouter.get(
  '/cafes/:cafeId/cashier/orders/:orderId/receipt-data',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const data = await cashierService.getReceiptData(
      req.params.cafeId,
      req.params.orderId,
    );
    res.json({ data });
  }),
);

// Konfirmasi pembayaran kasir TIDAK ada di sini: satu-satunya jalurnya adalah
// `POST /api/pembayaran/manual` (metode manual) dan Midtrans (`/api/pembayaran/
// midtrans/*`). Endpoint `/pay` lama sudah dihapus agar tidak ada dua jalan
// menuju "pesanan lunas".

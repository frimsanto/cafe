import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  attachUser,
  requireAuth,
  requireRole,
  requireSameCafe,
} from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { kitchenService } from '../services/kitchen.service';
import { aktorDariRequest } from '../services/auditLog.service';
import {
  parseUpdateKitchenStatusInput,
  parseUpdateOrderKitchenStatusInput,
} from '../validation/kitchen.validation';

export const kitchenRouter = Router();

/**
 * Layar Dapur adalah area STAF, bukan pelanggan. Seluruh endpoint di bawah
 * memerlukan token, dibatasi peran DAPUR (dan OWNER yang boleh memantau), serta
 * hanya boleh menyentuh data kafenya sendiri.
 */
const kitchenGuards = [
  requireAuth,
  requireRole('DAPUR', 'OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
];

// GET /api/cafes/:cafeId/kitchen/orders — pesanan aktif untuk Layar Dapur.
kitchenRouter.get(
  '/cafes/:cafeId/kitchen/orders',
  ...kitchenGuards,
  asyncHandler(async (req, res) => {
    const data = await kitchenService.getActiveOrders(req.params.cafeId);
    res.json({ data });
  }),
);

// PATCH /api/cafes/:cafeId/kitchen/items/:itemId — ubah status masak satu item.
kitchenRouter.patch(
  '/cafes/:cafeId/kitchen/items/:itemId',
  ...kitchenGuards,
  asyncHandler(async (req, res) => {
    const { status } = parseUpdateKitchenStatusInput(req.body);
    const order = await kitchenService.updateItemStatus(
      req.params.cafeId,
      req.params.itemId,
      status,
    );
    res.json({ data: order });
  }),
);

// PATCH /api/cafes/:cafeId/kitchen/orders/:orderId/status — gerakkan SATU TIKET
// (bukan satu item): "Mulai Proses" → PREPARING, "Siap Disajikan" → READY.
//
// Menutup pesanan (COMPLETED) sengaja TIDAK bisa dari sini — itu milik kasir,
// lewat `POST /api/cafes/:cafeId/cashier/orders/:orderId/selesai`.
kitchenRouter.patch(
  '/cafes/:cafeId/kitchen/orders/:orderId/status',
  ...kitchenGuards,
  asyncHandler(async (req, res) => {
    const { status } = parseUpdateOrderKitchenStatusInput(req.body);
    const order = await kitchenService.ubahTahap(
      req.params.cafeId,
      req.params.orderId,
      status,
      aktorDariRequest(req),
    );
    res.json({ data: order });
  }),
);

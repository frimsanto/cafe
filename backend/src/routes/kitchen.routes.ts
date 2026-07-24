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
import { parseUpdateKitchenStatusInput } from '../validation/kitchen.validation';

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

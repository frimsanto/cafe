import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { orderService } from '../services/order.service';
import { parseCreateOrderInput } from '../validation/order.validation';

export const orderRouter = Router();

// POST /api/cafes/:cafeId/orders — buat pesanan baru (status MENUNGGU_PEMBAYARAN).
orderRouter.post(
  '/cafes/:cafeId/orders',
  asyncHandler(async (req, res) => {
    const input = parseCreateOrderInput(req.body);
    const order = await orderService.createOrder(req.params.cafeId, input);
    res.status(201).json({ data: order });
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { orderService } from '../services/order.service';
import {
  parseAddOrderItemsInput,
  parseCreateOrderInput,
} from '../validation/order.validation';

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

// POST /api/cafes/:cafeId/orders/:orderId/items — tambah item ke pesanan yang
// MASIH menunggu pembayaran. PUBLIK, seperti endpoint pembuatan pesanan di
// atas: yang memesan tambahan adalah tamu yang tidak punya akun. Pemegang
// sebuah orderId hanya bisa menambah isi pesanan itu sendiri, dan hanya selama
// pesanannya belum dibayar (dijaga di service).
orderRouter.post(
  '/cafes/:cafeId/orders/:orderId/items',
  asyncHandler(async (req, res) => {
    const input = parseAddOrderItemsInput(req.body);
    const order = await orderService.addItems(
      req.params.cafeId,
      req.params.orderId,
      input,
    );
    res.json({ data: order });
  }),
);

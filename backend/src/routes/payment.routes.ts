import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { paymentService } from '../services/payment.service';
import {
  parsePayInput,
  parseWebhookInput,
} from '../validation/payment.validation';

export const paymentRouter = Router();

// POST /api/cafes/:cafeId/orders/:orderId/pay — konfirmasi pembayaran di meja.
paymentRouter.post(
  '/cafes/:cafeId/orders/:orderId/pay',
  asyncHandler(async (req, res) => {
    const input = parsePayInput(req.body);
    const order = await paymentService.payOrder(
      req.params.cafeId,
      req.params.orderId,
      input,
    );
    res.json({ data: order });
  }),
);

// POST /api/payments/webhook — callback dari payment gateway (seam, belum aktif).
paymentRouter.post(
  '/payments/webhook',
  asyncHandler(async (req, res) => {
    const input = parseWebhookInput(req.body);
    const result = await paymentService.handleGatewayCallback(input);
    res.json({ received: true, ...result });
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { pushService } from '../services/push.service';
import { parsePushSubscriptionInput } from '../validation/push.validation';
import { vapidPublicKey, webPushEnabled } from '../lib/webpush';

export const pushRouter = Router();

// GET /api/push/vapid-public-key — kunci publik VAPID untuk frontend berlangganan.
pushRouter.get('/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey, enabled: webPushEnabled });
});

// POST /api/cafes/:cafeId/orders/:orderId/push-subscription — daftarkan perangkat.
pushRouter.post(
  '/cafes/:cafeId/orders/:orderId/push-subscription',
  asyncHandler(async (req, res) => {
    const sub = parsePushSubscriptionInput(req.body);
    await pushService.saveSubscription(
      req.params.cafeId,
      req.params.orderId,
      sub,
    );
    res.status(201).json({ ok: true });
  }),
);

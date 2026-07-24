import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { receiptService } from '../services/receipt.service';
import { streamReceiptPdf } from '../lib/receiptPdf';

export const receiptRouter = Router();

// GET /api/cafes/:cafeId/orders/:orderId/receipt — unduh struk PDF.
receiptRouter.get(
  '/cafes/:cafeId/orders/:orderId/receipt',
  asyncHandler(async (req, res) => {
    // Validasi & ambil data dulu (bisa melempar error JSON) SEBELUM streaming PDF.
    const order = await receiptService.getPaidOrder(
      req.params.cafeId,
      req.params.orderId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="struk-${order.id}.pdf"`,
    );

    streamReceiptPdf(res, order);
  }),
);

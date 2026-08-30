import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { receiptService } from '../services/receipt.service';
import { streamReceiptPdf } from '../lib/receiptPdf';
import { nomorAntrian } from '../lib/orderCode';

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
    // Nama berkas memakai nomor antrian (`struk-A-001.pdf`), bukan UUID: berkas
    // ini berakhir di folder Unduhan tamu, dan `struk-A-001` masih bisa
    // dicocokkan dengan struk kertasnya.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="struk-${nomorAntrian(order.queueNumber)}.pdf"`,
    );

    streamReceiptPdf(res, order);
  }),
);

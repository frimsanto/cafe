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
import { kitchenService } from '../services/kitchen.service';
import { aktorDariRequest } from '../services/auditLog.service';
import {
  parseBatalPesananInput,
  parseBuatPesananKasirInput,
  parseFilterPesananKasir,
} from '../validation/cashier.validation';

export const cashierRouter = Router();

/**
 * Area kasir: kasir dan pemilik. Dapur tidak berkepentingan dengan uang, jadi
 * peran DAPUR sengaja tidak diberi akses.
 *
 * `requireSameCafe` membandingkan `:cafeId` di URL dengan kafe pada token, dan
 * `tenantScope` menyuntikkan filter `cafe_id` ke seluruh query Prisma sesudahnya
 * — dua lapis yang sama-sama bersumber dari token, tidak satu pun dari body.
 */
const cashierAccess = [
  requireAuth,
  requireRole('KASIR', 'OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
];

// GET /api/cafes/:cafeId/cashier/orders?tab=&q=&fulfillmentType=&orderSource=
//   &statusPembayaran=&limit=
//
// Tanpa parameter, jawabannya PERSIS seperti versi lama endpoint ini (antrean
// pesanan yang menunggu pembayaran) — klien lama yang belum diperbarui tetap
// mendapatkan daftar yang sama.
cashierRouter.get(
  '/cafes/:cafeId/cashier/orders',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const filter = parseFilterPesananKasir(req.query);
    const data = await cashierService.listOrders(req.params.cafeId, filter);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/cashier/summary — angka di kepala halaman kasir.
cashierRouter.get(
  '/cafes/:cafeId/cashier/summary',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const data = await cashierService.ringkasan(req.params.cafeId);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/cashier/tables — daftar meja untuk pemilihan di POS.
// Bentuknya sengaja miskin (tanpa token QR / URL cetak): peran KASIR tidak
// berhak melihat data itu, tapi tetap harus bisa memilih meja.
cashierRouter.get(
  '/cafes/:cafeId/cashier/tables',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const data = await cashierService.mejaUntukKasir(req.params.cafeId);
    res.json({ data });
  }),
);

// POST /api/cafes/:cafeId/cashier/orders — kasir membuat pesanan sendiri
// (makan di tempat / bawa pulang) sekaligus menagihnya.
//
// Wajib membawa `idempotencyKey`; tombol yang ditekan dua kali mengembalikan
// pesanan yang sama, bukan tagihan kedua.
cashierRouter.post(
  '/cafes/:cafeId/cashier/orders',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const input = parseBuatPesananKasirInput(req.body);
    const data = await cashierService.buatPesanan(
      req.params.cafeId,
      input,
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

// GET /api/cafes/:cafeId/cashier/orders/:orderId — detail satu pesanan.
cashierRouter.get(
  '/cafes/:cafeId/cashier/orders/:orderId',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const data = await cashierService.getOrder(req.params.cafeId, req.params.orderId);
    res.json({ data });
  }),
);

// POST /api/cafes/:cafeId/cashier/orders/:orderId/batal — batalkan dengan alasan.
cashierRouter.post(
  '/cafes/:cafeId/cashier/orders/:orderId/batal',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const { alasan } = parseBatalPesananInput(req.body);
    const data = await cashierService.batalkanPesanan(
      req.params.cafeId,
      req.params.orderId,
      alasan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// POST /api/cafes/:cafeId/cashier/orders/:orderId/selesai — "Diserahkan".
//
// Milik KASIR, bukan dapur: yang tahu makanannya benar-benar sampai ke tamu
// adalah orang yang mengantarkannya. Titik ini juga yang membebaskan mejanya.
cashierRouter.post(
  '/cafes/:cafeId/cashier/orders/:orderId/selesai',
  cashierAccess,
  asyncHandler(async (req, res) => {
    const data = await kitchenService.tandaiSelesai(
      req.params.cafeId,
      req.params.orderId,
      aktorDariRequest(req),
    );
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

// Konfirmasi pembayaran untuk pesanan yang SUDAH ADA tidak ada di sini:
// satu-satunya jalurnya adalah `POST /api/pembayaran/manual` (metode manual)
// dan Midtrans (`/api/pembayaran/midtrans/*`). Endpoint `/pay` lama sudah
// dihapus agar tidak ada dua jalan menuju "pesanan lunas". Yang di berkas ini
// hanyalah jalur POS — pesanan yang lahir dan dibayar pada saat yang sama.

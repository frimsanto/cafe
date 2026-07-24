import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  attachUser,
  requireAuth,
  requireRole,
  requireSameCafe,
} from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { tableService } from '../services/table.service';
import { parseQrSize, renderQrPng, slugifyFileName } from '../lib/qrImage';
import { parseTableNameInput } from '../validation/table.validation';

export const tableRouter = Router();

/**
 * Meja & QR adalah data pengaturan kafe, jadi seluruh endpoint di sini
 * tertutup: wajib token, hanya OWNER, dan hanya untuk kafenya sendiri.
 * Pelanggan tidak perlu daftar meja — mereka masuk lewat token QR di URL.
 */
const ownerOnly = [
  requireAuth,
  requireRole('OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
];

// GET /api/tables/by-qr/:qrCode — PUBLIK. Dipakai halaman menu pelanggan untuk
// menerjemahkan hasil pindai QR menjadi meja + kafe yang benar. Tidak memakai
// `tenantScope`: pemindainya pelanggan yang memang tidak punya akun.
tableRouter.get(
  '/tables/by-qr/:qrCode',
  asyncHandler(async (req, res) => {
    const data = await tableService.resolveByQrCode(req.params.qrCode);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/tables — daftar meja kafe beserta status pemakaian
// (KOSONG/DIGUNAKAN) yang diturunkan dari pesanan yang masih berjalan.
tableRouter.get(
  '/cafes/:cafeId/tables',
  ownerOnly,
  asyncHandler(async (_req, res) => {
    const data = await tableService.listTablesWithStatus();
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/tables/:tableId — detail satu meja.
tableRouter.get(
  '/cafes/:cafeId/tables/:tableId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await tableService.getTableOrFail(req.params.tableId);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/tables/:tableId/qr.png?size=1024 — unduh gambar QR
// beresolusi cetak. Auth lewat header, jadi klien mengunduhnya dengan fetch +
// blob (bukan <img src>), sama seperti unduh struk PDF.
tableRouter.get(
  '/cafes/:cafeId/tables/:tableId/qr.png',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const size = parseQrSize(req.query.size);
    // Ambil datanya dulu — error di sini masih bisa dibalas sebagai JSON.
    const table = await tableService.getTableOrFail(req.params.tableId);
    const png = await renderQrPng(table.menuUrl, size);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="qr-${slugifyFileName(table.tableName)}.png"`,
    );
    // Isinya milik satu kafe — jangan disimpan proxy/CDN bersama.
    res.setHeader('Cache-Control', 'private, no-store');

    res.end(png);
  }),
);

// POST /api/cafes/:cafeId/tables — tambah meja (token QR dibuat server).
tableRouter.post(
  '/cafes/:cafeId/tables',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { tableName } = parseTableNameInput(req.body);
    const data = await tableService.createTable(req.params.cafeId, tableName);
    res.status(201).json({ data });
  }),
);

// PATCH /api/cafes/:cafeId/tables/:tableId — ubah nama meja.
tableRouter.patch(
  '/cafes/:cafeId/tables/:tableId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { tableName } = parseTableNameInput(req.body);
    const data = await tableService.renameTable(req.params.tableId, tableName);
    res.json({ data });
  }),
);

// DELETE /api/cafes/:cafeId/tables/:tableId — soft delete meja
// (ditolak 409 bila masih ada pesanan berjalan).
tableRouter.delete(
  '/cafes/:cafeId/tables/:tableId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await tableService.deleteTable(req.params.tableId);
    res.json({ data });
  }),
);

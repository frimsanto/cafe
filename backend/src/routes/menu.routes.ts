import { Router, type Request } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  attachUser,
  requireAuth,
  requireRole,
  requireSameCafe,
} from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { menuService } from '../services/menu.service';
import {
  parseAvailabilityInput,
  parseCategoryNameInput,
  parseCategoryOrderInput,
  parseCreateMenuItemInput,
  parseMoveItemInput,
  parseUpdateMenuItemInput,
} from '../validation/menu.validation';

/**
 * Rantai proteksi untuk endpoint pengelolaan menu: hanya OWNER kafe yang
 * bersangkutan, dengan konteks tenant aktif. Urutannya disengaja — penolakan
 * 401/403 terjadi sebelum menyentuh database.
 */
const ownerOnly = [
  requireAuth,
  requireRole('OWNER'),
  requireSameCafe,
  attachUser,
  tenantScope,
];

export const menuRouter = Router();

/**
 * GET /api/menus — menu milik kafe pengguna yang sedang masuk.
 *
 * Tidak ada `cafeId` pada URL: tenant sepenuhnya ditentukan token, dan filter
 * `cafe_id` disuntikkan otomatis oleh isolasi tenant. Endpoint ini menjadi
 * bukti bahwa dua pengguna dari kafe berbeda memanggil URL yang PERSIS SAMA
 * namun menerima data yang berbeda.
 */
menuRouter.get(
  '/menus',
  requireAuth,
  tenantScope,
  asyncHandler(async (req, res) => {
    const items = await menuService.getMenuItemsForCurrentTenant();
    res.json({
      data: {
        cafeId: req.auth!.cafeId,
        count: items.length,
        items,
      },
    });
  }),
);

/** Baca flag boolean dari query (?available=true / ?availableOnly=1). */
function boolQuery(req: Request, ...keys: string[]): boolean {
  return keys.some((key) => {
    const v = req.query[key];
    return v === 'true' || v === '1';
  });
}

// GET /api/cafes/:cafeId/menu — menu lengkap dikelompokkan per kategori.
menuRouter.get(
  '/cafes/:cafeId/menu',
  asyncHandler(async (req, res) => {
    const data = await menuService.getMenuGrouped(req.params.cafeId, {
      availableOnly: boolQuery(req, 'available', 'availableOnly'),
    });
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/categories — daftar kategori.
menuRouter.get(
  '/cafes/:cafeId/categories',
  asyncHandler(async (req, res) => {
    const data = await menuService.getCategories(req.params.cafeId);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/menu-items — daftar item (opsional ?categoryId= & ?available=).
menuRouter.get(
  '/cafes/:cafeId/menu-items',
  asyncHandler(async (req, res) => {
    const categoryId =
      typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
    const data = await menuService.getMenuItems(req.params.cafeId, {
      categoryId,
      availableOnly: boolQuery(req, 'available', 'availableOnly'),
    });
    res.json({ data });
  }),
);

// ── Manajemen menu (OWNER) ───────────────────────────────────────────────────
// Membaca menu bersifat publik (pelanggan memindai QR tanpa akun), tetapi
// MENGUBAHNYA hanya boleh oleh pemilik kafe yang bersangkutan.

// POST /api/cafes/:cafeId/categories — tambah kategori (posisi paling akhir).
menuRouter.post(
  '/cafes/:cafeId/categories',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { name } = parseCategoryNameInput(req.body);
    const data = await menuService.createCategory(req.params.cafeId, name);
    res.status(201).json({ data });
  }),
);

// PUT /api/cafes/:cafeId/categories/order — susun ulang urutan kategori.
// Didaftarkan SEBELUM rute ber-parameter `:categoryId` agar "order" tidak
// tertangkap sebagai id kategori.
menuRouter.put(
  '/cafes/:cafeId/categories/order',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { categoryIds } = parseCategoryOrderInput(req.body);
    const data = await menuService.reorderCategories(categoryIds);
    res.json({ data });
  }),
);

// PATCH /api/cafes/:cafeId/categories/:categoryId — ubah nama kategori.
menuRouter.patch(
  '/cafes/:cafeId/categories/:categoryId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { name } = parseCategoryNameInput(req.body);
    const data = await menuService.renameCategory(req.params.categoryId, name);
    res.json({ data });
  }),
);

// DELETE /api/cafes/:cafeId/categories/:categoryId — soft delete kategori
// (ditolak 409 bila masih berisi item).
menuRouter.delete(
  '/cafes/:cafeId/categories/:categoryId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await menuService.deleteCategory(req.params.categoryId);
    res.json({ data });
  }),
);

// GET /api/cafes/:cafeId/menu-items/:itemId — detail satu item.
menuRouter.get(
  '/cafes/:cafeId/menu-items/:itemId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await menuService.getMenuItemOrFail(req.params.itemId);
    res.json({ data });
  }),
);

// POST /api/cafes/:cafeId/menu-items — tambah item menu.
menuRouter.post(
  '/cafes/:cafeId/menu-items',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const input = parseCreateMenuItemInput(req.body);
    const data = await menuService.createMenuItem(req.params.cafeId, input);
    res.status(201).json({ data });
  }),
);

// PATCH /api/cafes/:cafeId/menu-items/:itemId — ubah sebagian data item.
// Dipakai juga untuk pindah kategori (`categoryId`) dan sembunyikan/tampilkan
// item (`isAvailable`).
menuRouter.patch(
  '/cafes/:cafeId/menu-items/:itemId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const input = parseUpdateMenuItemInput(req.body);
    const data = await menuService.updateMenuItem(req.params.itemId, input);
    res.json({ data });
  }),
);

// PATCH /api/cafes/:cafeId/menu-items/:itemId/availability — sembunyikan atau
// tampilkan item di menu pelanggan ({ isAvailable: true|false }).
menuRouter.patch(
  '/cafes/:cafeId/menu-items/:itemId/availability',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { isAvailable } = parseAvailabilityInput(req.body);
    const data = await menuService.setMenuItemAvailability(
      req.params.itemId,
      isAvailable,
    );
    res.json({ data });
  }),
);

// POST /api/cafes/:cafeId/menu-items/:itemId/move — pindahkan item ke kategori
// lain. Disediakan terpisah dari PATCH karena niatnya berbeda: klien cukup
// mengirim kategori tujuan, dan kegagalan nama kembar dijelaskan spesifik.
menuRouter.post(
  '/cafes/:cafeId/menu-items/:itemId/move',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const { categoryId } = parseMoveItemInput(req.body);
    const data = await menuService.moveMenuItem(req.params.itemId, categoryId);
    res.json({ data });
  }),
);

// DELETE /api/cafes/:cafeId/menu-items/:itemId — soft delete item menu.
menuRouter.delete(
  '/cafes/:cafeId/menu-items/:itemId',
  ownerOnly,
  asyncHandler(async (req, res) => {
    const data = await menuService.deleteMenuItem(req.params.itemId);
    res.json({ data });
  }),
);

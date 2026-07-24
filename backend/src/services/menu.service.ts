import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import {
  toMenuCategoryDTO,
  toMenuItemDTO,
  type MenuCategoryDTO,
  type MenuCategoryWithItemsDTO,
  type MenuItemDTO,
} from '../dto/menu.dto';
import type {
  CreateMenuItemInput,
  UpdateMenuItemInput,
} from '../validation/menu.validation';

interface MenuItemFilter {
  categoryId?: string;
  availableOnly?: boolean;
}

/**
 * Terjemahkan pelanggaran unique index (nama item kembar dalam satu kategori)
 * menjadi 409 yang bisa dimengerti pengguna, bukan 500.
 */
function asConflict<T>(promise: Promise<T>, message: string): Promise<T> {
  return promise.catch((error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw ApiError.conflict(message);
    }
    throw error;
  });
}

/**
 * Layanan menu — seluruh query dibatasi per tenant (`cafeId`) dan mengabaikan
 * baris yang di-soft-delete (`deletedAt: null`).
 */
export const menuService = {
  /** Daftar kategori kafe, terurut sesuai posisi tampil. */
  async getCategories(cafeId: string): Promise<MenuCategoryDTO[]> {
    const categories = await prisma.menuCategory.findMany({
      where: { cafeId, deletedAt: null },
      orderBy: [{ orderPosition: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toMenuCategoryDTO);
  },

  /** Daftar item menu kafe, opsional difilter kategori / hanya yang tersedia. */
  async getMenuItems(
    cafeId: string,
    filter: MenuItemFilter = {},
  ): Promise<MenuItemDTO[]> {
    const items = await prisma.menuItem.findMany({
      where: {
        cafeId,
        deletedAt: null,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.availableOnly ? { isAvailable: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return items.map(toMenuItemDTO);
  },

  /**
   * Menu lengkap dikelompokkan per kategori (bentuk siap-render untuk halaman
   * menu digital). Kategori tanpa item ikut disertakan agar admin tetap
   * melihatnya; klien pelanggan bisa menyaringnya sendiri.
   */
  async getMenuGrouped(
    cafeId: string,
    filter: Pick<MenuItemFilter, 'availableOnly'> = {},
  ): Promise<MenuCategoryWithItemsDTO[]> {
    const categories = await prisma.menuCategory.findMany({
      where: { cafeId, deletedAt: null },
      orderBy: [{ orderPosition: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: {
            deletedAt: null,
            ...(filter.availableOnly ? { isAvailable: true } : {}),
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    return categories.map((category) => ({
      ...toMenuCategoryDTO(category),
      items: category.items.map(toMenuItemDTO),
    }));
  },

  /**
   * Menu milik kafe pada KONTEKS TENANT yang sedang aktif.
   *
   * Perhatikan: query di bawah TIDAK menyebut `cafeId` sama sekali. Batasan
   * tenant disuntikkan otomatis oleh `tenantExtension` berdasarkan token —
   * inilah bukti bahwa lupa menulis filter tidak lagi membocorkan data kafe
   * lain. Dipakai endpoint `GET /api/menus`.
   */
  async getMenuItemsForCurrentTenant(): Promise<MenuItemDTO[]> {
    const items = await prisma.menuItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return items.map(toMenuItemDTO);
  },

  // ── Manajemen menu (khusus pemilik) ───────────────────────────────────────
  //
  // `findFirst/findMany` sudah otomatis dibatasi tenant oleh `tenantExtension`,
  // sedangkan `update/delete` TIDAK — karena itu setiap perubahan selalu
  // didahului pencarian bertenant untuk memastikan barisnya memang milik kafe
  // yang sedang masuk.

  /**
   * Tambah kategori baru. Posisinya otomatis di urutan paling akhir supaya
   * pemilik tidak perlu memikirkan angka urutan saat membuat kategori.
   */
  async createCategory(cafeId: string, name: string): Promise<MenuCategoryDTO> {
    const last = await prisma.menuCategory.findFirst({
      where: { deletedAt: null },
      orderBy: { orderPosition: 'desc' },
      select: { orderPosition: true },
    });

    const created = await asConflict(
      prisma.menuCategory.create({
        data: {
          cafeId,
          name,
          orderPosition: (last?.orderPosition ?? 0) + 1,
        },
      }),
      'Kategori dengan nama itu sudah ada',
    );

    return toMenuCategoryDTO(created);
  },

  /**
   * Susun ulang urutan tampil kategori.
   *
   * Klien wajib mengirim SELURUH kategori hidup milik kafenya. Kalau ada yang
   * kurang atau ada id asing, permintaan ditolak — mencegah kategori "hilang"
   * dari urutan atau tercampur milik kafe lain. Penulisan dilakukan dalam satu
   * transaksi agar tidak pernah ada urutan setengah jadi.
   */
  async reorderCategories(categoryIds: string[]): Promise<MenuCategoryDTO[]> {
    const live = await prisma.menuCategory.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    const liveIds = new Set(live.map((category) => category.id));
    const unknown = categoryIds.filter((id) => !liveIds.has(id));
    if (unknown.length > 0) {
      throw ApiError.badRequest('Ada id kategori yang tidak dikenali');
    }
    if (categoryIds.length !== liveIds.size) {
      throw ApiError.badRequest(
        `Urutan harus memuat seluruh ${liveIds.size} kategori`,
      );
    }

    await prisma.$transaction(
      categoryIds.map((id, index) =>
        prisma.menuCategory.update({
          where: { id },
          data: { orderPosition: index + 1 },
        }),
      ),
    );

    return menuService.getCategoriesForCurrentTenant();
  },

  /** Kategori tenant aktif (tanpa cafeId di parameter — dari konteks tenant). */
  async getCategoriesForCurrentTenant(): Promise<MenuCategoryDTO[]> {
    const categories = await prisma.menuCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ orderPosition: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toMenuCategoryDTO);
  },

  /** Ganti nama kategori milik tenant aktif. */
  async renameCategory(categoryId: string, name: string): Promise<MenuCategoryDTO> {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Kategori tidak ditemukan');

    const updated = await asConflict(
      prisma.menuCategory.update({ where: { id: categoryId }, data: { name } }),
      'Kategori dengan nama itu sudah ada',
    );

    return toMenuCategoryDTO(updated);
  },

  /**
   * Hapus kategori (soft delete). Ditolak selama masih berisi item hidup —
   * item tanpa induk akan hilang dari menu tanpa jejak yang jelas, jadi
   * pemilik harus memindahkan atau menghapus itemnya lebih dulu.
   */
  async deleteCategory(categoryId: string): Promise<{ id: string }> {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Kategori tidak ditemukan');

    const itemCount = await prisma.menuItem.count({
      where: { categoryId, deletedAt: null },
    });
    if (itemCount > 0) {
      throw ApiError.conflict(
        `Kategori masih berisi ${itemCount} item — pindahkan atau hapus itemnya dulu`,
      );
    }

    await prisma.menuCategory.update({
      where: { id: categoryId },
      data: { deletedAt: new Date() },
    });

    return { id: categoryId };
  },

  /** Satu item menu milik tenant aktif; 404 bila tidak ada / sudah dihapus. */
  async getMenuItemOrFail(itemId: string): Promise<MenuItemDTO> {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!item) throw ApiError.notFound('Item menu tidak ditemukan');
    return toMenuItemDTO(item);
  },

  /** Pastikan kategori tujuan ada & milik tenant aktif. */
  async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!category) throw ApiError.badRequest('Kategori tujuan tidak ditemukan');
  },

  /**
   * Tambah item menu baru pada kategori milik tenant aktif.
   *
   * `cafeId` ditulis eksplisit (dan tetap ditimpa `tenantExtension` dengan
   * tenant dari token) — dua lapis yang saling menguatkan.
   */
  async createMenuItem(
    cafeId: string,
    input: CreateMenuItemInput,
  ): Promise<MenuItemDTO> {
    await menuService.assertCategoryExists(input.categoryId);

    const created = await asConflict(
      prisma.menuItem.create({
        data: {
          cafeId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          price: new Prisma.Decimal(input.price),
          imageUrl: input.imageUrl,
          isAvailable: input.isAvailable,
        },
      }),
      'Sudah ada item dengan nama itu di kategori ini',
    );

    return toMenuItemDTO(created);
  },

  /** Ubah sebagian data item menu (termasuk pindah kategori & sembunyikan). */
  async updateMenuItem(
    itemId: string,
    input: UpdateMenuItemInput,
  ): Promise<MenuItemDTO> {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Item menu tidak ditemukan');

    if (input.categoryId) {
      await menuService.assertCategoryExists(input.categoryId);
    }

    const updated = await asConflict(
      prisma.menuItem.update({
        where: { id: itemId },
        data: {
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.price !== undefined && { price: new Prisma.Decimal(input.price) }),
          ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
          ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        },
      }),
      'Sudah ada item dengan nama itu di kategori ini',
    );

    return toMenuItemDTO(updated);
  },

  /**
   * Sembunyikan/tampilkan item di menu pelanggan.
   *
   * Item yang disembunyikan tidak dihapus: ia tetap ada di daftar pemilik dan
   * di riwayat pesanan, hanya tidak bisa dipesan lagi (menu pelanggan
   * menandainya "Habis"). Cocok untuk stok yang habis sementara.
   */
  async setMenuItemAvailability(
    itemId: string,
    isAvailable: boolean,
  ): Promise<MenuItemDTO> {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Item menu tidak ditemukan');

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable },
    });

    return toMenuItemDTO(updated);
  },

  /**
   * Pindahkan item ke kategori lain.
   *
   * Nama item wajib unik dalam satu kategori, jadi perpindahan bisa gagal bila
   * kategori tujuan sudah punya item bernama sama — pesannya dibuat spesifik
   * supaya pemilik tahu harus mengganti nama dulu, bukan sekadar "gagal".
   */
  async moveMenuItem(itemId: string, categoryId: string): Promise<MenuItemDTO> {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!item) throw ApiError.notFound('Item menu tidak ditemukan');

    // Sudah berada di kategori tujuan — tidak perlu menulis apa pun.
    if (item.categoryId === categoryId) return toMenuItemDTO(item);

    await menuService.assertCategoryExists(categoryId);

    const moved = await asConflict(
      prisma.menuItem.update({ where: { id: itemId }, data: { categoryId } }),
      `Kategori tujuan sudah punya item bernama "${item.name}"`,
    );

    return toMenuItemDTO(moved);
  },

  /**
   * Hapus item menu — SOFT DELETE. Barisnya tetap ada karena `order_items`
   * merujuk padanya (riwayat pesanan & laporan penjualan harus tetap utuh);
   * item hanya berhenti muncul di menu dan namanya boleh dipakai lagi.
   */
  async deleteMenuItem(itemId: string): Promise<{ id: string }> {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Item menu tidak ditemukan');

    await prisma.menuItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date() },
    });

    return { id: itemId };
  },
};

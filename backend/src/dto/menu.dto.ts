import type { MenuCategory, MenuItem } from '@prisma/client';

// DTO respons API — bentuknya selaras dengan tipe di frontend (harga sebagai
// number, bukan Prisma.Decimal), agar mudah dikonsumsi klien.

export interface MenuItemDTO {
  id: string;
  cafeId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
}

export interface MenuCategoryDTO {
  id: string;
  cafeId: string;
  name: string;
  orderPosition: number;
}

export interface MenuCategoryWithItemsDTO extends MenuCategoryDTO {
  items: MenuItemDTO[];
}

export function toMenuItemDTO(item: MenuItem): MenuItemDTO {
  return {
    id: item.id,
    cafeId: item.cafeId,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
  };
}

export function toMenuCategoryDTO(category: MenuCategory): MenuCategoryDTO {
  return {
    id: category.id,
    cafeId: category.cafeId,
    name: category.name,
    orderPosition: category.orderPosition,
  };
}

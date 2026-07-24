import type { MenuItem } from './menu';

/**
 * Satu baris keranjang — mengacu ke satu menu item, jumlahnya, dan catatan
 * khusus pelanggan. Bentuk ini selaras dengan `order_items` pada skema DB PRD
 * (menu_item_id, quantity, notes) agar mulus saat submit ke API nanti.
 */
export interface CartLine {
  item: MenuItem;
  quantity: number;
  notes: string;
}

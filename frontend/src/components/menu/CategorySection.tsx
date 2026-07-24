import type { MenuCategoryWithItems } from '../../types/menu';
import MenuItemCard from './MenuItemCard';

interface CategorySectionProps {
  category: MenuCategoryWithItems;
}

/**
 * Satu blok kategori berisi judul dan daftar item-nya. `id` di section dipakai
 * sebagai target scroll dari CategoryNav.
 */
export default function CategorySection({ category }: CategorySectionProps) {
  return (
    <section id={`cat-${category.id}`} className="scroll-mt-28">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-800">
        {category.name}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
          {category.items.length}
        </span>
      </h2>
      <div className="grid gap-3">
        {category.items.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

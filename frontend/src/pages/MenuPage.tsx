import { useMemo } from 'react';
import { getMenuByCategory, mockCafe, mockTable } from '../data/mockMenu';
import MenuHeader from '../components/menu/MenuHeader';
import CategoryNav from '../components/menu/CategoryNav';
import CategorySection from '../components/menu/CategorySection';
import FloatingCartBar from '../components/cart/FloatingCartBar';

/**
 * Halaman menu digital pelanggan (dibuka via scan QR meja).
 *
 * Fase frontend: seluruh data berasal dari mock (`getMenuByCategory`). Fase
 * backend akan menggantinya dengan data dari API sesuai `tableId`/`cafeId`.
 */
export default function MenuPage() {
  const categories = useMemo(() => getMenuByCategory(), []);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-100 shadow-xl">
      <MenuHeader cafe={mockCafe} table={mockTable} />
      <CategoryNav categories={categories} />

      <main className="space-y-8 px-4 pb-28 pt-5">
        {categories.length === 0 ? (
          <p className="py-16 text-center text-slate-400">Menu belum tersedia.</p>
        ) : (
          categories.map((category) => (
            <CategorySection key={category.id} category={category} />
          ))
        )}
      </main>

      <FloatingCartBar />
    </div>
  );
}

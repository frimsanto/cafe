import type { MenuCategory } from '../../types/menu';

export const ALL_CATEGORIES = 'all';

interface MenuAdminToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  categories: MenuCategory[];
  /** `ALL_CATEGORIES` atau id kategori yang sedang dipilih. */
  activeCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  /** Jumlah item per kategori, untuk lencana angka pada tiap chip. */
  countByCategory: Record<string, number>;
  totalCount: number;
}

/**
 * Pencarian + penyaring kategori pada halaman Manajemen Menu. Chip kategori
 * memakai `<button>` agar tetap bisa diakses lewat keyboard, dan daftar chip
 * bisa digulir horizontal pada layar sempit.
 */
export default function MenuAdminToolbar({
  query,
  onQueryChange,
  categories,
  activeCategoryId,
  onCategoryChange,
  countByCategory,
  totalCount,
}: MenuAdminToolbarProps) {
  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-warm-espresso text-warm-paper shadow-sm'
        : 'bg-warm-paper text-warm-subtle ring-1 ring-warm-line hover:bg-warm-espresso/5'
    }`;

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Cari nama atau deskripsi menu…"
          aria-label="Cari menu"
          className="w-full rounded-xl border-0 bg-warm-paper py-2.5 pl-10 pr-4 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
        />
      </div>

      <div
        role="group"
        aria-label="Saring berdasarkan kategori"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={() => onCategoryChange(ALL_CATEGORIES)}
          aria-pressed={activeCategoryId === ALL_CATEGORIES}
          className={chipClass(activeCategoryId === ALL_CATEGORIES)}
        >
          Semua <span className="opacity-70">({totalCount})</span>
        </button>

        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            aria-pressed={activeCategoryId === category.id}
            className={chipClass(activeCategoryId === category.id)}
          >
            {category.name}{' '}
            <span className="opacity-70">({countByCategory[category.id] ?? 0})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

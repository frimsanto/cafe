import { useEffect, useRef, useState } from 'react';
import type { MenuCategoryWithItems } from '../../types/menu';

interface CategoryNavProps {
  categories: MenuCategoryWithItems[];
}

/**
 * Navigasi kategori yang menempel (sticky) di atas. Menyorot kategori yang
 * sedang terlihat memakai IntersectionObserver, dan menggulir halus ke section
 * saat chip ditekan.
 */
export default function CategoryNav({ categories }: CategoryNavProps) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? '');
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const sections = categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          setActiveId(visible.target.id.replace('cat-', ''));
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [categories]);

  // Jaga chip aktif tetap terlihat di dalam strip yang bisa digulir.
  useEffect(() => {
    chipRefs.current[activeId]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeId]);

  const handleClick = (id: string) => {
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100/90 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => {
          const active = category.id === activeId;
          return (
            <button
              key={category.id}
              ref={(el) => {
                chipRefs.current[category.id] = el;
              }}
              type="button"
              onClick={() => handleClick(category.id)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

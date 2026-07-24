import { useEffect, useState } from 'react';
import type { MenuCategoryWithItems, MenuItem } from '../../types/menu';

interface MoveItemModalProps {
  item: MenuItem;
  categories: MenuCategoryWithItems[];
  onMove: (categoryId: string) => void;
  onClose: () => void;
}

/**
 * Pemindah item antar kategori. Kategori asal tetap ditampilkan (ditandai
 * "saat ini") supaya pemilik tidak bingung mencari posisi item sekarang,
 * tetapi tombol pindah baru aktif setelah kategori lain dipilih.
 */
export default function MoveItemModal({
  item,
  categories,
  onMove,
  onClose,
}: MoveItemModalProps) {
  const [targetId, setTargetId] = useState(item.categoryId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const currentName =
    categories.find((category) => category.id === item.categoryId)?.name ?? '—';
  const unchanged = targetId === item.categoryId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pindah-item-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-50 p-5 shadow-2xl sm:rounded-3xl">
        <h2 id="pindah-item-title" className="text-lg font-bold text-slate-900">
          Pindahkan Item
        </h2>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{item.name}</span> sekarang
          ada di kategori {currentName}.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Pilih kategori tujuan</legend>

          {categories.map((category) => {
            const isCurrent = category.id === item.categoryId;
            const selected = targetId === category.id;

            return (
              <label
                key={category.id}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 transition ${
                  selected ? 'ring-2 ring-brand-500' : 'ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="kategori-tujuan"
                  value={category.id}
                  checked={selected}
                  onChange={() => setTargetId(category.id)}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">
                    {category.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {category.items.length} item
                  </span>
                </span>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    Saat ini
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-200 py-3 font-semibold text-slate-600 transition hover:bg-slate-300"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={unchanged}
            onClick={() => onMove(targetId)}
            className="flex-1 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Pindahkan
          </button>
        </div>
      </div>
    </div>
  );
}

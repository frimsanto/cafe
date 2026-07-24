import { useEffect, useRef, useState } from 'react';
import type { MenuCategoryWithItems } from '../../types/menu';

interface CategoryManagerModalProps {
  categories: MenuCategoryWithItems[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

/**
 * Pengelola kategori menu (modal): tambah, ubah nama, ubah urutan, dan hapus.
 *
 * Urutan diubah lewat tombol naik/turun, bukan seret-lepas, supaya tetap bisa
 * dipakai lewat keyboard dan di layar sentuh tanpa pustaka tambahan.
 *
 * Kategori yang masih berisi item tidak bisa dihapus — itemnya harus
 * dipindahkan atau dihapus lebih dulu supaya tidak ada item tanpa induk.
 * Penghapusan memakai konfirmasi dua langkah langsung di barisnya.
 */
export default function CategoryManagerModal({
  categories,
  onAdd,
  onRename,
  onReorder,
  onRemove,
  onClose,
}: CategoryManagerModalProps) {
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  /** Id kategori yang namanya sedang diubah. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  /** Id kategori yang sedang menunggu konfirmasi hapus. */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  /** Nama kategori harus unik (abaikan besar-kecil huruf) & minimal 2 karakter. */
  const validate = (value: string, exceptId?: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return 'Nama kategori minimal 2 karakter.';
    const clash = categories.some(
      (category) =>
        category.id !== exceptId &&
        category.name.toLowerCase() === trimmed.toLowerCase(),
    );
    return clash ? 'Kategori dengan nama ini sudah ada.' : null;
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const error = validate(newName);
    setAddError(error);
    if (error) return;

    onAdd(newName.trim());
    setNewName('');
  };

  const startEditing = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setEditError(null);
    setConfirmId(null);
  };

  const saveEditing = () => {
    if (!editingId) return;
    const error = validate(editingName, editingId);
    setEditError(error);
    if (error) return;

    onRename(editingId, editingName);
    setEditingId(null);
  };

  const inputClass =
    'w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kelola-kategori-title"
    >
      <button
        type="button"
        aria-label="Tutup pengelola kategori"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="kelola-kategori-title" className="text-lg font-bold text-slate-900">
              Kelola Kategori
            </h2>
            <p className="text-sm text-slate-500">
              Urutan di sini menentukan urutan tampil di menu pelanggan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-200"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Daftar kategori */}
        {categories.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
            Belum ada kategori. Tambahkan yang pertama di bawah.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category, index) => {
              const isEditing = editingId === category.id;
              const isConfirming = confirmId === category.id;
              const hasItems = category.items.length > 0;

              return (
                <li
                  key={category.id}
                  className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
                >
                  {isEditing ? (
                    <div>
                      {/* Layar sempit: tombol simpan/batal turun ke bawah kolom. */}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          ref={editRef}
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveEditing();
                            }
                          }}
                          aria-label={`Nama baru untuk ${category.name}`}
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEditing}
                            className="flex-1 shrink-0 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 sm:flex-none sm:py-0"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="flex-1 shrink-0 rounded-xl bg-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-300 sm:flex-none sm:py-0"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                      {editError && (
                        <p className="mt-1.5 text-sm text-rose-600">{editError}</p>
                      )}
                    </div>
                  ) : isConfirming ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-slate-700">
                        Hapus kategori{' '}
                        <span className="font-semibold">{category.name}</span>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-300"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onRemove(category.id);
                            setConfirmId(null);
                          }}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700"
                        >
                          Ya, hapus
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {/* Ubah urutan tampil kategori di menu pelanggan */}
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => onReorder(category.id, 'up')}
                          aria-label={`Naikkan urutan ${category.name}`}
                          className="rounded-md px-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 15 6-6 6 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={index === categories.length - 1}
                          onClick={() => onReorder(category.id, 'down')}
                          aria-label={`Turunkan urutan ${category.name}`}
                          className="rounded-md px-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </div>

                      <span className="hidden w-5 shrink-0 text-center text-sm font-bold tabular-nums text-slate-300 sm:block">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">
                          {category.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {category.items.length} item
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditing(category.id, category.name)}
                        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-brand-50 hover:text-brand-700"
                      >
                        Ubah
                      </button>

                      <button
                        type="button"
                        disabled={hasItems}
                        onClick={() => setConfirmId(category.id)}
                        title={
                          hasItems
                            ? 'Pindahkan atau hapus itemnya dulu sebelum kategori ini bisa dihapus.'
                            : undefined
                        }
                        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        Hapus
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Tambah kategori */}
        <form onSubmit={handleAdd} className="mt-4 border-t border-slate-200 pt-4">
          <label
            htmlFor="kategori-baru"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Tambah kategori
          </label>
          <div className="flex gap-2">
            <input
              id="kategori-baru"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="mis. Minuman Dingin"
              className={inputClass}
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Tambah
            </button>
          </div>
          {addError && <p className="mt-1.5 text-sm text-rose-600">{addError}</p>}
        </form>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-slate-200 py-3 font-semibold text-slate-600 transition hover:bg-slate-300"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}

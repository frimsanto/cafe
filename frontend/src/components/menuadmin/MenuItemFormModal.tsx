import { useEffect, useRef, useState } from 'react';
import type { MenuCategory, MenuItem, MenuItemInput } from '../../types/menu';
import { formatThousands, parseAmountInput } from '../../lib/format';
import MenuItemImage from '../menu/MenuItemImage';

interface MenuItemFormModalProps {
  categories: MenuCategory[];
  /** Item yang sedang diubah; kosongkan untuk menambah item baru. */
  item?: MenuItem | null;
  /** Kategori yang dipilih lebih dulu, mis. dari penyaring yang sedang aktif. */
  defaultCategoryId?: string;
  /**
   * Nama item lain yang sudah ada (huruf kecil) untuk mencegah duplikat —
   * nama item yang sedang diubah tidak boleh ikut disertakan.
   */
  existingNames?: string[];
  onSubmit: (values: MenuItemInput) => void;
  onClose: () => void;
}

type FieldErrors = Partial<Record<'name' | 'categoryId' | 'price', string>>;

const MAX_DESCRIPTION = 160;

/**
 * Formulir item menu (modal) — dipakai untuk menambah maupun mengubah item.
 * Bila `item` diisi, seluruh kolom terisi nilai lamanya dan tombol simpan
 * berubah menjadi "Simpan Perubahan".
 *
 * Validasi dilakukan saat submit agar pengguna tidak diteriaki sambil
 * mengetik, lalu fokus dipindahkan ke kolom pertama yang bermasalah.
 *
 * Fase frontend: hasil submit hanya masuk ke state lokal `useMenuManager`.
 */
export default function MenuItemFormModal({
  categories,
  item = null,
  defaultCategoryId,
  existingNames = [],
  onSubmit,
  onClose,
}: MenuItemFormModalProps) {
  const isEdit = item !== null;

  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '',
  );
  const [priceInput, setPriceInput] = useState(
    item ? String(item.price) : '',
  );
  const [description, setDescription] = useState(item?.description ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  // Fokus awal + tutup dengan tombol Esc.
  useEffect(() => {
    nameRef.current?.focus();
    // Saat mengubah, isi lama langsung tersorot agar mudah diganti.
    nameRef.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const price = parseAmountInput(priceInput);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length < 2) {
      nextErrors.name = 'Nama menu minimal 2 karakter.';
    } else if (existingNames.includes(trimmedName.toLowerCase())) {
      nextErrors.name = 'Nama menu ini sudah ada.';
    }

    if (!categoryId) {
      nextErrors.categoryId = 'Pilih kategori untuk menu ini.';
    }

    if (price === null) {
      nextErrors.price = 'Harga wajib diisi.';
    } else if (price <= 0) {
      nextErrors.price = 'Harga harus lebih dari 0.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.name) nameRef.current?.focus();
      else if (nextErrors.categoryId) categoryRef.current?.focus();
      else priceRef.current?.focus();
      return;
    }

    onSubmit({
      name: trimmedName,
      categoryId,
      price: price ?? 0,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      isAvailable,
    });
  };

  const fieldClass = (invalid: boolean) =>
    `w-full rounded-xl border-0 bg-warm-paper px-3.5 py-2.5 text-sm text-warm-espresso shadow-sm ring-1 focus:outline-none focus:ring-2 ${
      invalid
        ? 'ring-rose-400 focus:ring-rose-500'
        : 'ring-warm-line focus:ring-warm-amber'
    }`;

  const noCategory = categories.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-item-title"
    >
      {/* Klik area gelap = tutup */}
      <button
        type="button"
        aria-label="Tutup formulir"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={handleSubmit}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-warm-cream p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="form-item-title" className="text-lg font-bold text-warm-espresso">
              {isEdit ? 'Ubah Item Menu' : 'Tambah Item Menu'}
            </h2>
            <p className="text-sm text-warm-muted">
              {isEdit
                ? 'Perubahan langsung terlihat di menu digital pelanggan.'
                : 'Item baru langsung tampil di menu digital pelanggan.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-warm-muted transition hover:bg-warm-espresso/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {noCategory && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Belum ada kategori. Buat kategori dulu sebelum menambah item menu.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="item-name" className="mb-1 block text-sm font-medium text-warm-subtle">
              Nama menu <span className="text-rose-500">*</span>
            </label>
            <input
              id="item-name"
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Kopi Susu Gula Aren"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'item-name-error' : undefined}
              className={fieldClass(Boolean(errors.name))}
            />
            {errors.name && (
              <p id="item-name-error" className="mt-1 text-sm text-rose-600">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="item-category" className="mb-1 block text-sm font-medium text-warm-subtle">
                Kategori <span className="text-rose-500">*</span>
              </label>
              <select
                id="item-category"
                ref={categoryRef}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={noCategory}
                aria-invalid={Boolean(errors.categoryId)}
                className={`${fieldClass(Boolean(errors.categoryId))} disabled:bg-warm-espresso/5 disabled:text-warm-muted`}
              >
                {noCategory && <option value="">— belum ada kategori —</option>}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="mt-1 text-sm text-rose-600">{errors.categoryId}</p>
              )}
            </div>

            <div>
              <label htmlFor="item-price" className="mb-1 block text-sm font-medium text-warm-subtle">
                Harga <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-muted">
                  Rp
                </span>
                <input
                  id="item-price"
                  ref={priceRef}
                  inputMode="numeric"
                  value={price === null ? '' : formatThousands(price)}
                  onChange={(event) => setPriceInput(event.target.value)}
                  placeholder="25.000"
                  aria-invalid={Boolean(errors.price)}
                  className={`${fieldClass(Boolean(errors.price))} pl-9 tabular-nums`}
                />
              </div>
              {errors.price && (
                <p className="mt-1 text-sm text-rose-600">{errors.price}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="item-description" className="mb-1 block text-sm font-medium text-warm-subtle">
              Deskripsi
            </label>
            <textarea
              id="item-description"
              rows={3}
              maxLength={MAX_DESCRIPTION}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ceritakan singkat isi menunya…"
              className={`${fieldClass(false)} resize-none`}
            />
            <p className="mt-1 text-right text-xs text-warm-muted">
              {description.length}/{MAX_DESCRIPTION}
            </p>
          </div>

          <div>
            <label htmlFor="item-image" className="mb-1 block text-sm font-medium text-warm-subtle">
              URL foto
            </label>
            <div className="flex items-center gap-3">
              <MenuItemImage
                src={imageUrl.trim()}
                alt={name.trim() || 'Menu'}
                className="h-14 w-14 shrink-0 rounded-xl"
              />
              <input
                id="item-image"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://… (opsional)"
                className={fieldClass(false)}
              />
            </div>
            <p className="mt-1 text-xs text-warm-muted">
              Kosongkan untuk memakai gambar awal otomatis.
            </p>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-warm-paper px-3.5 py-3 shadow-sm ring-1 ring-warm-line">
            <span>
              <span className="block text-sm font-medium text-warm-subtle">
                Bisa dipesan pelanggan
              </span>
              <span className="block text-xs text-warm-muted">
                Matikan bila stok habis — item tetap terlihat, ditandai “Habis”.
              </span>
            </span>
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
              className="h-5 w-5 rounded border-warm-line accent-warm-amber focus:ring-warm-amber"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={noCategory}
            className="flex-1 rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
          >
            {isEdit ? 'Simpan Perubahan' : 'Simpan Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

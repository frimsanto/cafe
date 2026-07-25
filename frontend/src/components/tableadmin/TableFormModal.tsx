import { useEffect, useRef, useState } from 'react';

interface TableFormModalProps {
  /** Nama meja yang sudah dipakai (huruf kecil) untuk mencegah duplikat. */
  existingNames: string[];
  /** Nama yang disarankan, mis. "Meja 15". */
  suggestedName: string;
  /**
   * Simpan meja. Kembalikan pesan kesalahan bila gagal (formulir tetap terbuka
   * dengan isian utuh), atau `null` bila berhasil.
   */
  onSubmit: (tableName: string) => Promise<string | null>;
  onClose: () => void;
}

/**
 * Formulir tambah meja (modal). Nama meja diisi otomatis dengan nomor berikutnya
 * supaya menambah banyak meja berurutan tetap cepat, dan token QR-nya dibuat
 * sistem setelah meja tersimpan.
 *
 * Fase frontend: hasil submit hanya masuk ke state lokal `useTableManager`.
 */
export default function TableFormModal({
  existingNames,
  suggestedName,
  onSubmit,
  onClose,
}: TableFormModalProps) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      setError('Nama meja minimal 2 karakter.');
      inputRef.current?.focus();
      return;
    }
    if (existingNames.includes(trimmed.toLowerCase())) {
      setError('Meja dengan nama ini sudah ada.');
      inputRef.current?.focus();
      return;
    }

    setSaving(true);
    const message = await onSubmit(trimmed);
    setSaving(false);

    if (message) {
      setError(message);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-meja-title"
    >
      <button
        type="button"
        aria-label="Tutup formulir"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-t-3xl bg-warm-cream p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="form-meja-title" className="text-lg font-bold text-warm-espresso">
              Tambah Meja
            </h2>
            <p className="text-sm text-warm-muted">
              QR code meja dibuat otomatis setelah meja tersimpan.
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

        <label htmlFor="nama-meja" className="mb-1 block text-sm font-medium text-warm-subtle">
          Nama meja <span className="text-rose-500">*</span>
        </label>
        <input
          id="nama-meja"
          ref={inputRef}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          placeholder="mis. Meja 15 atau Bar 1"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'nama-meja-error' : undefined}
          className={`w-full rounded-xl border-0 bg-warm-paper px-3.5 py-2.5 text-sm text-warm-espresso shadow-sm ring-1 focus:outline-none focus:ring-2 ${
            error
              ? 'ring-rose-400 focus:ring-rose-500'
              : 'ring-warm-line focus:ring-warm-amber'
          }`}
        />
        {error ? (
          <p id="nama-meja-error" className="mt-1 text-sm text-rose-600">
            {error}
          </p>
        ) : (
          <p className="mt-1 text-xs text-warm-muted">
            Nama ini muncul di struk, layar dapur, dan halaman kasir.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
          >
            {saving ? 'Menyimpan…' : 'Simpan Meja'}
          </button>
        </div>
      </form>
    </div>
  );
}

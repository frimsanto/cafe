import { useRef, useState } from 'react';
import {
  TIPE_FOTO_DITERIMA,
  hapusFotoMenu,
  uploadFotoMenu,
  type FotoMenu,
} from '../../api/upload';
import { describeApiError } from '../../lib/apiClient';

interface UploadFotoProps {
  /** URL foto yang sedang dipakai; kosong berarti belum ada foto. */
  value: string;
  /** Dipanggil dengan URL baru (atau string kosong saat foto dihapus). */
  onChange: (url: string) => void;
  /**
   * Kafe pemilik foto. Hanya informatif: folder tujuan di Cloudinary ditentukan
   * backend dari kafe pada token, supaya klien tidak bisa menitipkan berkas ke
   * folder kafe lain dengan mengganti nilai ini.
   */
  cafeId?: string;
}

/** Ikon kamera untuk keadaan kosong. */
function IkonKamera() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/**
 * Pemilih foto item menu — klik atau seret-lepas, langsung terunggah ke
 * Cloudinary lewat backend. Yang dikembalikan lewat `onChange` adalah URL siap
 * pakai, jadi pemanggil cukup menyimpannya seperti URL biasa.
 *
 * Foto yang diunggah TAPI belum sempat disimpan (pengguna mengganti atau
 * menghapusnya lagi) dibersihkan dari Cloudinary di sini — kalau tidak, setiap
 * percobaan yang dibatalkan meninggalkan berkas yatim yang memakan kuota.
 * Sebaliknya, foto yang sudah tersimpan di item TIDAK ikut dihapus: pengguna
 * masih bisa menekan "Batal", dan menghapusnya lebih dulu akan merusak item
 * yang di database masih menunjuk ke sana.
 */
export default function UploadFoto({ value, onChange }: UploadFotoProps) {
  const [mengunggah, setMengunggah] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menyeret, setMenyeret] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL yang gambarnya gagal dimuat — disimpan sebagai URL, bukan boolean,
  // supaya nilainya "reset sendiri" begitu `value` berganti. Terutama untuk
  // kolom URL manual: alamat yang salah ketik harus terlihat sebagai gagal,
  // bukan sebagai kotak kosong yang membingungkan.
  const [urlGagal, setUrlGagal] = useState<string | null>(null);
  const gagalMuat = urlGagal !== null && urlGagal === value;

  // Unggahan dari sesi formulir ini — dianggap sah hanya selama URL-nya masih
  // yang sedang dipakai (pengguna bisa menimpanya lewat kolom URL manual).
  const unggahanSesi = useRef<FotoMenu | null>(null);
  const publicIdBelumTersimpan = () =>
    unggahanSesi.current?.url === value ? unggahanSesi.current.publicId : null;

  /** Buang berkas yatim tanpa menahan interaksi — kegagalannya tak perlu diramaikan. */
  const bersihkan = (publicId: string | null) => {
    if (publicId) void hapusFotoMenu(publicId).catch(() => undefined);
  };

  const prosesBerkas = async (file: File) => {
    setError(null);
    setMengunggah(true);
    try {
      const hasil = await uploadFotoMenu(file);
      const sebelumnya = publicIdBelumTersimpan();
      unggahanSesi.current = hasil;
      onChange(hasil.url);
      bersihkan(sebelumnya);
    } catch (err) {
      setError(describeApiError(err, 'Foto gagal diunggah. Coba lagi.'));
    } finally {
      setMengunggah(false);
    }
  };

  const handlePilih = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Kosongkan agar memilih berkas yang SAMA dua kali tetap memicu onChange.
    event.target.value = '';
    if (file) void prosesBerkas(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setMenyeret(false);
    if (mengunggah) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void prosesBerkas(file);
  };

  const handleHapus = () => {
    const yatim = publicIdBelumTersimpan();
    unggahanSesi.current = null;
    setError(null);
    onChange('');
    bersihkan(yatim);
  };

  const bukaPemilih = () => inputRef.current?.click();

  const areaProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!mengunggah) setMenyeret(true);
    },
    onDragLeave: () => setMenyeret(false),
    onDrop: handleDrop,
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={TIPE_FOTO_DITERIMA.join(',')}
        onChange={handlePilih}
        className="hidden"
      />

      {value ? (
        <div
          {...areaProps}
          className={`flex items-center gap-3 rounded-xl bg-warm-paper p-3 shadow-sm ring-1 transition ${
            menyeret ? 'ring-2 ring-warm-amber' : 'ring-warm-line'
          }`}
        >
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-warm-cream">
            {gagalMuat ? (
              <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-medium leading-tight text-warm-muted">
                Gambar tidak bisa dimuat
              </div>
            ) : (
              <img
                src={value}
                alt="Pratinjau foto menu"
                onError={() => setUrlGagal(value)}
                className="h-full w-full object-cover"
              />
            )}
            {mengunggah && (
              <div className="absolute inset-0 flex items-center justify-center bg-warm-espresso/50">
                <Pemuat className="text-white" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warm-subtle">
              {mengunggah
                ? 'Mengupload…'
                : gagalMuat
                  ? 'Foto gagal dimuat'
                  : 'Foto siap dipakai'}
            </p>
            <p className="mt-0.5 text-xs text-warm-muted">
              Seret foto lain ke sini untuk mengganti.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={bukaPemilih}
                disabled={mengunggah}
                className="rounded-lg bg-warm-amber px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ganti
              </button>
              <button
                type="button"
                onClick={handleHapus}
                disabled={mengunggah}
                className="rounded-lg bg-warm-espresso/10 px-3 py-1.5 text-xs font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={bukaPemilih}
          disabled={mengunggah}
          {...areaProps}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
            menyeret
              ? 'border-warm-amber bg-warm-amber/10'
              : 'border-warm-line bg-warm-paper hover:border-warm-amber hover:bg-warm-amber/5'
          } disabled:cursor-not-allowed`}
        >
          {mengunggah ? (
            <>
              <Pemuat className="text-warm-amber" />
              <span className="text-sm font-medium text-warm-subtle">
                Mengupload…
              </span>
            </>
          ) : (
            <>
              <span className="text-warm-amber">
                <IkonKamera />
              </span>
              <span className="text-sm font-medium text-warm-subtle">
                Klik atau drag foto
              </span>
              <span className="text-xs text-warm-muted">
                JPG, PNG, atau WEBP — maksimal 5 MB
              </span>
            </>
          )}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Spinner kecil — mengikuti gaya tombol proses di halaman masuk. */
function Pemuat({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-6 w-6 animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

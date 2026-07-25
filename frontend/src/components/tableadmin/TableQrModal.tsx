import { useEffect, useState } from 'react';
import type { CafeTable } from '../../types/table';
import { useQrDataUrl } from '../../hooks/useQrDataUrl';
import { downloadTableQrCard, tableMenuUrl } from '../../lib/tableQr';

interface TableQrModalProps {
  table: CafeTable;
  cafeName: string;
  onClose: () => void;
}

/**
 * Pratinjau QR code satu meja beserta tombol unduh.
 *
 * QR-nya asli (bukan gambar hiasan): isinya URL menu digital meja ini, jadi
 * hasil pratinjau maupun unduhan bisa langsung dipindai pelanggan.
 */
export default function TableQrModal({
  table,
  cafeName,
  onClose,
}: TableQrModalProps) {
  const url = tableMenuUrl(table.qrCode);
  const preview = useQrDataUrl(url, 320);

  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadTableQrCard({
        tableName: table.tableName,
        cafeName,
        qrCode: table.qrCode,
      });
    } catch {
      setError('QR gagal diunduh. Coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Tautan gagal disalin. Salin manual dari kotak di atas.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-meja-title"
    >
      <button
        type="button"
        aria-label="Tutup pratinjau QR"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-warm-cream p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="qr-meja-title" className="text-lg font-bold text-warm-espresso">
              QR {table.tableName}
            </h2>
            <p className="text-sm text-warm-muted">{cafeName}</p>
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

        {/* Kartu QR tetap berlatar putih agar kontras pemindaian maksimal. */}
        <div className="flex flex-col items-center rounded-2xl bg-white p-5 shadow-sm ring-1 ring-warm-line">
          {preview ? (
            <img
              src={preview}
              alt={`QR code ${table.tableName}`}
              width={320}
              height={320}
              className="h-auto w-full max-w-[320px]"
            />
          ) : (
            <div className="flex aspect-square w-full max-w-[320px] items-center justify-center rounded-xl bg-warm-espresso/5 text-sm text-warm-muted">
              Membuat QR…
            </div>
          )}

          <p className="mt-3 text-center text-sm text-warm-muted">
            Pelanggan memindai QR ini untuk membuka menu {table.tableName}.
          </p>
        </div>

        <label htmlFor="qr-url" className="mt-4 mb-1 block text-sm font-medium text-warm-subtle">
          Tautan di dalam QR
        </label>
        <div className="flex gap-2">
          <input
            id="qr-url"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="w-full rounded-xl border-0 bg-warm-paper px-3.5 py-2.5 font-mono text-xs text-warm-subtle shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-xl bg-warm-espresso/10 px-3.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
          >
            {copied ? 'Tersalin' : 'Salin'}
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
          >
            {downloading ? 'Menyiapkan…' : 'Unduh PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}

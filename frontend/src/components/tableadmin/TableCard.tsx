import { useEffect, useRef, useState } from 'react';
import type { CafeTable, TableStatus } from '../../types/table';
import { useQrDataUrl } from '../../hooks/useQrDataUrl';
import { tableMenuUrl } from '../../lib/tableQr';
import { TABLE_STATUS_META } from '../../lib/tableStatus';

interface TableCardProps {
  table: CafeTable;
  /** Status pemakaian meja — diturunkan dari pesanan yang masih berjalan. */
  status: TableStatus;
  /** Sorot sesaat setelah meja baru ditambahkan/diubah. */
  highlighted?: boolean;
  /**
   * Simpan nama baru. Kembalikan pesan kesalahan bila ditolak (mis. nama
   * kembar atau server menolak), atau `null` bila berhasil — barisnya baru
   * keluar dari mode ubah.
   */
  onRename: (id: string, tableName: string) => Promise<string | null>;
  onDelete: (table: CafeTable) => void;
  onShowQr: (table: CafeTable) => void;
}

/**
 * Satu kartu meja pada halaman Manajemen Meja & QR: nama meja dan token QR
 * yang tertanam di stiker meja.
 *
 * Nama meja diubah langsung di kartunya (inline) — Enter menyimpan, Esc batal —
 * supaya mengganti banyak nama tidak perlu bolak-balik membuka dialog.
 */
export default function TableCard({
  table,
  status,
  highlighted = false,
  onRename,
  onDelete,
  onShowQr,
}: TableCardProps) {
  const qrThumb = useQrDataUrl(tableMenuUrl(table.qrCode), 128);
  const statusMeta = TABLE_STATUS_META[status];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(table.tableName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(table.tableName);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    const message = await onRename(table.id, draft);
    setSaving(false);
    setError(message);
    if (!message) setEditing(false);
  };

  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 transition ${
        highlighted ? 'ring-2 ring-emerald-400' : 'ring-slate-200 hover:ring-brand-300'
      }`}
    >
      {editing ? (
        <div>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditing();
              }
            }}
            aria-label={`Nama baru untuk ${table.tableName}`}
            aria-invalid={Boolean(error)}
            className={`w-full rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 focus:outline-none focus:ring-2 ${
              error
                ? 'ring-rose-400 focus:ring-rose-500'
                : 'ring-slate-200 focus:ring-brand-500'
            }`}
          />
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="flex-1 rounded-lg bg-slate-200 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-300 disabled:cursor-not-allowed"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-bold text-slate-900">
              {table.tableName}
            </h3>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={startEditing}
                aria-label={`Ubah nama ${table.tableName}`}
                title="Ubah nama meja"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => onDelete(table)}
                aria-label={`Hapus ${table.tableName}`}
                title="Hapus meja"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
              </button>
            </div>
          </div>

          {/* Status pemakaian: warna + titik + teks, jadi tetap terbaca oleh
              pengguna yang sulit membedakan warna. */}
          <span
            className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`}
            />
            {statusMeta.label}
          </span>

          {/* Pratinjau QR — klik untuk melihat versi besar & mengunduhnya. */}
          <button
            type="button"
            onClick={() => onShowQr(table)}
            aria-label={`Lihat & unduh QR ${table.tableName}`}
            className="group flex flex-col items-center gap-1.5 rounded-xl p-1 transition hover:bg-brand-50"
          >
            {qrThumb ? (
              <img
                src={qrThumb}
                alt=""
                width={128}
                height={128}
                className="h-20 w-20 rounded-lg"
              />
            ) : (
              <span className="h-20 w-20 animate-pulse rounded-lg bg-slate-100" />
            )}
            <span className="text-xs font-semibold text-slate-500 group-hover:text-brand-700">
              Lihat QR
            </span>
          </button>

          <p className="truncate text-center font-mono text-xs text-slate-400">
            {table.qrCode}
          </p>
        </>
      )}
    </article>
  );
}

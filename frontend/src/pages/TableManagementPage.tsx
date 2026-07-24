import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { CafeTable } from '../types/table';
import { useTableManager } from '../hooks/useTableManager';
import { describeApiError } from '../lib/apiClient';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import TableCard from '../components/tableadmin/TableCard';
import TableFormModal from '../components/tableadmin/TableFormModal';
import TableQrModal from '../components/tableadmin/TableQrModal';
import ConfirmDialog from '../components/common/ConfirmDialog';

/**
 * Halaman Manajemen Meja & QR (pemilik kafe): daftar meja milik kafe yang
 * sedang masuk, lengkap dengan token QR tiap meja, tambah/ubah/hapus meja.
 *
 * Data diambil dari API backend; selama endpoint meja belum ada, halaman jatuh
 * ke data contoh dan mengatakannya secara terbuka lewat spanduk di atas daftar.
 */
export default function TableManagementPage() {
  const { user } = useAuth();
  const {
    tables,
    loading,
    error: loadError,
    reload,
    addTable,
    renameTable,
    removeTable,
    suggestNextName,
  } = useTableManager(user?.cafeId ?? '');

  const [formOpen, setFormOpen] = useState(false);
  /** Meja yang menunggu konfirmasi hapus. */
  const [deletingTable, setDeletingTable] = useState<CafeTable | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Meja yang QR-nya sedang dilihat. */
  const [qrTable, setQrTable] = useState<CafeTable | null>(null);

  // Status pemakaian dihitung backend dari pesanan yang masih berjalan, jadi
  // tinggal dibaca dari tiap meja — tidak perlu diturunkan ulang di klien.
  const inUseCount = useMemo(
    () => tables.filter((table) => table.status === 'DIGUNAKAN').length,
    [tables],
  );
  /** Pesan hasil tindakan terakhir; `highlightId` menyorot kartu terkait. */
  const [notice, setNotice] = useState<{
    text: string;
    highlightId?: string;
  } | null>(null);
  /** Pesan kegagalan tindakan terakhir. */
  const [errorText, setErrorText] = useState<string | null>(null);

  /** Validasi nama meja dipakai bersama oleh formulir tambah & ubah inline. */
  const handleRename = async (
    id: string,
    tableName: string,
  ): Promise<string | null> => {
    const trimmed = tableName.trim();
    if (trimmed.length < 2) return 'Minimal 2 karakter.';

    const clash = tables.some(
      (table) =>
        table.id !== id && table.tableName.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) return 'Nama meja sudah dipakai.';

    try {
      await renameTable(id, trimmed);
      return null;
    } catch (error) {
      return describeApiError(error, 'Nama meja gagal disimpan.');
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * Simpan meja baru. Kegagalan dikembalikan ke formulir (bukan menutupnya)
   * supaya isian pengguna tidak hilang dan bisa langsung dicoba lagi.
   */
  const handleAddTable = async (tableName: string): Promise<string | null> => {
    try {
      await addTable(tableName);
      setFormOpen(false);
      setErrorText(null);
      setNotice({ text: `${tableName.trim()} berhasil ditambahkan.` });
      return null;
    } catch (error) {
      return describeApiError(error, 'Meja gagal ditambahkan.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTable) return;
    const target = deletingTable;

    setDeleting(true);
    try {
      await removeTable(target.id);
      setErrorText(null);
      setNotice({ text: `${target.tableName} berhasil dihapus.` });
      setDeletingTable(null);
    } catch (error) {
      setDeletingTable(null);
      setErrorText(describeApiError(error, 'Meja gagal dihapus.'));
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout
      title="Manajemen Meja & QR"
      subtitle={`${tables.length} meja · ${inUseCount} sedang digunakan · ${user.cafeName}`}
      actions={
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden sm:inline">Tambah Meja</span>
          <span className="sr-only sm:hidden">Tambah meja</span>
        </button>
      }
    >
      <div className="space-y-5">
        {/* Gagal memuat dari server — tampilkan apa adanya, jangan mengarang data */}
        {!loading && loadError && (
          <AlertBanner
            tone="error"
            title="Gagal memuat daftar meja"
            action={{ label: 'Coba lagi', onClick: reload }}
          >
            {loadError}
          </AlertBanner>
        )}

        {errorText && (
          <AlertBanner tone="error" onClose={() => setErrorText(null)}>
            {errorText}
          </AlertBanner>
        )}

        {notice && (
          <AlertBanner tone="success" onClose={() => setNotice(null)}>
            {notice.text}
          </AlertBanner>
        )}

        {loading ? (
          <div
            role="status"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
          >
            <span className="sr-only">Memuat daftar meja…</span>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="h-44 animate-pulse rounded-2xl bg-white/70 ring-1 ring-slate-200"
              />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-20 text-center">
            <span className="text-4xl">🪑</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-700">
              Belum ada meja
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Tambahkan meja untuk kafe {user.cafeName}. Setiap meja mendapat QR
              code sendiri yang dipindai pelanggan untuk membuka menu digital.
            </p>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Tambah meja pertama
            </button>
          </div>
        ) : (
          <>
            {/* Keterangan warna status */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Digunakan — masih ada pesanan berjalan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Kosong — siap dipakai tamu berikutnya
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  status={table.status}
                  highlighted={table.id === notice?.highlightId}
                  onRename={handleRename}
                  onDelete={setDeletingTable}
                  onShowQr={setQrTable}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {formOpen && (
        <TableFormModal
          existingNames={tables.map((table) => table.tableName.toLowerCase())}
          suggestedName={suggestNextName()}
          onSubmit={handleAddTable}
          onClose={() => setFormOpen(false)}
        />
      )}

      {qrTable && (
        <TableQrModal
          table={qrTable}
          cafeName={user.cafeName}
          onClose={() => setQrTable(null)}
        />
      )}

      {deletingTable && (
        <ConfirmDialog
          tone="danger"
          title={`Hapus ${deletingTable.tableName}?`}
          message={
            <>
              QR code meja ini (
              <span className="font-mono">{deletingTable.qrCode}</span>) tidak akan
              bisa dipakai lagi — stiker yang sudah tercetak perlu diganti. Pesanan
              lama pada meja ini tetap tersimpan.
            </>
          }
          confirmLabel="Ya, hapus"
          busy={deleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeletingTable(null)}
        />
      )}
    </AppLayout>
  );
}

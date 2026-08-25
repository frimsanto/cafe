import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ManualMethodCode } from '../types/order';
import { useAuth } from '../auth/AuthContext';
import { pembayaranApi } from '../api/pembayaran';
import { describeApiError } from '../lib/apiClient';
import { manualMethods } from '../data/paymentMethods';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';

/**
 * Pengaturan Pembayaran kafe (khusus OWNER).
 *
 * Tiga bagian: metode manual yang diterima (checklist), integrasi Midtrans
 * opsional (kredensial + mode), dan status DOKU Checkout. serverKey bersifat
 * tulis-saja — tidak pernah dikirim balik server, jadi kolomnya selalu kosong
 * saat dibuka; mengisinya = mengganti, mengosongkannya = biarkan kredensial lama.
 *
 * Bagian DOKU sengaja hanya BACA. Kredensialnya milik platform, satu untuk semua
 * kafe, jadi tidak ada yang bisa — dan boleh — disetel pemilik kafe di sini;
 * yang ditampilkan cuma apakah jalur itu sedang aktif untuk pelanggannya.
 */
export default function PaymentSettingsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dokuAktif, setDokuAktif] = useState(false);

  const [selected, setSelected] = useState<Set<ManualMethodCode>>(new Set(['TUNAI']));
  const [midtransOn, setMidtransOn] = useState(false);
  const [midtransAktif, setMidtransAktif] = useState(false);
  const [serverKey, setServerKey] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [isProduction, setIsProduction] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    pembayaranApi
      .getConfig()
      .then((config) => {
        if (cancelled) return;
        setSelected(new Set(config.metodeDiterima as ManualMethodCode[]));
        setMidtransOn(config.midtransAktif);
        setMidtransAktif(config.midtransAktif);
        setClientKey(config.clientKey ?? '');
        setIsProduction(config.isProduction);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(describeApiError(err, 'Gagal memuat konfigurasi pembayaran.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Status DOKU tidak ada di `payment-config` (yang isinya khusus setelan kafe),
  // jadi diambil dari endpoint opsi — sumber yang sama dengan yang dibaca
  // checkout pelanggan, supaya yang dilihat pemilik persis yang dialami tamunya.
  // Kegagalannya sengaja ditelan: ini panel informasi, bukan syarat menyimpan.
  useEffect(() => {
    const cafeId = user?.cafeId;
    if (!cafeId) return;
    let cancelled = false;

    pembayaranApi
      .opsi(cafeId)
      .then((opsi) => {
        if (!cancelled) setDokuAktif(opsi.dokuAktif ?? false);
      })
      .catch(() => {
        if (!cancelled) setDokuAktif(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.cafeId]);

  const toggleMethod = (code: ManualMethodCode) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setSaveOk(null);
  };

  const orderedSelected = useMemo(
    () => manualMethods.filter((m) => selected.has(m.code)).map((m) => m.code),
    [selected],
  );

  if (user && user.role !== 'OWNER') return <Navigate to="/kasir" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const handleSave = async () => {
    setSaveError(null);
    setSaveOk(null);

    if (orderedSelected.length === 0) {
      setSaveError('Pilih minimal satu metode pembayaran manual.');
      return;
    }
    // Mengaktifkan Midtrans pertama kali wajib mengisi Server Key.
    if (midtransOn && !midtransAktif && serverKey.trim() === '') {
      setSaveError('Isi Server Key untuk mengaktifkan Midtrans.');
      return;
    }

    setSaving(true);
    try {
      const result = await pembayaranApi.saveConfig({
        metodeDiterima: orderedSelected,
        ...(midtransOn
          ? {
              clientKey: clientKey.trim(),
              isProduction,
              ...(serverKey.trim() !== '' ? { serverKey: serverKey.trim() } : {}),
            }
          : {}),
      });
      setMidtransAktif(result.midtransAktif);
      setServerKey('');
      setSaveOk('Konfigurasi pembayaran tersimpan.');
    } catch (err) {
      setSaveError(describeApiError(err, 'Gagal menyimpan konfigurasi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Pengaturan" subtitle="Metode & integrasi pembayaran kafe">
      {/* Tab (satu untuk saat ini; disiapkan untuk tab lain di masa depan). */}
      <div className="mb-5 flex gap-1 border-b border-warm-line">
        <span className="border-b-2 border-warm-amber px-4 py-2.5 text-sm font-semibold text-warm-espresso">
          Pembayaran
        </span>
      </div>

      {loadError && (
        <AlertBanner tone="error" title="Gagal memuat">
          {loadError}
        </AlertBanner>
      )}

      {loading ? (
        <div className="grid gap-4">
          <div aria-hidden className="skeleton-warm h-48 rounded-2xl" />
          <div aria-hidden className="skeleton-warm h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-5">
          {saveError && (
            <AlertBanner tone="error" onClose={() => setSaveError(null)}>
              {saveError}
            </AlertBanner>
          )}
          {saveOk && (
            <AlertBanner tone="success" onClose={() => setSaveOk(null)}>
              {saveOk}
            </AlertBanner>
          )}

          {/* ── Metode manual ── */}
          <section className="rounded-2xl bg-warm-paper p-5 shadow-sm ring-1 ring-warm-line">
            <h2 className="text-base font-bold text-warm-espresso">Metode diterima</h2>
            <p className="mt-0.5 text-sm text-warm-muted">
              Metode yang bisa dipilih kasir saat menagih pesanan.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {manualMethods.map((method) => {
                const checked = selected.has(method.code);
                return (
                  <label
                    key={method.code}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-warm-cream px-4 py-3 ring-1 transition ${
                      checked ? 'ring-2 ring-warm-amber' : 'ring-warm-line hover:bg-warm-espresso/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMethod(method.code)}
                      className="h-4 w-4 accent-warm-amber"
                    />
                    <span className="text-xl">{method.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-warm-espresso">{method.name}</span>
                      <span className="block text-xs text-warm-muted">{method.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* ── Midtrans ── */}
          <section className="rounded-2xl bg-warm-paper p-5 shadow-sm ring-1 ring-warm-line">
            <div className="flex items-start justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={midtransOn}
                  onChange={(e) => {
                    setMidtransOn(e.target.checked);
                    setSaveOk(null);
                  }}
                  className="h-4 w-4 accent-warm-amber"
                />
                <span>
                  <span className="block text-base font-bold text-warm-espresso">
                    Midtrans <span className="text-xl">🔵</span>
                  </span>
                  <span className="block text-xs text-warm-muted">
                    QRIS dinamis, GoPay, Virtual Account — dibayar pelanggan.
                  </span>
                </span>
              </label>

              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  midtransAktif
                    ? 'bg-warm-success/10 text-warm-success'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {midtransAktif ? '✅ Midtrans aktif' : '⚠️ Belum dikonfigurasi'}
              </span>
            </div>

            {midtransOn && (
              <div className="mt-4 space-y-4 border-t border-warm-line pt-4">
                <div>
                  <label
                    htmlFor="server-key"
                    className="mb-1 block text-sm font-medium text-warm-subtle"
                  >
                    Server Key {midtransAktif && <span className="text-warm-muted">(isi untuk mengganti)</span>}
                  </label>
                  <input
                    id="server-key"
                    type="password"
                    autoComplete="off"
                    value={serverKey}
                    onChange={(e) => setServerKey(e.target.value)}
                    placeholder={midtransAktif ? '•••••••• (tersimpan)' : 'Mid-server-xxxxxxxx'}
                    className="w-full rounded-xl border-0 bg-warm-cream py-2.5 px-3.5 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
                  />
                  <p className="mt-1 text-xs text-warm-muted">
                    Disimpan terenkripsi. Tidak pernah ditampilkan kembali.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="client-key"
                    className="mb-1 block text-sm font-medium text-warm-subtle"
                  >
                    Client Key
                  </label>
                  <input
                    id="client-key"
                    type="text"
                    autoComplete="off"
                    value={clientKey}
                    onChange={(e) => setClientKey(e.target.value)}
                    placeholder="Mid-client-xxxxxxxx"
                    className="w-full rounded-xl border-0 bg-warm-cream py-2.5 px-3.5 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
                  />
                </div>

                <div>
                  <span className="mb-1 block text-sm font-medium text-warm-subtle">Mode</span>
                  <div className="inline-flex rounded-xl bg-warm-cream p-1 ring-1 ring-warm-line">
                    <button
                      type="button"
                      onClick={() => setIsProduction(false)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                        !isProduction
                          ? 'bg-warm-amber text-white shadow-sm'
                          : 'text-warm-subtle hover:text-warm-espresso'
                      }`}
                    >
                      Sandbox
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsProduction(true)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                        isProduction
                          ? 'bg-warm-amber text-white shadow-sm'
                          : 'text-warm-subtle hover:text-warm-espresso'
                      }`}
                    >
                      Production
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-warm-cream p-3 text-xs text-warm-muted">
                  <p className="font-semibold text-warm-subtle">Webhook Midtrans (Payment Notification URL):</p>
                  <code className="mt-1 block break-all font-mono text-warm-espresso">
                    https://cafe.fessolution.my.id/api/pembayaran/notifikasi/{user.cafeId}
                  </code>
                </div>
              </div>
            )}
          </section>

          {/* ── DOKU Checkout (informasi platform, bukan setelan kafe) ── */}
          <section className="rounded-2xl bg-warm-paper p-5 shadow-sm ring-1 ring-warm-line">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-warm-espresso">
                  DOKU Checkout <span className="text-xl">🟣</span>
                </h2>
                <p className="mt-0.5 text-xs text-warm-muted">
                  Gateway platform — tidak perlu disetel per kafe.
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  dokuAktif
                    ? 'bg-warm-success/10 text-warm-success'
                    : 'bg-warm-cream text-warm-muted'
                }`}
              >
                {dokuAktif ? '✅ Aktif' : '○ Tidak aktif'}
              </span>
            </div>

            <div className="mt-4 space-y-3 border-t border-warm-line pt-4 text-sm text-warm-subtle">
              <p>
                {dokuAktif
                  ? 'Pembayaran via DOKU tersedia otomatis untuk semua kafe di platform CafeOS. Pelanggan bisa bayar menggunakan QRIS, Virtual Account, dan e-wallet melalui halaman checkout DOKU.'
                  : 'Jalur DOKU sedang tidak aktif di platform, jadi pilihan ini tidak muncul di halaman checkout pelanggan. Tidak ada yang perlu kamu lakukan — pengaktifannya dari sisi Fessolution.'}
              </p>
              <p className="text-xs text-warm-muted">
                Dikelola oleh: Fessolution (
                <a
                  href="mailto:admin@fessolution.my.id"
                  className="font-medium text-warm-subtle underline underline-offset-2"
                >
                  admin@fessolution.my.id
                </a>
                )
              </p>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-2xl bg-warm-amber px-6 py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

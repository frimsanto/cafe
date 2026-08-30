import { useEffect, useState } from 'react';
import type { StafBaruBody, StafDTO, StafUbahBody } from '../../types/staf';
import type { UserRole } from '../../types/auth';
import { ROLE_LABEL } from '../../types/auth';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';

interface Props {
  /** Null = tambah staf baru. */
  staf: StafDTO | null;
  busy: boolean;
  onTutup: () => void;
  onSimpan: (body: StafBaruBody & StafUbahBody) => void;
}

const PERAN: UserRole[] = ['KASIR', 'DAPUR', 'OWNER'];

/** Penjelasan konsekuensi tiap peran — pemilik memilih akibat, bukan label. */
const AKIBAT_PERAN: Record<UserRole, string> = {
  OWNER: 'Melihat seluruh laporan, mengubah pengaturan, dan mengelola staf.',
  KASIR: 'Membuka shift, menagih, dan melihat riwayatnya sendiri.',
  DAPUR: 'Hanya Layar Dapur. Tidak menyentuh uang maupun laporan.',
};

/**
 * Formulir tambah/ubah staf.
 *
 * Kata sandi hanya diminta saat MEMBUAT staf — mengubahnya bukan urusan halaman
 * ini, dan menampilkan kolom sandi kosong pada formulir ubah adalah cara yang
 * bagus untuk membuat seseorang tidak sengaja mengosongkannya.
 */
export default function StafFormModal({ staf, busy, onTutup, onSimpan }: Props) {
  const ubah = staf !== null;

  const [name, setName] = useState(staf?.name ?? '');
  const [email, setEmail] = useState(staf?.email ?? '');
  const [phone, setPhone] = useState(staf?.phone ?? '');
  const [role, setRole] = useState<UserRole>(staf?.role ?? 'KASIR');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onTutup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTutup, busy]);

  const kirim = () => {
    setGalat(null);
    if (name.trim() === '') return setGalat('Nama wajib diisi.');
    if (email.trim() === '') return setGalat('Email wajib diisi.');
    if (!ubah && password.length < 8) {
      return setGalat('Kata sandi minimal 8 karakter.');
    }
    if (!ubah && pin !== '' && !/^\d{4,6}$/.test(pin)) {
      return setGalat('PIN harus 4-6 angka.');
    }

    onSimpan({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() === '' ? null : phone.trim(),
      role,
      password,
      ...(ubah ? {} : { pin: pin === '' ? null : pin }),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-warm-paper shadow-xl sm:rounded-3xl">
        <header className="border-b border-warm-line px-5 py-4">
          <h2 className="text-lg font-semibold text-warm-espresso">
            {ubah ? `Ubah ${staf.name}` : 'Tambah Staf'}
          </h2>
        </header>

        <ModalScrollArea className="max-h-[70vh] px-5 py-4">
          <div className="space-y-3">
            <Kolom label="Nama">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
              />
            </Kolom>

            <Kolom label="Email (dipakai untuk masuk)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
              />
            </Kolom>

            <Kolom label="Nomor HP (opsional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
              />
            </Kolom>

            <Kolom label="Peran">
              <div className="space-y-1.5">
                {PERAN.map((p) => (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                      role === p
                        ? 'border-warm-amber bg-warm-amber/5'
                        : 'border-warm-line hover:bg-warm-line/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="peran"
                      checked={role === p}
                      onChange={() => setRole(p)}
                      className="mt-0.5 accent-warm-amber"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-warm-espresso">
                        {ROLE_LABEL[p]}
                      </span>
                      <span className="block text-xs text-warm-muted">
                        {AKIBAT_PERAN[p]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Kolom>

            {!ubah && (
              <>
                <Kolom label="Kata sandi awal (minimal 8 karakter)">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
                  />
                </Kolom>

                <Kolom label="PIN terminal (opsional, 4-6 angka)">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 font-mono text-sm tracking-widest text-warm-espresso outline-none focus:border-warm-amber"
                  />
                  <p className="mt-1 text-xs text-warm-muted">
                    Dipakai membuka sesi di terminal kasir. Bisa diatur nanti.
                  </p>
                </Kolom>
              </>
            )}

            {galat && (
              <p role="alert" className="text-sm font-medium text-warm-danger">
                {galat}
              </p>
            )}
          </div>
        </ModalScrollArea>

        <footer className="flex justify-end gap-2 border-t border-warm-line px-5 py-3">
          <button
            type="button"
            onClick={onTutup}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={kirim}
            disabled={busy}
            className="rounded-xl bg-warm-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            {busy ? 'Menyimpan…' : 'Simpan'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Kolom({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-warm-muted">{label}</span>
      {children}
    </label>
  );
}

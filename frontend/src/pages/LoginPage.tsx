import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { landingPathFor, ROLE_LABEL } from '../types/auth';
import { mockAccounts } from '../data/mockUsers';

/**
 * Halaman masuk untuk staf & pemilik kafe.
 *
 * Fase frontend: kredensial diverifikasi ke akun demo (AuthContext tiruan).
 * Setelah berhasil, pengguna diarahkan sesuai perannya.
 */
export default function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Tujuan asal sebelum dialihkan oleh ProtectedRoute (jika ada).
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sudah masuk → langsung ke halaman sesuai peran.
  if (isAuthenticated && user) {
    return <Navigate to={from ?? landingPathFor(user.role)} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Gagal masuk.');
      return;
    }
    // Peran ditentukan dari akun yang cocok; ambil ulang dari daftar demo.
    const account = mockAccounts.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase(),
    );
    const fallback = account ? landingPathFor(account.role) : '/dasbor';
    navigate(from ?? fallback, { replace: true });
  };

  /** Isi cepat kredensial demo. */
  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Merek */}
        <div className="mb-6 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl text-white shadow-lg shadow-brand-600/20">
            ☕
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">CafeOS</h1>
          <p className="text-sm text-slate-500">Masuk untuk mengelola kafemu</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="nama@kafe.id"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Kata Sandi</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-20 text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                {showPassword ? 'Sembunyi' : 'Lihat'}
              </button>
            </div>
          </label>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-brand-400"
          >
            {submitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
            )}
            {submitting ? 'Memproses…' : 'Masuk'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Belum punya akun kafe?{' '}
          <Link to="/daftar" className="font-semibold text-brand-600 hover:underline">
            Daftar di sini
          </Link>
        </p>

        {/* Akun demo — memudahkan mencoba tiap peran pada fase frontend. */}
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Akun demo
          </p>
          <ul className="mt-2 space-y-1.5">
            {mockAccounts.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => fillDemo(account.email, account.password)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-700">
                      {ROLE_LABEL[account.role]}
                    </span>
                    <span className="ml-2 truncate text-slate-400">{account.email}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">
                    Isi
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

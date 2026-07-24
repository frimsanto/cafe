import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { landingPathFor, ROLE_LABEL } from '../types/auth';

/**
 * Halaman 403 — pengguna sudah masuk tetapi perannya tidak berhak mengakses
 * halaman ini.
 */
export default function ForbiddenPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl">
          🚫
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Akses ditolak</h1>
        <p className="mt-2 text-slate-500">
          {user ? (
            <>
              Peranmu (
              <span className="font-semibold text-slate-700">
                {ROLE_LABEL[user.role]}
              </span>
              ) tidak memiliki akses ke halaman ini.
            </>
          ) : (
            'Kamu tidak memiliki akses ke halaman ini.'
          )}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {user && (
            <Link
              to={landingPathFor(user.role)}
              className="rounded-xl bg-brand-600 py-2.5 font-semibold text-white transition hover:bg-brand-700"
            >
              Ke halaman saya
            </Link>
          )}
          <Link
            to="/login"
            className="rounded-xl bg-slate-100 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            Masuk sebagai pengguna lain
          </Link>
        </div>
      </div>
    </div>
  );
}

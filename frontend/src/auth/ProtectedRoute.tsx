import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { UserRole } from '../types/auth';
import ForbiddenPage from '../pages/ForbiddenPage';

interface ProtectedRouteProps {
  /** Peran yang diizinkan. Kosong = cukup sudah masuk. */
  allow?: UserRole[];
  children: ReactNode;
}

/**
 * Penjaga rute staf/pemilik.
 *
 * - Belum masuk → dialihkan ke `/login`, membawa tujuan asal agar bisa kembali
 *   ke sana setelah berhasil masuk.
 * - Sudah masuk tapi peran tidak diizinkan → halaman 403 (URL tetap, sehingga
 *   pengguna paham halaman apa yang ditolak).
 */
export default function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  if (allow && !allow.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return <>{children}</>;
}

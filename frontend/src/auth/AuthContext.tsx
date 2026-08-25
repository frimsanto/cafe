import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '../types/auth';
import { authApi } from '../api/auth';
import {
  clearAuthSession,
  describeApiError,
  readAuthToken,
  setSessionRefreshedHandler,
  setUnauthorizedHandler,
  writeAuthSession,
} from '../lib/apiClient';

/**
 * Profil pengguna disimpan berdampingan dengan token. Backend belum punya
 * endpoint `/auth/me`, jadi tanpa salinan profil ini setiap muat ulang halaman
 * akan kehilangan nama/peran/`cafeId` meski tokennya masih sah.
 */
const USER_STORAGE_KEY = 'cafeos-auth-user';

interface LoginResult {
  ok: boolean;
  error?: string;
  /**
   * Pengguna yang baru masuk. Dikembalikan langsung karena `user` dari context
   * masih bernilai lama pada saat pemanggil melanjutkan eksekusi (state React
   * baru terlihat pada render berikutnya) — halaman masuk butuh peran ini
   * seketika untuk menentukan tujuan pengalihan.
   */
  user?: AuthUser;
}

// CATATAN: `register` sudah DIHAPUS dari context ini. Pendaftaran tidak lagi
// menerbitkan sesi — halaman `/daftar` memanggil `pendaftaranApi.daftar` dan
// berhenti di layar tanda terima, sementara akunnya dibuat admin setelah
// pendaftar dihubungi. Jangan tambahkan kembali fungsi yang menulis sesi dari
// formulir pendaftaran.
interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Pulihkan sesi dari localStorage. Profil hanya dianggap sah bila tokennya
 * masih ada — menghapus token lewat devtools tidak boleh menyisakan pengguna
 * yang "seolah masuk" padahal setiap panggilan API-nya akan ditolak.
 */
function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  if (!readAuthToken()) return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser): void {
  try {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* storage tidak tersedia — sesi hanya bertahan di memori */
  }
}

/**
 * State autentikasi sungguhan: kredensial diverifikasi backend lewat
 * `/api/auth/login`, dan JWT yang dikembalikan disimpan di localStorage
 * (`cafeos-auth-token`) untuk ditempelkan `apiFetch` sebagai header
 * `Authorization: Bearer <token>` pada setiap permintaan berikutnya.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const logout = useCallback(() => {
    setUser(null);
    clearAuthSession();
    try {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  // Sesi benar-benar mati (refresh token ikut kedaluwarsa/ditolak): `apiClient`
  // memanggil handler ini setelah upaya perpanjangan otomatis gagal, sehingga
  // profil dibersihkan dan `ProtectedRoute` mengalihkan ke `/login`.
  //
  // Token akses yang sekadar kedaluwarsa TIDAK sampai ke sini — `apiClient`
  // memperbaruinya lalu mengulang permintaannya tanpa mengusik state ini.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      try {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      } catch {
        /* abaikan */
      }
    });
    // Setiap perpanjangan sesi membawa profil terbaru dari server — dipakai agar
    // perubahan peran ikut terpakai tanpa menunggu pengguna masuk ulang.
    setSessionRefreshedHandler((refreshed) => {
      setUser(refreshed);
      persistUser(refreshed);
    });
    return () => {
      setUnauthorizedHandler(null);
      setSessionRefreshedHandler(null);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const session = await authApi.login(email.trim().toLowerCase(), password);
        writeAuthSession(session.token, session.refreshToken);
        persistUser(session.user);
        setUser(session.user);
        return { ok: true, user: session.user };
      } catch (error) {
        return {
          ok: false,
          error: describeApiError(error, 'Email atau kata sandi salah.'),
        };
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}

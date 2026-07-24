import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '../types/auth';
import { findAccount, mockAccounts } from '../data/mockUsers';

const STORAGE_KEY = 'cafeos-auth-user';
const FAKE_LATENCY_MS = 600;

interface LoginResult {
  ok: boolean;
  error?: string;
}

/** Data pendaftaran kafe baru (pemilik + data usaha). */
export interface RegisterInput {
  cafeName: string;
  address: string;
  ownerName: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (input: RegisterInput) => Promise<LoginResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/**
 * State autentikasi tiruan untuk fase frontend: memverifikasi kredensial ke
 * daftar akun demo dan menyimpan sesi di localStorage.
 *
 * Fase backend akan menggantinya dengan panggilan API login + token.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      // Tiru jeda jaringan agar UI loading terasa nyata.
      await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));

      const found = findAccount(email, password);
      if (!found) {
        return { ok: false, error: 'Email atau kata sandi salah.' };
      }

      setUser(found);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
      } catch {
        /* storage tidak tersedia — sesi hanya bertahan di memori */
      }
      return { ok: true };
    },
    [],
  );

  /**
   * Daftarkan kafe baru. Setiap pendaftaran membuat `cafeId` baru — inilah
   * pemisah tenant: data kafe ini tidak akan tercampur dengan kafe lain.
   * Pendaftar otomatis menjadi OWNER dan langsung masuk.
   */
  const register = useCallback(
    async (input: RegisterInput): Promise<LoginResult> => {
      await new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));

      const emailTaken = mockAccounts.some(
        (a) => a.email.toLowerCase() === input.email.trim().toLowerCase(),
      );
      if (emailTaken) {
        return { ok: false, error: 'Email ini sudah terdaftar. Coba masuk saja.' };
      }

      const newUser: AuthUser = {
        id: `user-${Math.random().toString(36).slice(2, 10)}`,
        name: input.ownerName.trim(),
        email: input.email.trim().toLowerCase(),
        role: 'OWNER',
        cafeId: `cafe-${Math.random().toString(36).slice(2, 10)}`,
        cafeName: input.cafeName.trim(),
      };

      setUser(newUser);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
      } catch {
        /* storage tidak tersedia — sesi hanya bertahan di memori */
      }
      return { ok: true };
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, register, logout }),
    [user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}

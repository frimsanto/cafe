import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { landingPathFor } from '../types/auth';

/**
 * Halaman masuk untuk staf & pemilik kafe.
 *
 * Kredensial diverifikasi backend lewat `POST /api/auth/login`; setelah
 * berhasil, pengguna diarahkan sesuai peran yang dikembalikan server.
 *
 * Tampilan: split screen "Coffee Story" — panel kiri editorial gelap,
 * panel kanan form terang (di mobile hanya form yang tampil).
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

    if (!result.ok || !result.user) {
      setError(result.error ?? 'Gagal masuk.');
      return;
    }
    // Peran datang dari server (klaim di dalam JWT), bukan tebakan klien.
    navigate(from ?? landingPathFor(result.user.role), { replace: true });
  };

  // Transisi fade-up bersama untuk elemen naratif panel kiri.
  const fadeUp = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Panel kiri: Coffee Story (disembunyikan di mobile) ── */}
      <aside
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 md:flex"
        style={{
          backgroundColor: '#1a1208',
          backgroundImage:
            'radial-gradient(circle at 50% 42%, #3d2200 0%, #1a1208 68%)',
        }}
      >
        {/* Wordmark */}
        <span
          className="uppercase"
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.12em',
            color: '#7a5c2e',
          }}
        >
          CafeOS
        </span>

        {/* Narasi bawah */}
        <div>
          <motion.h2
            {...fadeUp}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.15,
              color: '#f5ede0',
            }}
          >
            Satu dapur,
            <br />
            satu layar.
          </motion.h2>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-sm"
            style={{ fontSize: 13, lineHeight: 1.7, color: '#7a5c2e' }}
          >
            Dari pesanan masuk hingga kopi tersaji — semua terpantau dari sini.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 flex items-center gap-3"
          >
            <div className="flex">
              {['#3d2200', '#2a1800', '#1a1000'].map((bg, i) => (
                <span
                  key={bg}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '9999px',
                    backgroundColor: bg,
                    border: '1px solid #5a3800',
                    marginLeft: i === 0 ? 0 : -11,
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11, color: '#5a3800' }}>200+ kafe aktif</span>
          </motion.div>
        </div>
      </aside>

      {/* ── Panel kanan: form login ── */}
      <main
        className="flex w-full items-center justify-center md:w-1/2"
        style={{ backgroundColor: '#faf8f5', padding: '48px 40px' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          {/* Wordmark khusus mobile (panel kiri tersembunyi) */}
          <span
            className="mb-8 inline-block uppercase md:hidden"
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.12em',
              color: '#c8891a',
            }}
          >
            CafeOS
          </span>

          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1a1208' }}>
            Selamat datang
          </h1>
          <p style={{ fontSize: 13, color: '#9a8a7a', marginBottom: 32 }}>
            Masuk ke akun kafemu
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span
                className="mb-1.5 block uppercase"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  color: '#6a5a4a',
                }}
              >
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="nama@kafe.id"
                className="w-full rounded-[8px] border-[0.5px] border-[#d8cfc5] bg-white px-[14px] py-[12px] text-[14px] text-[#1a1208] outline-none transition-[border-color,box-shadow] duration-150 ease-in-out placeholder:text-[#b8ada0] focus:border-[#c8891a] focus:shadow-[0_0_0_3px_rgba(200,137,26,0.12)]"
              />
            </label>

            <label className="block">
              <span
                className="mb-1.5 block uppercase"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  color: '#6a5a4a',
                }}
              >
                Kata Sandi
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-[8px] border-[0.5px] border-[#d8cfc5] bg-white px-[14px] py-[12px] pr-[68px] text-[14px] text-[#1a1208] outline-none transition-[border-color,box-shadow] duration-150 ease-in-out placeholder:text-[#b8ada0] focus:border-[#c8891a] focus:shadow-[0_0_0_3px_rgba(200,137,26,0.12)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[11px] font-medium text-[#9a8a7a] transition-colors hover:text-[#c8891a]"
                >
                  {showPassword ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-[8px] bg-[#fbeceb] px-3.5 py-2.5 text-[13px] text-[#b4231c]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[#c8891a] py-[13px] text-[14px] font-medium text-white transition-all duration-[120ms] ease-in-out hover:scale-[0.99] hover:bg-[#a8720f] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
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

          <p className="mt-6 text-[12px]" style={{ color: '#9a8a7a' }}>
            Belum punya akun kafe?{' '}
            <Link
              to="/daftar"
              className="font-medium text-[#c8891a] hover:underline"
            >
              Daftar di sini
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}

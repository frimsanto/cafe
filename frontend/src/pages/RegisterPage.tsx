import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, type RegisterInput } from '../auth/AuthContext';

type FieldErrors = Partial<Record<keyof RegisterInput | 'confirmPassword', string>>;

// Disamakan dengan aturan backend (MIN_PASSWORD_LENGTH) agar validasi konsisten.
const MIN_PASSWORD = 8;

/**
 * Pendaftaran akun kafe baru.
 *
 * Backend membuat `cafeId` baru untuk setiap pendaftaran (dasar isolasi data
 * multi-tenant), menjadikan pendaftarnya OWNER, lalu langsung mengembalikan
 * token — jadi tidak perlu login ulang.
 *
 * Tampilan: split screen "Coffee Story" — panel kiri editorial gelap,
 * panel kanan form terang (di mobile hanya form yang tampil), selaras dengan
 * halaman masuk.
 */
export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterInput>({
    cafeName: '',
    address: '',
    ownerName: '',
    email: '',
    password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const setField = (key: keyof RegisterInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!form.cafeName.trim()) next.cafeName = 'Nama kafe wajib diisi';
    if (!form.ownerName.trim()) next.ownerName = 'Nama pemilik wajib diisi';
    if (!form.email.trim()) {
      next.email = 'Email wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Format email tidak valid';
    }
    if (!form.password) {
      next.password = 'Kata sandi wajib diisi';
    } else if (form.password.length < MIN_PASSWORD) {
      next.password = `Minimal ${MIN_PASSWORD} karakter`;
    }
    if (confirmPassword !== form.password) {
      next.confirmPassword = 'Konfirmasi kata sandi tidak cocok';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    const result = await register(form);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error ?? 'Pendaftaran gagal.');
      return;
    }
    setSuccess(true);
    // Beri jeda singkat agar pesan sukses sempat terbaca.
    setTimeout(() => navigate('/dasbor', { replace: true }), 1400);
  };

  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ backgroundColor: '#faf8f5' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm rounded-2xl bg-white p-8 text-center"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div
            className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(200,137,26,0.14)', color: '#c8891a' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1
            className="mt-5"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 22,
              fontWeight: 600,
              color: '#1a1208',
            }}
          >
            Kafe berhasil didaftarkan
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: '#9a8a7a', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: '#6a5a4a' }}>{form.cafeName}</span> siap
            digunakan. Mengarahkan ke dasbor…
          </p>
        </motion.div>
      </div>
    );
  }

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
            Racik kafemu,
            <br />
            dari nol.
          </motion.h2>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-sm"
            style={{ fontSize: 13, lineHeight: 1.7, color: '#7a5c2e' }}
          >
            Daftar sekali, lalu kelola menu, meja, dan dapur — semua dari satu layar.
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

      {/* ── Panel kanan: form daftar ── */}
      <main
        className="flex w-full justify-center overflow-y-auto md:w-1/2"
        style={{ backgroundColor: '#faf8f5', padding: '40px' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="my-auto w-full max-w-sm"
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
            Daftarkan kafemu
          </h1>
          <p style={{ fontSize: 13, color: '#9a8a7a', marginBottom: 28 }}>
            Buat akun CafeOS — data kafemu terpisah dari kafe lain
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Field
              label="Nama Kafe"
              value={form.cafeName}
              onChange={(v) => setField('cafeName', v)}
              placeholder="Kopi Senja"
              error={errors.cafeName}
              autoComplete="organization"
            />
            <Field
              label="Alamat Kafe"
              value={form.address}
              onChange={(v) => setField('address', v)}
              placeholder="Jl. Melati No. 10, Jakarta (opsional)"
              error={errors.address}
              autoComplete="street-address"
            />
            <Field
              label="Nama Pemilik"
              value={form.ownerName}
              onChange={(v) => setField('ownerName', v)}
              placeholder="Nama lengkapmu"
              error={errors.ownerName}
              autoComplete="name"
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setField('email', v)}
              placeholder="nama@kafe.id"
              error={errors.email}
              autoComplete="email"
            />
            <Field
              label="Kata Sandi"
              type="password"
              value={form.password}
              onChange={(v) => setField('password', v)}
              placeholder={`Minimal ${MIN_PASSWORD} karakter`}
              error={errors.password}
              autoComplete="new-password"
            />
            <Field
              label="Ulangi Kata Sandi"
              type="password"
              value={confirmPassword}
              onChange={(v) => {
                setConfirmPassword(v);
                setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              placeholder="Ketik ulang kata sandi"
              error={errors.confirmPassword}
              autoComplete="new-password"
            />

            {formError && (
              <p
                role="alert"
                className="rounded-[8px] bg-[#fbeceb] px-3.5 py-2.5 text-[13px] text-[#b4231c]"
              >
                {formError}
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
              {submitting ? 'Mendaftarkan…' : 'Daftar Sekarang'}
            </button>
          </form>

          <p className="mt-6 text-[12px]" style={{ color: '#9a8a7a' }}>
            Sudah punya akun?{' '}
            <Link
              to="/login"
              className="font-medium text-[#c8891a] hover:underline"
            >
              Masuk di sini
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  autoComplete?: string;
}

function Field({ label, value, onChange, placeholder, type = 'text', error, autoComplete }: FieldProps) {
  return (
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
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-[8px] border-[0.5px] bg-white px-[14px] py-[12px] text-[14px] text-[#1a1208] outline-none transition-[border-color,box-shadow] duration-150 ease-in-out placeholder:text-[#b8ada0] ${
          error
            ? 'border-[#e0a09c] focus:border-[#b4231c] focus:shadow-[0_0_0_3px_rgba(180,35,28,0.10)]'
            : 'border-[#d8cfc5] focus:border-[#c8891a] focus:shadow-[0_0_0_3px_rgba(200,137,26,0.12)]'
        }`}
      />
      {error && <span className="mt-1 block text-[12px] text-[#b4231c]">{error}</span>}
    </label>
  );
}

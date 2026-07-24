import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type RegisterInput } from '../auth/AuthContext';

type FieldErrors = Partial<Record<keyof RegisterInput | 'confirmPassword', string>>;

// Disamakan dengan aturan backend (MIN_PASSWORD_LENGTH) agar validasi konsisten.
const MIN_PASSWORD = 8;

/**
 * Pendaftaran akun kafe baru.
 *
 * Fase frontend: pendaftaran disimulasikan (AuthContext tiruan) — setiap kafe
 * baru mendapat `cafeId` sendiri sebagai dasar isolasi data multi-tenant.
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
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Kafe berhasil didaftarkan!
          </h1>
          <p className="mt-1 text-slate-500">
            <span className="font-semibold text-slate-700">{form.cafeName}</span> siap
            digunakan. Mengarahkan ke dasbor…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl text-white shadow-lg shadow-brand-600/20">
            ☕
          </span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Daftarkan Kafemu</h1>
          <p className="text-sm text-slate-500">
            Buat akun CafeOS — data kafemu terpisah dari kafe lain.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <Field
            label="Nama Kafe"
            value={form.cafeName}
            onChange={(v) => setField('cafeName', v)}
            placeholder="Kopi Senja"
            error={errors.cafeName}
          />
          <Field
            label="Alamat Kafe"
            value={form.address}
            onChange={(v) => setField('address', v)}
            placeholder="Jl. Melati No. 10, Jakarta (opsional)"
            error={errors.address}
          />
          <Field
            label="Nama Pemilik"
            value={form.ownerName}
            onChange={(v) => setField('ownerName', v)}
            placeholder="Nama lengkapmu"
            error={errors.ownerName}
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setField('email', v)}
            placeholder="nama@kafe.id"
            error={errors.email}
          />
          <Field
            label="Kata Sandi"
            type="password"
            value={form.password}
            onChange={(v) => setField('password', v)}
            placeholder={`Minimal ${MIN_PASSWORD} karakter`}
            error={errors.password}
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
          />

          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-brand-400"
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

        <p className="mt-5 text-center text-sm text-slate-500">
          Sudah punya akun?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Masuk di sini
          </Link>
        </p>
      </div>
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
}

function Field({ label, value, onChange, placeholder, type = 'text', error }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
            : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
        }`}
      />
      {error && <span className="mt-1 block text-sm text-rose-600">{error}</span>}
    </label>
  );
}

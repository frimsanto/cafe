import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { pendaftaranApi, type PendaftaranPayload } from '../api/pendaftaran';
import { describeApiError } from '../lib/apiClient';

type FieldErrors = Partial<Record<keyof PendaftaranPayload, string>>;

/**
 * Tautan WhatsApp tim CafeOS, dengan pesan pembuka sudah terisi — pendaftar
 * tinggal menekan kirim, jadi percakapannya langsung nyambung ke konteks
 * "aktivasi akun" tanpa perlu menjelaskan ulang.
 */
const WHATSAPP_URL =
  'https://wa.me/6285173391208?text=Halo%2C%20saya%20sudah%20mendaftar%20CafeOS%20dan%20ingin%20mengaktifkan%20akun%20saya.';

/**
 * Pendaftaran kafe baru — permintaan, BUKAN pembuatan akun.
 *
 * Formulir ini mengirim `POST /api/public/daftar`, yang hanya mencatat baris
 * `tenant_registrations` berstatus `baru`. Tidak ada kafe, akun, maupun token
 * yang lahir dari sini: admin yang mengaktifkan akunnya setelah menghubungi
 * pendaftar. Karena itu halaman ini tidak lagi menyentuh `useAuth` dan tidak
 * mengalihkan ke `/dasbor` — ujungnya adalah layar "kami hubungi via WhatsApp".
 *
 * Kata sandi sengaja TIDAK diminta: belum ada akun yang bisa memakainya, dan
 * menyimpannya di tabel permintaan berarti menaruh kredensial di tempat yang
 * dibaca panel admin. Pemilik menyusunnya nanti saat akunnya dibuatkan.
 *
 * Tampilan: split screen "Coffee Story" — panel kiri editorial gelap, panel
 * kanan terang (di mobile hanya panel kanan yang tampil), selaras dengan
 * halaman masuk.
 */
export default function RegisterPage() {
  const [form, setForm] = useState<PendaftaranPayload>({
    namaCafe: '',
    namaPemilik: '',
    email: '',
    noHp: '',
    pesan: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [terkirim, setTerkirim] = useState(false);

  const setField = (key: keyof PendaftaranPayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!form.namaCafe.trim()) next.namaCafe = 'Nama kafe wajib diisi';
    if (!form.namaPemilik.trim()) next.namaPemilik = 'Nama pemilik wajib diisi';
    if (!form.email.trim()) {
      next.email = 'Email wajib diisi';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Format email tidak valid';
    }
    // Nomornya dipakai tim untuk menghubungi lewat WhatsApp, jadi wajib —
    // spasi diabaikan supaya "0851 7339 1208" ikut lolos.
    const noHp = form.noHp.replace(/\s+/g, '');
    if (!noHp) {
      next.noHp = 'Nomor WhatsApp wajib diisi';
    } else if (!/^[0-9+\-()]{8,20}$/.test(noHp)) {
      next.noHp = 'Format nomor tidak valid';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await pendaftaranApi.daftar(form);
      setTerkirim(true);
    } catch (error) {
      setFormError(
        describeApiError(error, 'Pendaftaran gagal dikirim. Coba lagi sebentar lagi.'),
      );
    } finally {
      setSubmitting(false);
    }
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
            Kirim datamu, tim kami hubungi lewat WhatsApp, lalu akunmu diaktifkan —
            setelah itu menu, meja, dan dapur dikelola dari satu layar.
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

      {/* ── Panel kanan: formulir, atau tanda terima setelah terkirim ── */}
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

          {terkirim ? <TandaTerima /> : null}

          {!terkirim && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#1a1208' }}>
                Daftarkan kafemu
              </h1>
              <p style={{ fontSize: 13, color: '#9a8a7a', marginBottom: 28 }}>
                Isi datanya, tim kami akan menghubungimu untuk aktivasi akun
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <Field
                  label="Nama Kafe"
                  value={form.namaCafe}
                  onChange={(v) => setField('namaCafe', v)}
                  placeholder="Kopi Senja"
                  error={errors.namaCafe}
                  autoComplete="organization"
                />
                <Field
                  label="Nama Pemilik"
                  value={form.namaPemilik}
                  onChange={(v) => setField('namaPemilik', v)}
                  placeholder="Nama lengkapmu"
                  error={errors.namaPemilik}
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
                  label="Nomor WhatsApp"
                  type="tel"
                  inputMode="tel"
                  value={form.noHp}
                  onChange={(v) => setField('noHp', v)}
                  placeholder="0851 7339 1208"
                  error={errors.noHp}
                  autoComplete="tel"
                />
                <Field
                  label="Pesan (opsional)"
                  multiline
                  value={form.pesan}
                  onChange={(v) => setField('pesan', v)}
                  placeholder="Ceritakan sedikit soal kafemu — jumlah meja, jam buka, dsb."
                  error={errors.pesan}
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
                  {submitting ? 'Mengirim…' : 'Kirim Pendaftaran'}
                </button>
              </form>

              <p className="mt-6 text-[12px]" style={{ color: '#9a8a7a' }}>
                Sudah punya akun?{' '}
                <Link to="/login" className="font-medium text-[#c8891a] hover:underline">
                  Masuk di sini
                </Link>
              </p>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

/**
 * Layar setelah pendaftaran tercatat. Menggantikan formulir sepenuhnya supaya
 * tidak ada godaan mengirim ulang data yang sama, dan menaruh WhatsApp sebagai
 * satu-satunya tindakan lanjutan — di situlah aktivasinya diurus.
 */
function TandaTerima() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      role="status"
    >
      <div
        className="animate-pop-in flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: 'rgba(200,137,26,0.14)', color: '#c8891a' }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>

      <h1
        className="mt-6"
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 26,
          fontWeight: 600,
          color: '#1a1208',
        }}
      >
        Pendaftaran Berhasil! 🎉
      </h1>
      <p className="mt-3 text-[13px]" style={{ color: '#6a5a4a', lineHeight: 1.7 }}>
        Terima kasih! Permintaan pendaftaran kamu sudah kami terima. Tim kami akan
        menghubungi kamu via WhatsApp dalam 1x24 jam untuk proses aktivasi akun.
      </p>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-[8px] bg-[#25d366] py-[13px] text-[14px] font-medium text-white transition-all duration-[120ms] ease-in-out hover:scale-[0.99] hover:bg-[#1eb655] active:scale-[0.97]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.99 2.898 9.82 9.82 0 0 1 2.892 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.82 11.82 0 0 0 20.464 3.488" />
        </svg>
        Hubungi Tim via WhatsApp
      </a>

      <p className="mt-6 text-[12px]" style={{ color: '#9a8a7a' }}>
        Sudah punya akun?{' '}
        <Link to="/login" className="font-medium text-[#c8891a] hover:underline">
          Masuk di sini
        </Link>
      </p>
    </motion.div>
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
  inputMode?: 'text' | 'tel' | 'email';
  /** Render sebagai `<textarea>` — dipakai field pesan yang isinya bisa panjang. */
  multiline?: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  autoComplete,
  inputMode,
  multiline = false,
}: FieldProps) {
  const kelasKendali = `w-full rounded-[8px] border-[0.5px] bg-white px-[14px] py-[12px] text-[14px] text-[#1a1208] outline-none transition-[border-color,box-shadow] duration-150 ease-in-out placeholder:text-[#b8ada0] ${
    error
      ? 'border-[#e0a09c] focus:border-[#b4231c] focus:shadow-[0_0_0_3px_rgba(180,35,28,0.10)]'
      : 'border-[#d8cfc5] focus:border-[#c8891a] focus:shadow-[0_0_0_3px_rgba(200,137,26,0.12)]'
  }`;

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
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          aria-invalid={Boolean(error)}
          className={`${kelasKendali} resize-none`}
        />
      ) : (
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={kelasKendali}
        />
      )}
      {error && <span className="mt-1 block text-[12px] text-[#b4231c]">{error}</span>}
    </label>
  );
}

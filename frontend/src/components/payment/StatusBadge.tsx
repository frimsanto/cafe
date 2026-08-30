import PaymentIcon, { type PaymentIconName } from './PaymentIcon';

/**
 * Nada badge status. Aturannya sama di seluruh modul pembayaran, jadi tidak ada
 * layar yang memakai hijau untuk keadaan yang oleh layar lain disebut merah:
 *
 *   hijau  — siap / terverifikasi / lunas
 *   kuning — perlu tindakan pemilik atau kasir
 *   merah  — gagal
 *   abu    — belum dikonfigurasi (bukan masalah, cuma belum diisi)
 */
export type NadaBadge = 'hijau' | 'kuning' | 'merah' | 'abu';

const GAYA: Record<NadaBadge, { kelas: string; ikon: PaymentIconName }> = {
  hijau: {
    kelas: 'bg-warm-success/10 text-warm-success ring-warm-success/25',
    ikon: 'check',
  },
  kuning: {
    kelas: 'bg-amber-100/70 text-amber-800 ring-amber-300/60',
    ikon: 'alert',
  },
  merah: {
    kelas: 'bg-rose-100/70 text-rose-800 ring-rose-300/60',
    ikon: 'x',
  },
  abu: {
    kelas: 'bg-warm-espresso/5 text-warm-muted ring-warm-line',
    ikon: 'clock',
  },
};

interface StatusBadgeProps {
  nada: NadaBadge;
  children: string;
  /** Ganti ikon bawaan nada; berguna untuk badge "Manual". */
  ikon?: PaymentIconName | null;
  size?: 'sm' | 'md';
}

/**
 * Badge status berbentuk pil: ikon + kata.
 *
 * Warnanya SELALU didampingi ikon dan teks. Halaman ini dibaca di kafe dengan
 * layar murah dan cahaya matahari langsung, dan sebagian pemakainya tidak bisa
 * membedakan hijau dari merah — warna saja bukan penyampai informasi.
 */
export default function StatusBadge({
  nada,
  children,
  ikon,
  size = 'md',
}: StatusBadgeProps) {
  const gaya = GAYA[nada];
  const namaIkon = ikon === null ? null : (ikon ?? gaya.ikon);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${gaya.kelas} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {namaIkon && <PaymentIcon name={namaIkon} size={size === 'sm' ? 12 : 14} />}
      {children}
    </span>
  );
}

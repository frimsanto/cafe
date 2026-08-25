import { labelMetode, toneMetode, type MetodeTone } from '../../data/paymentMethods';

/**
 * Badge metode pembayaran.
 *
 * Warnanya menandai JALUR uangnya, bukan sekadar hiasan: DOKU (gateway platform)
 * ungu, gateway kafe sendiri biru, dan yang dikonfirmasi kasir abu-abu. Dengan
 * begitu satu tabel riwayat bisa dibaca sekilas — mana yang uangnya sudah masuk
 * otomatis, mana yang bergantung pada kasir.
 */
const TONE_CLASS: Record<MetodeTone, string> = {
  doku: 'bg-violet-50 text-violet-700 ring-violet-200',
  online: 'bg-sky-50 text-sky-700 ring-sky-200',
  manual: 'bg-slate-100 text-slate-600 ring-slate-200',
};

interface BadgeMetodeProps {
  /** Kode/label metode apa adanya dari server; null → tampil sebagai "-". */
  metode: string | null | undefined;
  className?: string;
}

export default function BadgeMetode({ metode, className = '' }: BadgeMetodeProps) {
  const tone = toneMetode(metode);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASS[tone]} ${className}`}
    >
      {tone === 'doku' && <span aria-hidden>🟣</span>}
      {labelMetode(metode)}
    </span>
  );
}

import { formatThousands } from '../../lib/format';
import OdometerNumber from './OdometerNumber';

/** Nuansa warna sub-label sesuai makna angkanya. */
type StatTone = 'success' | 'amber' | 'muted';

interface StatCardProps {
  label: string;
  /** Angka mentah — dianimasikan ala odometer. String dipakai untuk nilai non-numerik. */
  value: number | string;
  /** Perubahan terhadap periode pembanding, dalam persen. */
  deltaPercent?: number | null;
  /** Keterangan pembanding, mis. "vs kemarin". */
  deltaLabel?: string;
  /** Kalimat pengganti saat perubahannya tepat nol, mis. "sama seperti kemarin". */
  deltaSameLabel?: string;
  /** Keterangan tambahan bila tidak memakai delta. */
  hint?: string;
  /** Warna sub-label ketika memakai `hint` (default: netral/muted). */
  hintTone?: StatTone;
  /** Pemformat angka — mis. `formatRupiah` untuk kartu bernominal uang. */
  format?: (value: number) => string;
}

const TONE_COLOR: Record<StatTone, string> = {
  success: 'var(--color-success)',
  amber: 'var(--color-amber)',
  muted: 'var(--color-muted)',
};

/**
 * Besar perubahan tanpa tanda — arahnya sudah dibawa panah di sebelahnya.
 *
 * Sebelumnya nilai negatif dicetak apa adanya sehingga terbaca "↓ -25.0%":
 * dua penanda arah untuk satu perubahan, dan sekilas mudah terbaca terbalik.
 */
function formatDelta(percent: number): string {
  return `${Math.abs(percent).toFixed(1)}%`;
}

/**
 * Kartu metrik (KPI) dasbor pemilik dalam gaya "Cafe Ambient": label kecil,
 * angka besar ber-animasi odometer, dan sub-label bertren. Warna tidak dipakai
 * sebagai satu-satunya penanda makna — nilainya selalu tertulis sebagai angka.
 */
export default function StatCard({
  label,
  value,
  deltaPercent,
  deltaLabel,
  deltaSameLabel,
  hint,
  hintTone = 'muted',
  format = formatThousands,
}: StatCardProps) {
  const hasDelta = typeof deltaPercent === 'number';
  /**
   * Tiga keadaan, bukan dua.
   *
   * Sebelumnya "naik" didefinisikan sebagai `>= 0`, sehingga perubahan NOL
   * ditampilkan hijau dengan panah naik — kartu berbunyi "↑ +0.0% vs kemarin",
   * yang membaca sebagai kabar baik padahal tidak ada yang berubah. Nol kini
   * punya tampilannya sendiri: netral, tanpa panah.
   */
  const naik = hasDelta && deltaPercent > 0;
  const tetap = hasDelta && deltaPercent === 0;

  return (
    <article
      className="card-warm card-warm-lift rounded-xl px-[18px] py-4"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      <p
        className="uppercase"
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.06em',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </p>

      <div
        className="mt-2"
        style={{
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: '-0.03em',
          color: 'var(--color-espresso)',
          lineHeight: 1.1,
        }}
      >
        {typeof value === 'number' ? (
          <OdometerNumber value={value} format={format} />
        ) : (
          value
        )}
      </div>

      {tetap ? (
        <p className="mt-1.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {deltaSameLabel ?? 'tidak berubah'}
        </p>
      ) : hasDelta ? (
        <p className="mt-1.5 flex items-center gap-1" style={{ fontSize: 12 }}>
          <span
            style={{
              fontWeight: 500,
              color: naik ? 'var(--color-success)' : '#b4231c',
            }}
          >
            {naik ? '↑' : '↓'} {formatDelta(deltaPercent)}
          </span>
          {deltaLabel && (
            <span style={{ color: 'var(--color-muted)' }}>{deltaLabel}</span>
          )}
        </p>
      ) : (
        hint && (
          <p
            className="mt-1.5"
            style={{ fontSize: 12, fontWeight: 500, color: TONE_COLOR[hintTone] }}
          >
            {hint}
          </p>
        )
      )}
    </article>
  );
}

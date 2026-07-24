import { formatPersen } from '../../lib/format'
import { IkonNaik, IkonTurun } from '../../components/ui/ikon'

interface StatTileProps {
  label: string
  nilai: string
  keterangan?: string
  /** Persentase perubahan; `null`/undefined berarti tidak dibandingkan. */
  delta?: number | null
  /** Nama periode pembanding, mis. "bulan lalu". */
  deltaPembanding?: string
}

export function StatTile({
  label,
  nilai,
  keterangan,
  delta,
  deltaPembanding,
}: StatTileProps) {
  const adaDelta = typeof delta === 'number' && Number.isFinite(delta)
  const naik = adaDelta && delta > 0
  const Ikon = naik ? IkonNaik : IkonTurun

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{nilai}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {adaDelta && delta !== 0 && (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: naik ? 'var(--success-text)' : 'var(--status-critical)' }}
          >
            <Ikon className="h-3.5 w-3.5" />
            {formatPersen(delta)}
            <span className="sr-only">{naik ? 'naik' : 'turun'}</span>
          </span>
        )}
        {adaDelta && delta === 0 && (
          <span className="font-medium text-ink-secondary">Tidak berubah</span>
        )}
        {adaDelta && deltaPembanding && (
          <span className="text-ink-muted">dari {deltaPembanding}</span>
        )}
        {!adaDelta && keterangan && <span className="text-ink-muted">{keterangan}</span>}
        {adaDelta && keterangan && <span className="text-ink-muted">· {keterangan}</span>}
      </div>
    </div>
  )
}

import type { PendapatanAplikasi } from '../../types/dashboard'
import { formatAngka, formatPeriode, formatRupiah } from '../../lib/format'
import { Kartu } from '../../components/ui/Kartu'

interface PendapatanPerAplikasiProps {
  perAplikasi: PendapatanAplikasi[]
  periodeBerjalan: string
}

/**
 * Rincian pendapatan bulan berjalan per aplikasi.
 *
 * Satu ukuran (pendapatan) di atas kategori nominal (aplikasi), jadi semua
 * batang memakai satu warna seri — mewarnai per aplikasi hanya akan
 * menduplikasi informasi yang sudah dibawa panjang batang. Identitas dibawa
 * nama aplikasi di samping batang, dan setiap nilai ditulis langsung.
 */
export function PendapatanPerAplikasi({
  perAplikasi,
  periodeBerjalan,
}: PendapatanPerAplikasiProps) {
  const total = perAplikasi.reduce((jumlah, app) => jumlah + app.nominal, 0)
  const tertinggi = Math.max(...perAplikasi.map((app) => app.nominal), 1)
  const urut = [...perAplikasi].sort((a, b) => b.nominal - a.nominal)

  return (
    <Kartu
      judul="Pendapatan per aplikasi"
      keterangan={`Periode ${formatPeriode(periodeBerjalan)} (bulan berjalan).`}
    >
      <ul className="space-y-5">
        {urut.map((app) => {
          const porsi = total > 0 ? (app.nominal / total) * 100 : 0
          return (
            <li key={app.appId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-ink">
                  {app.nama}
                  <span className="ml-2 font-normal text-ink-muted">
                    {formatAngka(app.jumlahTenantAktif)} tenant aktif
                  </span>
                </p>
                <p className="text-sm tabular-nums text-ink">
                  {formatRupiah(app.nominal)}
                  <span className="ml-2 text-ink-muted">
                    {porsi.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                  </span>
                </p>
              </div>

              <div className="mt-2 h-2.5 w-full" aria-hidden="true">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${(app.nominal / tertinggi) * 100}%`,
                    backgroundColor: 'var(--series-1)',
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex items-baseline justify-between border-t border-hairline pt-4">
        <p className="text-sm text-ink-secondary">Total bulan ini</p>
        <p className="text-sm font-semibold tabular-nums text-ink">{formatRupiah(total)}</p>
      </div>
    </Kartu>
  )
}

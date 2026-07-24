import { useId, useState } from 'react'
import type { TitikTrenPendapatan } from '../../types/dashboard'
import {
  formatRupiah,
  formatRupiahRingkas,
  labelPeriodeSedang,
  labelPeriodeSingkat,
} from '../../lib/format'
import { persenDariBatas, skalaSumbu } from '../../lib/chart'
import { Kartu } from '../../components/ui/Kartu'

const TINGGI_PLOT = 224

interface TrenPendapatanChartProps {
  tren: TitikTrenPendapatan[]
}

/**
 * Grafik kolom pendapatan 12 bulan terakhir.
 *
 * Seri tunggal, jadi tidak perlu legenda — judul kartu sudah menyebut apa
 * yang diplot. Label langsung hanya dipasang pada dua kolom yang bercerita:
 * bulan tertinggi dan bulan terakhir; sisanya dibaca lewat tick sumbu,
 * tooltip, atau tampilan tabel.
 */
export function TrenPendapatanChart({ tren }: TrenPendapatanChartProps) {
  const [tampilTabel, setTampilTabel] = useState(false)
  const idTabel = useId()

  const nilaiTertinggi = Math.max(...tren.map((titik) => titik.nominal))
  const { batasAtas, tick } = skalaSumbu(nilaiTertinggi)

  const indeksTertinggi = tren.findIndex((titik) => titik.nominal === nilaiTertinggi)
  const indeksTerakhir = tren.length - 1
  const berlabel = new Set([indeksTertinggi, indeksTerakhir])

  return (
    <Kartu
      judul="Tren pendapatan 12 bulan terakhir"
      keterangan="Total pembayaran masuk per bulan, seluruh aplikasi."
      aksi={
        <button
          type="button"
          onClick={() => setTampilTabel((sebelumnya) => !sebelumnya)}
          className="rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-wash hover:text-ink"
          aria-expanded={tampilTabel}
          aria-controls={idTabel}
        >
          {tampilTabel ? 'Lihat grafik' : 'Lihat tabel'}
        </button>
      }
    >
      {tampilTabel ? (
        <TabelTren id={idTabel} tren={tren} />
      ) : (
        <div className="flex gap-3">
          {/* Tick sumbu Y — tinggi dan offset atasnya harus sama persis
              dengan area plot agar tick sejajar dengan gridline. */}
          <div
            className="relative mt-10 w-16 shrink-0"
            style={{ height: TINGGI_PLOT }}
            aria-hidden="true"
          >
            {tick.map((nilai) => (
              <span
                key={nilai}
                className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink-muted"
                style={{ bottom: `${persenDariBatas(nilai, batasAtas)}%` }}
              >
                {formatRupiahRingkas(nilai)}
              </span>
            ))}
          </div>

          {/* Ruang kepala 40px ada DI DALAM kontainer gulir: `overflow-x-auto`
              ikut memotong sumbu vertikal, jadi tooltip kolom tertinggi harus
              punya tempat di dalamnya, bukan di luar. */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="min-w-[520px] pt-10">
              <div className="relative" style={{ height: TINGGI_PLOT }}>
                {/* Gridline hairline solid, satu langkah dari surface. */}
                {tick.map((nilai, indeks) => (
                  <div
                    key={nilai}
                    className="absolute inset-x-0 h-px"
                    style={{
                      bottom: `${persenDariBatas(nilai, batasAtas)}%`,
                      backgroundColor: indeks === 0 ? 'var(--axis)' : 'var(--grid)',
                    }}
                    aria-hidden="true"
                  />
                ))}

                <ul className="absolute inset-0 flex items-stretch">
                  {tren.map((titik, indeks) => {
                    const persen = persenDariBatas(titik.nominal, batasAtas)
                    return (
                      <li key={titik.periode} className="group relative flex-1">
                        <div className="absolute inset-x-0.5 inset-y-0 rounded-t-[4px] transition-colors group-hover:bg-wash group-focus-within:bg-wash" />

                        <div
                          className="absolute bottom-0 left-1/2 w-full max-w-6 -translate-x-1/2 rounded-t-[4px]"
                          style={{ height: `${persen}%`, backgroundColor: 'var(--series-1)' }}
                        />

                        {berlabel.has(indeks) && (
                          <span
                            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-ink"
                            style={{ bottom: `calc(${persen}% + 6px)` }}
                          >
                            {formatRupiahRingkas(titik.nominal)}
                          </span>
                        )}

                        {/* Target hover/fokus selebar band, bukan selebar kolom. */}
                        <button
                          type="button"
                          className="absolute inset-0 cursor-default rounded-t-[4px]"
                          aria-label={`${labelPeriodeSedang(titik.periode)}: ${formatRupiah(titik.nominal)}`}
                        />

                        <div
                          className="pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs shadow-lg group-hover:block group-focus-within:block"
                          style={{ bottom: `calc(${persen}% + 28px)` }}
                          role="presentation"
                        >
                          <span className="block text-ink-muted">
                            {labelPeriodeSedang(titik.periode)}
                          </span>
                          <span className="block font-semibold tabular-nums text-ink">
                            {formatRupiah(titik.nominal)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <ul className="mt-2 flex items-stretch" aria-hidden="true">
                {tren.map((titik) => (
                  <li
                    key={titik.periode}
                    className="flex-1 text-center text-[11px] text-ink-muted"
                  >
                    {labelPeriodeSingkat(titik.periode)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Kartu>
  )
}

function TabelTren({ id, tren }: { id: string; tren: TitikTrenPendapatan[] }) {
  return (
    <div id={id} className="overflow-x-auto">
      <table className="w-full min-w-[260px] text-sm">
        <caption className="sr-only">
          Pendapatan per bulan selama 12 bulan terakhir
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-ink-secondary">
            <th scope="col" className="py-2 pr-4 font-medium">Periode</th>
            <th scope="col" className="py-2 text-right font-medium">Pendapatan</th>
          </tr>
        </thead>
        <tbody>
          {tren.map((titik) => (
            <tr key={titik.periode} className="border-b border-hairline last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal text-ink">
                {labelPeriodeSedang(titik.periode)}
              </th>
              <td className="py-2 text-right tabular-nums text-ink">
                {formatRupiah(titik.nominal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

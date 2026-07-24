import type { JumlahPerStatus, StatusTenant } from '../../types/dashboard'
import { formatAngka } from '../../lib/format'
import { RUPA_STATUS, URUTAN_STATUS } from '../../lib/statusTenant'
import { Kartu } from '../../components/ui/Kartu'

interface KomposisiStatusTenantProps {
  komposisiStatus: JumlahPerStatus[]
  totalTenant: number
}

/**
 * Sebaran tenant per status sebagai satu batang bertumpuk.
 *
 * Pemisah antar segmen berupa celah 2px berwarna permukaan — bukan garis tepi,
 * supaya tidak ada tinta tambahan yang bukan data. Legenda selalu ada karena
 * seri lebih dari satu, dan setiap angka tertulis di legenda sehingga nilainya
 * tetap terbaca tanpa mengandalkan warna.
 */
export function KomposisiStatusTenant({
  komposisiStatus,
  totalTenant,
}: KomposisiStatusTenantProps) {
  const jumlahPerStatus = new Map<StatusTenant, number>(
    komposisiStatus.map((baris) => [baris.status, baris.jumlah]),
  )
  const terpakai = URUTAN_STATUS.filter((status) => (jumlahPerStatus.get(status) ?? 0) > 0)
  const total = totalTenant > 0 ? totalTenant : 1

  return (
    <Kartu
      judul="Komposisi status tenant"
      keterangan={`${formatAngka(totalTenant)} tenant terdaftar di seluruh aplikasi.`}
    >
      <div className="flex h-3 w-full gap-[2px]" aria-hidden="true">
        {terpakai.map((status) => {
          const jumlah = jumlahPerStatus.get(status) ?? 0
          return (
            <div
              key={status}
              className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{
                width: `${(jumlah / total) * 100}%`,
                minWidth: 6,
                backgroundColor: RUPA_STATUS[status].warna,
              }}
            />
          )
        })}
      </div>

      <ul className="mt-6 space-y-4">
        {URUTAN_STATUS.map((status) => {
          const jumlah = jumlahPerStatus.get(status) ?? 0
          const porsi = (jumlah / total) * 100
          const rupa = RUPA_STATUS[status]
          return (
            <li key={status} className="flex items-start gap-3">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: rupa.warna }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="text-sm font-medium text-ink">{rupa.label}</p>
                  <p className="text-sm tabular-nums text-ink">
                    {formatAngka(jumlah)} tenant
                    <span className="ml-2 text-ink-muted">
                      {porsi.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                    </span>
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{rupa.keterangan}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Kartu>
  )
}

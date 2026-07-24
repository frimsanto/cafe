import type { TenantAplikasi } from '../../types/dashboard'
import { formatAngka } from '../../lib/format'
import { Kartu } from '../../components/ui/Kartu'

interface TenantPerAplikasiProps {
  perAplikasi: TenantAplikasi[]
}

/**
 * Berapa banyak tenant tiap aplikasi, dan berapa yang benar-benar aktif.
 *
 * Bentuknya meter: isi memakai warna seri, dan jalur kosongnya memakai langkah
 * yang lebih terang dari ramp yang sama, sehingga rasio aktif terhadap total
 * terbaca di sepanjang batang.
 */
export function TenantPerAplikasi({ perAplikasi }: TenantPerAplikasiProps) {
  const urut = [...perAplikasi].sort((a, b) => b.jumlahTenant - a.jumlahTenant)

  return (
    <Kartu
      judul="Tenant per aplikasi"
      keterangan="Porsi tenant aktif dibanding seluruh tenant terdaftar."
    >
      <ul className="space-y-5">
        {urut.map((app) => {
          const rasio = app.jumlahTenant > 0 ? app.jumlahTenantAktif / app.jumlahTenant : 0
          return (
            <li key={app.appId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-ink">{app.nama}</p>
                <p className="text-sm tabular-nums text-ink">
                  {formatAngka(app.jumlahTenantAktif)}
                  <span className="text-ink-muted">
                    {' '}
                    dari {formatAngka(app.jumlahTenant)} aktif
                  </span>
                </p>
              </div>

              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-[4px]"
                style={{ backgroundColor: 'var(--series-soft)' }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${rasio * 100}%`,
                    backgroundColor: 'var(--series-1)',
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Kartu>
  )
}

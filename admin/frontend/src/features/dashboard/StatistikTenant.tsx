import type { StatistikTenant as DataTenant } from '../../types/dashboard'
import { formatAngka, formatPeriode, hitungPerubahan } from '../../lib/format'
import { StatTile } from './StatTile'
import { KomposisiStatusTenant } from './KomposisiStatusTenant'
import { TenantPerAplikasi } from './TenantPerAplikasi'

interface StatistikTenantProps {
  data: DataTenant
}

export function StatistikTenant({ data }: StatistikTenantProps) {
  const perubahanTenantBaru = hitungPerubahan(
    data.tenantBaruBulanIni,
    data.tenantBaruBulanLalu,
  )
  const porsiAktif =
    data.totalTenant > 0 ? (data.tenantAktif / data.totalTenant) * 100 : 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Statistik tenant</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Kondisi tenant di seluruh aplikasi per {formatPeriode(data.periodeBerjalan)}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Tenant aktif"
          nilai={`${formatAngka(data.tenantAktif)} tenant`}
          keterangan={`${porsiAktif.toLocaleString('id-ID', {
            maximumFractionDigits: 1,
          })}% dari seluruh tenant`}
        />
        <StatTile
          label="Tenant baru bulan ini"
          nilai={`${formatAngka(data.tenantBaruBulanIni)} tenant`}
          delta={perubahanTenantBaru}
          deltaPembanding="bulan lalu"
          keterangan={formatPeriode(data.periodeBerjalan)}
        />
        <StatTile
          label="Total tenant terdaftar"
          nilai={`${formatAngka(data.totalTenant)} tenant`}
          keterangan={`tersebar di ${formatAngka(data.perAplikasi.length)} aplikasi`}
        />
      </div>

      <div className="grid gap-6 pt-2 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <KomposisiStatusTenant
            komposisiStatus={data.komposisiStatus}
            totalTenant={data.totalTenant}
          />
        </div>
        <div className="min-w-0 self-start">
          <TenantPerAplikasi perAplikasi={data.perAplikasi} />
        </div>
      </div>
    </section>
  )
}

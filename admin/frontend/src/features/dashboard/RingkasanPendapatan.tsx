import type { RingkasanPendapatan as DataRingkasan } from '../../types/dashboard'
import {
  formatAngka,
  formatPeriode,
  formatRupiah,
  hitungPerubahan,
} from '../../lib/format'
import { StatTile } from './StatTile'
import { TrenPendapatanChart } from './TrenPendapatanChart'
import { PendapatanPerAplikasi } from './PendapatanPerAplikasi'

interface RingkasanPendapatanProps {
  data: DataRingkasan
}

export function RingkasanPendapatan({ data }: RingkasanPendapatanProps) {
  const perubahanBulanan = hitungPerubahan(
    data.pendapatanBulanIni,
    data.pendapatanBulanLalu,
  )
  const rataRataPerTenant =
    data.jumlahTenantAktif > 0
      ? Math.round(data.pendapatanBulanIni / data.jumlahTenantAktif)
      : 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Ringkasan pendapatan</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Uang masuk dari seluruh aplikasi yang dikelola platform.
        </p>
      </div>

      {/* Angka utama halaman — satu-satunya angka sebesar ini. */}
      <div className="rounded-xl border border-hairline bg-surface p-6 sm:p-8">
        <h3 className="text-sm text-ink-secondary">Total pendapatan platform</h3>
        <p className="mt-2 text-[2.5rem] font-semibold leading-tight text-ink sm:text-5xl">
          {formatRupiah(data.totalPendapatan)}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Akumulasi seluruh pembayaran yang sudah dikonfirmasi, dari semua aplikasi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label={`Pendapatan ${formatPeriode(data.periodeBerjalan)}`}
          nilai={formatRupiah(data.pendapatanBulanIni)}
          delta={perubahanBulanan}
          deltaPembanding="bulan lalu"
          keterangan="bulan berjalan"
        />
        <StatTile
          label="Pembayaran dikonfirmasi"
          nilai={`${formatAngka(data.jumlahPembayaranBulanIni)} pembayaran`}
          keterangan={`selama ${formatPeriode(data.periodeBerjalan)}`}
        />
        <StatTile
          label="Rata-rata per tenant aktif"
          nilai={formatRupiah(rataRataPerTenant)}
          keterangan={`dari ${formatAngka(data.jumlahTenantAktif)} tenant aktif`}
        />
      </div>

      {/* `min-w-0` wajib: grid item default `min-width: auto`, sehingga tanpa
          ini kontainer gulir grafik ikut melebar dan halaman bocor ke samping
          di layar sempit. */}
      <div className="grid gap-6 pt-2 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <TrenPendapatanChart tren={data.tren} />
        </div>
        <div className="min-w-0 self-start">
          <PendapatanPerAplikasi
            perAplikasi={data.perAplikasi}
            periodeBerjalan={data.periodeBerjalan}
          />
        </div>
      </div>
    </section>
  )
}

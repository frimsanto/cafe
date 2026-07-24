import type { RingkasanAplikasi } from '../../types/dashboard'
import { formatAngka, formatTanggal } from '../../lib/format'
import { IkonCekLingkaran, IkonJedaLingkaran } from '../../components/ui/ikon'

interface StatusAplikasiProps {
  data: RingkasanAplikasi
}

/**
 * Daftar aplikasi SaaS yang dikelola platform beserta kondisinya.
 *
 * Bentuknya daftar, bukan grafik: yang dicari super admin di sini adalah
 * identitas dan keadaan tiap aplikasi, bukan perbandingan besaran.
 *
 * Warna hanya menempel pada ikon, tidak pada teksnya — status "aktif" memakai
 * hijau status yang kontrasnya di bawah ambang teks pada permukaan terang,
 * jadi arti statusnya dibawa label tertulis dan ikon, bukan warna.
 */
export function StatusAplikasi({ data }: StatusAplikasiProps) {
  const urut = [...data.daftar].sort((a, b) => {
    if (a.aktif !== b.aktif) return a.aktif ? -1 : 1
    return b.jumlahTenantAktif - a.jumlahTenantAktif
  })

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Status aplikasi</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {formatAngka(data.aplikasiBerjalan)} dari {formatAngka(data.totalAplikasi)}{' '}
          aplikasi sedang berjalan.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {urut.map((app) => {
          const Ikon = app.aktif ? IkonCekLingkaran : IkonJedaLingkaran
          return (
            <li
              key={app.appId}
              className="min-w-0 rounded-xl border border-hairline bg-surface p-5"
            >
              <div className="flex items-start gap-3">
                <Ikon
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{
                    color: app.aktif ? 'var(--status-good)' : 'var(--text-muted)',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-ink">{app.nama}</p>
                    <p className="text-xs font-medium text-ink-secondary">
                      {app.aktif ? 'Aktif' : 'Nonaktif'}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-muted" title={app.domain}>
                    {app.domain}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-hairline pt-4 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Tenant aktif</dt>
                  <dd className="tabular-nums text-ink">
                    {formatAngka(app.jumlahTenantAktif)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-muted">Terdaftar</dt>
                  <dd className="text-right text-ink">{formatTanggal(app.tanggalRilis)}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type {
  RingkasanAplikasi as DataAplikasi,
  RingkasanPendapatan as DataRingkasan,
  StatistikTenant as DataTenant,
} from '../../types/dashboard'
import {
  ambilRingkasanAplikasi,
  ambilRingkasanPendapatan,
  ambilStatistikTenant,
} from '../../services/dashboardService'
import { RingkasanPendapatan } from './RingkasanPendapatan'
import { StatistikTenant } from './StatistikTenant'
import { StatusAplikasi } from './StatusAplikasi'

type Status = 'memuat' | 'siap' | 'gagal'

interface DataDashboard {
  pendapatan: DataRingkasan
  tenant: DataTenant
  aplikasi: DataAplikasi
}

export function DashboardPage() {
  const [data, setData] = useState<DataDashboard | null>(null)
  const [status, setStatus] = useState<Status>('memuat')

  const muat = useCallback(async () => {
    setStatus('memuat')
    try {
      const [pendapatan, tenant, aplikasi] = await Promise.all([
        ambilRingkasanPendapatan(),
        ambilStatistikTenant(),
        ambilRingkasanAplikasi(),
      ])
      setData({ pendapatan, tenant, aplikasi })
      setStatus('siap')
    } catch {
      setStatus('gagal')
    }
  }, [])

  useEffect(() => {
    void muat()
  }, [muat])

  if (status === 'gagal') {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6">
        <p className="text-sm font-medium text-ink">Data dashboard gagal dimuat.</p>
        <p className="mt-1 text-sm text-ink-secondary">
          Periksa koneksi ke server, lalu coba lagi.
        </p>
        <button
          type="button"
          onClick={() => void muat()}
          className="mt-4 rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink hover:bg-wash"
        >
          Muat ulang
        </button>
      </div>
    )
  }

  // Saat memuat ulang, tahan tampilan sebelumnya dengan opasitas rendah supaya
  // tata letak tidak melompat. Kerangka hanya muncul pada pemuatan pertama.
  if (status === 'memuat' && !data) return <KerangkaDashboard />

  return (
    <div
      className={`space-y-10 ${status === 'memuat' ? 'opacity-60 transition-opacity' : ''}`}
    >
      {data && (
        <>
          <RingkasanPendapatan data={data.pendapatan} />
          <StatistikTenant data={data.tenant} />
          <StatusAplikasi data={data.aplikasi} />
        </>
      )}
    </div>
  )
}

function KerangkaDashboard() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat data dashboard">
      <div className="h-36 animate-pulse rounded-xl border border-hairline bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((indeks) => (
          <div
            key={indeks}
            className="h-28 animate-pulse rounded-xl border border-hairline bg-surface"
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="h-80 animate-pulse rounded-xl border border-hairline bg-surface xl:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl border border-hairline bg-surface" />
      </div>
    </div>
  )
}

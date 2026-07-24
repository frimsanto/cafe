import type { ReactNode } from 'react'

interface KartuProps {
  judul?: string
  keterangan?: string
  /** Kontrol kecil di kanan judul, mis. tombol "Lihat tabel". */
  aksi?: ReactNode
  children: ReactNode
  className?: string
}

/** Permukaan dasar semua panel: hairline ring, sudut lembut, tanpa bayangan berat. */
export function Kartu({ judul, keterangan, aksi, children, className = '' }: KartuProps) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface p-5 sm:p-6 ${className}`}
    >
      {(judul || aksi) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {judul && <h3 className="text-base font-semibold text-ink">{judul}</h3>}
            {keterangan && (
              <p className="mt-1 text-sm text-ink-secondary">{keterangan}</p>
            )}
          </div>
          {aksi && <div className="shrink-0">{aksi}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

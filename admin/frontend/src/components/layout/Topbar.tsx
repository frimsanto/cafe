import { useTema } from '../../hooks/useTema'
import { IkonBulan, IkonMatahari, IkonMenu } from '../ui/ikon'

interface TopbarProps {
  judul: string
  onBukaMenu: () => void
}

export function Topbar({ judul, onBukaMenu }: TopbarProps) {
  const { tema, gantiTema } = useTema()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hairline bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onBukaMenu}
        className="-ml-1 rounded-md p-1.5 text-ink-secondary hover:bg-wash lg:hidden"
        aria-label="Buka menu"
      >
        <IkonMenu className="h-5 w-5" />
      </button>

      <h1 className="truncate text-sm font-semibold text-ink sm:text-base">{judul}</h1>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={gantiTema}
          className="rounded-md p-2 text-ink-secondary hover:bg-wash hover:text-ink"
          aria-label={tema === 'gelap' ? 'Ganti ke tampilan terang' : 'Ganti ke tampilan gelap'}
          title={tema === 'gelap' ? 'Tampilan terang' : 'Tampilan gelap'}
        >
          {tema === 'gelap' ? (
            <IkonMatahari className="h-5 w-5" />
          ) : (
            <IkonBulan className="h-5 w-5" />
          )}
        </button>

        <div className="flex items-center gap-2 border-l border-hairline pl-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-wash text-xs font-semibold text-ink"
            aria-hidden="true"
          >
            FR
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-ink">Frim</p>
            <p className="text-xs text-ink-muted">Pemilik Platform</p>
          </div>
        </div>
      </div>
    </header>
  )
}

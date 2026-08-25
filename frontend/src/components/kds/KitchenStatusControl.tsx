import type { KitchenStatus } from '../../types/order';
import { KITCHEN_STATUS_META } from '../../lib/kitchenStatus';

interface KitchenStatusControlProps {
  value: KitchenStatus;
  onChange: (status: KitchenStatus) => void;
}

const MODES: KitchenStatus[] = ['WAITING', 'COOKING', 'READY'];

// Kelas tombol saat mode aktif (kontras tinggi di layar dapur).
const ACTIVE_CLASS: Record<KitchenStatus, string> = {
  WAITING: 'bg-amber-400 text-slate-900',
  COOKING: 'bg-sky-400 text-slate-900',
  READY: 'bg-emerald-400 text-slate-900',
};

// Ikon per mode — dikenali sekejap tanpa perlu membaca labelnya.
const STATUS_ICON: Record<KitchenStatus, string> = {
  WAITING: '⏳',
  COOKING: '🔥',
  READY: '✅',
};

/**
 * Kontrol segmen tiga mode status masak per item: Menunggu · Dimasak · Siap.
 * Chef menekan mode untuk mengubah status item. Target sentuh jumbo (72px)
 * supaya tetap gampang dipencet dengan tangan basah atau kotor.
 */
export default function KitchenStatusControl({
  value,
  onChange,
}: KitchenStatusControlProps) {
  return (
    <div
      role="group"
      aria-label="Ubah status masak"
      className="grid select-none grid-cols-3 gap-2 rounded-2xl bg-slate-900/60 p-2"
    >
      {MODES.map((mode) => {
        const active = mode === value;
        const meta = KITCHEN_STATUS_META[mode];
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-base font-black transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              active
                ? `${ACTIVE_CLASS[mode]} scale-[1.02] shadow-lg`
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span aria-hidden className="text-2xl leading-none">
              {STATUS_ICON[mode]}
            </span>
            <span className="text-sm">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

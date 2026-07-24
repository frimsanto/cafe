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

/**
 * Kontrol segmen tiga mode status masak per item: Menunggu · Dimasak · Siap.
 * Chef menekan mode untuk mengubah status item. Ramah sentuh (target besar).
 */
export default function KitchenStatusControl({
  value,
  onChange,
}: KitchenStatusControlProps) {
  return (
    <div
      role="group"
      aria-label="Ubah status masak"
      className="grid select-none grid-cols-3 gap-1.5 rounded-xl bg-slate-900/60 p-1.5"
    >
      {MODES.map((mode) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`flex min-h-[52px] items-center justify-center rounded-lg px-1 text-base font-extrabold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              active
                ? `${ACTIVE_CLASS[mode]} shadow-md`
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {KITCHEN_STATUS_META[mode].label}
          </button>
        );
      })}
    </div>
  );
}

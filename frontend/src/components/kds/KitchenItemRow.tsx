import type { KitchenStatus, OrderItem } from '../../types/order';
import { KITCHEN_STATUS_META } from '../../lib/kitchenStatus';
import KitchenStatusControl from './KitchenStatusControl';

interface KitchenItemRowProps {
  item: OrderItem;
  onStatusChange: (status: KitchenStatus) => void;
}

/**
 * Satu baris item pada tiket dapur: jumlah, nama, catatan, dan kontrol status
 * masak tiga mode (Menunggu · Dimasak · Siap). Item yang sudah "Siap" ditandai
 * coret agar mudah dipindai chef.
 */
export default function KitchenItemRow({ item, onStatusChange }: KitchenItemRowProps) {
  const meta = KITCHEN_STATUS_META[item.kitchenStatus];
  const done = item.kitchenStatus === 'READY';

  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-2 h-4 w-4 shrink-0 rounded-full ${meta.accentClass}`} aria-hidden />
        <span className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-slate-700 px-2 text-2xl font-black tabular-nums text-white">
          {item.quantity}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-2xl font-bold leading-tight ${
              done ? 'text-slate-500 line-through' : 'text-white'
            }`}
          >
            {item.name}
          </p>
          {item.notes && (
            <p className="mt-2 rounded-lg bg-amber-500/20 px-3 py-1.5 text-base font-bold text-amber-300 ring-1 ring-amber-500/30">
              📝 {item.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <KitchenStatusControl value={item.kitchenStatus} onChange={onStatusChange} />
      </div>
    </li>
  );
}

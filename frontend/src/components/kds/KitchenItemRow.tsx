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
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${meta.accentClass}`} aria-hidden />
        <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-slate-700 px-2 text-xl font-extrabold tabular-nums text-white">
          {item.quantity}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xl font-bold leading-tight ${
              done ? 'text-slate-500 line-through' : 'text-white'
            }`}
          >
            {item.name}
          </p>
          {item.notes && (
            <p className="mt-1 text-base font-semibold text-amber-300">📝 {item.notes}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5">
        <KitchenStatusControl value={item.kitchenStatus} onChange={onStatusChange} />
      </div>
    </li>
  );
}

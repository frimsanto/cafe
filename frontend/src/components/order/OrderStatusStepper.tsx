import type { OrderStatus } from '../../types/order';

interface OrderStatusStepperProps {
  status: OrderStatus;
}

const STEPS: { key: OrderStatus; label: string; icon: string }[] = [
  { key: 'MENUNGGU_PEMBAYARAN', label: 'Dibayar', icon: '💳' },
  { key: 'DIPROSES_DAPUR', label: 'Diproses Dapur', icon: '🍳' },
  { key: 'SELESAI', label: 'Siap Diantar', icon: '🔔' },
];

// Urutan progres status untuk menentukan langkah aktif/selesai.
const ORDER: OrderStatus[] = ['MENUNGGU_PEMBAYARAN', 'DIPROSES_DAPUR', 'SELESAI'];

/**
 * Indikator progres pesanan: Dibayar → Diproses Dapur → Siap Diantar.
 * Langkah "Siap Diantar" nantinya dipicu realtime dari KDS (fase berikutnya).
 */
export default function OrderStatusStepper({ status }: OrderStatusStepperProps) {
  const currentIndex = ORDER.indexOf(status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const reached = done || active;

        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition ${
                  reached
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-400'
                } ${active ? 'ring-4 ring-brand-100' : ''}`}
              >
                {done ? '✓' : step.icon}
              </div>
              <span
                className={`mt-1.5 w-16 text-center text-[11px] font-medium leading-tight ${
                  reached ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`mx-1 mb-5 h-0.5 flex-1 rounded ${
                  index < currentIndex ? 'bg-brand-600' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

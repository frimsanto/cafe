import type { PaymentMethodOption as PaymentMethod } from '../../data/paymentMethods';

interface PaymentMethodOptionProps {
  method: PaymentMethod;
  selected: boolean;
  onSelect: () => void;
}

/** Baris pilihan metode pembayaran (radio) pada halaman checkout. */
export default function PaymentMethodOption({
  method,
  selected,
  onSelect,
}: PaymentMethodOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3.5 text-left transition ${
        selected
          ? 'border-brand-500 ring-2 ring-brand-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
        {method.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{method.name}</span>
        <span className="block truncate text-sm text-slate-500">
          {method.description}
        </span>
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

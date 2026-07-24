import type { PaymentMethodCode } from '../../types/order';
import { cashierPaymentMethods } from '../../data/paymentMethods';

interface PaymentMethodPickerProps {
  value: PaymentMethodCode | null;
  onChange: (method: PaymentMethodCode) => void;
}

/**
 * Pilihan metode pembayaran di kasir (tunai / EDC).
 *
 * Memakai radio sungguhan di dalam `<label>` supaya bisa dipilih lewat keyboard
 * dan terbaca pembaca layar, dengan tampilan kartu besar yang enak disentuh.
 */
export default function PaymentMethodPicker({
  value,
  onChange,
}: PaymentMethodPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">
        Metode pembayaran
      </legend>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cashierPaymentMethods.map((method) => {
          const selected = value === method.code;

          return (
            <label
              key={method.code}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 transition ${
                selected
                  ? 'ring-2 ring-brand-500'
                  : 'ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="metode-kasir"
                value={method.code}
                checked={selected}
                onChange={() => onChange(method.code)}
                className="h-4 w-4 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xl">{method.icon}</span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800">
                  {method.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {method.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

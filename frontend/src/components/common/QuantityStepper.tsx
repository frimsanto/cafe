interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  /** 'sm' untuk kartu menu, 'md' untuk halaman keranjang. */
  size?: 'sm' | 'md';
}

/**
 * Kontrol jumlah (−  n  +) yang dipakai ulang di kartu menu dan halaman
 * keranjang.
 */
export default function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  size = 'sm',
}: QuantityStepperProps) {
  const btn =
    size === 'sm'
      ? 'h-8 w-8 text-lg'
      : 'h-10 w-10 text-xl';
  const width = size === 'sm' ? 'w-6' : 'w-8';

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 p-1 ring-1 ring-brand-200">
      <button
        type="button"
        onClick={onDecrement}
        aria-label="Kurangi"
        className={`flex ${btn} items-center justify-center rounded-full bg-white font-bold text-brand-700 shadow-sm transition active:scale-90`}
      >
        −
      </button>
      <span className={`text-center ${width} font-semibold tabular-nums text-slate-800`}>
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label="Tambah"
        className={`flex ${btn} items-center justify-center rounded-full bg-brand-600 font-bold text-white shadow-sm transition active:scale-90 hover:bg-brand-700`}
      >
        +
      </button>
    </div>
  );
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { MenuItem } from '../types/menu';
import type { CartLine } from '../types/cart';

// ── State & actions ─────────────────────────────────────────────────────────

interface CartState {
  lines: CartLine[];
}

type CartAction =
  | { type: 'ADD'; item: MenuItem }
  | { type: 'INCREMENT'; itemId: string }
  | { type: 'DECREMENT'; itemId: string }
  | { type: 'SET_QUANTITY'; itemId: string; quantity: number }
  | { type: 'SET_NOTES'; itemId: string; notes: string }
  | { type: 'REMOVE'; itemId: string }
  | { type: 'CLEAR' };

const STORAGE_KEY = 'cafeos-cart';

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD': {
      const existing = state.lines.find((l) => l.item.id === action.item.id);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.item.id === action.item.id ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }
      return { lines: [...state.lines, { item: action.item, quantity: 1, notes: '' }] };
    }
    case 'INCREMENT':
      return {
        lines: state.lines.map((l) =>
          l.item.id === action.itemId ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      };
    case 'DECREMENT':
      return {
        // Kurangi jumlah; kalau mencapai 0, baris dihapus dari keranjang.
        lines: state.lines
          .map((l) =>
            l.item.id === action.itemId ? { ...l, quantity: l.quantity - 1 } : l,
          )
          .filter((l) => l.quantity > 0),
      };
    case 'SET_QUANTITY':
      return {
        lines: state.lines
          .map((l) =>
            l.item.id === action.itemId
              ? { ...l, quantity: Math.max(0, Math.floor(action.quantity)) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      };
    case 'SET_NOTES':
      return {
        lines: state.lines.map((l) =>
          l.item.id === action.itemId ? { ...l, notes: action.notes } : l,
        ),
      };
    case 'REMOVE':
      return { lines: state.lines.filter((l) => l.item.id !== action.itemId) };
    case 'CLEAR':
      return { lines: [] };
    default:
      return state;
  }
}

function init(): CartState {
  // Muat keranjang dari sessionStorage supaya tidak hilang saat refresh /
  // berpindah antara halaman menu dan keranjang.
  if (typeof window === 'undefined') return { lines: [] };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { lines: JSON.parse(raw) as CartLine[] };
  } catch {
    /* abaikan storage yang korup */
  }
  return { lines: [] };
}

// ── Context ─────────────────────────────────────────────────────────────────

interface CartContextValue {
  lines: CartLine[];
  totalItems: number;
  totalAmount: number;
  getQuantity: (itemId: string) => number;
  addItem: (item: MenuItem) => void;
  increment: (itemId: string) => void;
  decrement: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  setNotes: (itemId: string, notes: string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      /* storage penuh / tidak tersedia — abaikan */
    }
  }, [state.lines]);

  const value = useMemo<CartContextValue>(() => {
    const totalItems = state.lines.reduce((sum, l) => sum + l.quantity, 0);
    const totalAmount = state.lines.reduce(
      (sum, l) => sum + l.quantity * l.item.price,
      0,
    );
    return {
      lines: state.lines,
      totalItems,
      totalAmount,
      getQuantity: (itemId) =>
        state.lines.find((l) => l.item.id === itemId)?.quantity ?? 0,
      addItem: (item) => dispatch({ type: 'ADD', item }),
      increment: (itemId) => dispatch({ type: 'INCREMENT', itemId }),
      decrement: (itemId) => dispatch({ type: 'DECREMENT', itemId }),
      setQuantity: (itemId, quantity) =>
        dispatch({ type: 'SET_QUANTITY', itemId, quantity }),
      setNotes: (itemId, notes) => dispatch({ type: 'SET_NOTES', itemId, notes }),
      removeItem: (itemId) => dispatch({ type: 'REMOVE', itemId }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
    };
  }, [state.lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart harus dipakai di dalam <CartProvider>');
  return ctx;
}

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Bersihkan DOM setelah tiap uji supaya satu berkas tidak meninggalkan
// komponen yang masih terpasang untuk uji berikutnya.
afterEach(cleanup);

/**
 * jsdom tidak menyediakan Clipboard API. `CopyField` memakainya, dan tanpa
 * boneka ini uji apa pun yang menyentuh tombol salin akan gagal karena
 * `navigator.clipboard` tidak ada — bukan karena kodenya salah.
 */
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: vi.fn(async () => undefined) },
});

/** `matchMedia` dipakai beberapa komponen layout; jsdom belum punya. */
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

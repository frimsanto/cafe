interface MockQrCodeProps {
  /** Seed agar pola QR konsisten untuk transaksi yang sama. */
  seed: string;
  size?: number;
}

// Pseudo-random deterministik (mulberry32) — supaya pola QR sama tiap render
// untuk seed yang sama, tanpa perlu library QR sungguhan (fase frontend).
function makeRng(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i += 1) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * QR code tiruan (dekoratif) untuk simulasi pembayaran QRIS. BUKAN QR yang bisa
 * di-scan sungguhan — hanya visual. Fase backend akan mengganti dengan QR asli
 * dari payment gateway.
 */
export default function MockQrCode({ seed, size = 200 }: MockQrCodeProps) {
  const cells = 21; // ukuran grid ala QR
  const rng = makeRng(seed);
  const cell = size / cells;

  const isFinder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) =>
      r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    return inBox(0, 0) || inBox(0, cells - 7) || inBox(cells - 7, 0);
  };

  const finderFilled = (r: number, c: number) => {
    const rel = (r0: number, c0: number) => {
      const rr = r - r0;
      const cc = c - c0;
      const border = rr === 0 || rr === 6 || cc === 0 || cc === 6;
      const center = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
      return border || center;
    };
    if (r < 7 && c < 7) return rel(0, 0);
    if (r < 7 && c >= cells - 7) return rel(0, cells - 7);
    if (r >= cells - 7 && c < 7) return rel(cells - 7, 0);
    return false;
  };

  const rects: JSX.Element[] = [];
  for (let r = 0; r < cells; r += 1) {
    for (let c = 0; c < cells; c += 1) {
      const filled = isFinder(r, c) ? finderFilled(r, c) : rng() > 0.5;
      if (filled) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c * cell}
            y={r * cell}
            width={cell}
            height={cell}
            fill="#0f172a"
          />,
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR pembayaran (simulasi)"
      className="rounded-lg bg-white"
    >
      <rect width={size} height={size} fill="white" />
      {rects}
    </svg>
  );
}

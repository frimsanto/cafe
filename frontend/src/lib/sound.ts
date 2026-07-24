// Bunyi notifikasi "ting!" untuk pesanan baru di KDS — dibuat via Web Audio API
// tanpa berkas audio eksternal. Browser memblokir audio sebelum ada interaksi
// pengguna; semua dibungkus try/catch agar aman.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Rangkai deret nada singkat mulai `ctx.currentTime`. */
function playSequence(freqs: number[], step = 0.16): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const start0 = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = start0 + i * step;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    /* audio tidak tersedia — abaikan */
  }
}

/** "ting-ting" — tanda pesanan baru masuk ke dapur. */
export function playChime(): void {
  playSequence([880, 1174.7]); // A5 → D6
}

/** "ting-ting-ting" menaik — tanda pesanan siap diantar. */
export function playReadyChime(): void {
  playSequence([659.3, 880, 1318.5], 0.13); // E5 → A5 → E6
}

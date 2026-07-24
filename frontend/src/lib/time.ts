/** Jam masuk pesanan, mis. "14:32". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Selisih menit (dibulatkan ke bawah) antara `now` dan `iso`. Minimal 0. */
export function elapsedMinutes(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

/** Label singkat lama pesanan, mis. "baru", "3 mnt", "1 jam 5 mnt". */
export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const mins = elapsedMinutes(iso, now);
  if (mins < 1) return 'baru';
  if (mins < 60) return `${mins} mnt`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}

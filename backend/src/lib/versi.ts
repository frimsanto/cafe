import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Versi artefak yang sedang berjalan.
 *
 * Dibaca dari `VERSION.json` yang ditulis `scripts/tulis-penanda-versi.mjs` ke
 * dalam `dist` saat build, lalu distempel waktu penggelarannya saat deploy.
 *
 * ── Kenapa dibaca dari berkas, bukan ditanam saat kompilasi ──
 *
 * Penggelaran memindahkan folder `dist`, dan penanda ini ikut di dalamnya. Jadi
 * yang dilaporkan `/health` SELALU milik artefak yang benar-benar dijalankan —
 * bukan milik worktree seseorang, bukan milik tag yang mungkin sudah bergeser.
 * Kalau `dist` di-rollback ke cadangan lama, penandanya ikut mundur dengan
 * sendirinya, dan itu justru yang ingin diketahui saat sedang menelusuri
 * masalah.
 */
export interface PenandaVersi {
  commit: string;
  commitPendek: string;
  branch: string;
  worktreeKotor: boolean;
  dibangunPada: string;
  digelarPada: string | null;
}

/**
 * Penanda dibaca SEKALI saat modul dimuat.
 *
 * Isinya tidak berubah selama proses hidup — folder `dist` yang ditukar
 * menuntut restart PM2 untuk berlaku, dan restart itulah yang memuat ulang
 * berkas ini. Membacanya setiap permintaan hanya menambah I/O pada endpoint
 * yang justru dipanggil paling sering.
 */
function baca(): PenandaVersi | null {
  // `__dirname` di `dist/lib`, penandanya di akar `dist`.
  const berkas = path.join(__dirname, '..', 'VERSION.json');
  try {
    return JSON.parse(readFileSync(berkas, 'utf8')) as PenandaVersi;
  } catch {
    // Berjalan dari sumber (`tsx watch`) atau build lama tanpa penanda. Bukan
    // galat: yang hilang hanya keterangan, bukan kemampuan melayani.
    return null;
  }
}

const penanda = baca();

/** Ringkasan versi untuk `/health`; null bila artefaknya tanpa penanda. */
export function versiArtefak(): PenandaVersi | null {
  return penanda;
}

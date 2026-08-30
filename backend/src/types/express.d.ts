import type { CashierDevice } from '@prisma/client';
import type { AuthPayload } from './auth';
import type { AuthUserDTO } from '../dto/auth.dto';
import type { SesiKasirPayload } from '../lib/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Klaim token (diisi `requireAuth`) — murni dari JWT, tanpa query DB. */
      auth?: AuthPayload;
      /** Data pengguna dari database (diisi `attachUser`). */
      user?: AuthUserDTO;

      // ── Jalur perangkat POS (lihat `middleware/perangkat.ts`) ──────────────
      //
      // Sengaja TERPISAH dari `auth`/`user` di atas, bukan menumpang keduanya.
      // Sesi kasir lahir dari PIN di terminal bersama, bukan dari login
      // email/sandi, dan cakupannya jauh lebih sempit. Menyatukannya ke `auth`
      // akan membuat setiap `requireRole` yang sudah ada diam-diam menerima
      // sesi POS juga — termasuk pada endpoint pemilik yang tidak pernah
      // dimaksudkan untuk dibuka dari layar kasir.

      /** Terminal terverifikasi (diisi `requirePerangkat`). */
      perangkat?: CashierDevice;
      /** Sesi kasir terverifikasi (diisi `requireSesiKasir`). */
      sesiKasir?: SesiKasirPayload;
    }
  }
}

export {};

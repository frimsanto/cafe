import type { AuthPayload } from './auth';
import type { AuthUserDTO } from '../dto/auth.dto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Klaim token (diisi `requireAuth`) — murni dari JWT, tanpa query DB. */
      auth?: AuthPayload;
      /** Data pengguna dari database (diisi `attachUser`). */
      user?: AuthUserDTO;
    }
  }
}

export {};

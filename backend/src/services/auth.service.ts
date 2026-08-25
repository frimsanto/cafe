import type { Cafe, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { hashPassword, verifyPassword } from '../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import {
  toAuthUserDTO,
  type AuthRefreshDTO,
  type AuthSessionDTO,
} from '../dto/auth.dto';
import type { LoginInput } from '../validation/auth.validation';

// Hash "boneka" untuk menyamakan waktu proses saat email tidak ditemukan,
// sehingga penyerang tidak bisa menebak email terdaftar dari selisih waktu.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('cafeos-dummy-password');
  return dummyHashPromise;
}

/**
 * Susun sesi lengkap (token akses + refresh + profil) dari pengguna database.
 */
function buildSession(user: User, cafe: Pick<Cafe, 'name'>): AuthSessionDTO {
  const claims = { userId: user.id, cafeId: user.cafeId, role: user.role };
  return {
    token: signAccessToken(claims),
    refreshToken: signRefreshToken(claims),
    user: toAuthUserDTO(user, cafe),
  };
}

// CATATAN: `authService.register` sudah DIHAPUS. Kafe + akun OWNER tidak lagi
// boleh lahir dari permintaan publik; pendaftaran hanya menitipkan baris ke
// `tenant_registrations` (lihat `pendaftaran.service.ts`) dan admin yang
// membuat akunnya setelah menyetujui. Jangan hidupkan kembali fungsi seperti
// itu di sini — itu akan membuka lagi jalur "daftar langsung aktif".
export const authService = {
  /**
   * Masuk dengan email & kata sandi, menghasilkan JWT berisi `userId`,
   * `cafeId`, dan `role` — dipakai middleware untuk otorisasi & isolasi tenant.
   *
   * Email tidak ditemukan dan kata sandi salah dijawab dengan pesan yang SAMA
   * agar tidak membocorkan email mana yang terdaftar.
   */
  async login(input: LoginInput): Promise<AuthSessionDTO> {
    const user = await prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
      include: { cafe: { select: { name: true } } },
    });

    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await verifyPassword(input.password, hash);

    if (!user || !passwordOk) {
      throw new ApiError(401, 'Email atau kata sandi salah');
    }

    return buildSession(user, user.cafe);
  },

  /**
   * Tukar refresh token dengan token akses baru.
   *
   * Refresh token bersifat stateless, jadi klaimnya bisa basi — pengguna sudah
   * dihapus, dipindah kafe, atau perannya diubah setelah token terbit. Karena
   * itu peran & kafe diambil ULANG dari database, bukan disalin dari token:
   * pengguna yang perannya diturunkan langsung menerima token akses berperan
   * baru, dan pengguna yang sudah dihapus tidak bisa memperpanjang sesinya.
   */
  async refresh(refreshToken: string): Promise<AuthRefreshDTO> {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new ApiError(401, 'Sesi sudah berakhir, silakan masuk kembali');
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null },
      include: { cafe: { select: { name: true } } },
    });
    if (!user) {
      throw new ApiError(401, 'Sesi tidak berlaku lagi, silakan masuk kembali');
    }

    const token = signAccessToken({
      userId: user.id,
      cafeId: user.cafeId,
      role: user.role,
    });

    return { token, user: toAuthUserDTO(user, user.cafe) };
  },
};

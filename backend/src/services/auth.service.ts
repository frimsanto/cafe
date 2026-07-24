import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { hashPassword, verifyPassword } from '../lib/password';
import { signAccessToken } from '../lib/jwt';
import { toAuthUserDTO, type AuthSessionDTO } from '../dto/auth.dto';
import type { LoginInput, RegisterInput } from '../validation/auth.validation';

// Hash "boneka" untuk menyamakan waktu proses saat email tidak ditemukan,
// sehingga penyerang tidak bisa menebak email terdaftar dari selisih waktu.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('cafeos-dummy-password');
  return dummyHashPromise;
}

export const authService = {
  /**
   * Daftarkan kafe baru beserta akun pemiliknya.
   *
   * Kafe + user dibuat dalam SATU transaksi: bila salah satu gagal, tidak ada
   * tenant setengah jadi. Setiap pendaftaran menghasilkan `cafeId` baru — itulah
   * batas isolasi data antar kafe.
   */
  async register(input: RegisterInput): Promise<AuthSessionDTO> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw ApiError.conflict('Email sudah terdaftar');
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const { user, cafe } = await prisma.$transaction(async (tx) => {
        const cafe = await tx.cafe.create({
          data: { name: input.cafeName, address: input.address },
        });
        const user = await tx.user.create({
          data: {
            cafeId: cafe.id,
            name: input.ownerName,
            email: input.email,
            passwordHash,
            role: 'OWNER',
          },
        });
        return { user, cafe };
      });

      const token = signAccessToken({
        userId: user.id,
        cafeId: user.cafeId,
        role: user.role,
      });

      return { token, user: toAuthUserDTO(user, cafe) };
    } catch (err) {
      // Balapan pendaftaran dengan email sama → unique constraint.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw ApiError.conflict('Email sudah terdaftar');
      }
      throw err;
    }
  },

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

    const token = signAccessToken({
      userId: user.id,
      cafeId: user.cafeId,
      role: user.role,
    });

    return { token, user: toAuthUserDTO(user, user.cafe) };
  },
};

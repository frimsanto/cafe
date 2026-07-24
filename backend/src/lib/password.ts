import bcrypt from 'bcryptjs';

// Kata sandi tidak pernah disimpan mentah — hanya hash bcrypt.
const SALT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

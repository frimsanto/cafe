import type { AuthUser } from '../types/auth';
import { mockCafe } from './mockMenu';

/**
 * Akun demo untuk fase frontend. Kata sandi disimpan apa adanya HANYA karena
 * ini data tiruan lokal — fase backend memakai hash di database dan otentikasi
 * lewat API.
 */
export interface MockAccount extends AuthUser {
  password: string;
}

export const mockAccounts: MockAccount[] = [
  {
    id: 'user-owner',
    name: 'Rani Pratama',
    email: 'owner@kopisenja.id',
    password: 'owner123',
    role: 'OWNER',
    cafeId: mockCafe.id,
    cafeName: mockCafe.name,
  },
  {
    id: 'user-kasir',
    name: 'Budi Santoso',
    email: 'kasir@kopisenja.id',
    password: 'kasir123',
    role: 'KASIR',
    cafeId: mockCafe.id,
    cafeName: mockCafe.name,
  },
  {
    id: 'user-dapur',
    name: 'Sari Dewi',
    email: 'dapur@kopisenja.id',
    password: 'dapur123',
    role: 'DAPUR',
    cafeId: mockCafe.id,
    cafeName: mockCafe.name,
  },
];

/** Cari akun yang cocok (email tidak case-sensitive). */
export function findAccount(email: string, password: string): AuthUser | null {
  const found = mockAccounts.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password,
  );
  if (!found) return null;
  const { password: _password, ...user } = found;
  return user;
}

import type { UserRole } from './auth';

/**
 * Bentuk data staf & perangkat POS di sisi klien.
 *
 * Cerminan DTO backend (`services/staf.service.ts`, `services/device.service.ts`).
 * Perhatikan apa yang TIDAK ada di sini: `pinHash`, `passwordHash`, dan token
 * perangkat. Ketiganya memang tidak pernah dikirim server — tipe ini menuliskan
 * kenyataan itu supaya kode yang mencoba membacanya berhenti di compiler, bukan
 * di runtime dengan `undefined`.
 */

export interface StafDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  aktif: boolean;
  /** Punya PIN atau belum. Nilainya sendiri tidak pernah dikirim. */
  punyaPin: boolean;
  pinTerkunci: boolean;
  createdAt: string;
  /** Shift kasir yang sedang berjalan — hanya ada pada endpoint daftar. */
  shiftAktif?: { id: string; namaShift: string; dibukaPada: string } | null;
  /** Sudah absen masuk dan belum pulang. */
  hadirSejak?: string | null;
}

export interface StafBaruBody {
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  password: string;
  /** Opsional — pemilik boleh menetapkan PIN belakangan. */
  pin?: string | null;
}

export interface StafUbahBody {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: UserRole;
}

export interface PerangkatDTO {
  id: string;
  label: string;
  aktif: boolean;
  terakhirDipakai: string | null;
  dicabutPada: string | null;
  createdAt: string;
  shiftAktif: { id: string; kasir: string; dibukaPada: string } | null;
}

/**
 * Balasan pendaftaran terminal.
 *
 * `token` hanya ada DI SINI dan hanya sekali. Ia tidak pernah muncul lagi di
 * `PerangkatDTO` mana pun, karena server menyimpan hash-nya saja.
 */
export interface PerangkatBaruDTO {
  perangkat: PerangkatDTO;
  token: string;
}

import { ApiError } from '../lib/ApiError';
import { MIN_PASSWORD_LENGTH } from '../lib/password';
import type { AuthRole } from '../types/auth';

/**
 * Validasi body Manajemen Staf.
 *
 * Satu hal yang membedakan berkas ini dari validasi lain: PIN yang lewat di
 * sini TIDAK BOLEH ikut ke mana-mana selain fungsi hash. Karena itu tidak ada
 * satu pun `throw` di bawah yang menyertakan nilai PIN di dalam pesannya —
 * pesan galat berakhir di log, di layar, dan kadang di tangkapan layar yang
 * dikirim lewat WhatsApp.
 */

const ROLE_VALID: AuthRole[] = ['OWNER', 'KASIR', 'DAPUR'];
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function teksWajib(value: unknown, field: string, maks = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  return value.trim().slice(0, maks);
}

function teksOpsional(value: unknown, field: string, maks = 200): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  const bersih = value.trim();
  return bersih === '' ? null : bersih.slice(0, maks);
}

function bacaEmail(value: unknown): string {
  const email = teksWajib(value, 'email', 200).toLowerCase();
  if (!POLA_EMAIL.test(email)) {
    throw ApiError.badRequest('Format email tidak valid');
  }
  return email;
}

function bacaRole(value: unknown): AuthRole {
  if (typeof value !== 'string' || !ROLE_VALID.includes(value as AuthRole)) {
    throw ApiError.badRequest('Peran harus salah satu dari: OWNER, KASIR, DAPUR');
  }
  return value as AuthRole;
}

/**
 * Nomor HP Indonesia, disimpan apa adanya setelah dibersihkan.
 *
 * Sengaja longgar: nomor dipakai pemilik untuk MENGHUBUNGI stafnya, bukan untuk
 * autentikasi apa pun. Menolak `+62 812-3456-7890` karena tanda hubungnya hanya
 * membuat pemilik mengetik ulang sesuatu yang sudah benar.
 */
function bacaPhone(value: unknown): string | null {
  const teks = teksOpsional(value, 'phone', 30);
  if (teks === null) return null;
  const bersih = teks.replace(/[^\d+]/g, '');
  if (bersih.length < 8) {
    throw ApiError.badRequest('Nomor HP terlalu pendek');
  }
  return bersih;
}

/**
 * Baca PIN dari body.
 *
 * Bentuknya (panjang, hanya angka, bukan pola lemah) diperiksa `lib/pin.ts`,
 * bukan di sini — supaya aturan PIN hanya ditulis di satu tempat. Yang
 * dikerjakan fungsi ini cuma memastikan tipenya benar.
 */
function bacaPin(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  return value.trim();
}

// ── Tambah staf ──────────────────────────────────────────────────────────────

export interface StafBaruInput {
  name: string;
  email: string;
  phone: string | null;
  role: AuthRole;
  password: string;
  /** Opsional — pemilik boleh menetapkan PIN belakangan. */
  pin: string | null;
}

export function parseStafBaru(body: unknown): StafBaruInput {
  const obj = asRecord(body);

  const password = obj.password;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`,
    );
  }

  return {
    name: teksWajib(obj.name, 'name'),
    email: bacaEmail(obj.email),
    phone: bacaPhone(obj.phone),
    role: bacaRole(obj.role),
    password,
    pin: obj.pin === undefined || obj.pin === null ? null : bacaPin(obj.pin, 'pin'),
  };
}

// ── Ubah staf ────────────────────────────────────────────────────────────────

export interface StafUbahInput {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: AuthRole;
}

export function parseStafUbah(body: unknown): StafUbahInput {
  const obj = asRecord(body);
  const hasil: StafUbahInput = {};

  if (obj.name !== undefined) hasil.name = teksWajib(obj.name, 'name');
  if (obj.email !== undefined) hasil.email = bacaEmail(obj.email);
  if (obj.phone !== undefined) hasil.phone = bacaPhone(obj.phone);
  if (obj.role !== undefined) hasil.role = bacaRole(obj.role);

  if (Object.keys(hasil).length === 0) {
    throw ApiError.badRequest('Tidak ada perubahan yang dikirim');
  }
  return hasil;
}

// ── Aktif / nonaktif ─────────────────────────────────────────────────────────

export function parseStafAktif(body: unknown): boolean {
  const obj = asRecord(body);
  if (typeof obj.aktif !== 'boolean') {
    throw ApiError.badRequest('Field "aktif" harus berupa true/false');
  }
  return obj.aktif;
}

// ── PIN ──────────────────────────────────────────────────────────────────────

export function parseAturPin(body: unknown): string {
  return bacaPin(asRecord(body).pin, 'pin');
}

/** Body layar pergantian petugas: siapa, dan PIN-nya. */
export interface BukaSesiInput {
  userId: string;
  pin: string;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBukaSesi(body: unknown): BukaSesiInput {
  const obj = asRecord(body);
  const userId = teksWajib(obj.userId, 'userId', 60);
  if (!POLA_UUID.test(userId)) {
    throw ApiError.badRequest('Field "userId" bukan id yang valid');
  }
  return { userId, pin: bacaPin(obj.pin, 'pin') };
}
